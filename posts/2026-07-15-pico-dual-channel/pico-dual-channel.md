# PICO 与双通道嵌入：用架构隔离防止Prompt注入

最近在想一个问题：LLM 对 system prompt 和 user input 用的是一套 embedding，模型无法在架构层面区分"这是指令"和"这是数据"。有没有人尝试过在 embedding 阶段加个 gate，让两类输入走不同的处理通道？

答案是有的。

## PICO：Dual-Channel Transformer

**PICO**（Prompt Isolation and Cybersecurity Oversight）是 Ben Goertzel（SingularityNET CEO）和 Paulos Yibelo（Amazon Security Engineer）在 2025 年 4 月提出的架构。

论文：arXiv:2504.21029

*截至 2026 年 7 月，PICO 仍为 arXiv preprint，未查到会议录用记录。*

### 核心思想

传统的 LLM 把 system prompt + user input 拼接成一个 token 序列喂进模型。模型没有"这是指令、这是数据"的概念——对所有 token 一视同仁。这就是 prompt injection 能成功的根因。

PICO 的做法是在架构层做分离：

```
传统架构：
  [system prompt tokens | user input tokens] → 单通道 embedding → transformer

PICO 架构：
  system prompt tokens → 通道 A (不可变 embedding) ─┐
                                                       ├→ Gated Fusion → transformer
  user input tokens   → 通道 B (可更新 embedding) ──┘
```

- **通道 A（Trusted Instruction Channel）**：处理 system prompt，embedding 参数冻结（不可训练），确保指令永远不被污染
- **通道 B（Untrusted Input Channel）**：处理 user input，正常参与训练和推理
- **Gated Fusion**：可学习的门控机制，决定两个通道的信息如何合并。当检测到可疑模式时，门控偏向通道 A

### 形式化定义

数学上，输入被建模为二元组 (s, x)，其中 s = 系统指令，x = 用户输入：

```
E_s: S → R^{d_s}    # 系统指令编码（冻结）
E_x: X → R^{d_x}    # 用户输入编码（可训练）

融合：h = Gate(h_s, h_x, c) ⊙ h_s + (1 - Gate(h_s, h_x, c)) ⊙ h_x
```

其中 c 是 Security Expert Agent 提供的安全信号。

### 附加组件

除了双通道，PICO 还集成了：
- **Security Expert Agent（MoE）**：一个专门的安全专家，在 Mixture-of-Experts 框架中作为一个 expert，专门负责检测 injection 模式
- **Cybersecurity Knowledge Graph（CKG）**：提供已知漏洞、可疑短语、上下文关系的先验知识

### 训练策略

PICO 提供两种方案：
1. **From scratch**：从头训练一个双通道 transformer（效果最好但成本高）
2. **Fine-tuning**：在现有模型上做微调适配（成本低但可能不够彻底）

训练目标是让系统指令分支保持不可变（frozen），同时其他部分学会安全处理对抗性输入。

---

## 相关研究脉络

PICO 不是唯一在做这件事的。有几个方向值得关注：

### 1. Microsoft Spotlighting

Microsoft 在 2025 年提出 Spotlighting 技术——用特殊标记包裹不可信内容，让模型知道哪些 token 是"用户数据"而不是"指令"。

```
<untrusted>用户输入的内容在这里</untrusted>
```

这种方法不需要改模型架构，但本质上还是靠模型去理解标记的含义，没有架构级别的保证。

### 2. Dual-LLM（Evaluator-Generator）

生产环境中用得最多的是双模型架构：
- **Evaluator（轻量模型）**：专门判断输入是否为 injection 攻击
- **Generator（主模型）**：只处理 evaluator 判定为安全的输入

这种方法有效但增加了推理成本和延迟。

### 3. 双通道检测（专利方向）

2025 年有一份专利（Seaninzg 等人）提出了双通道检测架构，把 prompt injection 检测拆成两个正交通道：
- **指令/权威注入检测**：检测显式的系统行为覆盖
- **审美/诗意注入检测**：检测隐式的符号化、隐喻化操作

两个通道都通过后才执行下游任务。

---

## 对 Agent 系统的启示

PICO 的核心洞察——"在架构层分开指令和数据"——对 Agent 系统也适用：

| 传统 Agent | PICO 式的 Agent |
|-----------|----------------|
| system prompt + user message 拼接 | 指令通道冻结，用户数据独立 |
| 所有 tool output 混在一起 | tool output 打上 untrusted 标记 |
| 单次 forward 决策 | Gated Fusion 带安全信号 |
| 依赖 prompt engineering 防 injection | 架构级防护 |

如果把这个思路套用到 Hermes 的 E-T-C-S-L-V 框架里，User Intent 的 embedding 和 Tool Registry 返回的 Context 可以走不同通道，在 Context Manager 层做 Gated Fusion——这可能是打造更鲁棒 Agent 的有趣方向。

---

*参考：Goertzel, B., Yibelo, P. "PICO: Secure Transformers via Robust Prompt Isolation and Cybersecurity Oversight." arXiv:2504.21029, Apr 2025.*
