---
title: "Triton GPU 编程入门（一）：从 Vector Add 到 GPU 执行模型"
date: 2026-06-06
tags: [AI Infra, Triton, GPU 编程]
---

OpenAI Triton 是一个用 Python 写 GPU kernel 的 DSL。它的核心卖点是「CUDA 的性能、Python 的体验」——编译器自动处理 tiling、memory coalescing 和 shared memory 优化。本文是 Triton 系列的第一篇，从最基础的 vector add 入手，建立 GPU 执行模型的心理表征。

**环境**：RTX 4070 SUPER (Compute Capability 8.9)，Triton 3.6.0，CUDA 13.0

---

## 一、GPU 执行模型速览

在 Triton 中写 kernel，需要理解三层抽象：

### 1. Grid → Blocks → Threads

```
Grid (2D example: 4×3 blocks)
┌──────┬──────┬──────┐
│ B00  │ B01  │ B02  │
├──────┼──────┼──────┤
│ B10  │ B11  │ B12  │
├──────┼──────┼──────┤
│ B20  │ B21  │ B22  │     每个 Block 内: 数百个 thread 并行
├──────┼──────┼──────┤
│ B30  │ B31  │ B32  │
└──────┴──────┴──────┘

Triton 对应：
  grid = (4, 3)          → 4×3 = 12 个 program
  program_id(0) ∈ [0,4)  → 行号
  program_id(1) ∈ [0,3)  → 列号
```

**关键区别**：Triton 的 "program" 映射到 CUDA 的 "thread block"。一个 program 内 Triton 自动管理 threads 的并行。

### 2. 内存层次

```
速度递增 →
┌─────────────────────────────────────────────────────┐
│ Global Memory (HBM)     │ 慢 (~1TB/s)，大 (12GB)   │
├─────────────────────────┤                           │
│ L2 Cache                │                           │
├─────────────────────────┤                           │
│ Shared Memory (SRAM)    │ 快，block 内共享 (128KB) │
├─────────────────────────┤                           │
│ Registers               │ 最快 (每 thread 255个)   │
└─────────────────────────────────────────────────────┘
```

性能优化的本质：**尽量减少 global memory 访问，尽量用 registers 和 shared memory**。

---

## 二、Hello Triton：Vector Add

```python
@triton.jit
def add_kernel(x_ptr, y_ptr, output_ptr, n_elements, BLOCK_SIZE: tl.constexpr):
    pid = tl.program_id(0)                           # 我是第几个 block？
    offsets = pid * BLOCK_SIZE + tl.arange(0, BLOCK_SIZE)  # 我处理哪些元素？
    mask = offsets < n_elements                      # 越界保护
    x = tl.load(x_ptr + offsets, mask=mask)           # 从 global memory 读
    y = tl.load(y_ptr + offsets, mask=mask)
    tl.store(output_ptr + offsets, x + y, mask=mask)  # 写回 global memory
```

### 逐行解释

| 代码 | 含义 |
|------|------|
| `tl.program_id(0)` | 当前 block 在 grid 第 0 维的索引。grid=(4,) 时取值为 0,1,2,3 |
| `tl.arange(0, BS)` | 生成 `[0, 1, 2, ..., BS-1]` 的向量，一个 thread 一个元素 |
| `pid * BS + arange` | 将程序级偏移 + 线程级偏移 = 全局索引 |
| `mask = offsets < N` | 当 N 不能被 BS 整除时，最后一个 block 部分线程越界 |
| `tl.load(ptr, mask=)` | 从 global memory 读取。mask=True 正常读，mask=False 跳过 |
| `tl.store(ptr, val, mask=)` | 写回 global memory |

### 启动 Kernel

```python
output = torch.empty(N, device='cuda', dtype=torch.float32)
BLOCK_SIZE = 256
grid = (triton.cdiv(N, BLOCK_SIZE),)  # ceil(N/256)

add_kernel[grid](x, y, output, N, BLOCK_SIZE=BLOCK_SIZE)
#          ^^^^  grid 写在中括号里
#                BLOCK_SIZE 作为 keyword argument（constexpr 要求）
```

---

## 三、为什么需要 offset？

上面 kernel 里最关键也最容易被忽略的一行：

```python
offsets = pid * BLOCK_SIZE + tl.arange(0, BLOCK_SIZE)
```

**一句话：Triton 会同时启动 N 个完全相同的 kernel 实例，每个实例必须知道自己管哪段数据，offset 就是它算出来的「这是我的地盘」。**

### 没有 offset 会怎样？

假设 1024 个元素，BLOCK_SIZE=256，启动了 4 个 block。没有 offset：

```
每个 block 做的事：处理第 0 到第 255 个元素
```

结果：4 个 block 全部冲去处理前 256 个——后面 768 个没人管。

### offset 拆成两部分

```
offset = pid × BLOCK_SIZE  +  tl.arange(0, BLOCK_SIZE)
         ↑                      ↑
    我这个 block 从哪开始    我在 block 内部排第几
    （全局基址）              （块内偏移）
```

| Worker | pid×256 | tl.arange | 负责的元素 |
|--------|---------|-----------|-----------|
| 0 | 0 | [0,1,...,255] | [0, 255] |
| 1 | 256 | [0,1,...,255] | [256, 511] |
| 2 | 512 | [0,1,...,255] | [512, 767] |
| 3 | 768 | [0,1,...,255] | [768, 1023] |

- `pid × BLOCK_SIZE` 回答：**我的工位在流水线最左边在哪？**
- `tl.arange(0, BLOCK_SIZE)` 回答：**我在自己工位上具体管哪一个元素？**

### 为什么不能直接用 pid 当索引？

```
index = pid    # 错！每个 block 只处理一个元素
```

4 个 block 只能处理 4 个元素，剩下 1020 个没人管。GPU 的设计是一个 block 里有 256 个线程，每个线程拿一个元素——所以需要 `tl.arange` 生成 256 个不同的索引。

---

## 四、实测性能

在 RTX 4070S 上测试 N=10M 个元素：

| 实现 | 耗时 | 带宽 |
|------|------|------|
| PyTorch (`x + y`) | 0.29 ms | 413 GB/s |
| Triton | 0.27 ms | 438 GB/s |

Triton 在 N=10M 时比 PyTorch 略快 ~6%，说明 Triton compiler 生成的 kernel 在 element-wise 操作上与 cuBLAS 优化的 PyTorch 算子持平甚至更优。437 GB/s 的带宽接近 RTX 4070S 的理论峰值（504 GB/s），说明内存带宽已接近饱和。

---

## 四、关键心智模型

### Vector Add 的并行化

```
N=1000, BLOCK_SIZE=256 → grid=(4,)

Block 0 (pid=0):  处理 indices [0,   255]
Block 1 (pid=1):  处理 indices [256, 511]
Block 2 (pid=2):  处理 indices [512, 767]
Block 3 (pid=3):  处理 indices [768, 999]  ← mask 保护 1000-1023

每个 block 内，256 个 thread 同时 load → compute → store
所有 block 在 GPU 上并行执行
```

这就是 GPU 编程的核心思想：**分解 + 并行 + 掩码保护**。

---

## 五、下一步

本文建立了最基础的 mental model。下一篇将实现 ReLU/GELU/SiLU 等逐元素激活函数，并讨论 memory coalescing —— 为什么连续访存比跳跃访存快 10 倍。

---

*本系列所有代码见 [triton-benchmark-prep](https://github.com/freezetheflame/triton-benchmark-prep)*
