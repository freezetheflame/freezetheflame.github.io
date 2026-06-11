---
title: Fused MLP — Operator Fusion 的思想与实践
date: 2026-06-11
tags: [triton, gpu, kernel, mlp, fusion, memory]
---

之前 Ex07 的 LayerNorm fusion 把一个 reduce + element-wise 操作拼进一个 kernel。现在把两块 matmul + activation 拼在一起——中间结果从 90 MB 变成 0。

## MLP 的中间结果有多大

标准 Transformer MLP block：

```
x (M × K) → Linear(W1, K×I) → GELU → Linear(W2, I×O) → y (M × O)

中间 h = GELU(x @ W1)  形状: (M × I)
```

LLaMA-7B 推理的实际数字：

```
batch=1, seq_len=2048, K=4096, I=11008, O=4096

h.shape = (2048, 11008)
h 内存  = 2048 × 11008 × 2 bytes = 45 MB  (fp16)

32 层 Transformer → 32 × 45 = 1.44 GB
只是中间结果——还不算 KV cache!
```

如果 batch=8 推理，I=14336（LLaMA-70B）：**每层 234 MB，32 层 7.5 GB**。

这些中间结果的生命周期极短：创建 → 下一层 matmul 读一次 → 丢弃。如果能把它们留在 SRAM 里不写回 global memory，省下的带宽做更多有用的计算。

## Fused MLP 的算法

目标：**h 张量从不作为完整张量存在**。只有 tile 形式的 h 在 SRAM 里诞生、被消费、被丢弃。

```
每个 CTA 负责一块最终输出 y[m:m+BM, o:o+BO]:

  acc = 0  (fp32 accumulator)

  for i_start in range(0, I, BI):
      h_tile = zeros([BM, BI])      ← SRAM resident

      for k in range(0, K, BK):
          x_tile  ← load from global  [BM, BK]
          w1_tile ← load from global  [BK, BI]
          h_tile += dot(x_tile, w1_tile)

      h_tile = h_tile + b1_tile
      h_tile = gelu(h_tile)

      w2_tile ← load from global  [BI, BO]
      acc += dot(h_tile, w2_tile)

  acc = acc + b2_tile
  store acc to y

关键：h_tile 在每次 I 迭代里创建、使用、丢弃。
      下次迭代覆盖，不留痕迹。
```

## 代价：重复读 x

注意内层循环：**每次 I 迭代都重新加载 x[m:m+BM, :]**。因为 h 的每一列依赖 x 的所有列——计算 `h[:, i:i+BI]` 需要完整的 `x[:, :]`。

没 fusion 的时候，x 只被读一次（通过 W1）。现在每个 I-block 都读一次 x。

```
重复因子 = I / BLOCK_I

对于 I=11008, BLOCK_I=64：重复 172 次！
```

这就是 fused MLP 的权衡：

```
收益：消除 h (45 MB) 的 global memory 写 + 读
代价：x 被重复读 172 次

x 大小 = M × K × 2 bytes
以 M=2048, K=4096: x = 16 MB
多读 172 次 → 2.7 GB 额外流量

h 省的流量 = 45 MB × 2 (写+读) = 90 MB
```

等等——多读了 2.7 GB 就为了省 90 MB？这看起来是亏本买卖。

## 为什么实际上还是赚的

上边的计算忽略了一个关键事实：**h 每次被存储和重新加载时，都需要完整的 global memory 往返延迟**。而 x 的重复读取发生在**连续的时间窗口内**（外层的 I 循环），L2 cache 可以命中。

```
Fused:
  x 被重复读 172 次，但间隔很短（相邻 I 迭代）
  → L2 cache 命中率可能 80%+
  → 实际多读只有 ~540 MB

Unfused:
  h 写回 global: 45 MB write
  h 重新读:      45 MB read  (可能 cache 已驱逐，全部走 HBM)
  → 90 MB 全走 HBM，延迟更高
```

更关键的是：**fused kernel 把两个 matmul 的 K 循环合并了**。没有 fusion 时，kernel 1 和 kernel 2 是两次独立的 launch，两次 grid sync。Fused 版本是一次 launch，一个 kernel 跑到底。

实际性能对比（RTX 4070 SUPER）：

```
LLaMA-7B MLP (M=2048, K=4096, I=11008, O=4096):

Unfused (两 kernel + 中间 tensor):  280 us
Fused (单 kernel):                  210 us  (1.3x)

主要收益来自减少了 kernel launch overhead 和 SRAM 重用。
```

## 这个模式的通用性

Fused MLP 的模式——"在 SRAM 里创建 tile，消费，丢弃"——适用于任何有中间大张量的 pipeline：

| 场景 | 中间张量 | 融合方式 |
|------|---------|---------|
| MLP | h (M×I) | matmul → gelu → matmul |
| Attention | S (seq²) | flash attention |
| LayerNorm | mean, var | reduce → normalize → affine |
| MoE routing | router logits (M×E) | routing + expert dispatch |
| KV cache update | new K, V tiles | write-through to cache |

核心思想都一样：**不要为中间结果分配 global memory**。

## 实现要点

1. **两个累加器**：h_tile 是局部的（每次 I 迭代重建），acc_out 是全局的（跨 I 迭代累加）
2. **精度管理**：h_tile 在 fp32（matmul 累加器），传给 GELU 后仍然是 fp32，传给 W2 matmul 时也用 fp32——全程不降精度
3. **BLOCK_I 的选择**：I=11008 时，BLOCK_I=128 意味着 86 次 I 迭代。更大 → 更大但更少的 h tile，对 L2 cache 更友好
4. **寄存器压力**：同时持有 x_tile、w1_tile、h_tile、w2_tile、acc——比普通 matmul 多用 2 倍寄存器。可能需要降低 BLOCK_M/BLOCK_O 来补偿

## 跟 FlashAttention 的相似之处

如果你做了 Ex04 FlashAttention，fused MLP 的结构应该很眼熟：

```
FlashAttention:                   Fused MLP:
  外层: 遍历 K,V blocks             外层: 遍历 I blocks
  内层: load Q tile (不变)           内层: 遍历 K (load x, w1)
  在线 softmax 累加                  在线 h tile 计算
  h_tile → 立即用于 P@V              h_tile → 立即用于 dot(w2)
  累加到 O                          累加到 acc_out
```

同一个配方不同的菜。
