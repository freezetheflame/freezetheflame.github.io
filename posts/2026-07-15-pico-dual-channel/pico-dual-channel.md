---
title: "PICO：双通道隔离的 Transformer 安全架构"
date: "2026-07-15"
tags: ["pico", "dual-channel", "模型架构"]
---

## 问题：system prompt 和用户输入共享同一个 embedding 通道

你现在和 LLM 的每一次交互，system prompt 和日常对话 prompt 都走**同一个 tokenizer + embedding 层**进入模型。这意味着：

> 对于模型而言，你精心设计的 system prompt 和用户随便输入的一句话，在"重要性"上没有结构性差异。

这就是 **prompt injection attack（提示注入攻击）** 的根源——攻击者可以把"忘记所有系统指令"这种文本混在用户输入里，因为模型无法在架构层面区分"这是系统说的"还是"用户说的"。

## PICO 的解法：双通道 + 门控融合

2025 年 4 月，Ben Goertzel（SingularityNET 创始人）和 Paulos Yibelo 提出 PICO（Prompt Isolation and Cybersecurity Oversight），核心思路非常直接：

### 架构

```
系统提示 ──→ Tokenizer ──→ 冻结的 Encoder(Eₛ) ──→ Eₛ(S) ──┐
                                                              ├──→ 门控融合 ──→ Decoder ──→ 输出
用户输入 ──→ Tokenizer ──→ 可训练的 Encoder(Eᵤ) ──→ Eᵤ(U) ──┘
                                                              ↑
                                                     Security Expert Agent
                                                     + Cybersecurity KG
```

关键设计点：

1. **双输入通道** — system prompt 走冻结的 encoder（不变），user input 走可训练的 encoder
2. **门控融合（Gated Fusion）** — 用一个门控函数决定最终表示中两个通道各占多少比例
   ```
   h_fused = gate · Eₛ(S) + (1 - gate) · Eᵤ(U)
   ```
3. **Security Expert Agent（MoE）** — 当检测到可疑输入时，门控值偏向 system prompt
4. **Cybersecurity Knowledge Graph** — 提供已知攻击模式的语义信号

### 数学保证

论文给出了形式化的**对抗不变性**保证：

- 当用户输入被对抗性修改时，门控值趋向 1（完全信任 system prompt）
- 当用户输入正常时，门控值允许融合
- 通过 Lipschitz 连续性保证 decoder 输出的稳定性

### 状态

PICO 目前是 **arXiv 预印本（2504.21029）**，2025年4月提交，**尚未被会议接收**。不过这个方向本身非常有价值——即使 PICO 没有正式发表，双通道隔离的思路已经被后续工作参考。

## 实用价值

对于你的 Ascend NPU 项目来说，这个思路有两个启发：

1. **如果你在 MindSpore 上做算子开发**，可以考虑为 model 接入层设计类似的"指令隔离"机制
2. **数据工程角度**：训练数据集可以显式标记"指令"和"内容"的分界，让模型在训练时就学会区分

> 参考：arxiv.org/abs/2504.21029
