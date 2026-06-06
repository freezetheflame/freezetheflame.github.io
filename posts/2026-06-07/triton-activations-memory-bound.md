---
title: "Triton GPU 编程入门（三）：激活函数与 Memory-Bound 分析"
date: 2026-06-07
tags: [AI Infra, Triton, GPU 编程]
---

上一篇用 Vector Add 理解了 GPU 的并行模型。本文实现三个实际算子——ReLU、GELU、SiLU——并引出 GPU 性能优化的核心概念：**memory-bound vs compute-bound**。

---

## 一、三个激活函数

### ReLU

```
ReLU(x) = max(0, x)
```

最简单的激活函数。GPU 上只需要一次比较和一次条件赋值。

### GELU（Gaussian Error Linear Unit）

```
GELU(x) = x · Φ(x)

其中 Φ 是标准正态分布的 CDF。精确计算需要 erf 函数，
实践中用 tanh 近似：

GELU(x) ≈ 0.5x · (1 + tanh(√(2/π) · (x + 0.044715x³)))
```

GELU 是 BERT、GPT-2/3 用的激活函数——比 ReLU 平滑，梯度更好。

### SiLU（Sigmoid Linear Unit，也叫 Swish）

```
SiLU(x) = x · σ(x) = x / (1 + e^(-x))
```

Llama 系列用的就是 SiLU。比 GELU 简单，但效果相当。

---

## 二、Triton 实现

ReLU 最简单——`tl.maximum(x, 0.0)` 一行搞定。

SiLU 同样简单——`tl.sigmoid(x)` 可用：

```
y = x * tl.sigmoid(x)
```

GELU 有一个坑：**Triton 3.x 没有 `tl.tanh`**。

需要自己用指数函数实现：

```
tanh(z) = (e^(2z) - 1) / (e^(2z) + 1)
```

完整 GELU kernel：

```
sqrt_2_over_pi = 0.7978845608028654
inner = sqrt_2_over_pi * (x + 0.044715 * x^3)
exp_2z = exp(2 * inner)
y = 0.5 * x * (1 + (exp_2z - 1) / (exp_2z + 1))
```

---

## 三、实测性能（RTX 4070S，N=10M）

| 算子 | Triton (ms) | Triton 带宽 | PyTorch (ms) | PyTorch 带宽 |
|------|------------|------------|-------------|-------------|
| ReLU | 0.184 | 436 GB/s | 0.183 | 436 GB/s |
| GELU | 0.183 | 436 GB/s | 0.183 | 437 GB/s |
| SiLU | 0.184 | 435 GB/s | 0.187 | 429 GB/s |

**两个反直觉的发现**：

1. Triton 和 PyTorch 几乎一模一样。说明对于 element-wise 操作，Triton compiler 生成的 CUDA kernel 和 PyTorch 用的 cuDNN kernel 质量相同。
2. 三个函数的性能完全一样。说明计算不是瓶颈——**瓶颈在读显存**。

---

## 四、Memory-Bound vs Compute-Bound

这是 GPU 性能优化最重要的概念。

### 算一笔账

RTX 4070 SUPER 的理论性能：

| 指标 | 数值 |
|------|------|
| 显存带宽 | 504 GB/s |
| FP32 算力 | ~35 TFLOPS |

处理 10M 个 float32 元素（共 40MB 数据）：

- 读输入 x（40MB）+ 写输出 y（40MB）= 80MB 数据搬运
- 耗时 0.184ms → 实际带宽 = 80MB / 0.184ms = **435 GB/s**

理论带宽 504 GB/s，实际达到 435 GB/s——**带宽利用率 86%**。

### 再看计算

10M 个 GELU 需要多少次运算？

```
GELU: 乘法、加法、exp、除法... 大约每个元素 10-15 次浮点运算
总计算量：~150M FLOP
耗时 0.183ms → ~0.8 TFLOPS

而 GPU 理论算力是 35 TFLOPS —— 只用了 2.3%
```

**结论：这些算子 98% 的时间在等显存，2% 的时间在算。这就是 memory-bound。**

### Memory-Bound 意味着什么

- 优化计算速度没用——再快也得等显存
- 优化方向是**减少显存读写**——fused kernel（把多个操作合并到一个 kernel 里）
- element-wise 操作天然 memory-bound，不需要复杂的 tiling 技巧
- 矩阵乘法才是 compute-bound——那是 Tiling 和 Tensor Core 的主场

---

## 五、实际教训

### Tanh 缺失是好事

Triton 没有 `tl.tanh` 这件事，初看是缺点，实际上是提醒：

**你在写 GPU kernel，不是在写 Python。任何高级函数都要理解它的底层实现。**

手写一次 tanh 让你知道它用了几个 exp、几个加减乘除，这些直接对应 GPU 指令。当你在 Ascend NPU 上移植 Triton 时，每个数学函数的指令数和精度都会不同——这正是 benchmark 要测的东西。

### 带宽就是天花板

如果你的 kernel 是 memory-bound（大部分 element-wise 操作都是），性能上限由 `数据量 / 显存带宽` 决定。再怎么优化 kernel 代码也突破不了这个物理极限——除非减少数据搬运。

---

## 六、下一步

下一篇实现 Softmax。和 element-wise 不同，softmax 需要跨元素通信（找全局最大、全局求和），将引出 **cross-thread reduction** 和 **online stable algorithm**。

---

*本系列所有代码见 [triton-benchmark-prep](https://github.com/freezetheflame/triton-benchmark-prep)*
