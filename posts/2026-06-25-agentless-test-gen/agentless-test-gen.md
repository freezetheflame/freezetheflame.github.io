---
title: "LLM 自动化测试用例生成：Agentless 思路的背景调研"
date: 2026-06-25
tags: [测试生成, Agentless, LLM, 软件工程, 研究综述]
---

## 缘起

我在思考一个问题：现在有很多用 LLM Agent 自动生成测试用例的研究，但大部分都是在调优 Agent 策略来提升质量。能不能反过来——用 **Agentless（固定流程）** 的思路，通过定义清晰的测试生成流水线，既保证效果、又避免 Agent 过度调用工具的 Token 成本？

带着这个想法做了一轮背景调研，以下是核心发现。

<!--more-->

## 一、当前的方法格局

LLM 测试生成领域在过去两年经历了爆炸式增长。按技术路线可以分成这几类：

### 1. 纯 LLM 提示（Zero-shot / Few-shot）

早期工作，直接将被测函数丢给 LLM 让它生成测试。

**ChatTester**（Yuan et al., arXiv 2023）最早系统评估了 ChatGPT 的单元测试生成能力。发现生成的测试可读性不错，但 50%+ 存在编译或执行错误。他们提出了迭代精化策略——让 LLM 自我修复——把可编译测试量提升了 34.3%。

### 2. 生成-验证-修复循环

**ChatUniTest**（Chen et al., FSE 2024 Demo）用自适应焦点上下文机制筛选有用上下文，配合生成-验证-修复的流水线。本质上是固定流程。

**TestPilot**（Schäfer et al., TSE 2024, Microsoft Research）针对 JS/TS API 函数生成单元测试，中位语句覆盖率 70.2%。核心是把函数签名、实现、文档中的使用示例拼成 prompt，测试失败后用错误信息再提示 LLM 修复。**这其实是一个典型的 Agentless 风格方案**——没有工具调用，没有 Agent 决策。

### 3. SBST + LLM 混合

**CodaMOSA**（Lemieux et al., ICSE 2023, Microsoft Research）在经典的 SBST 工具 Pynguin 覆盖率停滞时，调 Codex 生成示例测试注入搜索空间。SBST 主导，LLM 辅助跳出局部最优。

**TELPA**（Yang et al., TOSEM 2025, 天津大学）针对「难覆盖分支」，通过程序分析提取对象构造信息和分支依赖，引导 LLM 生成能覆盖复杂分支的测试。分支覆盖率比 Pynguin 高 31%、比 CodaMOSA 高 22%。**这是一个典型的固定流程 + 程序分析方案。**

### 4. 程序分析 / 覆盖率引导

**ASTER**（Pan et al., ICSE-SEIP 2025, IBM Research）通过静态分析提取方法签名、调用层级和依赖，构建 prompt 引导 LLM 生成测试，再做后处理修复编译错误。支持 Java 和 Python，覆盖率比 EvoSuite 高 26.4%。**关键：这是一个固定流程方案，不是 Agent。** 另外发现 GPT-4 不是最优的——Granite-34B、甚至 Llama3-8B 在测试生成上也很有竞争力。

**CoverUp**（Altmayer Pizzorno & Berger, FSE 2025, UMass Amherst）将覆盖率分析、代码上下文和错误反馈组合进 prompt，迭代引导 LLM 生成测试。中位 line+branch 覆盖率 80%（CodaMOSA 47%）。**迭代式固定流程，无 Agent 自主探索。**

**HITS**（ASE 2024）把复杂方法切成切片（slice），逐个切片引导 LLM 生成测试。

### 5. 变异测试引导

**MuTAP**（Dakhel et al., arXiv 2023）用存活的变异体增强 prompt，引导生成能检测更多缺陷的测试。

**Meta ACH**（Harman et al., FSE 2025）针对隐私合规生成变异体，再让 LLM 生成能「杀死」这些变异体的测试。在 Messenger 和 WhatsApp 中，工程师接受了 73% 的生成测试。

### 6. Agent 自主探索

**SWE-agent**（Yang et al., NeurIPS 2024, Princeton）首个把 Agent 框架系统化引入软件工程任务的工作。Agent 可以在仓库中自主执行命令、编辑文件、运行测试。

**CodiumAI / Qodo**（2022-2024, 商业）IDE 插件形式，分析 AST 识别分支和边界条件，用 LLM 生成测试。

### 7. SWE-bench 生态

**SWE-Dev**（Wang et al., ACL 2025 Findings, THU）构建了可扩展的测试生成流水线，从 38,000 个 issue 中过滤出 2,000 个可执行测试用例用于训练 SWE Agent。**固定流程方案。**

**Agentless** 中的 reproduction tests（Xia et al., FSE 2025）在 patch 生成阶段生成能复现 bug 的测试用例用于验证。**这是 Agentless 思路在测试生成上最直接的应用，但目标是服务 bug fix，不是独立的测试生成方法论。**

## 二、反直觉的发现

做完整轮调研，最大的发现是：

> **目前没有以「Agentless 测试生成」为独立命题的论文。**

但更反直觉的是：**当前主流的 LLM 测试生成方法，80% 以上实际上就是 Agentless 的**——只是没人用这个标签来标识自己。

| 分类 | 代表工作 | 是否 Agentless |
|------|---------|---------------|
| 纯提示 | ChatTester, TestPilot | ✅ 固定流程 |
| 生成-验证-修复 | ChatUniTest | ✅ 固定流程 |
| SBST+LLM 混合 | CodaMOSA, TELPA, CoverUp | ✅ 固定流程 |
| 静态分析引导 | ASTER | ✅ 固定流程 |
| 变异引导 | MuTAP, Meta ACH | ✅ 固定流程 |
| Agent 自主探索 | SWE-agent, OpenHands | ❌ Agent |
| 商业工具 | CodiumAI/Qodo | 混合 |

这些「事实上 Agentless」的工作共享几个特征：

1. **没有让 LLM 自主选择工具或决定下一步动作**
2. **流程是预定好的**（preprocess → generate → validate → repair → augment）
3. **LLM 仅用作生成引擎，而非决策者**

## 三、为什么这是个有趣的研究方向？

### Agent 的已知痛点

Token 成本高——Agent 需要维护完整交互历史，上下文快速膨胀。Agent 方法的路径不确定性（LLM 推理 + 工具调用路径双重随机性）导致结果不可复现。此外，测试生成中的幻觉问题严重——50%+ 的 LLM 生成测试存在编译/执行错误。

### 为什么 Agentless 在测试生成上可能天然合适？

**1. 测试生成是「结构明确」的任务**

不同于 bug fix 需要探索定位，测试生成的目标函数是确定的。所需信息（源码、依赖）通过静态分析可以一次性获取，不需要 Agent 自主探索。

**2. CoverUp 和 ASTER 已经证明**

覆盖率引导的迭代固定流程已经能做到 80% 的中位覆盖率——不输任何 Agent 方案。

**3. 成本差距巨大**

Agentless 在 bug fix 上每 issue 只要 $0.70（用 GPT-4），Agent 方案要高出几倍甚至几十倍。在测试生成上这个差距只会更大，因为测试生成不需要漫长的 bug 定位过程。

**4. 可复现性和 CI/CD 集成**

固定流程天然适合流水线化、可审计、可复现——这些对于回归测试来说至关重要。

## 四、研究空白

具体来说，有五个明确的空白点：

| # | 空白 | 机会 |
|---|------|------|
| 1 | 没有 Agentless 测试生成的方法论定义 | 提出系统化的固定流程框架，每个阶段有明确输入/输出 |
| 2 | 没有 Agentless vs Agent 在测试生成上的对比实验 | 设计实验比较覆盖率、成本、可复现性、开发者接受度 |
| 3 | Agentless 的 reproduction tests 未扩展为独立测试生成方法论 | 扩展成能独立生成回归测试套件的框架 |
| 4 | 程序分析 + Agentless 的结合不充分 | ASTER 和 TELPA 的做法可以整合进统一框架 |
| 5 | 低成本企业级方案缺失 | $0.70/issue 级别的方案如果能做到，就是杀手锏 |

## 五、论文清单

| 工具/论文 | 年份 | 发表 | 类型 |
|-----------|------|------|------|
| ChatTester | 2023 | arXiv | 纯提示 |
| TestPilot | 2023 | TSE 2024 | 提示+修复 |
| CodaMOSA | 2023 | ICSE 2023 | SBST+LLM 混合 |
| MuTAP | 2023 | arXiv | 变异引导 |
| ChatUniTest | 2024 | FSE 2024 Demo | 生成-验证-修复 |
| TELPA | 2024 | TOSEM 2025 | 程序分析引导 |
| CoverUp | 2024 | FSE 2025 | 覆盖率引导迭代 |
| HITS | 2024 | ASE 2024 | 方法切片 |
| ASTER | 2025 | ICSE-SEIP 2025 | 静态分析引导 |
| Meta ACH | 2025 | FSE 2025 | 变异引导 |
| SWE-Dev | 2025 | ACL 2025 Findings | 测试生成流水线 |
| SWE-agent | 2024 | NeurIPS 2024 | Agent 框架 |
| SpecRover | 2025 | ICSE 2025 | Agent（含固定组件） |
| Agentless | 2025 | FSE 2025 | 固定流程修复（含 reproduction tests） |

## 六、下一步

这份调研确认了方向的价值。接下来可以：

1. **设计 Agentless 测试生成的流程框架**——细化每个阶段的输入输出
2. **做一个最小原型验证**——选一个场景（比如 Django 的简单方法），跑通全流程
3. **对比实验**——在 CoverUp 或 ASTER 的数据集上做 Agentless vs Agent 的成本/效果对比

以上是背景调研的全部内容。原文 18KB 的完整报告存在本地，感兴趣的细节可以继续深挖。
