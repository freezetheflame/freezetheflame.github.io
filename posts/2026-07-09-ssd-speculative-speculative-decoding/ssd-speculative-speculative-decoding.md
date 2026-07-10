---
title: "Saguaro (SSD)：把推测解码的「推测」和「解码」也并行起来"
date: 2026-07-09
description: "ICLR 2026 论文解读：Tri Dao 团队提出 Speculative Speculative Decoding（SSD），消除推测解码中最后一个串行瓶颈，端到端加速 30%。"
tags: [LLM, 推理加速, Speculative Decoding, ICLR, AI Infra]
---

## 论文信息

**论文标题：** Speculative Speculative Decoding  
**作者：** Tanishq Kumar（斯坦福）、Tri Dao（普林斯顿）、Avner May（Together AI）  
**发表：** ICLR 2026  
**链接：** https://arxiv.org/abs/2603.03251  

---

## 为什么值得读？

Speculative Decoding（SD）已经是 LLM 推理加速的主流手段：用小 Draft Model 快速生成若干候选 token，再让大 Target Model 并行验证。但这个范式本身有一个被忽视的 **串行瓶颈**——Draft 和 Verify 是严格顺序的：先等 Draft 产出一批 token，再跑 Target verify，得到结果后才能开始下一轮 Draft。

在大模型推理越来越追求"每一微秒都压榨干净"的今天，这个串行瓶颈变得不可忽视。Tri Dao（FlashAttention 之父）团队这篇 ICLR 2026 论文，直指 SD 的"自我串行化"问题，提出 SSD（Speculative Speculative Decoding）——**让 Draft 和 Verify 重叠执行**，消除了 Draft 的 hidden latency。

---

## 方法核心思路

SSD 的核心洞察很直接：**Target Model 在 Verify 时，Draft Model 闲着呢。** 为什么不让它提前预判 Verify 的结果，并针对可能的结果先准备好下一轮 Draft？

**三步走：**

1. **预判（Prediction）：** 当前这一轮 Target 正在 Verify 时，Draft Model 预测可能出现的 Verify 结果（即哪些 token 会被接受、哪些被拒绝）。关键点在于——因为 Verify 是并行校验多个 token 的联合分布，可能的结果数量是有限的。

2. **预准备（Pre-emptive Drafting）：** 针对每种可能结果，Draft Model **提前计算**下一轮要给出的 Draft Token。这本质上是让 Draft Model 在一个"猜测"上执行 Attention，而不是等实际结果出来再跑。

3. **即时匹配：** 当 Target 正式返回 Verify 结果时，如果该结果落在预测集合中，Draft 结果可直接复用，**零延迟开始下一轮**。如果没命中（小概率事件），Fallback 到传统串行 SD。

论文识别了 SSD 面对的 **三个关键挑战** 并给出了优雅解决：

- **不可预测性（Unpredictability）：** Verify 结果空间太大怎么办？→ 设计了 **Top-K 截断 + 条件概率剪枝**，只保留最可能的结果路径
- **预计算开销（Pre-computation Cost）：** 预先计算多种结果会不会更慢？→ Draft Model 本身很轻量，Draft 的计算量远小于 Target Verify，预计算多个分支的总开销仍低于等待 Verify 完成的空闲时间
- **KV Cache 污染（Cache Contamination）：** 预计算用的假设性 KV Cache 和实际 KV Cache 不一致怎么办？→ 引入 **Lazy KV Cache 合并**策略

最终优化算法称为 **Saguaro**。

---

## 实验关键数据

| 指标 | 值 |
|------|-----|
| vs 优化版 SD 基线（平均加速） | **30%** |
| vs 自回归解码（最大加速） | **5×** |
| 测试基线 | Eagle3、Medusa、标准 SD |
| 实现 | 开源推理引擎（Together AI 生产环境） |

关键消融实验表明：预判准确率在 Top-2 条件下超过 **85%**，即 85% 以上的 Verify 结果可以即时匹配，真正实现零延迟 Draft。

---

## 思考

这篇论文的核心贡献在于 **识别并消除了 SD 范式中最后一个串行瓶颈**。从 SuperScalar 处理器的分支预测到 GPU 的乱序执行，计算机体系结构的历史告诉我们——**覆盖流水线气泡是提升吞吐最有效的手段**。SSD 把同样的思想引入 LLM 推理，视角非常深刻。

Tri Dao 团队在系统-算法交叉领域的功力在这篇论文中体现得淋漓尽致——不是简单堆砌技巧，而是从计算流水线的本质出发做设计。

**可改进之处：** 1）预计算分支数量在大批量场景（batch size > 8）下的扩展性没有充分讨论；2）预判失败时的 fallback 机制相对简单（退回串行），可能在大并发时引入尾部延迟抖动；3）Draft Model 需要支持多分支 Attention，对某些极简 Draft Model 架构可能不够友好。

**适合谁读：** LLM 推理引擎核心开发者、关注推测解码的 AI 系统研究员、对算法-系统协同设计感兴趣的工程师。如果你用过 vLLM 的 speculative decoding 功能，这篇会让你看到"还有 30% 的潜力可挖"。
