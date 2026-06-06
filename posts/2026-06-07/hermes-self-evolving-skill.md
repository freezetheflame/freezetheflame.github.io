---
title: "自演进 Skill：当 AI Agent 学会「积累经验」—— 从微软两篇新论文看 Hermes 的实践"
date: 2026-06-07
tags: [AI Agent, 自演进, Skill, Hermes, 微软, LLM, SkillOpt]
---

不改一行模型代码、不微调任何权重。只是把系统提示换成一张训练出来的 Skill 文档，Agent 的表现就从 41.8 飙到 80.7。

这不是思想实验。这是微软刚刚发表的两篇论文的真实结果。

如果你用过 Hermes Agent，你会觉得这个故事有点耳熟。

## 两篇论文讲了什么

微软一口气发了两篇：

- **SkillOpt**（[arXiv: 2605.23904](https://arxiv.org/abs/2605.23904)）：把 Agent Skill 当成模型一样训练——引入学习率控制、验证门、拒绝缓冲区、epoch 级慢更新。52 个测试场景全胜，平均提升 23.5 分。
- **Skill 生命周期研究**（[arXiv: 2605.23899](https://arxiv.org/abs/2605.23899)）：5 个领域 × 6 个模型，系统性地回答了一个更根本的问题——模型自动生成的 Skill，到底什么时候有用，什么时候反而帮倒忙？答案是：75% 有帮助，25% 会反噬。

下面我们仔细拆解这两篇论文，然后讨论一个关键问题：**Hermes Agent 的 Skill 系统跟论文比起来，处于什么位置？能不能把论文的思路做成插件？**

## SkillOpt：把深度学习的方法论搬到了 Skill 优化上

SkillOpt 的核心思路是：把 Skill 文档当成"外部可训练状态"，用一个更强的模型（优化器）来编辑这个文档。整个过程像极了深度学习的训练循环：

| 组件 | 对应训练概念 | 作用 |
|---|---|---|
| Rollout batch | 训练数据 | 目标模型用当前 Skill 跑一批任务，产出成功 + 失败的轨迹 |
| 小批量反思 | 反向传播 | 优化器把轨迹分成成功组和失败组，分别提炼"什么该保留""什么要修正" |
| 文本学习率 | 步长控制 | 每次最多改 L 条规则，防止一次改太多把有用的东西改没了 |
| 验证门 | Early Stopping | 改完的 Skill 必须在验证集上严格提升才被接受，否则拒绝 |
| 拒绝缓冲区 | 负样本记忆 | 被拒绝的编辑不会丢掉，作为"什么不能改"的负反馈留给后续步骤 |
| Epoch 级慢更新 | 动量 | 每个 epoch 结束后比较前后两版 Skill，把长期有效的经验写进受保护区域 |

这个设计的关键不是某个单独组件，而是它们的组合：
- 没有学习率控制 → 优化器会一次重写太多内容
- 没有验证门 → 看似合理的修改可能悄悄拉低表现
- 没有拒绝缓冲区 → 优化器会反复犯同样的错误

### 数字说话：52 场景全胜，平均 +23.5 分

SkillOpt 在全部 52 个（模型 × 基准 × 执行模式）测试场景中，击败了人类手写 Skill、一次性 LLM 生成、Trace2Skill、TextGrad、GEPA、EvoSkill 六种基线。

GPT-5.5 直接聊天模式下的表现（节选）：

| 基准 | 无 Skill | SkillOpt | 提升 |
|---|---|---|---|
| SpreadsheetBench | 41.8 | 80.7 | +38.9 |
| OfficeQA | 33.1 | 72.1 | +39.0 |
| LiveMath | 37.6 | 66.9 | +29.3 |
| ALFWorld | 83.6 | 95.5 | +11.9 |
| SearchQA | 77.7 | 87.3 | +9.6 |
| DocVQA | 78.8 | 91.2 | +12.4 |

六项平均 +23.5 分。在 Codex 执行模式下平均 +24.8 分，在 Claude Code 模式下平均 +19.1 分。

更值得注意的是：**越弱的模型受益越大**。GPT-5.4-nano 在 ALFWorld 上从 34.3 翻到 69.4（×2.0），在 DocVQA 上从 30.8 到 80.2（+49.4 分）。这意味着训练好的 Skill 可以给小模型补上它们权重里没有的程序性知识。

## 但 Skill 不是万能的——25% 会反噬

第二篇论文更值得警惕。研究团队在 5 个领域上，用 6 个目标模型和 5 个提取器，系统性地测了 Skill 生命周期的三个阶段：**经验生成 → Skill 提取 → Skill 消费**。

核心发现：模型生成的 Skill 在 75% 的情况下有帮助，但有 **25% 会造成负迁移**——用了 Skill 反而变差。而且负迁移风险因领域而异：
- 表格操作和软件工程最低（仅 13%）
- 机器人规划（ALFWorld）高达 **47%**

### 三个反直觉的发现

**发现一：更强的模型不一定是更好的 Skill 提取器。**

在 SpreadsheetBench 上，轻量级 Gemini-3.1-Flash-Lite 的提取效能最高，而 GPT-5.4 尽管任务执行能力最强，提取效能反而排在最后。提取 Skill 和执行任务是两种不同的能力。

**发现二：看起来写得好的 Skill 反而效果最差。**

研究者让 GPT-5.4 当评委，只看 Skill 文本判断哪个更好。结果准确率 **46.4%**——跟抛硬币没区别。而且差距越大的 Skill 对（一个明显好一个明显差），评委判断准确率反而越低——差距 ≥5 分的极端情况下，准确率只有 **15.8%**。

也就是说，读起来更流畅的 Skill，往往在实际使用中表现更差。

**发现三：什么才是好 Skill？不是文笔，是故障机制。**

通过自动化对比分析，研究者发现了 3 个真正能预测 Skill 效用的维度：

1. **故障机制编码**——有没有识别出领域特定的失败模式
2. **可执行特异性**——有没有给出具体的、可操作的补救措施，而不是泛泛的建议
3. **高风险操作黑名单**——有没有明确标注哪些操作绝对不能做

举例说明。SpreadsheetBench 上，高效果 Skill 写的是：

> "公式注入谬误——在无头执行环境中，公式字符串不会触发计算引擎，所以必须在 Python 中预计算静态值再写入。"

低效果 Skill 写的是：

> "编辑前先检查，编辑时保持最小改动。"

前者是具体的故障机制 + 可执行方案，后者是正确的废话。

把这三个维度作为"Meta-Skill"插入提取器的系统提示后，所有 9 个测试场景都改善了（平均 +1.55 分），SpreadsheetBench 最大提升达到 +3.7 分。而用 LLM 直觉列出的"合理性评分标准"（清晰性、完整性、简洁性等 7 个维度），反而让平均性能下降了 0.59 分。

## Hermes 的 Skill 系统跟论文比，处于什么位置？

回到用户的问题：能不能把这两篇论文的思路做成 Hermes 插件？

答案是：**SkillOpt 的"训练循环"确实是一个高级功能，Hermes 目前没有。但 Skill 的基础设施——保存、加载、生命周期管理——Hermes 已经完整实现了。**

| 能力 | 论文提出 | Hermes 现状 |
|---|---|---|
| 技能保存 | Skill 提取器 | `skill_manage(action='create')` ✅ |
| 技能加载 | 上下文注入 | 自动注入系统提示 ✅ |
| 生命周期管理 | 经验生成 → 提取 → 消费 | Curator（stale → archive） ✅ |
| 使用统计 | 效果追踪 | `.usage.json` ✅ |
| 质量把关 | Meta-Skill 三维度 | ❌ 缺失 |
| **迭代优化** | **SkillOpt 训练循环** | ❌ 缺失（核心差异） |
| 跨平台共享 | ? | Skills Hub + GitHub tap ✅ |

**真正的差距在"训练循环"**。Hermes 的 Skill 目前是"一次性生成 + 手动修补"模式——Agent 完成一个任务后保存经验，下次手动 patch 修正。SkillOpt 做的事是让这个过程自动化：跑一批任务 → 对比成功/失败 → 自动编辑 Skill → 验证 → 拒绝坏编辑 → epoch 迭代。

换句话说，Hermes 有"肌肉"，但没有"健身教练"。

## 论文对 Hermes Skill 系统的三个启示

### 启示一：Curator 需要加一个"质量打分器"

目前 Curator 只追踪 `use_count` 和 `patch_count`，不追踪**技能加载后任务成功率是否提升**。论文的 25% 负迁移率告诉我们：不能假设存下来的 Skill 一定有用。

Hermes 可以做的事情：
- 追踪"加载 Skill A 后，同类任务的首次成功率是否高于不加载的情况"
- 对高损技能自动降级（移到候选区而不是直接加载）
- 用论文的三维度（故障机制、可执行特异性、高风险黑名单）作为生成 Skill 时的内置质量模板

### 启示二：Skills 格式天然契合"故障机制编码"

回头看你自己的 Hermes 技能库——比如 Triton kernel development 这个 Skill：

```
## Pitfalls
- `tl.math.tanh` doesn't exist in Triton 3.6, hand-write it
- `tl.dot` requires same dtype for both operands
- TF32 can introduce ~2% error, use tf32=False for precision
- Always warmup 10x before benchmarking
```

这恰好就是论文说的"故障机制编码 + 可执行特异性"。不是"注意精度问题"这种正确的废话，而是"TF32 会带来 ~2% 误差，使用 tf32=False 可避免"。Hermes 的 Skill 格式（尤其是 Pitfalls 段）天然适合记录故障机制——只要 Agent 养成这个习惯。

### 启示三：手写 Skill 和训练 Skill 可以共存

SkillOpt 的结论不是说"永远不要手写 Skill"。而是说：**对于高频、重复、有明确成败标准的任务，训练出来的 Skill 远优于手写**。

这对 Hermes 用户的实操意义：
- **高频任务**（每天做几十次的操作）→ 值得跑 SkillOpt 风格的自动优化
- **低频探索型任务**（偶尔为之的新领域）→ 手写 Skill 足够
- **有明确验证手段的任务**（自动化测试能跑）→ 可以上训练循环
- **用户交互型任务**（需要审美的、主观判断的）→ 手写更好

## 一个可能的实现路径：把 SkillOpt 装进 Hermes

如果你真的想把论文的思路做成 Hermes 的插件/功能，架构可能是这样的：

```
                        ┌─────────────────────┐
                        │   SkillOpt Runner    │
                        │  (cron job or /cmd)  │
                        └──────────┬──────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          ▼                        ▼                        ▼
   ┌──────────────┐       ┌──────────────┐       ┌──────────────┐
   │ Rollout Batch │       │   Optimizer  │       │  Validator   │
   │ (跑N个任务)    │ ────► │ (对比成败轨迹) │ ────► │ (验证门)      │
   └──────────────┘       └──────────────┘       └──────────────┘
                                   │                        │
                                   ▼                        ▼
                          ┌──────────────┐       ┌──────────────┐
                          │ Patch Skill  │       │  Accept or   │
                          │ (文本学习率)   │       │  Reject +    │
                          └──────────────┘       │  Buffer      │
                                                 └──────────────┘
```

具体到 Hermes 的技术栈：
1. **Rollout Batch** → `delegate_task` 并行跑多个子 Agent，用同一 Skill，不同任务实例
2. **Optimizer** → 一个更强的模型（比如 Claude Opus / GPT-5.5）分析轨迹，生成 Skill patch
3. **Validator** → 在验证集上跑同样的任务，对比成功率
4. **Rejection Buffer** → Hermes Memory 存"哪些编辑被拒绝过，为什么"
5. **Epoch Loop** → `cronjob` 定期触发，每次迭代后的 Skill 通过 `skill_manage(action='patch')` 更新

这是完全可以工程化的，而且每个组件在 Hermes 里都有现成工具。不算"从零开发"，更像是"组装现有积木"。

## 最后：为什么这件事值得关心

论文里有一个数字我反复看了好几遍：

> 不改一行模型代码、不微调任何权重。只是把 Skill 换成训练出来的版本，得分从 41.8 到 80.7。

这意味着一件事：**Skill 文档可能是 LLM 时代性价比最高的"模型适配"手段**。不需要 GPU 集群、不需要标注数据、不需要重新部署。一个 300-2000 token 的 Markdown 文件，就能给小模型补上它权重里缺失的程序性知识。

而 Hermes，恰好是目前开源生态里把 Skill 当一等公民来设计的少数框架之一。当微软在发论文论证"Skill 应该像模型一样被训练"时，Hermes 用户已经在用 Curator 管理上百个技能的演进。

接下来的 6-12 个月，这场对话还会继续。而当"Skill 训练"从论文走进工程实践时，Hermes 的基础设施已经是现成的了。

---

*参考：*
- *SkillOpt: Executive Strategy for Self-Evolving Agent Skills — [arXiv: 2605.23904](https://arxiv.org/abs/2605.23904)*
- *From Raw Experience to Skill Consumption: A Systematic Study of Model-Generated Agent Skills — [arXiv: 2605.23899](https://arxiv.org/abs/2605.23899)*
- *Hermes Agent Skill 系统文档：https://hermes-agent.nousresearch.com/docs/*
- *Hermes Agent GitHub：https://github.com/NousResearch/hermes-agent*
- *微信原文：https://mp.weixin.qq.com/s/3IxI67-xTMTaOJo_fgVVKg*
