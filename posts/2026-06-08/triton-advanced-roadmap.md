---
title: "Triton 进阶路线图：LayerNorm、Fused MLP 与 Autotune"
date: 2026-06-08
tags: [triton, gpu, transformer, 性能优化]
---

Triton 基础算子写完之后，下一步往哪走？本文梳理三个进阶方向，构成从"能写 kernel"到"能写生产级 kernel"的桥梁。

## 当前进度回顾

假设你已经完成了：

- **Element-wise**（ReLU / GELU / SiLU）：理解 memory coalescing、memory-bound 的含义
- **Softmax**：online stable 算法、跨线程 reduction
- **Matmul**：tiling、`tl.dot`（Tensor Core）、grid 设计
- **FlashAttention**：fused kernel、online softmax 在 attention 中的应用
- **Profiling**：GPU event timing、roofline model、arithmetic intensity 分析

这六个 exercise 已经覆盖了 Triton 的核心原语。接下来三个方向各有侧重：

| 方向 | 难度 | 学到什么 | 实际价值 |
|------|------|---------|---------|
| LayerNorm / RMSNorm | ⭐⭐ | 跨 block reduction、Welford 算法 | 每个 Transformer block 至少两次 |
| Autotune | ⭐⭐ | Config 空间搜索、寄存器压力、occupancy | 所有 kernel 的最终优化手段 |
| Fused MLP | ⭐⭐⭐ | Kernel fusion、tile 间依赖管理 | 端到端推理延迟的直接优化 |

## 方向一：LayerNorm & RMSNorm

### 为什么重要

一个 7B 模型的 transformer block 里，LayerNorm 只占约 5-15% 的算力，但它无处不在——每个 attention 和 MLP 前后都有 normalization。在长序列推理中（如 128K context），norm kernel 的调用次数可能超过 attention 本身。

### 算法本质

```
LayerNorm(x) = (x - mean(x)) / sqrt(var(x) + ε) * γ + β
RMSNorm(x)   = x / sqrt(mean(x²) + ε) * γ          # 无 β，无减均值
```

两者都是**逐行独立**的——每行（每个 token）独立计算统计量，天然适合 GPU 并行。

### 核心挑战：跨 Block 的 Reduction

如果一行数据（hidden_dim，通常 768-8192）大于一个 BLOCK，就需要跨 block 合并统计量。Welford 算法可以在单次遍历中同时计算均值和方差，但跨 block 合并需要额外的 kernel launch：

```
Kernel 1: 每个 block 计算自己的 (count, mean, M2)，存到临时 buffer
Kernel 2: 合并临时 buffer，计算全局统计量
Kernel 3: 用全局统计量做 normalize + affine
```

不过大多数 LLM 的 hidden_dim ≤ 1024（如 LLaMA-7B 的 4096 通过 tensor parallelism 分片后），一行可以放进一个 block，单 kernel 搞定。

### 关键差异

- **Welford 并行合并公式**：需要正确处理两组统计量的合并，和简单求和不同
- **RMSNorm vs LayerNorm**：少一次 mean reduction，约快 10-15%
- **Affine 参数**：γ 和 β 存在 global memory 里，每次都要 load——可以 fuse 进 kernel

## 方向二：Autotune

### 为什么手选参数不够

写完 matmul 后，你手动选了 `BLOCK_M=64, BLOCK_N=64, BLOCK_K=32`。这组参数对特定形状可能不错，但换一个 M×N×K 组合就不一定了。

Triton 的 `@triton.autotune` 可以自动搜索参数空间，找到每个输入形状的最优配置。

### 工作原理

```python
@triton.autotune(
    configs=[
        triton.Config({'BLOCK_M': 64, 'BLOCK_N': 64, 'BLOCK_K': 32}, num_warps=4),
        triton.Config({'BLOCK_M': 128, 'BLOCK_N': 64, 'BLOCK_K': 32}, num_warps=8),
        # ... 更多 config
    ],
    key=['M', 'N', 'K'],  # 缓存的键
)
@triton.jit
def matmul_kernel(...):
    ...
```

首次运行时，Triton 编译所有 config，逐个 benchmark，缓存最优结果。后续调用直接使用缓存。

### 参数空间的设计直觉

- **BLOCK_M × BLOCK_N**：越大 → 每次 load 做更多计算 → 更高 AI。但受限于寄存器（~256KB / SM for fp32 accumulators）
- **num_warps**：4 warps × 4 CTAs = 16 warps/SM。8 warps × 2 CTAs = 也是 16 warps/SM。但 8 warps 的 block 更大 → 更多寄存器 per block → 可能降低 occupancy
- **num_stages**：pipeline stages。2 → 更少 shared memory 占用。4 → 更好隐藏访存延迟，但占更多 shared memory

### Profiling 与 Autotune 的关系

Profiling 告诉你"哪里慢了"（memory-bound vs compute-bound），Autotune 帮你"自动修"。两者配合使用才是完整的优化流程。

## 方向三：Fused MLP

### 为什么需要 fusion

标准的 Transformer MLP：

```
x = Linear_1(input)    # [N, D] → [N, 4D]    ← 写回 global memory（慢）
x = GELU(x)            # [N, 4D]              ← 读 + 写
x = Linear_2(x)        # [N, 4D] → [N, D]     ← 读 + 写
```

每一步的中间结果都写回 global memory（GDDR6X ~504 GB/s），但 GPU 的 L1 cache 和 shared memory 速度是它的 10 倍（~5 TB/s）。

Fusion 的思路：**在寄存器 / shared memory 里完成全部计算，只写一次最终结果。**

```
Fused: load → matmul_1 → GELU → matmul_2 → store
         ↑_____只走一次 global memory 来回_____↑
```

### 数据流设计

关键的约束是**寄存器容量**。中间值 `acc1` 是 `[BLOCK_M, 4K]`，以 4K = 16384（LLaMA-7B 的 intermediate size）为例，64 行 × 16384 列 × 4 字节 = 4 MB，远超寄存器容量。

解决方法是把中间维度也分 tile：

```python
for k4_block in range(0, 4*K, BLOCK_K4):
    # Step 1: acc1 = x_tile @ W1_chunk   → [BLOCK_M, BLOCK_K4]
    # Step 2: acc1 = GELU(acc1)          → 就地修改，寄存器内
    # Step 3: acc2 += acc1 @ W2_chunk    → 立即消费掉 acc1
```

这是一个 **tiled-gemm → elementwise → tiled-gemm** 的流水线。W1 和 W2 的加载顺序需要对齐，确保每次只加载当前 chunk 需要的权重。

### 实际收益

以 LLaMA-7B 为例，一次 MLP forward 需要读写：
- 未 fusion：x(2MB) + x1(8MB write + 8MB read) + x2(2MB write) = **20 MB**
- Fusion 后：x(2MB read) + x2(2MB write) = **4 MB**

节省 16 MB 的 memory traffic。在 batch inference 中，这直接降低延迟。

## 建议学习顺序

1. **Autotune 先做**——这是工具技能，给现有的 matmul 加上 autotune。学会后，给 LayerNorm 和 Fused MLP 加 autotune 就是顺手的事。运行 `TRITON_PRINT_AUTOTUNING=1` 看所有 config 的 benchmark 结果，理解为什么某些 config 赢、某些输。

2. **LayerNorm / RMSNorm**——相对简单，跨 block reduction 是唯一难点。先实现"一行能放进一个 block"的简单版本（`D ≤ 1024`），跑通后再扩展到更大的 `D`。

3. **Fused MLP 最后**——最复杂，涉及 tile 间依赖和流水线管理。建议先用 PyTorch 写 reference（确保算法正确），再逐步翻译成 Triton。

## 资源

所有练习代码和理论笔记在 [github.com/freezetheflame/triton-benchmark-prep](https://github.com/freezetheflame/triton-benchmark-prep)：

```
exercises/
  06_autotune.py          # Autotune 骨架，待你填完
notes/
  layernorm-rmsnorm.md    # LayerNorm/RMSNorm 理论 + Welford 算法
  fused-mlp.md            # Fused MLP 设计 + 伪代码
```

每个 note 都包含算法推导、伪代码、自测框架和常见陷阱——不提供完整实现，只给你搭好脚手架。
