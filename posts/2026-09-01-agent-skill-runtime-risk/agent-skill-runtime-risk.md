---
title: "Agent Skill 的运行时动态风险分析"
date: "2026-09-01"
tags: ["agent安全", "llm", "skill", "供应链安全", "安全测试"]
---

## 背景：Skill 成为新的软件供应链对象

2025 年以来，Agent 生态出现了一个明显的趋势：能力不再以单一工具或插件的形式分发，而是打包成 **Skill**——一个面向智能体的可分发"能力包"。Claude Code 的 `SKILL.md`、DeepSeek Harness（dsh）的 "Everything is a plugin"、Hermes Agent 的 skills 目录、以及 `AGENTS.md`/`CLAUDE.md` 这类项目级指令文件，本质都是同一种东西：**自然语言控制面与程序执行面的混合软件制品**。

一个典型 Skill 包含五部分：

$$S = (I, C, T, M, R)$$

- $I$（instructions）：给模型看的指令，决定何时使用、如何规划、遵守什么约束
- $C$（code）：Shell/Python/JS 脚本，执行文件处理、API 调用等
- $T$（tools）：工具名称、参数 schema、用途描述
- $M$（metadata）：来源、版本、依赖、权限声明
- $R$（resources）：模板、配置、示例数据

关键区别在于：**恶意 Skill 不一定需要执行恶意二进制**。它可以通过隐藏指令改变模型的决策过程，让模型主动调用已有工具完成危险操作。这正是传统插件安全模型覆盖不到的地方。

而 Skill 的运行时行为，不是由 Skill 单独决定的：

$$B = f(S, A, U, E, O, \Sigma)$$

其中 $A$ 是 Agent、$U$ 是用户输入、$E$ 是环境状态、$O$ 是工具返回结果、$\Sigma$ 是累积的会话/持久化状态。这个公式是理解"为什么静态扫描不够"的起点。

## 静态 vs 动态：为什么静态检查不够

静态分析能发现一部分问题：`SKILL.md` 里的隐藏指令、`curl | sh`、pickle 反序列化、未固定依赖、读取 `.env` 的代码、发送到未知域名的数据。Invariant Labs 2025 年公开的 **MCP Tool Poisoning** 就是典型例子——工具描述里嵌入模型会遵循的隐藏指令，诱导 Agent 把敏感内容发给攻击者。

但静态检查有五个系统性局限：

1. **行为依赖上下文**：恶意行为可能只在特定关键词、特定工具返回值、特定文件存在、甚至 Agent 完成若干步骤后才触发
2. **多步攻击看不出单文件恶意**：第一步读配置，第二步调测试工具，第三步把输出拼进网络请求——单看每步都无害，组合起来是秘密外传链路
3. **模型是非确定性执行器**：自然语言指令不构成传统控制流，模型可能换工具、改参数、根据返回值重新规划
4. **副作用跨边界**：Skill 本身没有删文件代码，但可以诱导 Agent 调用已有的文件工具；也可以与另一个有网络能力的 Skill 组合成权限拼接
5. **混淆与条件触发**：编码、低频触发器、环境探测，都能绕过人工审查和静态规则

静态与动态的对比：

| 维度 | 静态分析 | 动态/运行时分析 |
|---|---|---|
| 分析对象 | 文件、代码、元数据、工具描述 | 实际调用序列、参数、数据流、环境变化 |
| 擅长发现 | 危险 API、隐藏指令、依赖问题 | 条件触发、交互攻击、秘密外传、组合副作用 |
| 主要漏报 | 混淆、动态加载、模型诱导 | 未覆盖的触发路径 |
| 关键证据 | AST、字符串、依赖图 | 事件日志、系统调用、网络流、污点传播 |
| 适合阶段 | 安装前、发布前、更新前 | 执行中、审批时、执行后 |

可靠体系应该是 **静态筛查 + 动态执行 + 运行时策略 + 事后审计** 的组合，而不是指望一个 scanner 解决全部问题。

## 运行时分析方法

### 沙箱与行为监控

容器（非 root、只读挂载 Skill 代码、网络出口白名单、禁止 Docker socket）是基础层；高风险 Skill 可以上 microVM（Firecracker）加任务级快照。更关键的是用 seccomp/eBPF/auditd 做 **syscall 级观测**：工具调用日志只能记录 Agent"请求了什么"，系统调用日志才能验证"实际做了什么"——两者结合才能发现"声明只读、实际改文件"的偏差。网络监控不要只基于域名（DNS rebinding 可绕过），要记录发送数据是否包含秘密。

### 策略引擎与运行时权限

通用策略模型：

$$allow(agent, tool, args, resource, context) \rightarrow \{allow, deny, ask, allow\_once\}$$

策略不能只查工具名，要查参数语义——"读取文件"和"读取 `.ssh/id_rsa`"不应是同一权限。**Capability-based security** 比粗粒度角色更适合动态组合的 Agent：只读某工作目录、只访问指定 API、不得访问秘密、不得启动子进程，能力可撤销、可过期、与 Skill 版本绑定。审批提示必须展示实际参数和数据影响，而不是只显示"Skill 请求网络权限"。

### 污点追踪

定义源集合（system prompt、API key、`.env`、私密文件）与汇点集合（网络请求、工具参数、命令行、日志），检测路径：

$$secret \rightarrow model\ context \rightarrow tool\ argument \rightarrow network\ request$$

Agent 场景的难点是数据会经过模型重写、摘要、编码、分段输出，字节级污点会失效。需要消息级/token 级污点、对 Base64/JSON 等转换保持标签、把工具调用图与数据流图结合。目标不是禁止所有外发，而是区分"用户明确要求上传的文件"和"Skill 偷偷读 `.env` 后附加到请求"。

### 副作用检测与可回滚

每次执行记录为事件序列 $e_i = (timestamp, actor, action, resource, before, after, evidence)$，重点覆盖文件变更、Git 状态、数据库写、外部 API 写、进程调度、凭证变更。对可回滚资源用文件快照、Git worktree 隔离、数据库事务、任务级 checkpoint。但**回滚撤不回已发出的邮件和已泄露的密钥**——高风险外部副作用必须在执行前审批。事件重放可用于复现"某个 Skill 在何种上下文下作恶"。

### 行为基线

为 Skill 建立正常轨迹模型（工具序列、文件路径类别、网络目的地、进程树），偏离即告警。注意异常 ≠ 恶意，更适合作为风险排序和人工审批触发器，而不是自动拒绝。

### Mutation testing 与故障注入（与 agent-testing 的衔接点）

对 Skill 生成系统化变异体：SKILL.md 插入隐藏外传指令、工具描述换成带注入的版本、安全域名换成相似域名、只读变异为写、插入延迟触发条件、编码敏感路径。然后测安全系统能否发现：

$$Security\ Mutation\ Score = \frac{detected}{total}$$

其中 *detected* 是被检测或阻断的恶意变异体数，*total* 是恶意变异体总数。

故障注入则测试异常条件：工具返回恶意指令、伪造成功结果、网络重定向、凭证过期、MCP Server 返回异常内容——观察 Skill 是否在异常恢复路径上越权。

### 运行时验证

把安全要求写成时序性质，用监控器在线检查。例如"读取秘密后，除非用户批准，否则不能调用外部网络工具"可写成：

$$G(read(secret) \rightarrow G(\neg network\_send(secret)))$$

难点是 Agent 的自然语言计划与真实系统副作用之间存在抽象鸿沟，需要可执行的工具规范和资源模型。

## 现有工作与工具

**学术基础**（2024 前）：ReAct（arXiv:2210.03629）奠定了轨迹分析对象；ToolEmu（arXiv:2309.15817）用模拟工具评估风险；Indirect Prompt Injection（arXiv:2302.12173）证明指令可来自外部数据；AgentDojo（arXiv:2406.13352）提供了动态环境基准。

**2025-2026 趋势**：专门以"Agent Skill 运行时风险分析"为题的成熟论文仍然很少。值得关注的是 MCP Tool Poisoning（Invariant Labs，`mcp-scan`）、CaMeL（arXiv:2503.18813，架构级防注入）、以及 Claude Code/Codex/Cursor 把安全边界从"模型输入"扩展到"仓库中影响模型的配置文件"的实践。**不能把产品安全文档误称为经过同行评审的 Skill 安全理论——当前真正的空白恰恰是把这些产品现象抽象成可复现的运行时安全模型。**

**基础设施工具**：gVisor、Firecracker、bubblewrap（隔离）、OPA、AWS Cedar（策略引擎）、Protect AI `modelscan`（模型文件扫描）、Invariant Labs `mcp-scan`。这些可以拼接出 Skill 运行时防护原型，但缺少统一的 Agent Skill 事件模型、权限 schema、基准数据集和评测指标。

## 研究空白与选题

六个明显缺口：

1. **缺 Skill 专用威胁模型**：现有工作把风险归类为 prompt injection 或 tool misuse，不区分指令自身、依赖脚本、工具描述、Skill 间组合、安装更新链路
2. **缺统一运行时事件格式**：不同 Agent 对"调用工具""执行命令"的日志定义不同，研究无法比较——需要类似 OpenTelemetry 的 Agent 安全事件标准
3. **污点追踪未解决模型语义变换**：秘密被摘要、翻译、编码后，字符串匹配失效
4. **组合攻击研究不足**：两个无害 Skill 拼成完整攻击链，多数扫描器按单个 Skill 分析
5. **缺可逆性和损害量化**："调用了危险工具" ≠ 高风险，需要副作用分类、恢复成本指标
6. **缺 SkillBench**：AgentDojo 主要测任务和注入，需要覆盖恶意 Skill、变异体、依赖投毒、多 Skill 组合的标准基准

有发表潜力的选题（适合 ICST/ISSTA/ASE/CCS）：

- **SkillMutator**：面向 Agent Skill 的变异测试框架，定义 Security Mutation Score，横向比较各 Harness 的运行时防御能力
- **SkillFlow**：跨上下文/模型/工具/网络的动态污点追踪，解决语义变换下的秘密外传检测
- **SkillScope**：基于权限图的多 Skill 组合风险分析，检测组件安全但组合越权的路径
- **Rollback-Aware Agent Testing**：把副作用可逆性纳入安全评测，衡量实际损害而非"是否调用危险工具"
- **Runtime Contracts for Agent Skills**：声明式运行时契约 + 在线监控 + 故障注入评估完备性

## 总结

1. **Agent Skill 是新的软件供应链对象**：自然语言指令 + 工具描述 + 脚本 + 依赖 + 元数据混合体，不能简单当提示词或插件对待
2. **静态扫描必要但不充分**：危险行为依赖上下文、模型决策和多 Skill 交互，必须运行时分析
3. **运行时安全的核心是权限、数据流、副作用三者联动**：沙箱解决执行边界，策略引擎解决授权，污点追踪解决秘密流向，快照审计解决损害控制
4. **专门面向 Skill 的系统性研究明显不足**：dsh、Claude Code、Hermes、Codex 生态提供了大量新问题，缺统一事件格式、威胁模型和公开基准
5. **Agent testing 方法可直接迁移**：mutation testing、fault injection、runtime verification 能把 Skill 安全从"安全建议"推进为可测量的工程与研究问题

**参考**：ReAct (arXiv:2210.03629)、ToolEmu (arXiv:2309.15817)、Indirect Prompt Injection (arXiv:2302.12173)、InjecAgent (arXiv:2403.02691)、AgentDojo (arXiv:2406.13352)、CaMeL (arXiv:2503.18813)；Anthropic Claude Code Skills、OpenAI Codex、Invariant Labs mcp-scan、Protect AI modelscan、gVisor/Firecracker/bubblewrap、OPA/Cedar。
