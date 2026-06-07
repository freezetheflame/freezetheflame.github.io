---
title: "GPU 算子 Profiling 实战指南：测什么、怎么看、如何定位瓶颈"
date: 2026-06-07
tags: [AI Infra, Triton, GPU 编程, Profiling, 性能优化]
---

写完一个 GPU kernel，你怎么知道它「够不够快」？Profiling 不是跑一遍看个时间就完了——你需要知道测什么指标、怎么看数据、如何从数字反推瓶颈位置。本文是一份实用的 profiling 方法论。

---

## 一、Profiling 测什么？核心指标体系

### 1.1 延迟（Latency）

最基本的指标：kernel 执行一次要多久。

```
测量工具：
  torch.cuda.Event     → 毫秒级精度，适合 Triton kernel
  Nsight Systems       → 微秒级，能看到 kernel 之间的 overlap
  Nsight Compute       → 单 kernel 细粒度，cycle 级
```

**注意**：
- 必须 warmup（前几次 GPU 频率未稳定）
- `torch.cuda.synchronize()` 保证 kernel 真正跑完
- 多测几次取中位数或 p99，不要只看第一次

### 1.2 吞吐量（Throughput）

延迟的反面：单位时间能处理多少数据。

```
吞吐量 = 数据量 / 延迟

例如：处理 16M 个 float32 的 ReLU，耗时 0.36 ms
吞吐量 = 16M / 0.36ms = 44.4B elements/s ≈ 178 GB/s
```

对 memory-bound kernel，用**带宽利用率**衡量：
```
带宽利用率 = 实际吞吐量 / 理论峰值带宽 × 100%
```

对 compute-bound kernel，用 **FLOPS 利用率**衡量：
```
FLOPS 利用率 = 实际 FLOPS / 理论峰值 FLOPS × 100%
```

### 1.3 硬件利用率指标

| 指标 | 含义 | 从哪里看 | 好/坏标准 |
|------|------|----------|-----------|
| Occupancy | SM 中活跃 warp 数 / 最大 warp 数 | Nsight Compute | >50% 一般够用 |
| Register usage | 每个线程用了多少寄存器 | `TRITON_PRINT_AUTOTUNING` | <128 安全，>200 必定 spill |
| Register spills | 溢出到 local memory 的寄存器数 | Nsight / PTX 中的 `st.local` | 0 是理想值 |
| Shared memory usage | 每个 block 分配了多少 shared memory | Autotune 输出 | <100 KB（留 occupancy 空间） |
| Memory throughput | 实际显存带宽使用率 | Nsight Compute | memory-bound kernel 应 >80% |
| Compute throughput | 实际算力使用率 | Nsight Compute | compute-bound kernel 应 >50% |

### 1.4 Stall 原因分析

这是 Nsight Compute 最有价值的功能：**你的 SM 在等什么？**

| Stall 原因 | 含义 | 常见根因 |
|------------|------|----------|
| Long Scoreboard | 等 global memory 加载 | 访存未合并、L1 miss 多 |
| Short Scoreboard | 等 shared memory 或 L1 | bank conflict、shared memory 争用 |
| Barrier | 等同步 | `__syncthreads()` 开销大 |
| Branch | warp divergence | if-else 分支导致串行 |
| Not Selected | SM 没有调度这个 warp | occupancy 太低 |

**实战建议**：跑 `ncu --set full` 然后直接看 "Warp State Statistics" 饼图，哪个颜色最大就先看哪个。

---

## 二、三层 Profiling 工具链

```
快速诊断（秒级）               深度分析（分钟级）              终极武器（小时级）
┌─────────────────┐    ┌─────────────────────┐    ┌──────────────────┐
│ GPU Event Timer │ →  │ TRITON_PRINT_       │ →  │ Nsight Compute   │
│ (延迟 + 吞吐量)  │    │ AUTOTUNING=1        │    │ (每周期每条指令)   │
│                 │    │ (寄存器/shared mem)  │    │                  │
└─────────────────┘    └─────────────────────┘    └──────────────────┘
   自己写，秒出结果        环境变量，0 代码改动          硬件级，信息最全
```

### 2.1 GPU Event Timer — 入门首选

```python
import torch

def profile_kernel(kernel, args, warmup=10):
    start = torch.cuda.Event(enable_timing=True)
    end = torch.cuda.Event(enable_timing=True)

    # Warmup
    for _ in range(warmup):
        kernel(*args)
    torch.cuda.synchronize()

    # Timed
    start.record()
    kernel(*args)
    end.record()
    torch.cuda.synchronize()

    return start.elapsed_time(end)  # milliseconds
```

**什么时候够了？** 对比两个实现谁快、验证优化有没有效果。

**什么时候不够？** 你想知道「为什么慢」——这时候上 Nsight。

### 2.2 TRITON_PRINT_AUTOTUNING — 零成本诊断

```bash
TRITON_PRINT_AUTOTUNING=1 python my_kernel.py
```

输出每个 config 的：
```
Triton autotuning: my_kernel (1024, 1024, 1024)
  config 0: BLOCK_M=64, BLOCK_N=64, num_warps=4, num_stages=2
    n_regs=48, n_spills=0, shared_mem=8192, occupancy=0.75
    time=0.234 ms
  config 1: BLOCK_M=128, BLOCK_N=128, num_warps=8, num_stages=3
    n_regs=96, n_spills=4, shared_mem=16384, occupancy=0.50
    time=0.189 ms
```

**关键解读**：
- `n_regs=96`：正常。超过 128 要警惕，超过 200 必定影响性能
- `n_spills=4`：少量 spill 可接受。超过 20 要考虑降低寄存器压力
- `occupancy=0.50`：50% — 对 compute-bound kernel 够了，memory-bound 则偏低

### 2.3 Nsight Compute — 深度定位

```bash
# 快速看关键指标
ncu --set basic python my_kernel.py

# 全面分析（慢，信息全）
ncu --set full -o profile_report python my_kernel.py

# 只看 memory 相关
ncu --section MemoryWorkloadAnalysis python my_kernel.py
```

**Nsight 报告中优先看的 5 件事**：

1. **Kernel Duration** — 确认是你关心的 kernel
2. **Memory Throughput** — 如果是 memory-bound kernel，看占有率
3. **Compute Throughput** — 如果是 compute-bound kernel，看 SM 利用率
4. **Warp State Statistics** — 饼图告诉你 SM 在等什么
5. **Source View** — 每条指令的 stall 原因，精准到行

---

## 三、如何从 Profiling 数据定位问题

### 场景 1：Kernel 比预期慢 30-50%

**诊断流程**：
```
1. GPU Timer → 确认确实慢（排除 warmup 问题）
2. TRITON_PRINT_AUTOTUNING → 看 n_regs / n_spills
   ├─ n_regs > 200 → 寄存器溢出！降低 BLOCK_SIZE 或 num_warps
   └─ n_regs 正常 → 进入 3
3. Nsight Compute → 看 stall 原因
   ├─ Long Scoreboard > 60% → memory latency 主导
   │   └─ 优化：增大 BLOCK_SIZE，增加 num_stages，检查 coalescing
   ├─ Short Scoreboard > 40% → shared memory 瓶颈
   │   └─ 优化：padding 避免 bank conflict，减少 barrier
   └─ Not Selected > 50% → occupancy 太低
       └─ 优化：减少寄存器或 shared memory 用量
```

### 场景 2：Triton kernel 比 PyTorch 慢

先确认对比是否公平：
- 数据类型是否一致？（fp16 vs fp32 性能差 2-8 倍）
- PyTorch 可能用了 cuBLAS/cuDNN 的融合 kernel
- PyTorch 的 `torch.compile` 可能会做算子融合

如果确实慢：
```
1. 看 TRITON_PRINT_AUTOTUNING → 选最优 config 了吗？
2. 看 PTX → 对比 PyTorch 版本的 PTX（用 ncu 抓）
3. 检查是否有不必要的 global memory 往返
```

### 场景 3：Memory-bound kernel 带宽利用率低

```
ReLU 预期：~500 GB/s（接近峰值）
实际：     ~200 GB/s        ← 问题

排查清单：
□ BLOCK_SIZE 是否够大？（至少 512，建议 1024-2048）
□ 数据是否连续？（确保没有 stride 访问）
□ 是否有隐式的 fp32→fp16 转换？（每次转换都多一次访存）
□ Grid 是否足够大？（SM 没用满——56 个 SM 至少需要 56 个 block）
```

### 场景 4：Matmul 的 FLOPS 利用率上不去

```
Matmul 4096×4096×4096:
  理论 fp16 Tensor Core: ~178 TFLOPS
  实际:                  ~60 TFLOPS  ← 只有 34%

排查清单：
□ BLOCK_K 是否太小？（建议 32 或 64，太小则循环次数多）
□ BLOCK_M/BLOCK_N 是否够大？（让 Tensor Core 吃饱）
□ K 是否能整除 BLOCK_K？（不能的话最后一个迭代浪费算力）
□ num_stages 是否合适？（compute-bound kernel 只需 1-2 个 stage）
```

---

## 四、Profiling 的黄金法则

1. **先判断 bound 类型，再优化** — memory-bound 和 compute-bound 的优化方向完全不同，别优化错了方向
2. **不要过度相信理论峰值** — 实际能达到 70-80% 理论峰值就很好了
3. **Warmup 是必须的** — 不加 warmup 的 benchmark 是废数据
4. **一次只改一个变量** — 同时改 BLOCK_SIZE 和 num_warps，你不知道哪个起了作用
5. **记录每次 profiling** — 维护一个 profiling log，不然过两天就忘了哪个 config 最快

---

## 五、Profiling Log 模板

保持一个简单的记录习惯：

```
Kernel: gelu_fp16
Date: 2026-06-07
GPU: RTX 4070 SUPER

| Config                          | Time (ms) | BW (GB/s) | n_regs | n_spills | Occupancy |
|---------------------------------|-----------|-----------|--------|----------|-----------|
| BLOCK=512,  num_warps=4         | 0.42      | 480       | 32     | 0        | 0.75      |
| BLOCK=1024, num_warps=8         | 0.36      | 557       | 48     | 0        | 0.62      |
| BLOCK=2048, num_warps=16        | 0.38      | 530       | 72     | 2        | 0.50      |

结论: BLOCK=1024, num_warps=8 最优。更大 BLOCK 反而慢，因为 occupancy 下降。
```

---

本文是 Triton 系列的一部分。上一篇：[Triton 性能调优方法论](/posts/2026-06-07/triton-performance-tuning-methodology.html)
