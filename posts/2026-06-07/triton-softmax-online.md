---
title: "Triton GPU 编程入门（四）：Softmax 的两种写法与 Online 算法"
date: 2026-06-07
tags: [AI Infra, Triton, GPU 编程, 算法]
---

上一篇写了 ReLU/GELU/SiLU——它们都是 element-wise 的，一个线程处理一个元素，线程之间不需要通信。Softmax 不同：在归一化之前，你需要知道**整行的最大值**和**整行的指数和**。这就要求线程之间共享信息。

本文对比两种实现：
- **2-pass**：直观但慢（扫两遍）
- **1-pass online**：精巧且快（一遍扫完）

---

## 一、标准 Softmax 为什么需要两轮

```
softmax(x_i) = exp(x_i) / Σ exp(x_j)
```

直接算有两个问题：

1. **数值溢出**：x 很大时 exp(x) 直接爆 float 上限
2. **需要全局信息**：分母 Σ exp(x_j) 需要知道所有 x_j

标准解法（subtract max）：

```
max_x = max(x_1, ..., x_n)
softmax(x_i) = exp(x_i - max_x) / Σ exp(x_j - max_x)
```

先减最大值，再算 exp。但这需要**两轮扫描**：

```
第一轮：找到 max(x)
第二轮：用 max 算 exp 并求和归一化
```

在 GPU 上，每轮扫描都是一次完整的显存读写。两轮 = 两倍数据搬运。

---

## 二、2-Pass 实现思路

```
pass 1:
  acc_max = -inf
  for each chunk of the row:
    load chunk from global memory
    acc_max = max(acc_max, max(chunk))
  → 现在知道了整行的 max

pass 2:
  acc_sum = 0
  for each chunk of the row:
    load chunk again
    exp_vals = exp(chunk - acc_max)
    acc_sum += sum(exp_vals)
    store exp_vals somewhere (or load a third time)

pass 3 (normalize):
  for each chunk:
    load exp_vals
    store exp_vals / acc_sum
```

实际可以合并 pass 2 和 pass 3，但至少需要**两轮完整读取**每一行。

---

## 三、Online Softmax：一轮搞定

核心观察：**可以在遍历过程中动态更新统计量，发现新的最大值时"重新缩放"历史结果。**

### 算法

```
初始化：m = -inf, d = 0

对于每一块数据：
  m_new = max(m, max(block))
  d_new = d × exp(m - m_new) + sum(exp(block - m_new))
  m = m_new
  d = d_new

处理完所有块后：
  output = exp(x_i - m) / d
```

### 直观理解

假设计算一行 `[1, 5, 3, 9, 2]` 的 softmax，分两块：`[1, 5, 3]` 和 `[9, 2]`。

**第一块 `[1, 5, 3]`**：
- m = 5（当前最大值）
- d = exp(1-5) + exp(5-5) + exp(3-5) = exp(-4) + 1 + exp(-2) ≈ 0.0183 + 1 + 0.1353 = 1.1536

**第二块 `[9, 2]`——发现更大的值**：
- m_new = max(5, max(9, 2)) = 9
- alpha = exp(m - m_new) = exp(5-9) = exp(-4) ≈ 0.0183
- d_new = 1.1536 × 0.0183 + exp(9-9) + exp(2-9)
        = 0.0211 + 1 + exp(-7)
        ≈ 1.0212

可以看到 `d` 在遇到更大的 9 时，旧数据被"贬值"了（乘以 ≈0.018），而新数据以新最大值归一化后加入。

---

## 四、为什么 Online 算法数学正确

关键在于：给所有 exp 项减去同一个常数 M，softmax 结果不变。

```
exp(x_i - M_1) / Σ exp(x_j - M_1)
= exp(x_i - M_2) / Σ exp(x_j - M_2)
```

其中 M_1 是第一块的最大值，M_2 是全部数据的真实最大值。

Online 算法通过 `exp(m_old - m_new)` 这个缩放因子，在发现更优的 M 时无缝切换归一化基准。最终结果等同于一次性减去全局最大值后的 softmax。

---

## 五、实测性能（RTX 4070S，4096×4096）

| 实现 | 耗时 | 备注 |
|------|------|------|
| Online softmax (Triton) | 0.47 ms | 单次扫描 |
| PyTorch softmax | 0.32 ms | cuDNN 高度优化 |

Triton 比 PyTorch 慢 ~47%。但这不能说明 online 算法不好——PyTorch 的 softmax 用了 cuDNN 里手写汇编级别的优化，几十年的积累。

重要的是：**Online 算法的单轮扫描性质，使它成为 FlashAttention 的核心组件。** 在 FlashAttention 里，O(n²) 的 attention matrix 不能多次扫描——online 是唯一可行的方式。

---

## 六、从 Softmax 到 FlashAttention

Softmax 是 FlashAttention 的 50%。

在 attention 里，对于 Q 的每一行：

```
S = Q_row @ K^T            # 得到一行 [1, seq_len] 的分数
P = softmax(S)              # 对这个分数做 softmax
O_row = P @ V               # 用 softmax 权重对 V 加权求和
```

看到了吗？**S 做完 softmax 就是普通的 softmax**。不同之处在于：S 本身不是直接从显存读的，而是 Q @ K^T 算出来的。所以 FlashAttention 的处理单元不是"一行数据"，而是"一个 tile 的点积结果"。

Online softmax 让这个计算可以在不保存完整 S 矩阵的情况下完成：Q 按行分块 → 每个 Q 块遍历所有 K,V 块 → online softmax 累加 → 写完 output。

---

## 七、一个容易被忽略的细节

如果你写 2-pass softmax，注意 **Triton 的 `for` 循环中局部变量不会跨迭代保留**。

```python
# 这段 Triton 代码是错的：
m = float("-inf")
for start in range(0, N, BLOCK):
    x = tl.load(...)
    m = max(m, max(x))  # 看似在累加，但每次迭代是独立的！
```

Triton compiler 可能会把循环展开，导致每次迭代的 `m` 是独立变量。正确的做法是把 `m` 的更新显式地用 `tl.where` 或在循环结束后统一处理。

实际上这个问题在写 online softmax 时更隐蔽——`m` 和 `d` 都需要跨迭代保持。这就是为什么 Exercise 4（FlashAttention）容易出现数值错误的原因之一。

---

*本系列所有代码见 [triton-benchmark-prep](https://github.com/freezetheflame/triton-benchmark-prep)*
