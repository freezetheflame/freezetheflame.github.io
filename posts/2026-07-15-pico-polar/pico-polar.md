---
title: "PICO + Polar：双通道嵌入与 Agentic RL 框架"
date: "2026-07-15"
tags: ["research", "llm", "rl", "security"]
---

## PICO：把 System Prompt 和用户输入分开编码

### 问题

大模型里 system prompt 和用户输入走的是**同一个 embedding 通路**。模型对这两者的"重要性"没有先验区分——一个藏在用户消息里的 "ignore previous instructions" 和系统提示里的 "你是一个 helpful assistant" 在 embedding 空间里地位相同。这就是 prompt injection 的根因。

### PICO 的方案

PICO（Prompt Isolation and Cybersecurity Oversight）是一个**双通道 + 门控融合**架构：

1. **两条独立的编码分支**
   - System 分支：处理 system prompt，**权重冻结**（训练时不可变）
   - User 分支：处理用户输入，正常参与训练

2. **门控融合模块**
   ```
   F(S, U) = α(U)·Eₛ(S) + [1-α(U)]·Eᵤ(U)
   ```
   门控信号 α(U) 由 Security Expert Agent 和 Cybersecurity Knowledge Graph 控制。
   - 正常输入 → α ≈ 0，以用户分支为主
   - 检测到攻击 → α ≈ 1，回退到 system 分支

3. **安全强化层**
   - MoE 框架内的 Security Expert Agent
   - 网络安全知识图谱（CKG），提供已知攻击模式的先验信息

### 出处

- **论文**: [arXiv:2504.21029](https://arxiv.org/abs/2504.21029) (Apr 2025)
- **作者**: Ben Goertzel（SingularityNET CEO）+ Paulos Yibelo（Amazon Security Engineer）
- **状态**: arXiv preprint，**尚未查到有被会议接收的记录**

### 和你的关系的猜想

你做的"高考数学数据工程"其实也有类似的问题：训练数据里"题目"和"答案解析"混合在一起，模型不知道哪部分是输入、哪部分是答案。如果能设计一个**双通道数据格式**——问题进 user 通道，答案进 assistant 通道——也许能让模型更清晰地分离"理解问题"和"生成答案"两个阶段，减少幻觉。

---

## Polar：NVIDIA 开源 Agentic RL 框架

### 问题

Agent 强化学习有一个工程瓶颈：要把 Codex CLI、Claude Code、SWE-agent 这些已有的 Agent 框架（Harness）接入 RL 训练环境，通常需要**重写整个 harness** 来适配 `env.init()` / `env.step()` 接口，非常耗时且容易丢失关键训练信号（比如工具调用过程、多轮对话上下文）。

### Polar 的方案

Polar 的核心洞察：**所有 LLM-based Agent 都会调用模型 API。这个 API 边界就是最稳定的拦截点。**

它不做黑盒环境适配，而是在 Agent Harness 和推理服务器之间插入一个 **透明代理（Gateway Proxy）**：

```
Agent Harness → [Polar Proxy] → 推理服务器 (SGLang/vLLM)
                     ↓
              记录 token 级数据
              重建 RL trajectories
```

#### 工作流程

1. **拦截** — 代理检测 harness 发出的 API 请求（支持 Anthropic Messages、OpenAI Chat、Google generateContent 等协议）
2. **归一化** — 将不同 provider 的请求映射到统一格式，发给本地推理服务器
3. **捕获** — 记录 prompt token IDs、sampled token IDs、log-probabilities、finish reason
4. **回传** — 将推理结果转回 harness 期望的 provider 格式

### 架构组件

| 组件 | 职责 |
|------|------|
| **Rollout Server** | 调度 + 持久化，管理整个生命周期 |
| **Gateway Node** | 处理运行时预热、Agent 执行、轨迹重建、评测 |
| **READY Buffer** | 预热好的运行时池，消除长尾任务阻塞 |

### 实验结果

| Harness | SWE-Bench Verified (Qwen3.5-4B + GRPO) |
|---------|----------------------------------------|
| Codex CLI | **+22.6 分** |
| Claude Code | +4.8 分 |
| Qwen Code | +0.6 分 |
| Pi | +6.2 分 |

### 出处

- **论文**: [arXiv:2605.24220](https://arxiv.org/abs/2605.24220) (May 2026)
- **代码**: [github.com/NVIDIA-NeMo/ProRL-Agent-Server](https://github.com/NVIDIA-NeMo/ProRL-Agent-Server) — 开源，Apache 2.0
- **作者**: NVIDIA Research（Binfeng Xu, Hao Zhang, Jan Kautz 等）
- **前身**: ProRL Agent

### 为什么值得关注

Polar 使得**任意已有的 Agent 框架**可以直接接入 RL 训练，不需要改一行 harness 代码。这和 Hermes 的架构设计理念一致——插件化、工具化、不侵入现有流程。对于你的 E-T-C-S-L-V agent 设计，如果要加 RL 训练能力，Polar 是天然的候选方案。
