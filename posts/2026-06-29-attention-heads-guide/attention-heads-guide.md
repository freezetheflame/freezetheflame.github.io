---
title: "多头注意力完全图解：MHA/MQA/GQA/MLA的头部关系与数量约束"
date: 2026-06-29
tags: [注意力机制, Transformer, MHA, GQA, MLA, 推理优化, KV Cache]
---

如果你用过 LLaMA、Mistral、Qwen 或者 DeepSeek-V2，肯定在它们的 config.json 里见过 `num_attention_heads` 和 `num_key_value_heads` 这两个参数。前者等于 32 或 64，后者可能是 8、16 或者跟前者一样——这**不是随便选的数字**，这两者的关系直接决定了推理时的 KV Cache 大小和加速比。

本文用三张 Excalidraw 图解，把 MHA（标准多头注意力）、MQA（多查询注意力）、GQA（分组查询注意力）和 MLA（多头潜在注意力）的**头部数量关系、整除约束和数值例子**讲清楚。

<!--more-->

---

## 📐 引子：注意力「头」到底是什么？

在 Transformer 中，每个 attention head 是一个独立的"视角"：

$$
\text{Head}_i = \text{Attention}(Q_i, K_i, V_i) = \text{softmax}\left(\frac{Q_i K_i^T}{\sqrt{d_k}}\right) V_i
$$

其中：
- **Q (Query)**：当前 token 发出的"我关注谁"
- **K (Key)**：所有 token 的"我是谁"
- **V (Value)**：所有 token 的"我有什么"

多个 attention head 的结果拼接后通过输出投影融合：

$$
\text{MultiHead}(Q,K,V) = \text{Concat}(\text{Head}_1, \text{Head}_2, ..., \text{Head}_H) W_O
$$

所有变体（MHA/MQA/GQA/MLA）的区别，本质上是 **Q、K、V 的头数关系不同**。

---

## 🧩 第一章：标准多头注意力 (MHA)

### 基本概念

MHA（Multi-Head Attention）是 Transformer 原始论文中提出的方案。每个 attention head 拥有**独立的 Q、K、V 投影矩阵**。

### 数量关系

| 变量 | 符号 | MHA 中的值 |
|------|------|-----------|
| Q 头数 | $H_q$ | $H$ |
| K 头数 | $H_k$ | $H$ |
| V 头数 | $H_v$ | $H$ |
| 总注意力头数 | $H$ | 模型配置参数 |

核心关系：$H_q = H_k = H_v = H$

### 参数规模

每个 head 的维度 $d_h = d_{model} / H$，投影矩阵：

$$
W_Q \in \mathbb{R}^{d_{model} \times d_{model}}, \quad
W_K \in \mathbb{R}^{d_{model} \times d_{model}}, \quad
W_V \in \mathbb{R}^{d_{model} \times d_{model}}
$$

**一个数值例子**：d_model=4096, H=32, d_h=128

- 每个 head 的 Q/K/V 维度：128
- 总参数：3 × (4096 × 4096) ≈ 50M 参数（仅注意力投影层）
- KV Cache 大小（每层）：2 × H × d_h × seq_len × 精度字节 = 2 × 32 × 128 × seq_len × 2 = 16,384 × seq_len 字节

### 推理瓶颈

MHA 每生成一个 token 都需要缓存**所有 H 个头的 K 和 V 矩阵**。当 batch size 和序列长度增加时，KV Cache 占用线性增长，成为推理时的主要显存瓶颈。

---

## 🔗 第二章：多查询注意力 (MQA)

### 动机

MQA（Multi-Query Attention）由 Shazeer 在 2019 年提出，核心观察是：**解码时 K/V 缓存的带宽压力远大于计算压力**。如果能减少 K/V 头数，KV Cache 就能大幅缩减。

### 数量关系

MQA 将所有 Q head 映射到**同一个 K head 和同一个 V head**：

| 变量 | MQA 中的值 | 与 MHA 对比 |
|------|-----------|-------------|
| $H_q$ | $H$ | 不变 |
| $H_k$ | 1 | 减少到 1/H |
| $H_v$ | 1 | 减少到 1/H |

### KV Cache 节省

MQA 的 KV Cache 大小只相当于 MHA 的 **1/H**：

```
MHA KV Cache / 层 = 2 × H × d_h × seq_len × 2 bytes (FP16)
MQA KV Cache / 层 = 2 × 1 × d_h × seq_len × 2 bytes
```

以 H=32 为例，MQA 的 KV Cache 仅为 MHA 的 **3.125%**。

### 代价

共享 K/V 会降低模型的表达能力。在大模型场景下，MQA 的质量损失显著——尤其在不同 head 需要关注不同语义特征时，强制所有 head 共享同一个 K/V 过于激进。

---

## 👥 第三章：分组查询注意力 (GQA)

### GQA 的折中方案

GQA（Grouped Query Attention）由 Ainslie 等人 2023 年提出，是 MHA 和 MQA 的**中间地带**。

### 数量关系

| 变量 | GQA 中的值 | 说明 |
|------|-----------|------|
| $H_q$ | $H$ | 不变 |
| $H_k$ | $G$ | 分组数 (1 ≤ G ≤ H) |
| $H_v$ | $G$ | 与 K 相同 |

**核心约束**：$H_q \bmod G = 0$，即 Q 头数必须能被分组数整除。

**每组的 Q 头数**：

$$
\frac{H_q}{G} = \text{每个 K/V head 服务的 Q 头数量}
$$

### 边界情况

| G 的值 | 等价于 | 说明 |
|--------|-------|------|
| G = 1 | MQA | 所有 Q 共享 1 个 K/V |
| G = H | MHA | 每个 Q 有独立的 K/V |
| G = 2, 4, 8 | GQA | 折中方案，主流选择 |

### 工业界实践

| 模型 | d_model | $H_q$ | $H_k$ (G) | 每组 Q 头数 | KV Cache 节省 |
|------|---------|-------|----------|------------|--------------|
| LLaMA 1 65B | 8192 | 64 | 64 | 1 (MHA) | 1× |
| LLaMA 2 7B | 4096 | 32 | 32 | 1 (MHA) | 1× |
| LLaMA 2 70B | 8192 | 64 | 8 | 8 | **8×** |
| LLaMA 3 8B | 4096 | 32 | 8 | 4 | **4×** |
| LLaMA 3 70B | 8192 | 64 | 8 | 8 | **8×** |
| LLaMA 3.1 405B | 16384 | 128 | 8 | 16 | **16×** |
| Mistral 7B | 4096 | 32 | 8 | 4 | **4×** |
| Mistral Large (2) | 12288 | 96 | 8 | 12 | **12×** |
| Mixtral 8×7B | 4096 | 32 | 8 | 4 | **4×** |
| Qwen2 72B | 8192 | 64 | 16 | 4 | **4×** |
| Gemma 2 9B | 3584 | 16 | 8 | 2 | **2×** |
| Gemma 2 27B | 4608 | 32 | 16 | 2 | **2×** |

可以看到，**G=8 是目前最流行的配置**——LLaMA 70B、Mistral、Mixtral 都选了它。LLaMA 3.1 405B 进一步把 G 降到 8（H=128→每组 16 个 Q 头），以照顾超大规模推理的 KV Cache 开销。

### 为什么是 G=8 最流行？

这是一个经验权衡：

```
G 越小 → KV Cache 越小 → 推理越快 → 但质量越差
G 越大 → 质量越好 → 但 KV Cache 越大 → 推理越慢
```

G=8 在质量和速度之间找到了一个较好的平衡点。

---

## 🔢 第四章：数值约束详解

### 4.1 整除约束

**硬性要求**：$H_q \bmod H_{kv} = 0$

为什么？因为注意力计算中，Q 需要按组与 K 做带 batch 维度的矩阵乘法：

```python
def gqa_attention(Q, K, V, H_q, H_kv):
    # Q shape: [batch, seq, H_q * d_h]
    # K shape: [batch, seq, H_kv * d_h]

    # 将 Q 重新排列成 [batch, seq, G, h_per_group, d_h]
    # 其中 G = H_kv, h_per_group = H_q / H_kv
    Q = Q.view(batch, seq, H_kv, H_q // H_kv, d_h)
    K = K.view(batch, seq, H_kv, 1, d_h)  # 广播

    # batched matmul:
    scores = torch.matmul(Q, K.transpose(-2, -1))
    # 这里要求 H_q // H_kv 是整数
```

如果 $H_q / H_kv$ 不是整数，就会产生"不均匀分组"——有些组多一个 Q head，有些组少一个。这会破坏计算图的规则性，导致无法用统一的 batch matmul 实现。

### 4.2 Head 维度约束

每个 attention head 的维度：

$$
d_h = \frac{d_{model}}{H_q}
$$

常见取值：64、96、128。

对 GQA 来说，K/V head 的维度也是 $d_h$，只是数量减少到 $H_kv$：

- K 的总维度：$H_kv \times d_h = H_kv \times d_{model} / H_q$
- V 的总维度：同上

### 4.3 KV Cache 大小的精确公式

```python
def kv_cache_size(
    num_layers: int,
    batch_size: int,
    seq_len: int,
    d_model: int,
    H_q: int,
    H_kv: int,
    precision_bytes: int = 2,  # FP16
) -> int:
    """返回 KV Cache 总大小（字节）"""
    d_h = d_model // H_q
    kv_size_per_layer = 2 * H_kv * d_h * seq_len * precision_bytes  # K + V
    return num_layers * batch_size * kv_size_per_layer
```

**一个具体例子**：LLaMA 3 8B 推理，batch=4, seq=8192

```
d_model = 4096, H_q = 32, H_kv = 8
d_h = 4096 / 32 = 128
num_layers = 32

每层 KV Cache = 2 × 8 × 128 × 8192 × 2 = 33,554,432 字节 ≈ 32 MB
总 KV Cache = 32 × 4 × 32 MB ≈ 4 GB
```

如果换成 MHA（H_kv=32），总 KV Cache 将变成 16 GB——4 倍差距。

### 4.4 节省率公式

$$
\text{KV Cache 节省倍数} = \frac{H_q}{H_kv}
$$

| 机制 | $H_q$ | $H_kv$ | 节省倍数 |
|------|-------|--------|---------|
| MHA | 32 | 32 | 1× (基准) |
| GQA (G=8) | 32 | 8 | 4× |
| GQA (G=4) | 32 | 4 | 8× |
| MQA | 32 | 1 | 32× |

---

## 🧪 第五章：多头潜在注意力 (MLA)

### DeepSeek 的创新

MLA（Multi-head Latent Attention）是 DeepSeek-V2 提出的 KV Cache 压缩方案。它的核心思想是：**对 KV 进行低秩压缩，只缓存压缩后的 latent 表示，在计算时再展开**。

### 与传统 GQA 的关键区别

| 维度 | 传统 GQA | MLA |
|------|---------|-----|
| KV Cache 存储 | 完整的 $H_kv \times d_h$ | 压缩后 $d_l$ 维 latent |
| 共享方式 | Q 头分组共享 K/V | 所有 Q 头共享 latent KV |
| 展开方式 | 无需展开 | 通过 up-projection 展开 |
| 额外操作 | 无 | Matrix Absorption |

### 数学原理

MLA 将 K 和 V 的投影矩阵分解为两个低秩矩阵：

$$
W_K = W_{UK} \circ W_{DK}, \quad W_V = W_{UV} \circ W_{DV}
$$

其中：
- $W_{DK} \in \mathbb{R}^{d_l \times d_{model}}$（down-projection，压缩）
- $W_{UK} \in \mathbb{R}^{d_{model} \times d_l}$（up-projection，展开）
- $d_l \ll d_{model}$（latent 维度）

推理时，KV Cache 仅存储 latent 表示：

$$
C_{KV} = W_{DK} \cdot [h_1, h_2, ..., h_t] \quad \text{(shape: [seq\_len, d\_l])}
$$

### Matrix Absorption

这是 MLA 最关键也最精妙的优化。传统 naive 做法是先展开 latent KV 再算注意力：

```
K = C_KV @ W_UK     # [seq, d_model] — 展开，浪费带宽
A = Q @ K^T          # 注意力计算
```

Matrix Absorption 将 up-projection 吸收进 Q：

```
Q_absorbed = Q @ W_UK^T    # 先吸收：Q [d_model] → Q [d_l]
A = Q_absorbed @ C_KV^T     # 在 latent space 计算
```

这样**无需显式展开 latent KV**——计算的中间状态在更低的 $d_l$ 维空间中就完成了。这需要自定义 CUDA kernel 来实现，但能带来显著的带宽节省。

### KV Cache 对比（DeepSeek-V2 参数）

| 方法 | 每层 KV Cache 大小 | 节省 |
|------|-------------------|------|
| GQA (H=128, G=16, d_h=128) | 2 × 16 × 128 = 4096 个元素 | 基准 |
| MLA (d_l=512) | 2 × 512 = 1024 个元素 | **4×** |
| MHA (H=128) | 2 × 128 × 128 = 32768 个元素 | 8× (vs GQA) |

DeepSeek-V2 实测 MLA 可减少约 **75%** 的 KV Cache 占用，同时保持与全注意力相当的质量。

---

## 📊 第六章：总结与速查

### 核心公式速查

| 概念 | 公式 |
|------|------|
| Head 维度 | $d_h = d_{model} / H_q$ |
| GQA 分组数 | $G = H_kv$ |
| 每组 Q 头数 | $H_q / H_kv$ |
| 整除约束 | $H_q \bmod H_kv = 0$ |
| KV Cache 节省倍率 | $H_q / H_kv$ |
| MLA latent 维度 | $d_l \ll H_kv \times d_h$ |

### 选择指南

| 场景 | 推荐方案 | 理由 |
|------|---------|------|
| 小模型 (1B-7B) | MHA | KV Cache 压力小，质量优先 |
| 大模型 (7B-70B) 推理 | GQA (G=8) | 质量和速度的最佳平衡 |
| 超大模型 (70B+) 推理 | GQA (G=4~8) | 更大模型需更多 KV Cache 优化 |
| 极致推理吞吐 | MQA | 质量可牺牲时 |
| 长上下文 (128K+) | MLA 或 KV 量化 | KV Cache 成为主要瓶颈 |
| 显存受限部署 | GQA (G=4) + KV Cache 量化 | 双重压缩 |

### 推荐阅读

- 📖 [Attention Is All You Need](https://arxiv.org/abs/1706.03762)（Vaswani et al., 2017）— Transformer 原始论文，MHA 的起源
- 📖 [Fast Transformer Decoding: One Write-Head is All You Need](https://arxiv.org/abs/1911.02150)（Shazeer, 2019）— MQA 论文
- 📖 [GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints](https://arxiv.org/abs/2305.13245)（Ainslie et al., 2023）— GQA 论文
- 📖 [DeepSeek-V2: A Strong, Economical, and Efficient Mixture-of-Experts Language Model](https://arxiv.org/abs/2405.04434) — MLA 论文
- 📖 [FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness](https://arxiv.org/abs/2205.14135) — IO-aware 注意力计算的基础

---

## 🚀 下一步

理解头部关系后，你可以：

1. **动手改 config**：试试把一个 MHA 模型改为 GQA（通过平均池化合并 K/V head），感受质量损失和速度提升
2. **算你的 KV Cache**：用上面的公式算算自己的模型在目标序列长度和 batch size 下需要多大显存
3. **用代码验证**：在推理引擎（vLLM / llama.cpp）中比较 MHA/GQA/MQA 的实际吞吐差异

理解了"头"的关系，你就能在模型配置层面做出明智的推理优化决策——而不是只知道"跑起来"。

### 📊 本文配套图解

> **图1：MHA vs MQA vs GQA 对比图** — Q/K/V 头数和映射关系
> 在线查看：[https://excalidraw.com/#json=0osGQ_FXYcqF7-T9nZMRR,Ys0w7R8wGVTctOOLQnh00A](https://excalidraw.com/#json=0osGQ_FXYcqF7-T9nZMRR,Ys0w7R8wGVTctOOLQnh00A)
> 文件位置：`images/mha-vs-mqa-vs-gqa.excalidraw`

> **图2：注意力头数量约束图解** — 整除约束、GQA 连续谱、实战示例
> 在线查看：[https://excalidraw.com/#json=sQYUP3nTQ51NTjdq70GV0,HvWn_12aT6iLzRzHVE_bsQ](https://excalidraw.com/#json=sQYUP3nTQ51NTjdq70GV0,HvWn_12aT6iLzRzHVE_bsQ)
> 文件位置：`images/head-count-constraints.excalidraw`

> **图3：MLA — Multi-head Latent Attention 原理**
> 在线查看：[https://excalidraw.com/#json=91-QXaL8Ll0TjoKy6fuUy,PLJ4c6oIEyb7uNHEkH1wJw](https://excalidraw.com/#json=91-QXaL8Ll0TjoKy6fuUy,PLJ4c6oIEyb7uNHEkH1wJw)
> 文件位置：`images/mla-principle.excalidraw`
