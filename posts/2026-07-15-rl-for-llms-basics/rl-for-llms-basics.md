---
title: "RL for LLMs：从零到完整训练流程"
date: "2026-07-15"
tags: ["rl", "llm"]
---

> 本文从基本概念开始，逐步构建 LLM 强化学习的完整图景。

## 一、核心概念逐个拆

### Rollout

**直译**：展开、推出。
**RL 含义**：让 policy（策略，也就是当前模型）在环境中跑一遍，生成一条完整的行动轨迹（trajectory）。

类比一下：你让一个学生做一套试卷，他写下的全部答题过程就是一次 **rollout**。每一步（每道题）是"状态"，他写下的答案是"动作"，最后对答案打分就是"奖励"。

在 LLM Agent 的语境里：
```
Rollout = [turn₁, turn₂, ..., turnₙ]
```
每个 turn 包含 `(observation, action, reward)` 三元组。比如 Codex CLI 修复一个 bug：读文件（obs）→ 写代码（action）→ 编译通过/不通过（reward）。

### Policy

模型在给定状态下选择动作的策略。LLM 的 policy 就是 `P(next_token | context)`——给定上文，预测下一个 token。

### Reward（奖励）

对模型输出质量的标量评分。可以是：
- **二元**：代码编译通过 / 不通过（0 或 1）
- **连续**：测试通过率（0.0 ~ 1.0）
- **模型评分**：用 reward model 打分
- **规则评分**：格式正确 +5，逻辑错误 -2

### Value Function（价值函数）

预测"从这个状态出发，未来能拿多少总奖励"。帮助模型判断：
- 当前这步走对了吗？
- 如果现在换一种方式，后续会不会更好？

### Advantage（优势）

`A(s, a) = Q(s, a) - V(s)`

实际拿到的奖励比预期好多少。**正优势**鼓励这个动作，**负优势**抑制。

### Trajectory（轨迹）

一次 rollout 产生的完整序列：
```
s₀ → a₁ → s₁ → a₂ → s₂ → ... → sₙ
```
是训练的基本单元。

---

## 二、LLM RL 的全流程

### 第 0 步：准备工作

```
基础模型（如 Qwen3.5-4B）
        │
        ▼
SFT 微调（让模型先学会基本指令遵循）
        │
        ▼
Reward Model 或 Verifier（评分函数）
```

### 第 1 步：采样（Rollout）

用当前 policy（模型）在环境中跑 N 次，生成 N 条 trajectory：

```
输入："修复这个 Python 函数的 bug"
        │
        ▼
模型采样生成多条不同答案：
  Trajectory 1: 读代码 → 改第5行 → 补测试 → 通不过
  Trajectory 2: 读代码 → 分析根因 → 改第12行 → 通过
  Trajectory 3: 读代码 → 直接删函数 → 通不过
```

### 第 2 步：评估（Evaluation）

对每条 trajectory 打分：

| Trajectory | 分数 | 原因 |
|------------|------|------|
| 1 | 0.3 | 改了但没完全修好 |
| 2 | 0.9 | 正确修复，测试通过 |
| 3 | 0.0 | 直接删函数，负分 |

### 第 3 步：优势计算（Advantage Estimation）

计算每个 token/每步的 advantage：
```
Advantage = 实际累计奖励 - 预期奖励
```

好的步骤 → 正 advantage（鼓励）
差的步骤 → 负 advantage（抑制）

### 第 4 步：策略更新（Policy Update）

用 advantage 信号更新模型参数。目标是：**让 policy 倾向于产生高 advantage 的动作**。

核心优化目标（以 GRPO 为例）：
```
maximize: E[ advantage × log P(action | state) ]
```
同时加一个 KL penalty 防止模型偏离太远。

### 第 5 步：循环

重复 1-4 步，持续迭代。通常需要数千到数万次 rollout。

---

## 三、常见的 RL 算法选择

### PPO（Proximal Policy Optimization）

**最经典**，OpenAI 的默认选择。

核心 trick：用 clipped objective 防止单次更新步子太大。
```
L = min(ratio × A, clip(ratio, 1-ε, 1+ε) × A)
```

需要一个 value model（critic），所以内存占用翻倍。

**适用**：通用场景，奖励需要 value 函数辅助。

### GRPO（Group Relative Policy Optimization）

DeepSeek-R1 用的算法，**不需要 value model**。

核心 trick：对一个 prompt 采样一组 response，用组内相对排名代替 advantage：
```
Advantage = (response_score - group_mean) / group_std
```

比 PPO 省一半显存（省掉了 critic model）。

**适用**：资源受限场景、数学推理。

### Reinforce（REINFORCE）

最简单的 policy gradient，直接用累计奖励更新。

缺点：方差大，不稳定。

**适用**：简单场景的 baseline。

---

## 四、关键超参数

| 参数 | 含义 | 典型值 |
|------|------|--------|
| learning_rate | 学习率 | 1e-6 ~ 5e-6 |
| KL penalty | KL散度惩罚系数 | 0.01 ~ 0.1 |
| clip_epsilon | PPO 裁剪范围 | 0.1 ~ 0.3 |
| num_rollouts | 每次更新采样数 | 8 ~ 64 |
| temperature | 采样温度 | 0.6 ~ 1.0 |

---

## 五、Polar 的位置

结合 Polar 来看整个流程就很清楚了：

```
                Polar 的边界
                ┌──────────────┐
                │  proxy 捕获  │
                │  token 级数据 │
                └──────┬───────┘
                       │
Harness ──→ Rollout ──→ Trajectory ──→ Advantage ──→ Policy Update
(Codex等)              (记录)        (计算)         (GRPO/PPO)
```

Polar 不发明新算法，它解决的是 **Rollout 阶段**的工程问题——让任何 harness 都能被"黑盒"接入 RL pipeline。

---

> 参考：
> - Schulman et al., PPO, 2017
> - Shao et al., GRPO / DeepSeek-Math, 2024
> - Xu et al., Polar: Agentic RL on Any Harness, 2026
