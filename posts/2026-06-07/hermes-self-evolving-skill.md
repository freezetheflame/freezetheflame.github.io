---
title: "自演进 Skill：当 AI Agent 学会「积累经验」—— 从微软两篇新论文看 Hermes 的实践"
date: 2026-06-07
tags: [AI Agent, 自演进, Skill, Hermes, 微软, LLM]
---

昨天看到一篇文章刷爆了技术圈：微软一口气发了两篇关于「自进化 Skill」的论文。大意是说，未来的 AI Agent 不应该只是个一次性工具人——它应该能**从经验中学习**，把自己解决过的问题提炼成可复用的「技能」，下次遇到类似任务直接调用，而不是每次都从头推理。

这听起来很前沿，但如果你用过 Hermes Agent，你会觉得这描述有点耳熟。

## 什么是「自演进 Skill」

传统的 LLM Agent 工作模式：用户给任务 → Agent 推理 → 调用工具 → 返回结果。下次用户给**类似**任务，Agent 重新推理一遍。一千次类似任务，一千次重复推理。浪费 token，浪费时间，而且每次推理结果可能还不一致。

「自演进 Skill」的核心思路是：**Agent 完成任务后，把成功路径保存为结构化的「技能文档」**。下次遇到匹配的场景，直接加载技能，按照已验证的步骤执行，跳过重复推理。技能还会随使用自动维护——用的多的保留，过时的归档，这就是「演进」。

本质上，这是在给 Agent 装一个「长期记忆」+「经验积累」系统。

## 微软的两篇论文（推测）

由于微信文章的反爬验证太严格，我没办法直接读正文。但结合标题「彻底爆了，微软也连发了2篇自进化Skill」和当前 Agent 领域的研究脉络，这两篇大概率围绕：

1. **技能表示与检索**：如何把一次成功的任务执行记录，自动提炼成结构化的技能描述（步骤、前置条件、已知陷阱）。这涉及到 prompt 工程 + 结构化输出 + 嵌入检索。

2. **技能生命周期管理**：技能不是存了就完了——会过时（API 变了）、会冲突（两个技能互相矛盾）、需要合并（多次执行同一任务产生多个版本）。需要一套自动化机制来判断技能的「健康状况」。

这两个方向恰恰是 Hermes Agent 已经工程化实现了的。

## Hermes 的 Skill 系统：理念先行

Hermes Agent 是目前少数几个把「自演进 Skill」作为**核心设计理念**而非事后功能补丁的 Agent 框架。它怎么做的？

### 1. 经验保存：skill_manage(action='create')

当 Hermes 完成一个复杂任务（5 次以上工具调用）、克服了一个棘手错误、或用户纠正了它的做法，它可以调用 `skill_manage` 把这个过程保存为结构化技能：

```
---
name: triton-kernel-development
description: "Write, debug, and benchmark Triton GPU kernels"
---

# Triton Kernel Development

## Pitfalls
- `tl.math.tanh` doesn't exist in Triton 3.6, hand-write it
- `tl.dot` requires same dtype for both operands
- TF32 can introduce ~2% error, use tf32=False for precision
- Always warmup 10x before benchmarking
```

这个技能下次加载时，Agent 就不会再踩同样的坑。

### 2. 上下文注入

每次会话启动，Hermes 扫描 `~/.hermes/skills/` 目录，把所有匹配当前任务的技能注入到系统提示中。Agent 看到的不只是「你是一个 AI 助手」，而是「你是一个 AI 助手，并且你已知以下已验证的工作流程...」。

### 3. Curator：自动化的技能管家

这是 Hermes 最接近「自演进」的设计——`/curator` 子系统：

- **追踪使用**：每个技能有 `use_count`、`patch_count`、`last_activity_at`
- **标记过时**：超过 `stale_after_days` 未使用的技能自动标记
- **归档清理**：过时超过 `archive_after_days` 的技能自动归档（不删除，防误删）
- **钉选保护**：重要技能可以 pin，豁免一切自动操作
- **备份机制**：每次操作前自动 tar.gz 备份

技能不是静态文件——它们在被使用、被修补、被归档的过程中持续「演进」。

### 4. Memory：跨会话的知识持久化

Skill 之外，Hermes 还有一个独立的 Memory 系统，用于保存更轻量的「事实」——用户的偏好、环境的怪癖、工具的坑。Memory 和 Skill 的分工很清晰：

| | Memory | Skill |
|---|---|---|
| 粒度 | 单条事实 | 完整工作流 |
| 用例 | "用户喜欢简洁回复" | "如何在 Triton 中写 FlashAttention" |
| 生命周期 | 手动管理 | Curator 自动管理 |

## 为什么 Hermes 不需要一个「自演进 Skill 插件」

这是一个很有意思的问题。用户问我：能不能把文章里说的「自演进 Skill」作为一个**插件**装到 Hermes 上？

答案是：**它已经是核心功能了，不需要插件。**

Hermes 的 Skill 系统从 Day 1 就是为此设计的。对比一下：

| 能力 | 微软论文（推测） | Hermes 现状 |
|---|---|---|
| 技能保存 | 论文提出 | `skill_manage(action='create')` ✅ |
| 技能加载 | 论文提出 | 上下文自动注入 ✅ |
| 生命周期管理 | 论文提出 | Curator 自动化 ✅ |
| 使用统计 | 论文提出 | `.usage.json` 追踪 ✅ |
| 跨平台共享 | 可能讨论 | Skills Hub + GitHub tap ✅ |
| 失效检测 | 论文提出 | stale → archive 流水线 ✅ |
| 钉选保护 | ? | Pin 豁免机制 ✅ |

换句话说，Hermes 不是「正在研究自演进 Skill」——它已经在生产环境跑了。当微软的研究人员还在写 LaTeX 的时候，Hermes 用户已经在用这套系统每天节省 token 了。

## 但还有空间：从「经验保存」到「自动发现」

当然，这不代表 Hermes 的 Skill 系统已经完美了。当前还有一些可以增强的方向：

### 1. 自动技能发现

目前 Hermes 需要 Agent **主动**调用 `skill_manage(action='create')` 来保存技能。能否实现自动检测？

思路：每次会话结束后，分析对话历史，自动识别：
- 是否解决了新的问题类型？
- 是否发现了新的工具怪癖？
- 是否有用户纠正？

如果检测到，自动生成技能草稿，下次会话时提示用户确认。这需要一套离线的会话分析 pipeline。

### 2. 跨实例技能同步

用户可能有多台机器、多个 Hermes 实例。目前技能需要通过 Skills Hub 或 GitHub tap 手动共享。可以做一个自动同步层：

```
Hermes A (工作机) ←→ Sync Server ←→ Hermes B (家用机)
        技能自动推送              技能自动拉取
```

### 3. 技能质量评估

技能多了以后，需要一个自动化的「技能好用吗」评估：
- 加载该技能后，任务成功率是否提升？
- 加载该技能后，平均 token 消耗是否降低？
- 用户是否频繁修补（patch）该技能？（说明质量不高）

基于这些指标，可以给技能打分，高分技能优先加载，低分技能降级。

### 4. 分层技能：从「怎么做」到「为什么这么做」

当前 Skill 主要是「流程文档」——步骤 1 做什么，步骤 2 做什么。但高级用户需要的是「原理文档」——为什么这么做，trade-off 是什么，什么情况下不适用。

后续可以让 Skill 支持分层结构：
- **Execution 层**（给 Agent）：精确步骤
- **Rationale 层**（给用户）：设计原理
- **Context 层**（给模型）：适配判断条件

这恰好契合你在 Triton 学习中偏好的「理论文档 + 测试框架」模式——现有 Skill 格式已经是这么做的，但可以更系统化。

## 为什么这件事很重要

回到那篇刷屏文章。它之所以火，不是因为「微软发了论文」——微软天天发论文。而是因为**行业共识正在形成**：

> AI Agent 的下一个瓶颈不是模型能力，而是经验积累。

现在的 Agent 像是一个每次醒来都失忆的天才。它能解决复杂问题，但不记得自己昨天解决过。每次都要从头推理，每次都要重新踩坑。

自演进 Skill 要解决的问题就是：**让 Agent 拥有「工作经验」**。

Hermes 的 Skill + Memory + Curator 三位一体，是目前开源社区中最接近这个愿景的工程实现。而微软的论文加入战场，说明大厂也认可了这个方向。

未来 6-12 个月，我预测我们会看到：
- 更多关于「技能表示格式」的标准化尝试
- Agent-to-Agent 的技能交换协议
- 基于强化学习的自动技能优化
- 「招聘 Agent」时看的不再是 prompt 模板，而是它的 Skill Library

## 写在最后

如果你在用 Hermes，建议现在就开始养成「保存技能」的习惯。每次你花超过 5 分钟调试一个问题、发现一个非显而易见的工具行为、或者 Agent 做对了某件复杂的事——告诉它：`save this as a skill`。

这些技能是你跟 Agent 协作的「肌肉记忆」。一个月后回头看，你会发现你的 Agent 已经不是当初那个工具人了。

而如果你还没用 Hermes——`pip install hermes-agent`，然后试试看。它可能是目前最接近「会成长的 Agent」这个愿景的开源项目。

---

*参考：*
- *Hermes Agent Skill 系统文档：https://hermes-agent.nousresearch.com/docs/*
- *Hermes Agent GitHub：https://github.com/NousResearch/hermes-agent*
- *微信原文（需要微信客户端打开）：https://mp.weixin.qq.com/s/3IxI67-xTMTaOJo_fgVVKg*
