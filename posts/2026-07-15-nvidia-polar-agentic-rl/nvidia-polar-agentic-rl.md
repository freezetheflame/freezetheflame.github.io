# NVIDIA Polar：对任何 Agent Harness 做强化学习

## 问题：Agent RL 的工程瓶颈

给 LLM Agent 做强化学习，目前面临一个尴尬的工程问题：

> Agent 的执行环境（harness）——比如 Codex CLI、Claude Code、Qwen Code——都有自己一套复杂的 system prompt、工具调用格式、状态管理逻辑。传统的 RL 框架要求把 harness 重写成 `env.init()` / `env.step()` / `env.reset()` 接口，不仅工作量巨大，还会丢失 harness 特有的执行细节。

更麻烦的是，如果 harness 是闭源的（比如 Claude Code），你根本没法改它的代码。

## Polar 的核心洞察

2026 年 5 月，NVIDIA NeMo 团队开源了 **Polar**（GitHub: NVIDIA-NeMo/ProRL-Agent-Server，Apache 2.0）。

Polar 的洞察非常简洁：

> 无论什么 agent，它**必须调用 LLM API**。这个 API 边界就是天然的拦截点。

### 代理（Proxy）模式

Polar 在 agent harness 和 inference server 之间插一个 **API 代理**：

```
Agent Harness ──→ [Polar Proxy] ──→ Inference Server (SGLang/vLLM)
                      │
                      ▼
                记录 token 级数据
                （prompt、response、log probs）
                      │
                      ▼
                重建 RL trajectory
```

只需要把 harness 的 model base URL 指向 Polar 的 gateway，**不需要改任何 harness 代码**。

### 四个核心步骤

| 步骤 | 做什么 |
|------|--------|
| 1. 检测提供方 API | 自动识别 Anthropic Messages、OpenAI Chat、Google generateContent |
| 2. 标准化请求 | 把不同格式统一转成 OpenAI Chat Completions |
| 3. 捕获 token 级数据 | 保存 prompt token IDs、sampled token IDs、log probabilities |
| 4. 还原响应格式 | 把结果转回 harness 期望的格式返回，对 harness 完全透明 |

### 关键技术

- **Token-faithful 重建** — 直接用 inference server 返回的 token IDs 和 log probs 重建训练轨迹，不重新编码，避免 drift
- **Prefix Merging** — 多轮对话中复用公共前缀的 hidden states，训练速度提升 **5.39×**
- **异步解耦** — rollout 节点的 runtime 预热、agent 执行、轨迹重建、评估并行处理
- **支持流式** — 对期望 SSE 流式响应的 harness，Polar 先请求非流式结果再合成流式输出

## 实验结果

用简单的 GRPO 算法在 SWE-Bench Verified 上测试：

| Harness | Qwen3.5-4B 基线 | +Polar GRPO | 提升 |
|---------|-----------------|-------------|------|
| Codex CLI | — | +22.6 | **最大** |
| Claude Code | — | +4.8 | |
| Qwen Code | — | +0.6 | 已是 Qwen 亲儿子 |
| Pi | — | +6.2 | |

**+22.6 分** 在 SWE-Bench 上是巨大的提升，说明 harness-native 的训练确实学到了原生执行路径上的细节。

## 对 Hermes Agent 的启示

你正在用的 Hermes Agent 本身就是个 agent harness（E-T-C-S-L-V 六元组）。Polar 的思路意味着：

理论上你可以**把 Hermes 挂到 Polar proxy 后面**，然后用 GRPO 训练一个 "Hermes-native" 的模型——模型学会在 Hermes 的工具调用格式、上下文管理方式下更高效地执行任务。

> 论文：arxiv.org/abs/2605.24220
> 代码：github.com/NVIDIA-NeMo/ProRL-Agent-Server
