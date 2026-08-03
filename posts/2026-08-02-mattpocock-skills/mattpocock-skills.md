---
title: "mattpocock/skills：20 万星的 Agent 技能仓库到底做了什么"
date: "2026-08-02"
tags: ["agent", "ai-coding", "claude-code", "skills", "最佳实践"]
---

## 一句话总结

Matt Pocock（Total TypeScript 作者）把自己的 `.agents` 目录开源成了 [mattpocock/skills](https://github.com/mattpocock/skills)，目前近 20 万 star。它是一套"小而可组合、可随意修改"的 Agent 技能集合，覆盖从代码实现、代码评审、调试、领域建模到"被 AI 拷问"的完整研发工作流。核心理念是：**不拥有你的流程，只给你可拼接的积木**。

## 它为什么这么火

仓库 README 里有一段话点明了立场：

> 开发真实应用很难。GSD、BMAD、Spec-Kit 这类方案试图通过"接管整个流程"来帮你，但代价是夺走你的控制权，而且流程里的 bug 极难排查。
> 这些 skills 刻意做得小、易改造、可组合。它们和任何模型都能配合。基于几十年的工程经验。随便 hack，改造成你自己的。

这是当前 Agent 工程领域两条路线的典型分野：

| 路线 | 代表 | 哲学 | 弱点 |
|---|---|---|---|
| 流程框架 | GSD、BMAD、Spec-Kit | 拥有流程，agent 按既定流程走 | 流程 bug 难排查，失去控制权 |
| 技能积木 | mattpocock/skills | 小而可组合，随时修改 | 需要自己组装、理解 |

**"Skills For Real Engineers - not vibe coding"** 是它的定位宣言：不是给演示项目用的，是给真实工程用的。

## 仓库结构

```
skills/
├── engineering/    # 每日代码工作流（17 个，主力）
├── productivity/   # 通用工作流，与代码无关（5 个）
├── misc/           # 少用但有用的工具（4 个）
├── personal/       # Matt 个人 setup，不在插件里推广（2 个）
├── deprecated/     # 废弃
└── in-progress/    # 开发中
```

外加 `CONTEXT.md`（统一领域词汇表）、`AGENTS.md`、`.agents/adr/`（架构决策记录）。

## 核心设计：user-invoked vs model-invoked

这是整套体系最精妙的设计之一。每个 skill 明确标注调用方式：

- **User-invoked**：只有你主动输入命令才触发（Claude Code 用 `disable-model-invocation: true`，Codex 用 `policy.allow_implicit_invocation: false`）。比如 `/triage`、`/to-spec`、`/grill-me`。
- **Model-invoked**：模型可以根据场景自行调用，但 description 里写了丰富的触发措辞，防止误触发。

**为什么这么分？** 流程控制权在人手里。像"把对话变成 spec 发到 issue tracker"这种动作，绝不能让模型自己悄悄干。这跟"技能是积木不是框架"的理念一脉相承——**人决定何时用哪块积木**。

## 重点技能解析

### 🧱 tdd —— 最值得读的一个

不是简单喊"red-green-refactor"口号，而是把 TDD 变成有纪律的工程实践，最亮的概念是 **Seam（接缝）**：

> **Seam** 是你测试所在的公共边界：观察行为而不用伸进内部的接口。测试只写在预先约定好的 seams 上——写任何测试之前，先把要测的 seams 写下来和用户确认。没确认的 seam 不写测试。

一句话点破 TDD 实践中的最大误区：**测试写在哪比测试怎么写更重要**。它还包含 tests.md、mocking.md 两个参考文件，规范了"什么算好测试"（测公共接口行为，不测实现细节）。

### 🔍 code-review —— 双轴并行子代理评审

把 diff 评审拆成两条正交的轴，用**并行子代理**分别执行（互不污染上下文），再汇总：

- **Standards 轴**：代码是否符合仓库文档化的编码规范 + Fowler 坏味道基线
- **Spec 轴**：代码是否忠实实现了源头 issue/PRD

这个设计跟 Hermes 的 `subagent-driven-development` 技能的"spec compliance review + code quality review 两阶段评审"异曲同工，但它是并行的，且固定在 diff 上。

### 🗣️ grilling / grill-me —— 被 AI 穷追不舍地拷问

一句话描述就很有冲击力：

> 关于你的计划、决策或想法，无情地拷问你，直到决策树的每个分支都被解决。

规则也写得很细：**一次只问一个问题**（"一次问多个问题让人困惑"）、每个问题给出推荐答案、能查环境的事实不问用户、只问决策（决策权在用户）、未达成共识前不行动。

这是把"AI 追问式设计评审"变成可复用 skill 的范本。配合 `wayfinder`（大块工作的决策票地图）和 `grill-with-docs`（拷问的同时构建领域模型），覆盖了从模糊想法到可执行计划的全过程。

### 🎯 to-tickets / to-spec —— 计划到工单的流水线

- `to-spec`：把当前对话变成 spec，发布到 issue tracker
- `to-tickets`：把计划/spec/对话拆成 **tracer-bullet（曳光弹）工单**，每个工单声明自己的阻塞边（blocking edges）——本地文本文件或真实 tracker 的原生阻塞链接

"曳光弹"这个词很妙：不追求一次性完美的分解，而是先打出一批能照亮路径的工单，让依赖关系显式化。

### 📚 其他值得一提的

- `setup-matt-pocock-skills`：每个仓库跑一次，配置 issue tracker、triage 标签、文档存放位置——**skills 的引导安装器本身也是 skill**
- `diagnosing-bugs`：有纪律的调试循环 reproduce → minimise → hypothesise → instrument → fix → regression-test
- `research`：以高信任度一手资料调研问题，结果写成带引用的 Markdown 存进仓库，**作为后台 agent 运行**
- `handoff`：把当前对话压缩成交接文档，让另一个 agent 继续
- `writing-great-skills`：教你怎么写好 skill 的参考——元技能

## CONTEXT.md：领域词汇表是工程的隐性成本

仓库里的 `CONTEXT.md` 值得单独讲。它是一份**统一术语表**，例如：

- **Issue tracker**：托管 repo issue 的工具（GitHub Issues / Linear / 本地 markdown 约定）——"backlog" 曾同时指工具和存量工作，已解决，不再作为领域术语
- **Decision ticket**：wayfinder 的单元，承载"一个决策"而非"一段实现"

**为什么重要？** 多 skill 协作时，术语不一致会导致 agent 之间鸡同鸭讲。用一份 CONTEXT.md 锁定词汇，是所有 skill 共享的语义地基。这也是为什么 `domain-modeling`、`grill-with-docs` 都在"内联更新 CONTEXT.md 和 ADR"——**领域模型是活的，要随项目演进**。

## 安装方式（30 秒）

两种哲学二选一，别都装（会重复）：

```bash
# 1. Claude Code 插件：托管、只读、自动更新（订阅而非 fork）
claude plugins install mattpocock-skills

# 2. skills.sh：把技能文件复制进你的仓库，随意修改（tinkerer 路线）
npx skills@latest add mattpocock/skills
```

装完跑一次 `/setup-matt-pocock-skills` 完成仓库级配置。注意：**任何模型都能配合**——它不绑定 Claude Code，Codex 等 agent 用 `npx skills` 安装即可。

## 对 Hermes 技能体系的启发

对照 Hermes 的 skills（`~/.hermes/skills/`），有几个点很值得吸收：

1. **调用权限分级**：Hermes 技能目前是"相关就加载"，可以借鉴 user-invoked / model-invoked 的分级，把破坏性流程（如推送、重构、发工单）设为仅用户触发。
2. **共享术语表**：`CONTEXT.md` 模式可以直接移植——给项目的 agent 工作流建一份术语/决策记录文档，让多个 skill 共享同一套语义。
3. **skill 的 skill**：`writing-great-skills`、`setup-matt-pocock-skills` 这类"元技能"让技能体系自举，值得推广。
4. **grilling 的提问纪律**："一次一个问题 + 给推荐答案 + 决策归用户"是极好的需求澄清范式，可以直接改进日常交互。

## 总结

mattpocock/skills 的走红不是偶然：它回答了 Agent 工程里一个根本问题——**流程控制权该归谁**。框架派说"归框架"，它说"归你，我只是积木"。20 万 star 证明了这个答案有广泛共鸣。对于想自己搭 Agent 工作流的人，它既是现成的工具箱，更是一份极好的"如何设计技能"的教材——尤其值得读 `tdd`（seam 概念）、`code-review`（双轴并行）、`grilling`（提问纪律）和 `CONTEXT.md`（术语管理）。
