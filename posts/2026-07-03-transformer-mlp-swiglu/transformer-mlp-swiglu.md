---
title: 理解 Transformer 中的 MLP — 从 FFN 到 SwiGLU
date: 2026-07-03
tags: [transformer, mlp, swiglu, architecture, activation]
---

Transformer 的每一层由两个核心组件组成：Attention 负责 token 之间的信息交换，MLP 负责每个 token 内部的非线性变换。这篇文章从常识出发，讲清楚 MLP 的设计为什么会从最朴素的 `Linear → ReLU → Linear` 演化成今天所有 LLM 都在用的 SwiGLU。

## Attention 之后：为什么还要 MLP

Attention 做的事很简单——让当前 token 去看其他 token，做加权聚合。但这里有两个局限：

1. **Attention 本质是线性加权**。虽然它算出了复杂的权重分布，但最终输出只是 V 的加权和——加权和仍然是一个线性操作。
2. **Attention 只看别人，不看自己**。它融合了外部信息，但没有对自己内部做"思考"。

MLP 填补这个缺口。它**逐位置独立**地对每个 token 的表示做非线性变换。Attention 和 MLP 的分工：

```
Attention: "我应该关注哪些 token？"   → 跨位置的信息交换
MLP:       "这个 token 的信息应该怎样重新组织？" → 位置内的特征变换
```

用一个比喻：Attention 是会议讨论（大家交换意见），MLP 是每个人回到座位后的独立思考（消化和转化）。

## 经典 FFN 的结构

最早的 Transformer 论文（Vaswani et al., 2017）里的 FFN 长这样：

```
x (d_model) → Linear(d_model → d_ff) → ReLU → Linear(d_ff → d_model) → y (d_model)
```

两个线性层中间夹一个激活函数。d_ff 通常是 d_model 的 4 倍——先**膨胀**再**收缩**：

```
d_model = 512  →  d_ff = 2048  →  d_model = 512
```

为什么要膨胀？直觉上，低维空间的非线性表示能力有限。把向量投影到更高维空间，ReLU 可以激活不同的模式，然后再投影回来——这个过程给了模型更丰富的表达能力。

你可以类比为：写文章先打草稿（展开思路），再精简成最终稿（压缩回来）。

## 激活函数的演进

MLP 的"灵魂"在于中间的非线性激活函数。不同时期的主流选择：

### ReLU (2017)

```python
relu(x) = max(0, x)
```

简单粗暴，负半轴完全置零。优点是计算快、梯度不会消失（正半轴恒为 1）。问题也很明显：负半轴的神经元"死掉"后永远不更新（dying ReLU）。

### GELU (2018, GPT-2 / BERT)

```python
gelu(x) = x · Φ(x)    # Φ 是标准正态分布的 CDF
```

GELU 是 ReLU 的平滑版本，不再一刀切——输入越接近零，输出越小但不是零；输入越负，趋近于零但不完全为零。BERT 和 GPT-2 都用它。它在数学上等价于"随机正则化 dropout 的期望值"，所以比 ReLU 的性能好一截。

### SwiGLU (2022, PaLM / LLaMA)

到了 2022 年，Google 的 PaLM 论文提出了 SwiGLU，Meta 的 LLaMA 立刻跟进。之后所有开源 LLM 几乎无一例外都用了 SwiGLU。

## SwiGLU 到底是什么

SwiGLU 不是换了一个激活函数，而是**改变了 MLP 的整体结构**。经典的 FFN 只有两个权重矩阵（W1, W2），但 SwiGLU 用了**三个**：

```
经典 FFN（2 个权重）：
  x → Linear(d_model → d_ff) → ReLU → Linear(d_ff → d_model) → y

SwiGLU（3 个权重）：
  x → gate_proj(d_model → d_intermediate) ──┐
                                              ├─ silu(gate) ⊙ up ──→ down_proj → y
  x → up_proj(d_model → d_intermediate)   ──┘
```

一张图看清楚区别：

```
        x                          x
        │                   ┌──────┴──────┐
   Linear(W1)               │             │
        │              gate_proj      up_proj
     activation         (W_gate)      (W_up)
        │                   │             │
   Linear(W2)            SiLU            │
        │                   │             │
        y                   └── ⊙ ───────┘
                                 │
                            down_proj
                            (W_down)
                                 │
                                 y
```

三个权重矩阵的名字来自 HuggingFace Qwen2/Llama 的实际代码：

| 矩阵 | 形状 (Qwen2.5-0.5B) | 作用 |
|------|-----|------|
| `gate_proj` | 896 → 4864 | 门控：决定哪些信息可以通过 |
| `up_proj` | 896 → 4864 | 提升：把输入投影到高维 |
| `down_proj` | 4864 → 896 | 压缩：降回原来的维度 |

计算过程：

```python
# SwiGLU 的核心公式
h = silu(gate_proj(x)) * up_proj(x)    # element-wise 相乘
y = down_proj(h)
```

### 门控机制

"gate" 这个词很关键。SwiGLU 把激活函数的角色一分为二：

- `up_proj` 照常产生一组值（相当于原来 W1 的输出）
- `gate_proj` 产生另一组同样形状的值，经过 SiLU 后变成 [0, 1) 范围的"门"
- **门控制了哪些值可以流过去**——接近 0 的门会抑制，接近 +∞ 的门会让值透过

这种门控机制让模型学会了**自适应地选择**每个维度上哪些特征重要。不是一刀切的 ReLU 负值归零，也不是平滑的 GELU——每个输入自己决定如何过滤。

### SwiGLU vs GLU vs 普通 FFN 的参数数量

SwiGLU 有三个权重矩阵，看起来参数更多？是的——但论文用的是公平对比。原来的 FFN 用 `d_ff = 4 × d_model`，SwiGLU 用 `d_intermediate ≈ 2.67 × d_model`，总参数量持平：

```
经典 FFN:  W1 + W2 = d_model × 4d + 4d × d_model = 8d²
SwiGLU:    W_gate + W_up + W_down = d × 2.67d + d × 2.67d + 2.67d × d = 8d²
```

参数量一样，但 SwiGLU 的性能更好。这就是为什么所有现代 LLM 都切换过来了。

## 一个真实模型的 shape 走查

以 Qwen2.5-0.5B 为例，用 `register_forward_hook` 追踪 MLP 内部的 tensor flow。输入是一个形状为 `(1, 16, 896)` 的向量——batch=1，16 个 token，每个 896 维。

```
输入 x:                        (1, 16, 896)
    │
    ├── gate_proj(x)           (1, 16, 896)  →  (1, 16, 4864)
    │       │
    │     silu()               element-wise, 不改变 shape
    │       │
    │   gate_output:           (1, 16, 4864)
    │
    ├── up_proj(x)             (1, 16, 896)  →  (1, 16, 4864)
    │       │
    │   up_output:             (1, 16, 4864)
    │
    └── gate_output ⊙ up_output → (1, 16, 4864)  ← element-wise 乘
            │
        down_proj               (1, 16, 4864) →  (1, 16, 896)
            │
输出 y:                         (1, 16, 896)
```

几个值得注意的点：

1. **gate 和 up 的输出 shape 完全一致**——这保证了 element-wise 乘法能逐元素对齐
2. **中间膨胀比是 5.43x**（4864 / 896）——比经典的 4x 稍大，因为 Qwen2.5-0.5B 没有严格遵循 8d/3 的公式，小模型的维度选择更灵活
3. **down_proj 压缩回原来的 hidden_size**——加上 residual connection 后才能相加

## SiLU 为什么是 SiLU

也就是 Swish 激活函数：`silu(x) = x · σ(x)`，其中 σ 是 sigmoid。

```
SiLU 图（用文字表示）:
         │        ╱
         │      ╱
    ─────┼───╱───  x → +∞ 时，silu(x) ≈ x
       ╱ │
    ╱    │         x < 0 时，silu(x) 是负的但趋近于 0（不像 ReLU 完全归零）
         │         x → -∞ 时，silu(x) → 0
```

和 GELU 对比：
- SiLU 在正值区域是近似线性的（GELU 也是）
- SiLU 在负值区域允许小负数通过（GELU 也是）
- SiLU 计算更简单（sigmoid 比高斯 CDF 快）
- SiLU 作为门控时，sigmoid 部分天然是 [0,1]，语义清晰

## 总结

MLP 在 Transformer 里的角色可以概括为：**每个 token 的"内部处理单元"**。它的演化反映了研究者对非线性表达能力日益深入的理解：

```
ReLU FFN (2017)
  │
  ├─ 问题: dying ReLU, 一刀切
  │
  ▼
GELU FFN (2018)
  │
  ├─ 平滑了, 但 activation 仍然是一个整体概念
  │
  ▼
SwiGLU (2022)
  │
  └─ 门控机制: 把"激活"拆成 gate + value
     让模型学会自适应地过滤信息
```

如果你正在手写 Transformer 或者 debug attention/MLP 的 shape 问题，记住这个口诀：**Attention 是 token 之间的对话，MLP 是每个 token 自己的思考**。
