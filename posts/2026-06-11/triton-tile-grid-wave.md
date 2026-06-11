---
title: GPU Kernel 的 Tile、Grid、Wave 与 Launch Overhead
date: 2026-06-11
tags: [triton, gpu, kernel, performance, fundamentals]
---

写 Triton kernel 的时候，`BLOCK_M`、`BLOCK_N`、`BLOCK_K` 这些参数到底怎么影响性能？为什么 autotune 给不同 shape 选不同的 tile 配置？

这篇文章从 CTA、grid、wave、launch overhead 讲起，到三个 shape 的 autotune 决策规律。

## 从工人到 CTA

每个 `tl.program_id(0), tl.program_id(1)` 对应一个 **CTA**（Cooperative Thread Array）。可以把它理解为一个"工人"——一个人拿一块砖：

```python
# grid 决定一共派多少个工人
grid = (cdiv(M, BLOCK_M), cdiv(N, BLOCK_N))

# BLOCK_M × BLOCK_N = 每个工人负责的输出子矩阵
```

一个 matmul `C = A @ B`，把 C 切成 `BLOCK_M × BLOCK_N` 的小块，每个工人负责一块。工人总数是 `grid[0] × grid[1]`。

## SM：GPU 的车间

工人不是凭空干活的。他们在 **SM**（Streaming Multiprocessor）上跑。

```
RTX 4070 SUPER: 56 个 SM
每个 SM 同时容纳的工人数量 = 受限于寄存器 + 共享内存
```

我们的 matmul kernel 每个工人约用 **128 个寄存器**。一个 SM 有 65536 个寄存器，但一个工人只能用 255 个（硬件上限）。

实际上一个 SM 同时能跑的工人数由 **寄存器压力** 决定：

```
每个工人 128 regs × 每个工人 4 warps × 32 threads = 16384 regs per worker
SM 有 65536 regs → 65536 / 16384 = 4 个工人/SM ✓

如果每个工人 200 regs: 200 × 4 × 32 = 25600 → 65536 / 25600 = 2 个工人/SM
```

所以 `num_warps` 和 tile 尺寸直接影响 occupancy（每 SM 同时跑的工人数）。

## Wave：工人排队

如果工人的总数超过 SM 能同时容纳的量，超出的就得排队。**wave 就是排队的轮数。**

```
wave 数 = 工人总数 / (SM 数量 × 每 SM 同时工人数)
```

举个例子：

```
1024×1024 matmul, BLOCK_M=64, BLOCK_N=64
  工人 = 16 × 16 = 256 个
  每 SM 同时 4 个工人
  256 / (56 × 4) = 256 / 224 ≈ 1.1 wave  ← 几乎不用排队

2048×2048, BLOCK_M=64, BLOCK_N=64
  工人 = 32 × 32 = 1024 个
  1024 / 224 ≈ 4.6 wave  ← 排 5 轮

4096×4096, BLOCK_M=64, BLOCK_N=64
  工人 = 64 × 64 = 4096 个
  4096 / 224 ≈ 18.3 wave  ← 排 18 轮！
```

## Launch Overhead：每次排队的代价

每个 wave 结束到下一个 wave 开始之间，GPU 调度器要：

- 释放上一批工人的寄存器
- 分配新一批工人的寄存器和共享内存
- 加载新工人的 kernel arguments
- 启动新工人执行

每次切换的时间是 **固定的几十微秒**。wave 越多，这部分开销累积越大。

在 4096² 的 18 个 wave 场景下，调度开销可以达到毫秒级。而 matmul 本身才 2ms——调度占了一小半。

## 三种优化：不同 Shape 不同策略

回到 `BLOCK_M`、`BLOCK_N`、`BLOCK_K` 的选择。

**BLOCK_M 和 BLOCK_N 越大 → 工人越少 → wave 越少 → launch overhead 越低。**

但 tile 不能无限大——受寄存器限制了。而且 tile 太大也有问题（对小的 M/N 维度会浪费 mask 计算）。

**BLOCK_K 越大 → K 循环次数越少 → 从 global memory 加载的次数越少。**

但 BLOCK_K 大意味着每个工人用更多共享内存（存 A tile 和 B tile），会限制 occupancy。

这些因素互相制约，最优配置取决于矩阵的 **绝对大小**（不只是形状）。

### 1024² — 工人太少，需要 wide tile

```
BLOCK_N=64:  256 工人, 1.1 wave
BLOCK_N=128: 128 工人, 0.6 wave ← 更少！但 wave 已经不是瓶颈

为什么还选 N=128？因为 wide tile 的算存比更高：

BLOCK_N=64:  (64+32) bytes load → 64×32×2 flops → 21 flops/byte
BLOCK_N=128: (128+32) bytes load → 128×32×2 flops → 26 flops/byte
```

小矩阵没有足够多工人填满 SM，也谈不上 launch overhead。瓶颈是 **memory bandwidth**——每次从 global memory 搬的 byte 能做的计算越多越好。

**小矩阵的策略：提算存比。**

### 2048² — 工人适中，deep K 减内存流量

```
BLOCK_K=32: 1024 工人, 4.6 wave, K 循环 2048/32 = 64 次
BLOCK_K=64: 1024 工人, 4.6 wave, K 循环 2048/64 = 32 次 ← 少跑 32 趟！
```

1024 个工人 × 每人 64 次 K 迭代 × 每次迭代加载 A tile + B tile × 2 bytes(fp16)：

```
K=32: 1024 × 64 × (64×32 + 32×64) × 2 bytes ≈ 16.8 GB global memory traffic
K=64: 1024 × 32 × (64×64 + 64×64) × 2 bytes ≈ 16.8 GB  ← 一样！
```

等等，总 traffic 一样？对——问题不在总量，在**每次 load 的效率和延迟**。

```
K=32: 每 tile 只有 64×32 个元素 = 2KB → 每次 load 很小，512 次 load/L1 请求
      加载延迟摊销在 2048 flops 上
K=64: 每 tile 有 64×64 个元素 = 4KB → 每次 load 更大，256 次 load/L1 请求
      加载延迟摊销在 4096 flops 上
```

更大的 tile 让每次 load 请求的延迟被更多计算覆盖。这是 latency hiding——GPU 的核心设计理念：用大量计算掩盖内存延迟。

**中矩阵的策略：deep K 掩盖内存延迟。**

### 4096² — 工人太多，必须降调度开销

```
BLOCK_N=64:  4096 工人, 18.3 wave → 调度开销 ~1ms+
BLOCK_N=128: 2048 工人, 9.1 wave  → 调度开销砍半
```

4096 个工人的调度开销已经超过 K 循环优化能带来的任何收益。工人"够多了"——多到成了一种负担。此时减少工人数量是第一优先级。

**大矩阵的策略：减少工人，降调度开销。**

## 一张图总结

```
矩阵规模   主导瓶颈         优化方向        autotune 选了什么
────────  ───────────────  ─────────────  ──────────────────
 1024²    memory BW        wide tile       N=128 (算存比 ↑)
 2048²    memory latency   deep K          K=64  (load 次数 ↓)
 4096²    launch overhead  fewer CTAs      N=128 (wave 数 ↓)
```

三个规模对应三种瓶颈，没有一种 tile 配置能通吃。

## 跟 CPU 编程的类比

如果你有 CPU 多线程背景：

- **CTA ≈ 一个线程**（但有 128 个硬件线程在里面做 SIMT）
- **SM ≈ CPU 核心**（SM 能"超卖"运行多个 CTA）
- **wave ≈ CPU 线程池的任务队列长度**（队列短 → 核闲着；队列太长 → 调度开销大）
- **BLOCK_K ≈ 循环展开因子**（展开多 → 循环次数少，但寄存器压力大）
- **BLOCK_M/ BLOCK_N ≈ 任务粒度**（粗粒度 → 任务少；细粒度 → 任务多但管理成本高）

GPU 和 CPU 都面临同一个根本问题：**如何平衡任务数量、每任务工作量、资源占用**。GPU 的 twist 是：它是一个大规模并行机器，队列管理成本在极端 worker 数量下不可忽略。

## 检验理解

试着预测：给一个 `M=512, N=512, K=512` 的矩阵，最优配置大概是怎样的？然后再看 `M=8192, N=8192, K=8192`。

答案在文章末尾。

---

**512³**：工人 = 512/64 × 512/64 = 64 个。太少了——物理 SM 都填不满（56 SM × 4 workers = 需要 224+ 工人才饱和）。此时瓶颈极端是 memory bandwidth，最优配置可能是 **BLOCK_N=256**（极 wide tile）。甚至 BLOCK_M 也可能需要拉大——因为 M 太小了，grid 只有 8 个 CTA 沿 M。

**8192³**：工人 = 128×128 = 16384 个。16384 / 224 ≈ 73 wave。调度开销已到荒谬级别。最优配置一定是 **BLOCK_M=256, BLOCK_N=256**，把工人压到 32×32=1024 个（≈ 4.6 wave）。
