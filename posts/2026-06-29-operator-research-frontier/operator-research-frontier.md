---
title: "AI算子科研前沿：2025-2026年最热的6大研究方向"
date: 2026-06-29
tags: [算子研究, Kernel生成, LLM4Code, 稀疏计算, 量化, AI编译, 科研前沿]
---

> 本文面向 AI Infra 从业者，覆盖 2025–2026 年算子（Operator/Kernel）领域最前沿的 6 个研究方向。目标读者：有 CUDA/Triton 基础、想系统了解算子领域科研热点的工程师和研究者。

当 DeepSeek-V4 的推理集群每天消耗数千张 H100 时，每一个 kernel 的 1% 加速都在转化为数十万美元的成本节省。这不再是学院派的性能调优游戏——算子优化已经成为大模型时代的"芯片级"竞争力。与此同时，LLM 正在从被优化的对象变成优化者本身，用 RL 生成 CUDA kernel 的论文从 2024 年的零星几篇井喷到 2026 年的数十篇。这场范式转变正在重塑 AI Infra 的底层逻辑。

<!--more-->

---

## 🌍 开篇：为什么算子研究正在爆发

### LLM推理成本驱动的kernel优化需求

过去两年，AI Infra 最显著的变化是：**算子的性能瓶颈从"计算"转向了"内存"**。随着 FlashAttention 解决了 attention 的 IO 问题、Tensor Core 将 GEMM 推向接近理论峰值，新的瓶颈——非连续内存访问、reduction 依赖、长序列的 KV cache 管理——正在成为微架构级别的硬骨头。每一个新的 LLM 架构（MLA、MoE、Mamba）都在创造新的算子需求，而手写这些 kernel 的速度远跟不上模型迭代的速度。

### 从手写kernel到LLM生成kernel的范式转变

2024 年，人们还在争论"LLM 能否写出比 PyTorch 更快的 kernel"。2025 年 KernelBench 基准的诞生让这个问题的答案变得可量化。2026 年的今天，**RL for kernel generation** 已经成为一个独立的研究子领域，Kevin、CUDA Agent、K-Search 轮番刷新 SOTA。这不仅仅是自动化——本质上，这是将算子优化从"专家经验的序列化表达"转化为"可学习的、可搜索的优化空间"。

### 六大方向的内在联系

本文覆盖的六个方向并不是孤立的。它们共享一个核心驱动力——**在大模型推理成本爆炸的时代，如何让计算更接近硬件的理论极限**：

| 方向 | 核心矛盾 | 解决思路 |
|------|---------|---------|
| LLM-driven Kernel Generation | 专家kernel稀缺，手工效率低 | 用RL+LLM自动搜索优化空间 |
| 高级算子融合 | 传统fusion覆盖有限 | 代数方法突破reduction依赖 |
| 稀疏计算 | 激活/权重的冗余未被充分利用 | 结构化+非结构化稀疏协同 |
| 长上下文Attention | 自注意力O(N²)的存储和计算墙 | IO-aware + KV压缩 + 分布式 |
| 极致低比特量化 | 精度与吞吐的tradeoff | FP8成熟化、FP4前沿探索 |
| 多硬件可移植性 | 每个硬件需要独立的kernel栈 | Triton/MLIR跨平台抽象 |

这些方向交汇之处，正是下一代 AI Infra 的基座。

---

## 1. 🤖 LLM驱动的Kernel自动生成（最热赛道）

### 核心问题

在 GPU 上编写高性能 CUDA/Triton kernel 需要深厚的硬件知识——内存合并访问、shared memory tiling、warp-level 同步、指令排布……这些技能即使在资深工程师中也是稀缺资源。核心问题是：**能否让 LLM 学会写高效的 GPU kernel，甚至超越人类专家？**

### 背景：KernelBench的诞生

KernelBench [Ouyang et al., 2025] 的发布是这个领域的"ImageNet 时刻"。它提供了标准化的训练/评测基准：给定一个 PyTorch reference 实现，模型需要生成 CUDA kernel，以正确率和相对于 PyTorch Eager 的 speedup 作为评价指标。Level-1（单算子）、Level-2（算子序列）、Level-3（复杂融合）三个难度梯度，让所有方法有了公平的擂台。

### 代表性论文

#### Kevin: Multi-Turn RL for Generating CUDA Kernels [Baronio et al., ICLR 2026]

Stanford 和 Cognition AI 合作的 Kevin 是第一个将 **multi-turn RL** 用于 CUDA kernel 生成的模型。核心思路：不是让模型一次写出最终 kernel，而是模拟人类专家的迭代过程——写代码 → 执行 → 看 profiling 反馈 → 修改。关键设计：

- **Turn-wise reward**: 将长轨迹拆解为每个 turn 独立的训练样本，解决稀疏奖励问题
- **CoT 摘要**: 对历史推理链进行摘要压缩，防止 context explosion
- **串行 > 并行**的 scaling 发现：在固定推理预算下，串行 refinement 比并行采样更有效

结果：基于 QwQ-32B，正确率从 56% 提升到 **82%**，speedup 从 0.53x 提升到 **1.10x**（相对 PyTorch Eager），超越 o4-mini（0.78x）。

#### CUDA Agent: Large-Scale Agentic RL [Dai et al., ByteDance/Tsinghua, 2026]

如果说 Kevin 展示了 multi-turn RL 的可行性，CUDA Agent 则是把这条路推到极致。它的三个核心组件：

1. **CUDA-Agent-Ops-6K 数据集**: 6,000 个合成算子任务，通过组合式融合 pipeline 自动生成多算子复合任务（最多 5 个 operator 类堆叠在一个 layer 中）
2. **Skill-augmented 环境**: 预置 CUDA 优化最佳实践的 SKILL.md prompt，引导 agent 沿着"analyze → implement → compile → optimize"的标准化流程工作
3. **PPO + Value Pretraining**: 解决长期 agentic 交互中 value 函数不稳定、轨迹无限膨胀的核心问题

结果：KernelBench SOTA！Level-1/2 **100%** faster than torch.compile，Level-3 **92%** faster。整体 **96.8%** faster，geomean speedup **2.11x**。超越 Claude Opus 4.5 和 Gemini 3 Pro 约 40%。

> 💡 **个人评论**：CUDA Agent 最impressive的不是它刷榜的成绩，而是它**自主发现**的优化策略——代数化简（将对角矩阵乘+GEMM 优化为 broadcast mul）、主动启用 TF32 Tensor Core、融合 cuDNN API 调用——这些是传统编译器和 rule-based 系统很难自动发现的。

#### K-Search: Co-Evolving Intrinsic World Model [Cao et al., UC Berkeley, 2026]

Berkeley Sky Lab 的 K-Search 提出了不同的视角：与其用 RL 训一个"会写 kernel 的模型"，不如用 LLM 构建一个**搜索世界模型**。核心创新是 **co-evolving world model**——一个维护 kernel bottleneck 假设、设计替代方案和优化策略的结构化搜索树，显式地将高层算法规划与底层代码实现解耦。

结果不追求 KernelBench SOTA，而是在 FlashInfer 的复杂 kernel（GQA、MLA、MoE）上达到平均 **2.10x** 加速，MoE kernel 最高 **14.3x**。在 GPUMode TriMul 任务上，H100 上达到 1030µs，超越人类专家解决方案。

#### AutoTriton [Li et al., Tsinghua/OpenBMB, 2025]

以上工作都专注于 CUDA，而 AutoTriton 是第一篇将 RL 应用到 **Triton kernel** 生成的工作。基于 Seed-Coder-8B-Reasoning，通过 SFT + GRPO 两阶段训练。一个有趣的设计是双轨 reward：rule-based reward（语法检查 + 参数类型）和 execution-based reward（运行正确性 + 性能）。在 KernalBench 和 TritonBench 上达到与 Claude-4-Sonnet 和 DeepSeek-R1-0528 可比的效果。

### 综合对比

| 方法 | 训练数据 | 基座模型 | KernelBench Correctness | KernelBench Speedup | 核心创新 |
|------|---------|---------|----------------------|-------------------|---------|
| Kevin [2026] | KernelBench 80 tasks | QwQ-32B | 82% | 1.10x | Multi-turn RL, turn-wise reward |
| CUDA Agent [2026] | 6K 合成算子 | 未公开 | SOTA (100/100/92%) | 2.11x geomean | 大规模Agentic RL, Value Pretraining |
| K-Search [2026] | 无训练数据 | GPT-5/Gemini | 未在KB评测 | 2.10x avg | Co-evolving world model, 搜索+规划 |
| AutoTriton [2025] | TritonBench | Seed-Coder-8B | 可比Claude-4 | 接近RTX 3090优化 | 首个Triton RL方法, GRPO |

### 开放问题

1. **RL 泛化性**: 当前方法在 Level-1/2 表现优秀，但 Level-3（复杂融合）仍有差距。RL 学到的策略能否泛化到训练分布之外的算子类型？
2. **长序列 kernel**: 当前 benchmark 以短序列为主，但在 128K+ token 场景下，kernel 设计涉及到的 memory hierarchy 复杂性剧增，RL 方法尚未验证
3. **多硬件支持**: Kevin 和 CUDA Agent 都只产出 NVIDIA CUDA kernel，无法自动迁移到 AMD/Huawei
4. **安全与验证**: LLM 可能产生 silent correctness bug（数值误差在 tolerance 内但存在边界问题），如何验证生成的 kernel 在全输入空间上正确？

---

## 2. 🔄 高级算子融合：从手动到编译器自动

### 核心问题

传统算子融合（GEMM + Bias + ReLU）已成标配，所有编译器都能做。但真正的挑战在于**含有 reduction 依赖的复杂算子融合**——比如 attention 中的 softmax 依赖 row-wise sum，这使得两个 GEMM 不能简单 fuse 在一起。核心问题：**能否自动生成 FlashAttention 级别的 fused kernel？**

### 代表性论文

#### Neptune: Advanced ML Operator Fusion [Zhao et al., UIUC, PLDI 2026]

Neptune 是本年度最惊艳的编译器工作之一。它的核心 insight 极其简单却强大：**主动打破依赖关系，然后用代数校正表达式补偿**。

具体来说，对于 attention 中的 `QK^T → softmax → SV` 序列，传统编译器无法 fuse 因为 softmax 需要上一步的全局 max 和 sum。Neptune 的做法是：
1. **故意**让 QK^T 做完部分计算就提前开始 SV
2. 维护一个"校正缓冲区"，记录偏离的值
3. 最后用代数校正得到正确结果

这本质上是在 **正确性和并行性** 之间做了一个巧妙的 tradeoff —— 引入少量冗余计算换取更大的融合机会。

结果令人震惊：从一段朴素 attention 代码开始，Neptune 自动生成了**功能上等价于 FlashAttention 和 FlashDecoding 的 kernel**。在 10 个 attention benchmark 上，平均超越 Triton/TVM/FlexAttention **1.35x**，在 AMD GPU 上最高 **3.32x**。

> 💡 **个人评论**：Neptune 的代数校正方法极其优雅，它揭示了一个被忽略的事实——传统编译器对"依赖"的理解过于严格。对 ML operator 来说，某些依赖可以被"软化"，只要最终结果正确。这有点像浮点计算中交换律不成立的背景下，我们仍然可以用 FMA 重排来加速——代价是微小的数值偏差。

#### MLIR-based Fusion Pipeline

在 Neptune 之外，MLIR 生态也在推进 fusion 的自动化。典型的 lowering 链:

```
TOSA (Tensor Operator Set Architecture)
  → Linalg (线性代数方言)
    → Vector (向量化)
      → LLVM (GPU codegen)
```

这个 pipeline 的优点是 **渐进式 lower**：每一层都可以做特定抽象的融合优化。例如在 Linalg 层做 element-wise fusion，在 Vector 层做 reduction fusion。但问题也很明显——每一层的 fusion 决策是独立的，全局最优性无法保证。

### 编译器自动fusion vs 手工Triton kernel

| 维度 | 编译器自动fusion | 手工Triton kernel |
|------|----------------|------------------|
| 开发效率 | 极高，只需写简单算子定义 | 低，需要手动调tile size和schedule |
| 性能上限 | 中高，受限于编译器启发式 | 高，可达理论峰值 |
| 覆盖范围 | 普适但浅层优化 | 针对特定场景深度优化 |
| 可维护性 | 高，代码量少 | 低，需要专家维护 |
| 动态shape支持 | 较好（编译器可插入runtime check） | 较差（需要多版本kernel） |

**Neptune 的突破在于将编译器自动 fusion 的性能上限拉高到了可以挑战手写 kernel 的水平。** 但注意它目前只适用于 attention-like 的 reduction 序列，更广泛的算子类型仍需验证。

### 开放问题

1. **Fusion 搜索空间爆炸**: 当 operator graph 有几百个节点时，哪些 fusable、哪些不 fuse 是最优解，搜索空间是指数级的
2. **动态 shape**: 如果输入维度在运行时变化，fusion plan 需要在线调整，这是编译器目前最头疼的问题
3. **代数校正的自动化**: Neptune 的校正表达式是手工推导的，能否让编译器自动发现这些校正模式？

---

## 3. 🧊 稀疏计算算子：从结构化到非结构化

### 核心问题

LLM 中存在大量冗余——权重可以被剪枝、激活值可以稀疏、attention 可以只关注部分 token。问题是如何在 GPU 有限的稀疏硬件支持下，把这些冗余转化为真实的加速？

### 2:4结构化稀疏：硬件基础

NVIDIA 从 Ampere (A100) 开始支持 **2:4 structured sparsity**：在每组 4 个元素中只保留 2 个非零值，Tensor Core 可以在硬件层面跳过零值计算，理论上实现 **2x 加速**。但实际加速往往只有 1.2-1.3x，原因是：
- 稀疏格式转换需要预处理
- 权重加载的带宽节省被元数据开销抵消
- 只有权重稀疏，激活密度仍然是 100%

### 代表性进展

#### 2:4 Activation Sparsity [Haziza et al., Meta, 2025]

这篇来自 Meta 的工作将一个看似无关的发现变成了实用的加速技术：**Squared-ReLU 激活函数（ReLU²）天然产生 2:4 稀疏模式**——约 50% 的激活值恰好为 0。这完美匹配 NVIDIA 的 2:4 硬件稀疏支持。

方法：使用 ReLU² 替代 GELU/SiLU（需要少量 fine-tune），激活值自动呈现 2:4 稀疏 → 直接使用 cuSPARSELt 加速 FFN 的前向和反向传播。

结果：FFN 加速 **1.3x**，**无损精度**。与 FP8 量化兼容，可以叠加使用。

> 💡 **个人评论**：这篇论文的意义不在于 1.3x 加速本身，而在于它展示了"算法-硬件 co-design"的极致——选择激活函数不仅影响精度，还影响硬件的利用率。ReLU² 让稀疏成为自然结果，而不是事后修剪。这是"稀疏即免费"的典型案例。

#### V:N:M Sparsity [Zhao et al., ICLR 2025]

2:4 的最大限制是稀疏比例固定为 50%。V:N:M sparsity 突破了这一点：将权重矩阵划分为 V×M 的块，在每个块内剪枝 (M-4) 列，剩余列应用 2:4。这使得稀疏比例可以从 50% 灵活调整到更高。

结果：DeiT-base 在 64:2:8 稀疏率（75% 稀疏）下几乎无损（<0.3% 精度损失），speedup **1.7x**，远超 2:4 的 1.15x。

#### Insum: Sparse GPU Kernels with Indirect Einsums [Won et al., MIT, ASPLOS 2026]

MIT CSAIL 的 Insum 走了另一条路：**用抽象表达代替手动稀疏 kernel 编写**。核心思想是用 Einsum（Einstein summation）描述稀疏计算，然后自动 rewrite 为格式相关的 indirect Einsum——用 indirect indexing 将稀疏数据映射为稠密 tensor 操作。

结果：**1.14x–3.81x speedup**，同时代码量减少 **202x–4491x**（从数百行 Triton/CUDA 降到 1 行 Einsum）。format-agnostic 的设计意味着同一份代码可以适配不同的稀疏格式（GroupCOO, BlockGroupCOO, CSR等）。

#### Deja Vu: Contextual Sparsity [Liu et al., 2023]

虽然发表于 2023 年，Deja Vu 的影响持续至今。它揭示了 LLM 推理中的一个关键现象：**每个 token 只激活一小部分神经元，且激活模式在不同 token 间高度可预测**。基于此，可以通过学习一个轻量级 predictor 来提前预测哪些神经元会被激活，只加载这些神经元对应的权重，实现推理加速 **2-6x**。这个方向在 2025 年进一步发展为"通用激活稀疏性规律"[Zhang et al., 2025]。

### 开放问题

1. **动态稀疏的 kernel launch overhead**: 如果每个 layer/sample 的稀疏模式不同，kernel launch 和格式转换的开销可能吞噬加速收益
2. **硬件支持受限**: NVIDIA 只支持 2:4，AMD/Intel 完全没有硬件稀疏支持。V:N:M 虽然灵活，但没有硬件 native 支持，需要通过软件模拟
3. **训练-推理 gap**: 训练时大部分方法不支持稀疏（反向传播需要完整梯度），导致训练/推理的稀疏策略不一致

---

## 4. ⚡ 长上下文Attention算子演进

### 核心问题

Transformer 的计算复杂度是 O(N²·d)，当序列长度 N 从 4K 扩展到 128K、1M、甚至无限时，attention 从计算瓶颈变成了**内存瓶颈**——显存中存不下完整的 attention 矩阵。核心问题是：**如何在保持精度的前提下，让 attention 算子支持无限长的上下文？**

### FlashAttention系列：从IO-aware到微架构适配

FlashAttention 系列的演进本身就浓缩了算子优化的全部智慧：

| 版本 | 年份 | 硬件目标 | 核心创新 | 关键指标 |
|------|------|---------|---------|---------|
| FA1 | 2022 | A100 (Ampere) | IO-aware tiling, online softmax | 2-4x 加速 |
| FA2 | 2023 | A100 + Ada | Warp-level parallelism, MQA/GQA | 2x over FA1 |
| FA3 | 2024 | H100 (Hopper) | Async warp specialization, FP8, WGMMA | 1.5-2x over FA2, 1.2 PFLOPs |
| FA4 | 2026 | B200 (Blackwell) | Asymmetric hardware scaling, TMEM, CuTe-DSL | 1.3x over cuDNN, 1613 TFLOPs |

**FA3** [Shah et al., NeurIPS 2024] 的关键技术：
- **Warp specialization**: 将 warp 分拆为 producer（负责异步数据加载）和 consumer（负责计算），消除数据搬运和计算之间的串行依赖
- **Block-wise interleaving**: 将 matmul 和 softmax 交错执行，更好地利用 Tensor Core
- **FP8 block quantization**: 利用 H100 的 FP8 Tensor Core 支持，达到 1.2 PFLOPs/s

**FA4** [Zadouri et al., 2026] 的突破在于应对 Blackwell 的**非对称硬件 scaling**——Tensor Core 吞吐翻倍，但 exp 单元和 shared memory 带宽没有同步增长。解决方案：
- **FMA-based exp emulation**: 用 FMA 单元模拟指数函数（利用 BF16 的量化噪声容忍度）
- **DSMEM-based atomic reduction 减半**: 利用分布式 shared memory 将 dQ 的原子操作减半
- **TMEM 利用**: Blackwell 的 Tensor Memory (256 KB/SM) 允许 MMA 异步写入，大幅降低 register pressure
- **CuTe-DSL 用 Python 写 kernel**: 编译时间从 45-55 秒降到 **1.4-2.5 秒**

### vLLM PageAttention：非连续KV cache的算子设计

PageAttention [Kwon et al., 2023] 不是 attention 算法本身的创新，而是**显存管理层面的算子设计革命**。它将 KV cache 分页管理，解决了 LLM serving 中 key 的显存碎片和浪费问题。非连续的 KV cache 需要专门的 attention kernel 来处理（按 page 索引访问），这催生了一系列非连续 memory access pattern 优化的 kernel 设计。

### MLA：DeepSeek的KV压缩

Multi-head Latent Attention (MLA) [DeepSeek, 2024] 的核心是 **KV 压缩 + Matrix Absorption**：
- 将 KV 投影到低维 latent space（压缩率 4-8x）
- 在计算 attention 时，通过 matrix absorption 技术将压缩后的 KV 直接与 Q 计算
- 显著降低 prefill 和 decode 阶段的 KV cache 存储开销

MLA 的内存节省使其能在同等显存下支持更长的上下文，但代价是 attention 算子变得复杂——需要额外的投影矩阵和 latent space 的计算。DeepSeek 为此设计了专门的 fused MLA kernel。

### 分布式Attention

| 方法 | 策略 | 通信开销 | 适用场景 |
|------|------|---------|---------|
| Ring Attention | 在 ring 上轮转 KV blocks | O(N) 通信 | 单机多卡训练 |
| Star Attention | 中心节点分发 KV | O(1) 广播 | 多机推理 |
| Distributed FlashAttention | FA 的分布式变体 | 取决于分区策略 | 长序列训练 |

### LongCache: Training-free无限上下文

LongCache [2025] 提出了一种训练-free 的无限上下文方法：不需要额外训练，通过缓存和选择性压缩历史 token 的 KV，使模型可以处理任意长度的序列。虽然严格来说这不是"算子"创新，但它对 attention kernel 提出了新的要求——需要支持 streaming 和动态 KV cache 管理。

### 对比

| 方法 | 内存节省 | 速度提升 | 适用场景 | 算子复杂度 |
|------|---------|---------|---------|-----------|
| FlashAttention-3 | ~10x HBM read | 1.5-2x | 通用 attention | ⭐⭐⭐ 中 |
| FlashAttention-4 | ~10x HBM read | 1.3x over cuDNN | Blackwell 平台 | ⭐⭐⭐⭐ 高 |
| PageAttention | 灵活显存管理 | 1.5-2x serving | vLLM 推理引擎 | ⭐⭐ 中 |
| MLA (DeepSeek) | 4-8x KV cache | 小幅 | 超长上下文 | ⭐⭐⭐⭐⭐ 极高 |
| Ring/Star Attention | N/A | 线性扩展 | 多卡分布式 | ⭐⭐ 低 |

### 开放问题

1. **1M+ 超长上下文的 kernel 设计**: 当前 attention 算法在 128K 内工作良好，但到 1M token 时，tiling 策略和 online softmax 的数值稳定性尚未被充分验证
2. **FlashAttention on non-NVIDIA**: FA 的优化深度绑定 NVIDIA 硬件特性（WGMMA、TMA、TMEM），AMD/Intel GPU 缺乏对应的 native 支持
3. **MLA 的 kernel 复杂度**: MLA 的 fused kernel 编写极其复杂，目前只有 DeepSeek 内部有高质量实现，社区复现版本性能差距明显

---

## 5. 🔢 极致低比特量化算子

### 核心问题

精度降低直接减少内存带宽需求并提升 Tensor Core 吞吐。FP8 已在工业界全面铺开，FP4 正在成为下一个战场。核心问题是：**如何设计算子来充分利用 FP4/FP8 的硬件能力，同时将精度损失控制在可接受范围内？**

### FP8的成熟：E4M3/E5M2的工业实践

H100 的 FP8 Tensor Core 让 FP8 量化成为标配。E4M3（4 bit exponent, 3 bit mantissa）适合 weight 和 activation，E5M2 适合 gradient。工业实践表明：
- **W8A8 FP8 量化**：几乎无精度损失，推理加速 1.5-2x
- **KV cache INT8/FP8**：已成为长上下文推理的标准配置

### FP4前沿：Blackwell B200

Blackwell B200 首次在硬件级别支持 **FP4**——E2M1 格式（2 bit exponent + 1 bit mantissa）。这带来了一个有趣的 tradeoff：精度大幅降低，但 Tensor Core 吞吐在 FP4 下可以达到 FP16 的 4 倍。

**MXFP4 (Microscaling FP4)** [2025] 进一步引入了 microscaling factor，将一组 FP4 值共享一个 scaling factor，在高精度场景下显著改善了 FP4 的表示能力。

### KV Cache量化的演进

这是最活跃的量化算子研究方向之一：

```
INT8 quantization [2023]
  → FP8 quantization [2024]   (更好的数值特性)
    → FP4 KV cache [2025]     (4x cache reduction)
      → MXFP4 microscaling [2026] (更好的精度保留)
```

FP4 KV cache 可以让 128K 上下文的 KV cache 占用从 32GB 降到 8GB——这对单机部署长上下文模型至关重要。

### 量化方法的演化线

```
SmoothQuant [Xiao et al., 2023]  
  → 逐通道迁移量化难度，LLM INT8 推理无精度损失
  → QuaRot [Ashkboos et al., 2024]  
    → 旋转矩阵消除 outlier，W4A4 成为可能
    → SpinQuant [Liu et al., 2025]  
      → 可学习的旋转矩阵，提升了 QuaRot 的精度
```

**SpinQuant** 是这条演化链的最新节点：它没有改变量化算子的结构，而是通过可学习的方式找到最优旋转矩阵，使 W4A4 量化达到接近无损的水平。

### 开放问题

1. **FP4 的训练稳定性**: FP4 在前向传播中尚可，但反向传播中梯度下溢严重，目前 FP4 训练仍是一个开放挑战
2. **精度 loss 的校准**: 低比特量化后的模型通常需要 calibration 数据集来进行 post-training quantization，但 calibration 数据集的选择严重影响最终精度，缺乏系统化的方法
3. **硬件支持的滞后**: FP4 目前只在 Blackwell 上得到原生支持，Hopper 和 AMD GPU 需要通过软件模拟，性能损失较大

---

## 6. 🌐 多硬件算子可移植性

### 核心问题

NVIDIA、AMD、Intel、Apple、华为……每个硬件厂商都有自己的 GPU 架构和优化库。算子开发者面临一个选择：是每次为每个平台重写 kernel，还是找到一个跨平台的抽象层？核心问题是：**能否实现"一次编写，处处高性能"的算子开发范式？**

### Triton的多后端进展

OpenAI Triton 的多后端支持是 2025-2026 年最重要的算子基础设施发展之一：

| 后端 | 状态 | 性能差距 vs Native | 主要挑战 |
|------|------|-------------------|---------|
| NVIDIA (PTX) | 成熟 | < 10% | 与厂商库比仍有差距 |
| AMD (ROCm) | Beta | 15-30% | 缺少原生 hipTensorCore 映射 |
| Intel (PVC/SPIRV) | Experimental | 30-50% | GPU 架构差异大，vectorization 不匹配 |
| Apple (Metal) | Experimental | 50%+ | Tile size 约束不同，缺少 warp 语义 |
| 华为 Ascend | Community effort | 差距较大 | Cube 单元 vs Tensor Core 的概念映射 |

### MLIR的Universal Lowering Promise

MLIR 的愿景是所有硬件后端共享同一个 IR lowering 链。但在实践中：

- **优势**: TOSA → Linalg → Vector → LLVM 的 pipeline 确实可以定位到不同硬件
- **现实**: 每个硬件后端的「最后一公里」（Vector/Linalg → 硬件指令）是完全不同的，导致大量重复代码

### AMD Composable Kernel vs NVIDIA CUTLASS

这是一个非常有启发的设计哲学对比：

| 维度 | NVIDIA CUTLASS | AMD Composable Kernel (CK) |
|------|---------------|---------------------------|
| 设计理念 | 模板元编程, 极度泛化 | 组合式, 模块化 |
| 抽象层次 | 从 thread-level 到 block-level | template-based tile operators |
| 学习曲线 | 极陡 (C++ templates, 编译慢) | 相对平缓 |
| GPU特性利用 | 深度绑定 PTX/SASS | 通过 hip 抽象，多代兼容 |
| 性能上限 | 极高 (可直接手工排布指令) | 高 (模块化设计略有 overhead) |

> 💡 **个人评论**: CUTLASS 代表了 "给专家用的终极武器" 的理念——你能用它写出任何东西，但你得是专家。CK 代表了 "工程化优先" 的理念——你不需要精通汇编也能写出不错的 kernel。两种哲学没有绝对优劣，但 CK 的设计更符合当前 AI Infra 对 developer productivity 的追求。

### TOSA/StableHLO作为跨平台算子中间表示

- **TOSA** (Tensor Operator Set Architecture): Arm 主导的算子 IR，定义了 NN 算子的标准语义，MLIR 原生集成
- **StableHLO**: Google 的 HLO 稳定化版本，JAX/PJRT 的中间表示

两者都在朝着成为"算子的 LLVM IR"的目标前进——上接框架，下接硬件后端。但目前的问题是**语义粒度**：TOSA 的算子集偏向推理（固定 shape、量化友好），StableHLO 偏向训练（动态 shape、自动微分），两者互有重叠但不对齐。

### 华为Ascend C的演进

华为 Ascend 的算子开发语言经历了从 TBE (Tensor Boost Engine) 到 Ascend C 的自研演进。Ascend C 的核心设计：采用 **DSL + API** 的双层抽象，开发者可以用高阶 DSL 描述计算逻辑，编译器优化后映射到 Cube 单元和 Vector 单元。2025 年发布的 Ascend C 2.0 增加了对 Turing-complete 编程的支持（原先是受限的 dataflow 模型），使其表达能力接近 Triton。

### 开放问题

1. **Triton on NPU 的性能 gap**: 当前 Triton 后端在 NVIDIA GPU 上达到 native 性能的 90%+，但在 NPU（华为、Graphcore、Groq）上差距可能超过 50%。根本原因是 Triton 的编程模型（warp-level SIMT）与 NPU 的 dataflow 架构不匹配
2. **抽象层级的正确选择**: 多后端支持的最大挑战不是技术实现，而是确定"正确的抽象层级"——太底层则失去可移植性，太高层则无法利用硬件特性。Triton 选择了 "tile-level" 这个 Goldilocks point，但这对 NPU 来说可能偏高
3. **社区 vs 厂商利益**: 每个硬件厂商都有激励让自己的后端特殊化（从而锁定用户），这与可移植性的目标存在根本矛盾

---

## 7. 🚀 结语与展望

### 这些方向会交汇在哪里

站在 2026 年中回顾这六大方向，可以看到一个清晰的趋势：**算子开发的自动化、智能化、跨平台化正在同步加速**。它们不只是在各自维度上独立前进，而是在多个层面交汇：

**LLM-driven kernel generation + 编译器自动fusion**: CUDA Agent 已经展示了 RL agent 能自动发现传统编译器无法发现的优化（代数化简、API 调用选择）。接下来必然的趋势是——将 RL agent 嵌入编译器 pipeline，让编译器不仅做规则驱动的 fusion，还能通过 agentic search 探索更大范围的优化空间。换句话说，**编译器变成 RL agent 的执行环境**。

**FP4 + 稀疏计算的联合优化**: 低比特量化减少了数据搬移量，稀疏减少了计算量，两者的联合优化可以突破单一方法的性能天花板。Meta 的 2:4 Activation Sparsity 已经展示了与 FP8 的兼容性。FP4 + 4:8 稀疏的组合可能在 Blackwell 上实现 4-6x 的端到端加速。

**Triton 的"CPU 时刻"**: 就像 LLVM 统一了 CPU 编译器的后端，Triton（或类似抽象）正在成为 GPU kernel 开发的 LLVM。如果 Triton on AMD/Intel/Apple 的性能差距能缩小到 10% 以内，那么"一次编写，处处高性能"将从愿景变为现实。

### 个人预测：未来2年的算子开发范式

1. **2027 年：RL agent 成为 kernel 开发的默认工具**。类似 GitHub Copilot，但专门针对 GPU kernel 优化。开发者描述算子语义，RL agent 自动生成+调优 kernel。
2. **算子抽象层统一到 Triton-level**: 框架和硬件厂商会围绕 Triton（或 MLIR 的 linalg-on-tensors）建立统一的 DSL 生态，手写 CUDA 将仅限于最极致的性能热点。
3. **"编程-less"算子开发**: 自动微分 + 自动融合 + 自动稀疏 + 自动量化的组合，将使得 90% 的算子可以通过声明式 API（如 einsum 表述）自动获得高性能实现，不需要手动编写任何 GPU 代码。
4. **硬件与算子的 co-design 成为主流**: FlashAttention 系列证明了算法-硬件 co-design 的威力。未来的 GPU 架构设计将越来越多地考虑算子的新型模式，而算子的突破也会反向驱动硬件架构演进。

---

## 参考文献

1. Baronio, C., Marsella, P., Pan, B., Guo, S., Alberti, S. "Kevin: Multi-Turn RL for Generating CUDA Kernels." *ICLR 2026*. [arXiv:2507.11948]
2. Dai, W., Wu, H., Yu, Q., et al. "CUDA Agent: Large-Scale Agentic RL for High-Performance CUDA Kernel Generation." *arXiv:2602.24286*, 2026.
3. Cao, S., Mao, Z., Gonzalez, J. E., Stoica, I. "K-Search: LLM Kernel Generation via Co-Evolving Intrinsic World Model." *arXiv:2602.19128*, 2026.
4. Li, S., Wang, Z., He, Y., et al. "AutoTriton: Automatic Triton Programming with Reinforcement Learning in LLMs." *ICLR 2026*. [arXiv:2507.05687]
5. Ouyang, W., et al. "KernelBench: A Benchmark for LLM-Generated CUDA Kernels." 2025.
6. Zhao, Y., Johnson, E., Chatarasi, P., Adve, V., Misailovic, S. "Neptune: Advanced ML Operator Fusion for Locality and Parallelism on GPUs." *PLDI 2026*. [arXiv:2510.08726]
7. Haziza, D., Chou, T., Choudhary, D., et al. "Accelerating Transformer Inference and Training with 2:4 Activation Sparsity." *ICLR Workshop*, 2025. [arXiv:2503.16672]
8. Zhao, K., Yuan, T., Bao, H., et al. "Beyond 2:4: Exploring V:N:M Sparsity for Efficient Transformer Inference on GPUs." *ICLR 2025*. [arXiv:2410.16135]
9. Won, J., Ahrens, W., Emer, J. S., Amarasinghe, S. "Insum: Sparse GPU Kernels Simplified and Optimized with Indirect Einsums." *ASPLOS 2026*. [arXiv:2510.17505]
10. Liu, Z., et al. "Deja Vu: Contextual Sparsity for Efficient LLMs at Inference Time." *ICML 2023*.
11. Shah, J., Bikshandi, G., Zhang, Y., et al. "FlashAttention-3: Fast and Accurate Attention with Asynchrony and Low-precision." *NeurIPS 2024*. [arXiv:2407.08608]
12. Zadouri, T., et al. "FlashAttention-4: Algorithm and Kernel Pipelining Co-Design for Asymmetric Hardware Scaling." *arXiv:2603.05451*, 2026.
13. Kwon, W., Li, Z., Zhuang, S., et al. "Efficient Memory Management for Large Language Model Serving with PagedAttention." *SOSP 2023*.
14. DeepSeek-AI. "DeepSeek-V2: A Strong, Economical, and Efficient Mixture-of-Experts Language Model." *arXiv:2405.04434*, 2024.
15. Xiao, G., Lin, J., Seznec, M., et al. "SmoothQuant: Accurate and Efficient Post-Training Quantization for Large Language Models." *ICML 2023*.
16. Ashkboos, S., et al. "QuaRot: Outlier-Free 4-Bit Inference in Rotated LLMs." *NeurIPS 2024*.
17. Liu, J., et al. "SpinQuant: LLM Quantization with Learned Rotations." 2025.
18. Zhang, J., et al. "Universal Properties of Activation Sparsity in Large Language Models." 2025.
19. Tillet, P., Kung, H. T., Cox, D. "Triton: An Intermediate Language and Compiler for Tiled Neural Network Computations." *PLDI 2019*.
20. Ansel, J., Yang, E., He, H., et al. "PyTorch 2: Faster Machine Learning through Dynamic Python Bytecode Transformation and Graph Compilation." *ASPLOS 2024*.

---

*本文发布于 2026 年 6 月 29 日。算子领域发展极快，论文和观点可能很快过时，请结合最新研究动态阅读。*
