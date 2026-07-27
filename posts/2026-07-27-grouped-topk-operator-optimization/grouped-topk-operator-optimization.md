---
title: "GroupedTopK 算子优化入门：从 MoE 路由到 Triton 融合思路"
date: "2026-07-27"
tags: ["AI Infra", "Triton", "GPU 编程", "MoE", "算子优化", "GroupedTopK", "KernelSwift"]
---

最近开始准备 KernelSwift 算子创新大赛。第一个打算认真拆解的题目是
GroupedTopK：它规模不大，却刚好涵盖 GPU 算子开发里最值得入门的几个主题——
并行划分、归约、Top-K、算子融合、数值稳定性和性能分析。

这篇文章记录我从 PyTorch reference 出发理解这个算子的过程。目标不是立刻写出
最快的 kernel，而是先回答三个问题：

1. GroupedTopK 在 MoE 模型里解决什么问题？
2. 官方 reference 的每一步究竟在算什么？
3. 为什么把这些步骤融合进一个 Triton kernel 可能更快？

> 本文的接口与默认 shape 来自 2026 KernelSwift 算子创新大赛赛道一
> Task01 题面。具体评测细节仍应以后续官方评测程序为准。

---

## 一、先建立背景：MoE 为什么需要路由

普通 Transformer 的 FFN 层会让每个 token 经过同一套参数。MoE
（Mixture of Experts）则准备多套 FFN，也就是多个 expert，然后让每个 token
只进入少数几个 expert。

一个典型的数据流是：

```text
hidden states
      │
      ▼
  router / gate
      │  为每个 token 产生 E 个 expert logits
      ▼
  Top-K routing
      │  选择 K 个 expert 和对应权重
      ▼
 selected experts
      │
      ▼
 weighted reduction
```

如果一共有 256 个专家，而每个 token 只选择 8 个，那么真正执行的专家计算会稀疏
很多。但专家通常分布在不同设备上：完全自由的全局 Top-K 可能让 token 在设备间
频繁通信。

GroupedTopK 在普通 Top-K 前增加一层“按组筛选”：

```text
256 experts
   ↓ 分成 8 组，每组 32 个
先选 4 个 expert group
   ↓
只在这 4 组的 128 个 expert 中选最终 Top-8
```

这种结构可以限制候选专家的分布，是计算选择与通信约束之间的一种折中。

如果对 expert、router、Top-K 和路由权重还比较陌生，建议先阅读配套前置篇：
[MoE 路由入门：从 Dense FFN 到 GroupedTopK](../2026-07-27-moe-routing-primer/moe-routing-primer.html)。

---

## 二、官方任务的接口

官方 `Model` 的构造参数如下：

```python
Model(
    topk=8,
    renormalize=True,
    num_expert_group=8,
    topk_group=4,
    scoring_func="softmax",
    routed_scaling_factor=1.0,
)
```

示例输入为：

| 输入 | Shape | Dtype | 用途 |
|---|---:|---|---|
| `hidden_states` | `[83, 7168]` | FP16 | 只用于核对 token 数 |
| `gating_output` | `[83, 256]` | FP32 | 每个 token 对 256 个专家的 logits |

输出为：

| 输出 | Shape | Dtype | 含义 |
|---|---:|---|---|
| `topk_weights` | `[83, 8]` | FP32 | 最终 8 个专家的路由权重 |
| `topk_ids` | `[83, 8]` | INT32 | 最终 8 个专家的全局编号 |

这里有一个容易忽略却很重要的点：`hidden_states` 的数据完全不参与路由计算，
reference 只读取它的第 0 维来检查 token 数是否一致。

因此，一个合理的自定义算子不应该把 `[83, 7168]` 的内容读入设备计算。实际需要
处理的核心输入只有大约 85 KiB：

```text
83 × 256 × sizeof(float32) ≈ 85 KiB
```

---

## 三、逐步拆解 GroupedTopK

记：

- token 数为 `T`；
- expert 数为 `E`；
- expert group 数为 `G`；
- 每组 expert 数为 `P = E / G`；
- 保留的 group 数为 `K_g`；
- 最终 expert 数为 `K`。

官方默认值是：

```text
T = 83, E = 256, G = 8, P = 32, K_g = 4, K = 8
```

### 3.1 激活路由分数

`scoring_func="softmax"` 时，对每个 token 的 256 个 logits 做 softmax。

为避免指数溢出，数值稳定的计算形式是：

$$
m_t = \max_j x_{t,j}
$$

$$
s_{t,e} =
\frac{\exp(x_{t,e}-m_t)}
{\sum_j \exp(x_{t,j}-m_t)}
$$

题目也支持 sigmoid：

$$
s_{t,e}=\frac{1}{1+\exp(-x_{t,e})}
$$

softmax 会让同一 token 的所有 expert 竞争一个总概率；sigmoid 则独立地给每个
expert 打分。两条路径的权重语义不同，不能混用。

### 3.2 按组求最大值

逻辑上将：

```text
scores: [T, 256]
```

看作：

```text
grouped_scores: [T, 8, 32]
```

每组分数取组内最大 expert 分数：

$$
g_{t,i}=\max_{e\in\text{group}_i}s_{t,e}
$$

注意，这里官方明确采用组内最大值，不是一些 MoE 实现里的“组内 Top-2
求和”。算子优化首先必须忠于 reference，而不是忠于我们熟悉的另一个模型实现。

### 3.3 选择 Top-4 expert group

对每个 token 的 8 个 `group_scores` 做 Top-4，得到保留组的 ID。

```text
group_scores:   [T, 8]
selected_group: [T, 4]
```

### 3.4 屏蔽未选中的组

reference 会构造 group mask，再展开成 `[T, 256]` 的 expert mask。未选中组的
expert 分数被替换为负无穷：

$$
\tilde{s}_{t,e}=
\begin{cases}
s_{t,e}, & e \text{ 所在组被选中} \\
-\infty, & \text{其他情况}
\end{cases}
$$

### 3.5 从候选 expert 中选择 Top-8

4 个保留组一共有 128 个候选 expert。再做一次 Top-8，得到最终 ID 与权重。

```text
topk_weights: [T, 8]
topk_ids:     [T, 8]
```

### 3.6 重新归一化和缩放

默认 `renormalize=True`，因此将选中的权重除以它们的总和：

$$
\hat{w}_{t,k}=
\frac{w_{t,k}}{\sum_{j=1}^{K}w_{t,j}}
$$

最后再乘 `routed_scaling_factor`。

---

## 四、用一个小例子手算

假设只有 8 个 expert，分为 4 组，每组 2 个：

```text
group 0: expert 0, 1
group 1: expert 2, 3
group 2: expert 4, 5
group 3: expert 6, 7
```

某个 token 的分数是：

```text
expert:  0    1    2    3    4    5    6    7
score:  .1   .8   .4   .3   .9   .7   .2   .6
```

组分数为：

```text
group 0: max(.1, .8) = .8
group 1: max(.4, .3) = .4
group 2: max(.9, .7) = .9
group 3: max(.2, .6) = .6
```

如果 `topk_group=2`，保留 group 2 和 group 0：

```text
expert:  0    1    2    3    4    5    6    7
score:  .1   .8   -∞   -∞   .9   .7   -∞   -∞
```

如果最终 `topk=2`，则选择 expert 4 和 expert 1。这个例子揭示了 GroupedTopK
的本质：两层选择，而不是对全部 expert 直接做一次 Top-K。

---

## 五、为什么 PyTorch 写法可能慢

PyTorch reference 非常清晰，但清晰的张量表达不等于最少的设备工作。它的逻辑数据流
大致是：

```text
gating_output
    ↓ softmax / sigmoid
scores
    ↓ view + max
group_scores
    ↓ topk
group_idx
    ↓ zeros_like + scatter + expand + reshape
score_mask
    ↓ masked_fill
tmp_scores
    ↓ topk
weights + ids
    ↓ sum + div + scale + cast
outputs
```

其中会出现多个 kernel launch 和多个中间张量。对于 GroupedTopK 这种数据量不大的
操作，真正昂贵的未必是浮点运算，而可能是：

- 启动许多小 kernel 的固定开销；
- 中间结果反复写入和读出显存；
- 构造与原始 scores 一样大的 mask；
- 通用 Top-K 没有利用 `G=8`、`K_g=4`、`K=8` 都很小这一事实。

因此这道题的优化目标不是“堆更多 FLOPS”，而是减少数据搬运和调度阶段。

---

## 六、第一个 Triton kernel 应该怎样划分

最自然的 baseline 是：**一个 Triton program 处理一个 token**。

```text
Grid: (T,)

program 0 → token 0 的 256 个 logits
program 1 → token 1 的 256 个 logits
...
program 82 → token 82 的 256 个 logits
```

每个 program 内部完成：

```text
load 256 logits
   ↓
8 组 × 32 元素归约
   ↓
选 4 个 group
   ↓
屏蔽未选 group
   ↓
选 8 个 expert
   ↓
计算并归一化权重
   ↓
store 8 weights + 8 ids
```

理想情况下，所有中间值留在寄存器或片上存储中，最终只写出真正需要的 16 个值。

为什么不一开始就设计更复杂的二维 grid？因为不同 token 完全独立，一 token 一
program：

- 没有跨 program 同步；
- 输入行在内存中连续；
- 容易与逐行 reference 对拍；
- 容易定位 Top-K 和 mask 的错误。

83 个 program 的并行度是否足够，要等实际硬件 profiling 后再判断。先写对，再依据证据
改变并行策略。

如果对 program、grid 和 tile 还不熟悉，可以先看
[GPU Kernel 的 Tile、Grid、Wave 与 Launch Overhead](../2026-06-11/triton-tile-grid-wave.html)。

---

## 七、一个关键的数学化简

官方默认路径是：

```text
scoring_func = "softmax"
renormalize = True
```

softmax 对同一行的大小关系是单调的：

$$
x_a > x_b
\Longleftrightarrow
\operatorname{softmax}(x)_a > \operatorname{softmax}(x)_b
$$

因此，选 group 和选 expert 时，可以直接比较 logits，不必先物化全部 256 个 softmax
结果。

更进一步，若最终还会对选中的 K 个权重重新归一化，完整 softmax 的公共分母会约掉。
设最终选中集合为 `S`：

$$
\frac{
\exp(x_i)/\sum_{j=1}^{E}\exp(x_j)
}{
\sum_{k\in S}\exp(x_k)/\sum_{j=1}^{E}\exp(x_j)
}
=
\frac{\exp(x_i)}{\sum_{k\in S}\exp(x_k)}
$$

这意味着默认路径可以尝试：

```text
在 logits 上选 group
→ 在 logits 上选最终 expert
→ 只对选中的 8 个 logits 做稳定 softmax
```

原本 256 个元素上的指数与求和，缩小成了 8 个元素上的计算。

不过这个化简有明确边界：

- `softmax + renormalize=False` 仍需要完整 256-way softmax 的分母；
- sigmoid 路径的输出权重不能套用 softmax 公式；
- NaN、正负无穷和相同值的行为必须与 reference 对齐；
- 如果评测会改变构造参数，kernel 必须有正确的通用路径。

数学上等价不代表浮点逐位相等，最终仍要用官方容差验证。

---

## 八、Top-K 才是实现中的核心难点

sum 和 max 都是标准归约；Top-K 则需要同时维护值与索引。

当 `K` 很小时，最直观的方法是重复 K 次：

```text
找到当前最大值与 argmax
记录 value 和 index
把该位置设为 -∞
继续寻找下一个最大值
```

它避免了对全部 256 个元素做完整排序，但还有不少细节：

1. 相同值时选择较小 ID 还是较大 ID？
2. `argmax` 的 tie-breaking 是否和 `torch.topk` 一致？
3. 被 padding 的 lane 会不会意外入选？
4. NaN 如何传播或参与比较？
5. 两级 Top-K 是否保持了正确的全局 expert ID？
6. 输出顺序是否和 reference 一样按权重降序？

随机输入几乎不会产生 tie，因此只测随机数很容易掩盖错误。正确性测试必须主动构造
相同分数、边界值和特殊值。

---

## 九、正确性优先：应该怎样建立测试矩阵

在追求速度前，至少需要覆盖以下情况。

### Shape 与分组

- expert 数是 2 的幂和不是 2 的幂；
- expert 数可被 group 数整除；
- `topk_group=1`；
- `topk=1`；
- 最终 Top-K 接近候选 expert 数；
- token 数很小和较大。

### 数值

- 全部 logits 相等；
- 一组内出现多个相同最大值；
- 极大正数与极小负数；
- 全零输入；
- 包含正负无穷；
- 根据官方要求决定是否测试 NaN。

### 配置

- softmax 与 sigmoid；
- `renormalize=True/False`；
- scaling factor 等于和不等于 1；
- FP32 输出 dtype；
- INT32 ID dtype。

### 不变量

默认配置下可以检查：

- 每行恰好输出 8 个合法 ID；
- ID 范围在 `[0, 255]`；
- 所有 ID 都来自选中的 4 个 group；
- renormalize 后每行权重和约等于 1；
- scaling 后每行权重和约等于 scaling factor；
- `hidden_states` 内容变化不会影响输出。

最后一条很有价值：它能帮助我们确认实现没有误读那块大输入。

---

## 十、如何判断优化是否真的有效

不要只看一次 wall-clock 时间。至少要区分：

- 首次 JIT 编译时间；
- warm-up 后的稳态 kernel 时间；
- PyTorch reference 的总时间；
- 自定义 kernel 的总时间；
- 不同参数和不同芯片上的表现。

GroupedTopK 很可能主要受 kernel launch 与延迟影响，而不是峰值算力限制。一个很快的
kernel 仍可能因为编译、框架调度或不必要的输入处理失去优势。

性能分析时可以按以下顺序提问：

1. 自定义实现到底启动了几个 kernel？
2. 是否物化了 `[T, E]` 的中间 mask 或 scores？
3. 是否读取了无用的 `hidden_states`？
4. Top-K 的时间占比是多少？
5. 一 token 一 program 是否让设备利用率过低？
6. 增加 `num_warps` 后是更快，还是带来寄存器压力？
7. 默认路径的数学化简是否减少了 exp 与 reduction？

可以结合之前的
[Triton 性能调优方法论](../2026-06-07/triton-performance-tuning-methodology.html)
和
[GPU 算子 Profiling 实战指南](../2026-06-07/triton-profiling-practical-guide.html)
继续学习。

---

## 十一、适合初学者的开发路线

我准备按下面的顺序推进，而不是一上来就追求比赛最快成绩。

### Stage 0：锁定 reference

保存官方 PyTorch 实现，记录接口、shape、dtype、构造参数和输出语义。

### Stage 1：CPU 小例子

用很小的 expert 数手算并观察每个中间结果：激活分数、group score、group ID、mask、
最终 expert ID 和权重。

### Stage 2：建立正确性测试

覆盖随机输入、tie、极端数值、不同配置和输出 dtype。先明确“什么叫做正确”。

### Stage 3：朴素融合 Triton baseline

一个 program 处理一个 token，完整实现 reference 语义。此阶段不追求极致性能，也不急着
autotune。

### Stage 4：默认路径特化

针对 `softmax + renormalize=True` 验证 logits 直接选择与 K-way softmax 化简。

### Stage 5：Benchmark 与 profiling

在真实目标芯片上测 warm-up 后延迟，检查 kernel 数量、内存访问、寄存器压力与设备占用。

### Stage 6：Shape-aware dispatch

只有证据表明单一配置无法覆盖不同 shape 时，才增加多套 block/warp 配置与通用 fallback。

---

## 十二、现阶段最值得记住的原则

GroupedTopK 看起来只是几个 PyTorch API 串起来，但算子优化关注的是另一层问题：

```text
数学语义是什么？
数据在哪里？
中间结果是否必须落到显存？
GPU 被启动了多少次？
不同操作能否在同一个 program 中完成？
能否利用单调性或代数关系减少计算？
浮点行为是否仍与 reference 一致？
```

对第一次接触算子优化的人来说，最重要的转变是：不要把 PyTorch reference 当作必须逐行
翻译的实现方案。它定义的是**可观察语义**；自定义 kernel 可以采用完全不同的数据流，
只要输出正确，并且真正减少硬件工作。

这也是 GroupedTopK 适合作为第一道题的原因。它足够小，可以完整地看清从模型语义、数学
化简、并行映射、正确性到性能验证的整条链路。

下一篇将从官方 reference 出发，建立可复现的测试基线，并进一步拆解 Triton 中的一 token
一 program 应该如何表达。
