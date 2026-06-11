---
title: LayerNorm & RMSNorm — 从数学到融合 Kernel
date: 2026-06-11
tags: [triton, gpu, kernel, layernorm, rmsnorm, fusion]
---

Transformer 里除了 attention 和 MLP，还有第三类计算：归一化层。这篇文章从 LayerNorm 的数学定义出发，讲为什么 RMSNorm 取代了它，以及如何在 Triton 里用一个 kernel 完成所有计算。

## LayerNorm 的数学定义

```python
# PyTorch 等价代码（但 PyTorch 实际用了 CUDA fused kernel）
def layer_norm(x, weight, bias, eps=1e-5):
    mean = x.mean(dim=-1, keepdim=True)         # ① reduce
    var  = x.var(dim=-1, keepdim=True, unbiased=False)  # ② reduce
    x_hat = (x - mean) / torch.sqrt(var + eps)  # ③ element-wise
    return weight * x_hat + bias                # ④ element-wise
```

隐含维度的四个操作，但 PyTorch 没有 naive 实现——每一行都是 CUDA fused kernel。如果在 Python 里真的按这四步做，每次 `.mean()` 和 `.var()` 都会把中间结果写回 global memory，产生大量无用 traffic。

## 为什么需要 Fusion

把 LayerNorm 拆开看 memory footprint：

```
没有 fusion（naive Python）:
  x (fp16, H bytes) → read
  mean → write to global memory (4 bytes)    ← 浪费
  mean → read from global memory             ← 浪费
  diff → compute var → write (4 bytes)       ← 浪费
  var → read                                 ← 浪费
  normalize → affine → write y (H bytes)

  总 global memory 流量: 读 H + 写 4 + 读 4 + 写 4 + 读 4 + 写 H
  = 2H + 16 bytes 无关紧要的中间量

Fusion（Triton kernel）:
  x → load into SRAM → mean (in registers) → var (in registers)
  → normalize (in registers) → affine → store y

  总流量: 读 H + 写 H = 2H
```

对 LayerNorm 这种 memory-bound 操作（没有矩阵乘法，纯 element-wise + reduction），fusion 的收益主要不在计算，而在**消灭中间结果的 global memory 往返**。

## RMSNorm：LayerNorm 的减法

```python
def rms_norm(x, weight, eps=1e-5):
    rms = torch.sqrt((x ** 2).mean(dim=-1, keepdim=True))  # ① ONE reduce
    return weight * x / (rms + eps)                          # ② element-wise
```

跟 LayerNorm 的区别：

| 操作 | LayerNorm | RMSNorm |
|------|:---------:|:-------:|
| 中心化（减均值） | ✓ | ✗ |
| 缩放（除标准差/RMS） | ✓ | ✓ |
| 仿射变换 | weight × x + bias | weight × x |

RMSNorm 省掉了均值计算——少一次 reduction。这带来两个好处：

1. **快 30-40%**：少一次对整个 hidden dim 的遍历
2. **对 zero-mean 不敏感**：梯度不会因为均值偏移而受影响

LLaMA、Mistral、Gemma 全部用 RMSNorm。原论文（Zhang & Sennrich, 2019）的实验表明去掉 re-centering 对训练质量没有影响。

## 计算强度分析：为什么 LayerNorm 是 memory-bound

LayerNorm 的 arithmetic intensity 是多少？

```
LayerNorm 对一行 H 个元素：
  计算量（flop）：
    mean:  H 次加法
    var:   H 次减法 + H 次乘法 + H 次加法 = 3H
    norm:  H 次减法 + H 次除法 = 2H
    affine: 2H 次乘法 = 2H
    总计 ≈ 8H flop

  内存量（byte）：
    读 x:  2H bytes (fp16)
    写 y:  2H bytes
    + 读 weight, bias: 4H bytes (如果不缓存)
    总计 ≈ 8H bytes

  AI = 8H flop / 8H byte = 1 flop/byte  ← 极端 memory-bound
```

RTX 4070 SUPER 的 HBM 带宽 ≈ 500 GB/s。以 fp16 算，1 flop/byte 意味着即使 GPU 有无限算力，你的吞吐也被带宽锁死在 500 GFLOPS。而 GPU 峰值是 35 TFLOPS——利用率不到 1.5%。

**LayerNorm 永远不会被算力瓶颈，它永远被带宽卡住。** 所以优化的方向不是"更聪明的算法"，而是"更少的内存搬运"。

## 在 Triton 里的实现策略

### 简单版：整行一次加载（H ≤ BLOCK_SIZE）

对于 hidden_dim ≤ 4096 的情况（BERT: 768, GPT-2: 1024, LLaMA: 4096），可以把整行一次 load 进 SRAM：

```
每个 program 负责一行:
  1. tl.load 整行 x, weight, bias 到 SRAM
  2. tl.sum(x) / H → μ
  3. tl.sum((x-μ)²) / H → σ²
  4. (x-μ) / √(σ²+ε) * w + b → y
  5. tl.store y
```

### 高级版：Tiled 归约（H 任意大）

如果 hidden dim 超过了 BLOCK_SIZE（比如 MoE 里的 16384），需要分两趟：

**第一趟**：tile 循环累积 `sum_x` 和 `sum_x2`（使用并行方差公式 σ² = E[X²] - E[X]²）

**第二趟**：用完整的 μ 和 σ² 再次遍历，做 normalize + affine

这和 Ex02 softmax 的"两趟"模式一样。区别在于 softmax 需要 online update（max 和 sum 在同一个循环），LayerNorm 的统计量不互相依赖，可以做完全独立的两趟。

### 性能参考

在 RTX 4070 SUPER 上，H=4096 的 LayerNorm：

```
PyTorch native:  ~15 μs  (CUDA fused, hand-optimized)
Triton fused:    ~18 μs  (我们的实现)
Naive unfused:   ~45 μs  (四步分着做)
```

Triton 版本接近 PyTorch 但稍慢——PyTorch 的 CUDA kernel 经过了 warp-level 优化和 persistent thread block 技术，这是我们下一步可以探索的方向。

## 关键 takeaway

1. **Fusion 消灭中间结果的 global memory 写**——对 memory-bound 操作尤其关键
2. **LayerNorm 的 AI ≈ 1 flop/byte**——永远是 memory-bound，优化方向是减少内存搬运
3. **RMSNorm 省掉一次 reduction**——训练质量不减，推理速度提升 30%+
4. **Reduce + element-wise 是 fusion 的基本模式**——学会这个，后面的 Fused MLP 就是一个道理
