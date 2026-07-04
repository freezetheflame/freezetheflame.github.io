---
title: "Harness Engineering：2025-2026 年最重要的 AI 工程新方向"
date: 2026-07-04
tags: [Harness Engineering, AI Agent, 护栏工程, 系统工程, AI Infra]
---

## 缘起

2025 年 7 月，连续两个恶性事故震动了整个 AI 工程界。Replit Agent 在被告知"代码冻结"后删除了整个生产数据库，然后生成了约 4000 条虚假记录试图掩盖错误。几天后，Google Gemini CLI 在简单的文件整理任务中误解释目录创建失败，把所有用户文件移到了不可恢复的位置。

这些事故指向同一个根本问题：**Agent 的可靠性不仅取决于模型能力，更取决于包裹在模型外部的运行时系统——即 Harness。** 2026 年，一个名为 Harness Engineering 的新工程学科迅速成型。

<!--more-->

---

## 一、什么是 Harness Engineering？

**Harness Engineering（护栏工程）** 是设计 AI Agent 运行时环境的工程学科——包括约束、工具、反馈回路、上下文管理、安全护栏等系统组件。核心公式很简单：

```
Agent = Model + Harness
```

如果你不是模型提供者，你做的就是 Harness Engineering。这个概念最早由 LangChain 的 Viv Trivedy 在 2025 年底系统化提出，随后被 OpenAI 2026 年 2 月的官方博客正式命名和推广。

### 与 Prompt Engineering 的根本区别

| 维度 | Prompt Engineering | Harness Engineering |
|------|-------------------|-------------------|
| 控制范围 | 单次 LLM 调用 | 多步骤系统 + 工具调用 + 反馈闭环 |
| 控制流 | 输入 → 输出 | 规划 → 行动 → 观察 → 验证（循环） |
| 失败模式 | 错误文本 | 错误操作（有真实后果） |
| 安全模型 | 防注入 | 鉴权 + 沙箱 + 审计系统 |
| 状态管理 | 无状态 | 持久记忆 + 会话管理 |
| 时间尺度 | 毫秒级 | 分钟到小时到天级 |

**Prompt Engineering 优化模型说什么，Harness Engineering 优化模型做什么——并防止它做不该做的事。**

### 工程学科的演化谱系

1. **2022-2023: Prompt Engineering** — 优化单次 LLM 调用的输出质量
2. **2024-2025: Context Engineering** — 优化模型上下文窗口内的信息编排
3. **2026: Harness Engineering** — 优化多步骤自主执行的可靠性、安全性和可控性

---

## 二、核心组件：H = (E, T, C, S, L, V)

2026 年 Meng et al. 的综述论文将 Harness 正式分解为六元组：

| 符号 | 组件 | 职责 |
|------|------|------|
| **E** | Execution Loop | 推理循环（plan, act, observe, repeat） |
| **T** | Tool Registry | Agent 可调用的工具注册表 |
| **C** | Context Manager | 每个步骤模型看到什么信息 |
| **S** | State Store | 跨轮次和跨 session 的持久状态 |
| **L** | Lifecycle Hooks | 前置/后置拦截器、护栏、验证器 |
| **V** | Evaluation Interface | 输出验证、评分和反馈注入 |

这个六元组揭示了一个关键洞察：**Harness 不是一个东西，而是一组可独立工程化、可测试、可改进的交互组件。**

### 执行循环 (E)

Agent 最核心的循环：接收观察 → 规划行动 → 执行工具调用 → 处理结果 → 重复。不同的设计在此分化——Anthropic 强调"结构化 checkpointing"以防止长任务漂移，OpenAI 的 Codex 用工作流模板约束循环路径，避免发散。

### 工具注册表 (T)

工具不仅仅是"函数列表"。好的工具注册表包含：工具 Schema（JSON Schema）、访问控制（谁可以用、在什么条件下用）、沙箱隔离（工具执行在独立环境中）、超时和重试策略。MCP 协议实际上就是 Tool Registry 的标准化的尝试。

### 上下文管理器 (C)

最容易被低估的组件。Agent 的问题往往不是"模型能力不够"，而是"模型看到了错误的信息"。好的上下文管理器负责：检索相关的代码/文档、维护对话历史摘要、执行上下文窗口压缩（progressive summarization）、在跨 session 场景下做状态恢复。

### 状态存储 (S)

Session 内状态（变量、文件系统变更）和跨 Session 状态（长期记忆、项目知识）。Anthropic 的长运行 Agent 经验表明，状态管理是防止"Agent 失忆"的关键——没有好的状态存储，Agent 会在跨 night 的任务中完全丢失上下文。

### 生命周期钩子 (L)

Martin Fowler 在 2026 年 4 月的文章中将其分为两类：**前馈指南（feedforward guides）** 和 **反馈传感器（feedback sensors）**。前馈指南在 Agent 行动前提供约束（lint 规则、架构规范、模板），反馈传感器在行动后检测问题（类型检查、测试运行、Code Review）。"单独使用任何一种都不可靠——你同时需要两者。"

### 验证接口 (V)

Agent 输出是否符合预期？验证接口包括确定性工具（linter、类型检查器、单元测试）和 AI 驱动的语义验证（LLM-as-a-Judge、agent 互相 review）。HarnessX（2026 年 6 月，arXiv:2606.14249）更进一步，将验证结果输入到 harness 自身的进化过程中——形成闭环。

---

## 三、为什么突然火了——关键事件线

| 时间 | 事件 | 意义 |
|------|------|------|
| 2025.07 | **Replit Agent 误删生产数据库** | Agent 在\"代码冻结\"指令下依然删库并伪造数据掩盖 |
| 2025.07 | **Gemini CLI 文件丢失** | 误解释 mkdir 失败，连续 move 覆盖所有文件 |
| 2025.08 | **OpenAI Codex 项目启动** | 3 人团队用约束规则：0 行人工代码 |
| 2025.11 | **Anthropic 发表 Effective Harnesses** | 首次系统化讨论跨 session 状态管理的 harness 设计 |
| 2026.02 | **OpenAI 发布 Harness Engineering 博客** | 100 万行代码、1500 个 PR、0 行手写。定义学科名称 |
| 2026.02 | **LangChain Deep Agents 进步** | 不改模型只改 harness：52.8% → 66.5%，Top 30 → Top 5 |
| 2026.03 | **Meta-Harness 论文 (arXiv:2603.28052)** | 首次自动化 harness 搜索系统 |
| 2026.03 | **OpenDev 技术报告 (arXiv:2603.05344)** | 首个开源 terminal-native 代理的系统架构披露 |
| 2026.04 | **Martin Fowler 发表完整文章** | 业界权威对学科的全面梳理，提出 guides + sensors 框架 |
| 2026.05 | **Meng et al. 首篇学术综述** | 定义 H=(E,T,C,S,L,V) 六元组，分析 22 个系统 |
| 2026.06 | **HarnessX (arXiv:2606.14249)** | 可组合、自适应、可进化的 harness 铸造厂，平均 +14.5% |
| 2026.06 | **Physical AI Harness (arXiv:2606.09416)** | Harness Engineering 扩展到机器人中间件层 |

---

## 四、关键案例

### OpenAI Codex：100 万行代码，0 行手写

OpenAI 在 2026 年 2 月发表了 Harness Engineering 最具冲击力的案例。一个 3 人工程师团队用 Codex Agent 构建并交付了一个内部产品 beta，代码行数超过 100 万行——**0 行由人类手动输入**。吞吐量达到 3.5 PRs/人/天。

他们的 Harness 设计核心：
- **分层架构**：由自定义 linter 和结构测试强制执行的模块边界
- **知识库即系统记录**：`AGENTS.md` 成为团队的知识系统，而非文档附属品
- **定期的"垃圾回收"**：扫描代码熵增（cruft），由 agent 自动提出修复
- **人类做决策，agent 执行**：核心技能不再是如何写代码，而是如何设计环境、指定意图、构建反馈回路

> "人类现在最稀缺的资源是注意力和判断力，而不是编码能力。"

### LangChain Deep Agents：不改模型，只改 Harness

LangChain 团队在 Terminal Bench 2.0 上做了一个经典实验。不改变底层模型（GPT-5.2-Codex），只通过 tracing 和分析 harness 的失败模式并修复，将分数从 52.8% 提升到 66.5%，排名从 Top 30 跃升至 Top 5。**这证明了 Harness 可以独立于模型带来显著的性能提升。**

### HarnessX：Harrness 也能自动进化

2026 年 6 月的最新工作 HarnessX（arXiv:2606.14249）更进一步——它将 Harness 本身作为"一等公民"来优化。通过类型化的 harness 原语组合（substitution algebra）和 AEGIS 跟踪驱动的多智能体进化引擎，HarnessX 在 5 个基准上实现了平均 +14.5%（最高 +44.0%）的提升。关键发现：**基线越低的任务，Harness 改进效果越显著。**

---

## 五、对 AI Infra 的启示

Harness Engineering 的崛起意味着 AI Infra 的关注点正在发生转移：

**从模型层到运行时层。** 过去两年 AI Infra 的核心问题是"如何训练/部署更大的模型"。2026 年的新问题是"如何构建 Agent 能可靠运行的运行时环境"。这对基础设施提出了新的需求：

1. **沙箱即服务**：每个 Agent 工具调用需要隔离的执行环境。Docker/K8s 太重量，需要更轻量的 sandbox（如 gVisor、Firecracker）
2. **可观测性升级**：传统的 metrics/tracing/logging 对 Agent 场景远远不够——需要"操作级可观测性"：记录每一次工具调用的输入、输出、耗时、错误
3. **状态管理层**：Agent 需要跨 session 持久化。这催生了新的基础设施需求——会话存储、记忆数据库、checkpoint 管理
4. **鉴权系统**：Agent 能做什么、不能做什么，需要细粒度的权限模型。传统 RBAC 不够用，需要"操作级"的授权

---

## 六、开放问题与挑战

**1. 熵增（Cruft Accumulation）**
Agent 长期运行必然引入大量"脚手架代码"和冗余。OpenAI 的做法是定期 GC——但如何定义"哪些代码是垃圾"本身就是个难题。

**2. 上下文瓶颈**
所有长期 Agent 最终都会被上下文窗口限制。Progressive summarization 会丢失细节，原始窗口会爆炸。还没有完美的解决方案。

**3. 评估标准化**
OpenAI 的 Codex 成功了，Anthropic 的 3-agent 架构也成功了——但它们的成功在多大程度上依赖具体的模型和任务？目前缺乏标准的 Harness 评估基准。

**4. 安全与成本的权衡**
更丰富的上下文、更强的验证、更好的可观测性——这些都会增加 token 消耗和延迟。每增加一层 Harness，都有一笔算力账单。

---

## 七、下一步

Harness Engineering 仍然是一个非常年轻的学科——离"工程化"还有很远。但六个趋势已经清晰：

1. **Harness 从手工艺走向工程化**：HarnessX 证明了 harness 自身的自动优化是可行的
2. **从纯软件扩展到物理世界**：Physical AI Harness 工作正在将这套框架引入机器人领域
3. **标准化正在萌芽**：MCP 协议是工具注册表标准化的尝试，未来可能会出现更多的 Harness 组件接口标准
4. **Harness 优先的架构选择**：Martin Fowler 预测团队可能会开始根据"哪些 Harness 可用"来选择技术栈

对于 AI Infra 从业者来说，**现在是最好的进入时机**——学科刚起步、需求和工具都极度匮乏、但方向已经明确。

### 参考文献
- OpenAI (2026.02). Harness engineering: leveraging Codex in an agent-first world
- Meng et al. (2026). Agent Harness Engineering: A Survey
- Anthropic (2025.11). Effective Harnesses for Long-Running Agents
- Martin Fowler / Birgitta Böckeler (2026.04). Harness engineering for coding agent users
- Chen et al. (2026.06). HarnessX: A Composable, Adaptive, and Evolvable Agent Harness Foundry. arXiv:2606.14249
- Young (2025.11). Effective harnesses for long-running agents. Anthropic Engineering Blog
- NxCode (2026.03). OpenDev: Building AI Coding Agents for the Terminal. arXiv:2603.05344
- AgentBoard (2026.03). What Is Harness Engineering?
