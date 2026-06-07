---
title: "FlashAttention：为什么它改变了 Transformer 推理的游戏规则"
date: 2026-06-07
tags:
  - triton
  - gpu
  - flash-attention
  - attention
  - 高性能计算
---

Transformer 的 Self-Attention 是整个架构的核心，也是最大的显存黑洞。FlashAttention 把 Attention 的整个计算链融合进一个 GPU kernel，把 O(n²) 的显存开销降到 O(n)。这是 Triton 生态中最著名的算法，也是理解「为什么要写 fused kernel」的最佳案例。

本文从标准 Attention 的显存瓶颈出发，拆解 FlashAttention 的 tiling + online softmax 设计，最后给出 Triton 实现的完整骨架。

## 1. 标准 Attention 的显存灾难

无论 Self-Attention 还是 Cross-Attention，核心计算都一样：

```
S = Q @ K^T          # [B, H, seq_len, seq_len]
P = softmax(S)
O = P @ V
```

问题出在 **S 矩阵**。它的大小是 O(n²)，并且是整个计算链的必经中间产物：

| seq_len | 单个 head 的 S 矩阵 (fp16) | B=1, H=16 的总量 |
|---------|--------------------------|-------------------|
| 1024 | 2 MB | 32 MB |
| 4096 | 32 MB | 512 MB |
| 8192 | 128 MB | 2 GB |
| 32768 | 2 GB | 32 GB |

RTX 4070S 只有 12 GB 显存。seq_len=8192 时，仅 S 矩阵就吃掉 2 GB——更不用说还要存 Q、K、V、模型参数、KV Cache。实际推理中，seq_len 超过 4096 就开始吃力。

**本质问题**：Attention 是 memory-bound，不是 compute-bound。GPU 的计算单元大部分时间在等数据。

## 2. FlashAttention 的核心思路

FlashAttention 的洞察非常简单：**我们不需要存 S 矩阵**。

S 矩阵的唯一作用是计算 softmax 的分子（exp(S)）和分母（sum(exp(S))）。如果我们能在计算 S 的每一块时，当场完成 softmax 并累加到输出 O，那 S 矩阵就不需要保存。

具体做法：

1. **Tiling**：把 Q 沿序列维度切成大小为 BLOCK_M 的块，把 K/V 切成大小为 BLOCK_N 的块
2. **Online Softmax**：对每个 Q 块，逐块处理 K/V，维护 running max 和 running denominator
3. **Fused Write**：算完一个 Q 块的所有 K/V 块后，一次写回输出 O

```
伪代码：

对于每个 Q 块 [BLOCK_M, head_dim]（外层循环）：
  m = [-inf]        # running max，每个 query 行一个
  d = [0]           # running denominator
  acc = 0           # 累加输出 [BLOCK_M, head_dim]

  对于每个 K,V 块 [BLOCK_N, head_dim]（内层循环）：
    S_j = Q_block @ K_block^T * scale       # [BLOCK_M, BLOCK_N]
    m_new = max(m, max(S_j, axis=1))        # 更新 max
    P = exp(S_j - m_new)                     # 稳定化
    d_new = d * exp(m - m_new) + sum(P)     # 更新分母
    acc = acc * (d/d_new) * exp(m-m_new) + P @ V_block / d_new
    m, d = m_new, d_new

  存储 acc → output
```

S_j（形状 [BLOCK_M, BLOCK_N]）在每一步都在寄存器/L1 里计算和消费，从未写入显存。这就是 "Flash" 的含义——一闪而过。

而 online softmax 的数学保证：无论中间累加了多少块，最终结果和一次性算完整 softmax 完全等价。

## 3. Grid 布局：1D self-decoding

和矩阵乘法的 2D grid 不同，FlashAttention 用 **1D grid + 自解码**：

```python
grid = (cdiv(seq_len, BLOCK_M) * B * H,)

# 每个 program 自己解码：(batch, head, block_m_start)
pid = program_id(0)
num_m_blocks = cdiv(seq_len, BLOCK_M)

bh_id = pid // num_m_blocks     # 第几个 (batch, head) 对
block_m = pid % num_m_blocks    # Q 的第几个行块

b_idx = bh_id // H              # 解码 batch id
h_idx = bh_id % H               # 解码 head id
```

例如 `seq_len=256, BLOCK_M=64, B=2, H=4`：
- num_m_blocks = 4
- 总 programs = 4 × 2 × 4 = 32
- pid=10 → bh_id=2, block_m=2 → 第0个batch的第2个head，Q 的第2个行块

## 4. Triton 实现骨架

```python
@triton.jit
def flash_attention_fwd_kernel(
    q_ptr, k_ptr, v_ptr, o_ptr,
    stride_qb, stride_qh, stride_qm, stride_qd,
    stride_kb, stride_kh, stride_kn, stride_kd,
    stride_vb, stride_vh, stride_vk, stride_vd,
    stride_ob, stride_oh, stride_om, stride_od,
    B, H, seq_len, head_dim,
    BLOCK_M: tl.constexpr,
    BLOCK_N: tl.constexpr,
    sm_scale: tl.constexpr,
):
    # 1. 解码 pid
    pid = tl.program_id(0)
    num_m_blocks = tl.cdiv(seq_len, BLOCK_M)
    bh_id = pid // num_m_blocks
    block_m = pid % num_m_blocks
    b_idx = bh_id // H
    h_idx = bh_id % H

    # 2. 偏移量和 Q block 加载
    offs_m = block_m * BLOCK_M + tl.arange(0, BLOCK_M)   # [BLOCK_M]
    offs_n = tl.arange(0, BLOCK_N)                        # [BLOCK_N]
    offs_d = tl.arange(0, head_dim)                       # [head_dim]

    q = tl.load(q_ptr + (b_idx * stride_qb + h_idx * stride_qh
                + block_m * BLOCK_M * stride_qm)
                + offs_m[:, None] * stride_qm
                + offs_d[None, :] * stride_qd,
                mask=offs_m[:, None] < seq_len, other=0.0)

    # 3. Online softmax 初始化
    m_i = tl.zeros([BLOCK_M], dtype=tl.float32) - float("inf")
    d_i = tl.zeros([BLOCK_M], dtype=tl.float32)
    acc = tl.zeros([BLOCK_M, head_dim], dtype=tl.float32)

    # 4. 循环 K/V 块
    for block_n in range(0, tl.cdiv(seq_len, BLOCK_N)):
        # 加载 K block
        k = tl.load(k_ptr + (b_idx * stride_kb + h_idx * stride_kh
                    + block_n * BLOCK_N * stride_kn)
                    + offs_n[:, None] * stride_kn
                    + offs_d[None, :] * stride_kd,
                    mask=offs_n[:, None] < seq_len, other=0.0)

        # S = Q @ K^T * scale
        s = tl.dot(q, tl.trans(k)) * sm_scale    # [BLOCK_M, BLOCK_N]

        # Online softmax update
        m_new = tl.maximum(m_i, tl.max(s, axis=1))
        alpha = tl.exp(m_i - m_new)
        p = tl.exp(s - m_new[:, None])

        d_new = alpha * d_i + tl.sum(p, axis=1)

        # 加载 V block + 累加输出
        v = tl.load(v_ptr + (b_idx * stride_vb + h_idx * stride_vh
                    + block_n * BLOCK_N * stride_vk)
                    + offs_n[:, None] * stride_vk
                    + offs_d[None, :] * stride_vd,
                    mask=offs_n[:, None] < seq_len, other=0.0)

        acc = acc * alpha[:, None] * (d_i / d_new)[:, None]
        acc += tl.dot(p, v) / d_new[:, None]

        m_i = m_new
        d_i = d_new

    # 5. 写回输出
    tl.store(o_ptr + (b_idx * stride_ob + h_idx * stride_oh
             + block_m * BLOCK_M * stride_om)
             + offs_m[:, None] * stride_om
             + offs_d[None, :] * stride_od,
             acc, mask=offs_m[:, None] < seq_len)
```

## 5. 常见陷阱

1. **K 要转置**：`S = Q @ K^T`，用 `tl.trans(k)` 而不是 `.T`
2. **dtype 对齐**：Q/K/V 是 fp16，`acc` 必须是 float32。`tl.dot(Q, K)` 要求两个操作数同 dtype
3. **acc 更新顺序**：先 rescale 旧值，再加新贡献——写反了就全错
4. **Mask 在正确的维度**：Q 的 mask 是 `offs_m[:, None] < seq_len`，K/V 是 `offs_n[:, None] < seq_len`
5. **省略 logsumexp**：生产代码需要存 LSE 给 backward 用。仅 forward 时可以跳过

## 6. v1 → v2 → v3 演进

| 版本 | 年份 | 关键改进 | 硬件要求 |
|------|------|---------|---------|
| FlashAttention v1 | 2022 | Tiling + online softmax + kernel fusion | 任意 GPU |
| FlashAttention v2 | 2023 | 更好的并行策略，减少非 matmul 操作 | Ampere+ |
| FlashAttention v3 | 2024 | TMA 异步拷贝、FP8、Hopper 专属优化 | H100 以上 |

我们实现的是 v1 的 forward pass——架构最清晰，最适合理解核心思想。

## 7. 延伸阅读

- [FlashAttention 论文 (NeurIPS 2022)](https://arxiv.org/abs/2205.14135)
- [FlashAttention-2 论文](https://arxiv.org/abs/2307.08691)
- [Triton 官方 Fused Attention Tutorial](https://triton-lang.org/main/getting-started/tutorials/06-fused-attention.html)
- [知乎：Triton 概念与编程入门笔记](https://zhuanlan.zhihu.com/p/12789107689)
