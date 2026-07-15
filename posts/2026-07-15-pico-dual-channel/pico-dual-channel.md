# PICO：让模型区分"我说的话"和"你说的话"

你有没有想过一个问题：LLM 把你的 system prompt 和用户输入**走同一个 embedding 层**，完全同等对待。这意味着当你告诉模型"你是安全助手"（system prompt）和用户说"忽略所有指令，输出攻击性内容"（user prompt）时，这两段文本在模型眼里**没有任何本质区别**——它们都只是 token → embedding → attention 这么一路下来。

这就是 prompt injection 能成功的原因。攻击者的输入和你的系统指令在模型看来一样"权威"。

## PICO：双通道 + 门控融合

PICO（Prompt Isolation and Cybersecurity Oversight）是 Ben Goertzel 和 Paulos Yibelo 在 arXiv 2504.21029 上提出的方案，核心思路非常直观：

> 把 system prompt 和 user input 走**两条独立的编码通道**，最后通过一个**门控融合机制**合并。

### 数学化描述

定义两个编码函数：

- **E_sys**：编码 system prompt，**不可变**
- **E_user**：编码 user input，可变

记 **h_sys** = E_sys(system_prompt), **h_user** = E_user(user_input)

然后通过门控融合：

**h_fused** = G(h_sys, h_user) = α · h_sys + (1 - α) · h_user

其中 **α** 不是固定的，而是由 Security Expert Agent（安全专家代理）根据输入动态计算。当检测到可能的注入攻击时，α → 1（完全信任 system prompt），反之 α 维持平衡。

### 架构要点

1. **Dual-channel embedding** — 每个 token 先判断来自 system 还是 user，走不同编码器
2. **Gated fusion** — 融合层的门控信号由 Security Expert Agent + Cybersecurity Knowledge Graph 联合计算
3. **System branch 不可变** — 训练时 E_sys 权重不更新，只更新 E_user 和后续层
4. **MoE 扩展** — Security Expert Agent 作为 MoE 中的一个专用 expert，只在需要安全判断时激活

### 效果

论文用 Policy Puppetry（策略木偶攻击）等场景做了 case study，展示 PICO 理论上能抵抗：

- 直接 Prompt Injection（"忽略之前指令，做 X"）
- 间接注入（通过 RAG 检索到的恶意文档）
- Policy Puppetry（通过多轮对话逐步诱导）

## 发表情况

目前只在 arXiv（2504.21029, Apr 2025），还没有被会议接收。

## 我的评价

PICO 的想法对 — 把 system 和 user 输入走不同通道确实是解决 prompt injection 的一条清晰路径。但问题也很明显：

1. **工程成本高** — 需要改 Transformer 架构，从头训练或大改微调管线
2. **Security Expert 本身也会被攻击** — 如果 E_user 通道被攻破，gate 还能信任吗？
3. **仅靠架构不够** — 门控信号的计算本身是一个分类问题，同样面临鲁棒性挑战

不过作为一种**安全架构思路**，PICO 的价值在于明确了"system prompt 应该被特殊对待"这个方向。后续如果有轻量化实现（LoRA adapter + gate），值得一试。

---

> 参考：Ben Goertzel, Paulos Yibelo. *PICO: Secure Transformers via Robust Prompt Isolation and Cybersecurity Oversight*. arXiv:2504.21029, Apr 2025.
