---
title: "MoE 路由入门：从 Dense FFN 到 GroupedTopK"
date: "2026-07-27"
tags: ["AI Infra", "MoE", "Transformer", "路由", "GroupedTopK", "算子优化", "入门"]
---

在研究 GroupedTopK 算子之前，我发现自己虽然知道 MoE 的全称是 Mixture of
Experts，却没有真正想清楚：expert 到底是什么、router 输出的数字代表什么、Top-K
之后数据怎样流动，以及一个看似简单的路由操作为什么值得单独优化。

这篇文章补齐这层背景。我们从普通 Transformer 的 FFN 开始，一步步走到稀疏
MoE、Top-K 路由和 GroupedTopK，并把模型概念翻译成算子开发时真正需要关注的 tensor
shape、数据搬运和性能问题。

读完后，希望能清楚回答：

1. MoE 的“专家”究竟是什么？
2. 为什么参数量可以增长，但每个 token 的计算量不必同比增长？
3. router、Top-K、dispatch 和 combine 分别做什么？
4. 为什么专家分组能够影响多卡通信？
5. GroupedTopK 在整条 MoE 数据流中处于什么位置？

---

## 一、从普通 Transformer 的 FFN 说起

一个 Transformer block 通常包含 Attention 和 FFN 两个主要计算模块。先忽略归一化
和残差连接，数据流可以简化为：

```text
hidden states
    │
    ├── Self-Attention
    │
    └── Feed-Forward Network (FFN)
```

经典 FFN 对每个 token 独立应用同一组参数：

$$
\operatorname{FFN}(x)=W_2\,\sigma(W_1x)
$$

如果模型使用 SwiGLU，则常见形式是：

$$
\operatorname{FFN}(x)=
W_{down}\left(\operatorname{SiLU}(W_{gate}x)\odot W_{up}x\right)
$$

无论输入 token 表达的是代码、数学、中文还是图像信息，普通 FFN 都会使用这一套共享
权重。

从 tensor 角度看，假设：

```text
T = token 数
H = hidden size
I = intermediate size
```

输入与输出一般是：

```text
input:  [T, H]
output: [T, H]
```

中间需要执行两个大矩阵乘法。模型想获得更强的容量时，一个直接办法是增大 `H` 或 `I`，
但这会让每个 token 的计算量一起上升。

---

## 二、MoE 的核心想法：准备多套 FFN，但只激活少数几套

MoE 将一套 FFN 换成 `E` 套 FFN。每一套 FFN 就叫一个 expert：

```text
expert 0 = 一套独立 FFN 参数
expert 1 = 一套独立 FFN 参数
...
expert E-1 = 一套独立 FFN 参数
```

最容易误解的地方是：expert 通常不是一个完整 Transformer，也不是一个会独立思考的
Agent。它往往只是 MoE 层中的一套 FFN 权重。

如果对所有 expert 都计算，再把结果加权求和：

$$
y=\sum_{e=1}^{E}p_e(x)\operatorname{Expert}_e(x)
$$

这叫稠密混合。参数量增加了，计算量也随 expert 数线性增加，代价很高。

稀疏 MoE 的关键是：对每个 token 只选择少数 `K` 个 expert：

$$
y=\sum_{e\in S(x)}w_e(x)\operatorname{Expert}_e(x),
\qquad |S(x)|=K \ll E
$$

例如模型有 256 个 expert，但每个 token 只经过 8 个。模型拥有 256 套 FFN 参数，单个
token 却只执行其中 8 套。

这就是 MoE 常说的“扩大参数容量，同时保持稀疏计算”的来源。它并不意味着 MoE 免费：
参数仍要存储，expert 之间的数据调度和多卡通信也可能非常昂贵。

---

## 三、Router：谁来决定 token 去哪个 expert

MoE 层需要一个 router，也常被称为 gate。最简单的 router 是一个线性投影：

$$
z=xW_r
$$

其中：

```text
x:   [T, H]
W_r: [H, E]
z:   [T, E]
```

`z[t, e]` 是 token `t` 对 expert `e` 的 logit。它不是 expert 的输出，而是路由器对
“这个 token 应该去哪个 expert”的打分。

之后通常通过 softmax 或 sigmoid 得到 scores：

$$
s_{t,e}=\operatorname{softmax}(z_t)_e
$$

或者：

$$
s_{t,e}=\operatorname{sigmoid}(z_{t,e})
$$

两者的差别是：

- softmax 让同一 token 的所有 expert 共享一个概率总量，彼此竞争；
- sigmoid 独立地给每个 expert 打分，最终通常还会对选中权重归一化。

Router 只负责产生分数。真正把候选缩小到 `K` 个 expert 的步骤，是后面的 Top-K
routing。

---

## 四、Top-K 路由到底输出什么

假设：

```text
T = 3 tokens
E = 4 experts
K = 2
```

router scores 可能是：

```text
          expert 0  expert 1  expert 2  expert 3
token 0      .10       .60       .20       .10
token 1      .40       .15       .35       .10
token 2      .05       .10       .15       .70
```

对每行执行 Top-2：

```text
topk_ids:
token 0 → [1, 2]
token 1 → [0, 2]
token 2 → [3, 2]

topk_weights:
token 0 → [.60, .20]
token 1 → [.40, .35]
token 2 → [.70, .15]
```

输出 shape 是：

```text
topk_ids:     [T, K]
topk_weights: [T, K]
```

如果要求重新归一化，那么 token 0 的权重会变成：

$$
\left[
\frac{0.60}{0.60+0.20},
\frac{0.20}{0.60+0.20}
\right]
= [0.75, 0.25]
$$

Top-K 输出的 ID 决定数据去哪里；weights 决定各 expert 输出最终占多大比例。算子开发
中必须同时保证两者正确，不能只比较权重。

---

## 五、选择之后发生什么：Dispatch、Expert Compute、Combine

Top-K 只完成了路由决策。完整 MoE 层还要经历三步。

### 5.1 Dispatch：把 token 发给对应 expert

每个 token 被复制或逻辑映射成 `K` 个 token-expert pair：

```text
(token 0, expert 1)
(token 0, expert 2)
(token 1, expert 0)
(token 1, expert 2)
(token 2, expert 3)
(token 2, expert 2)
```

pair 总数是：

$$
P=T\times K
$$

为了高效执行 expert GEMM，系统通常按 expert ID 对这些 pair 分桶和排序：

```text
expert 0: token 1
expert 1: token 0
expert 2: token 0, token 1, token 2
expert 3: token 2
```

这样同一个 expert 收到的 token 可以组成一个小矩阵，统一执行矩阵乘法。

### 5.2 Expert Compute：运行被选中的 FFN

每个 expert 对属于自己的 token 子集执行 FFN：

```text
x_e
  → gate/up projection
  → activation × up
  → down projection
  → expert output
```

不同 expert 收到的 token 数可能很不均匀，因此 GEMM 的 `M` 维也是动态的。这会带来大量
小 GEMM、padding 和负载不均衡问题。

### 5.3 Combine：按路由权重合并输出

每个 token 的多个 expert 输出按 `topk_weights` 加权求和：

$$
y_t=\sum_{k=1}^{K}w_{t,k}y_{t,k}
$$

最终重新得到 `[T, H]`，继续进入 Transformer 的下一部分。

完整链路可以画成：

```text
hidden_states [T, H]
       │
       ▼
router projection [T, E]
       │
       ▼
Top-K / GroupedTopK
       │ ids [T,K], weights [T,K]
       ▼
dispatch + expert grouping
       │
       ▼
expert FFN compute
       │
       ▼
weighted combine [T, H]
```

---

## 六、为什么要把 expert 分组

如果所有 expert 都在一张卡上，普通全局 Top-K 很自然。但大规模 MoE 通常会把 expert
分散在多张卡或多个节点上：

```text
device 0: expert 0–31
device 1: expert 32–63
device 2: expert 64–95
device 3: expert 96–127
...
```

一个 token 的 Top-K expert 如果分布在许多设备上，hidden state 就要被发往多个设备，
之后 expert 输出还要返回原位置。这类 all-to-all 数据交换可能成为 MoE 的主要瓶颈。

GroupedTopK 先把 expert 划分为组，再限制每个 token 只能从少数几个高分组中选择最终
expert：

```text
全部 E 个 expert
       │
       ├── 计算每个 group 的代表分数
       ├── 选择 Top-Kg 个 group
       └── 只在保留组中选择最终 Top-K expert
```

如果 group 与设备或通信域的布局存在对应关系，限制候选 group 就有机会减少一个 token
涉及的通信范围。

需要谨慎表述的是：分组本身不自动保证通信一定减少。真实收益取决于：

- expert 如何映射到设备；
- 一个 group 是否对应一个或少数设备；
- `topk_group` 设置多大；
- token 的路由分布是否均衡；
- 通信库和并行策略如何实现 dispatch。

从模型语义看，GroupedTopK 是结构化候选筛选；从系统角度看，它为控制通信范围提供了
一个抓手。

---

## 七、GroupedTopK 与普通 Top-K 的区别

假设 8 个 expert 分成 4 组：

```text
group 0: expert 0, 1
group 1: expert 2, 3
group 2: expert 4, 5
group 3: expert 6, 7
```

某个 token 的分数为：

```text
expert:  0    1    2    3    4    5    6    7
score:  .1   .8   .4   .3   .9   .7   .2   .6
```

普通 Top-3 会直接选择：

```text
expert 4 (.9), expert 1 (.8), expert 5 (.7)
```

GroupedTopK 如果规定先选 2 个 group，并用组内最大值作为组分数：

```text
group 0 → .8
group 1 → .4
group 2 → .9
group 3 → .6
```

保留 group 2 和 group 0，再从这两个组中选 Top-3，结果仍然是 4、1、5。

但如果最终需要 Top-4，普通 Top-K 会继续选择 expert 7；GroupedTopK 因为 group 3 已被
屏蔽，只能从 group 0 和 group 2 中选择 expert 0。由此可见，分组约束可能改变最终
路由结果，而不仅是更快地近似普通 Top-K。

---

## 八、路由系统还有哪些问题

### 8.1 负载不均衡

如果大量 token 都选择同一个 expert：

- 热门 expert 计算排队；
- 其他 expert 闲置；
- 多卡执行时间由最慢设备决定；
- padding 和容量限制可能浪费计算或丢弃 token。

因此训练 MoE 时通常还会引入负载均衡损失、expert bias、capacity factor 等机制。这些
机制不一定属于 GroupedTopK 算子本身，但会影响它接收到的 score 分布。

### 8.2 Top-K 的离散性

Top-K 选择是离散操作。ID 的微小变化会让 token 去往完全不同的 expert，因此数值误差
不仅影响一个浮点权重，还可能改变后续整条计算路径。

### 8.3 Tie-breaking

当多个 expert 分数相同，返回哪个 ID、以什么顺序返回，必须和 reference 保持一致。
随机输入很少产生完全相同的值，所以专门的 tie 测试非常重要。

### 8.4 Router 精度

即使 hidden state 和 expert FFN 使用 FP16/BF16，router logits 与 softmax 统计常常会用
FP32，以减少排序边界附近的数值误差。

---

## 九、从模型概念切换到算子视角

理解模型后，再来看算子优化关注什么。

对于一个框架用户，GroupedTopK 是下面这些 PyTorch 操作：

```text
softmax / sigmoid
reshape
group max
group topk
scatter mask
masked_fill
expert topk
renormalize
dtype conversion
```

对于 kernel 开发者，要问的是：

```text
输入在显存中如何排列？
一个 program 负责多少 token 和 expert？
group max 能否留在寄存器中？
是否真的需要物化 mask？
两级 Top-K 能否在一次 kernel launch 中完成？
最终只写 weights 和 ids 是否足够？
softmax 是否可以利用单调性化简？
不同后端的并行粒度与片上资源有什么限制？
```

这是一种重要的思维切换：PyTorch reference 定义可观察语义，不代表自定义 kernel 必须
逐行模仿它的数据流。

---

## 十、把概念映射到 KernelSwift Task01

KernelSwift GroupedTopK 的官方默认配置是：

```text
num_tokens        = 83
num_experts       = 256
num_expert_group  = 8
experts_per_group = 32
topk_group        = 4
topk              = 8
scoring_func      = softmax
renormalize       = True
```

因此每个 token 的路由过程是：

```text
256 logits
   ↓ softmax
8 个 group，每组 32 个 expert
   ↓ 每组取最大值
选择 4 个 group
   ↓ 屏蔽其余 4 组
从 128 个候选 expert 中选择 8 个
   ↓ 重新归一化
8 weights + 8 ids
```

官方输入还有一个 `[83, 7168]` 的 `hidden_states`，但它在 reference 中只用于检查 token
数，并不参与路由计算。这个事实对性能实现很重要：不应该因为接口里存在这块 tensor 就
读取它的全部数据。

进一步的正式接口、数学化简、Triton program 映射与正确性测试，可以继续阅读：

[GroupedTopK 算子优化入门：从 MoE 路由到 Triton 融合思路](../2026-07-27-grouped-topk-operator-optimization/grouped-topk-operator-optimization.html)

---

## 十一、学习这类算子时的推荐顺序

如果和我一样是第一次系统做算子优化，可以按下面的顺序建立知识：

1. **模型语义**：先理解 expert、router、Top-K、dispatch 和 combine。
2. **Tensor 语义**：为每一步写出 shape、dtype、stride 和输出不变量。
3. **PyTorch reference**：观察中间张量，建立可信的正确性基准。
4. **GPU 执行模型**：理解 program、grid、block、mask、warp 和 reduction。
5. **朴素融合 kernel**：先保证 ID 和权重正确。
6. **性能分析**：区分 launch-bound、memory-bound 和 compute-bound。
7. **定向优化**：根据真实 shape 与目标芯片调整实现，而不是盲目 autotune。

这条路线看起来慢，却能避免最常见的问题：在尚未确认语义时就优化错误的计算，或者在没有
profiling 证据时把 kernel 复杂化。

---

## 十二、总结

MoE 的核心不是简单地“增加很多 FFN”，而是通过稀疏路由把模型容量和单 token 计算量部分
解耦：

```text
多套 expert 参数提供容量
router 为每个 token 打分
Top-K 只激活少数 expert
dispatch 将 token 按 expert 重排
expert FFN 执行实际计算
combine 按路由权重恢复 token 输出
```

GroupedTopK 在普通 Top-K 前加入 group 级筛选。它既改变模型的候选约束，也可能帮助系统
控制跨设备路由范围。

从算子优化角度看，它的价值在于：输入不大、步骤很多、中间 tensor 明显，非常适合练习
kernel fusion、归约、Top-K、数值稳定性和 launch overhead 分析。

下一步，就是把这套模型语义落实成逐项可验证的 reference 测试，再开始写第一个 Triton
baseline。
