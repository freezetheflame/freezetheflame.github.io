---
title: "vLLM 源码剖析（一）：从零搭建推理压测环境"
date: 2026-06-06
tags: [AI Infra, vLLM, 推理引擎]
---

vLLM 是目前最主流的 LLM 推理引擎之一，以 PagedAttention 和 continuous batching 两大创新著称。本文是「vLLM 源码剖析」系列的第一篇，记录从零搭建环境、跑通首次推理、完成基准压测的全过程。后续文章将深入 PagedAttention、Scheduler、Block Manager 等核心模块。

**硬件环境**：RTX 4070 Super 12GB VRAM，CUDA 13.2，vLLM 0.22.1，PyTorch 2.11  
**测试模型**：Qwen2.5-1.5B-Instruct（2.9GB，bf16，28 层，hidden_size=1536）

---

## 一、环境搭建

```bash
# 安装 vLLM（清华镜像源，国内更快）
pip install -i https://pypi.tuna.tsinghua.edu.cn/simple vllm

# 下载测试模型
hf download Qwen/Qwen2.5-1.5B-Instruct --local-dir ./models/qwen2.5-1.5b
```

### 踩坑记录

1. **HF_ENDPOINT 镜像冲突**：如果设置了 `HF_ENDPOINT=https://hf-mirror.com`，httpx 会报 `UnsupportedProtocol` 错误。需要 `unset HF_ENDPOINT` 后再下载。
2. **numpy 版本冲突**：vLLM 安装会升级 numpy 到 2.3.5，和旧版 scikit-learn 二进制不兼容。升级 sklearn 即可解决：`pip install --upgrade scikit-learn`。
3. **Triton JIT 编译**：首次推理会触发 attention kernel 的 JIT 编译，造成延迟尖刺（latency spike）。生产环境建议通过 warmup 预热。

选择 Qwen2.5-1.5B-Instruct 作为测试模型：参数量小（~3GB 显存），12GB 显卡可同时跑 batch=32 不会 OOM，便于快速迭代实验。

---

## 二、首次推理

vLLM 提供两套 API：离线批处理（`vllm.LLM`）和 OpenAI-compatible server（`vllm serve`）。先用离线 API 跑通：

```python
from vllm import LLM, SamplingParams

llm = LLM(model="Qwen2.5-1.5B-Instruct", gpu_memory_utilization=0.85)
outputs = llm.generate(["Explain PagedAttention."], SamplingParams(max_tokens=256))
```

### 关键参数说明

| 参数 | 含义 | 推荐值 |
|------|------|--------|
| `gpu_memory_utilization` | GPU 显存使用比例 | 12GB 卡建议 0.85（留余量给 CUDA context） |
| `max_tokens` | 最大生成 token 数 | 不宜设太大，vLLM 会预分配 KV cache |
| `temperature` | 生成随机性 | 压测时设 0 保证确定性 |

---

## 三、基准压测

### 3.1 Batch Size vs Throughput

固定 max_tokens=128, temperature=0，测试不同 batch size 的吞吐量和延迟：

| Batch Size | Tokens/sec | Requests/sec | Avg Latency (ms) |
|------------|-----------|-------------|-------------------|
| 1 | 49.1 | 0.38 | 2607 |
| 2 | 245.4 | 1.96 | 512 |
| 4 | 504.0 | 3.98 | 252 |
| 8 | 1006.4 | 8.05 | 124 |
| 16 | 1857.3 | 14.62 | 68 |
| 32 | 3692.5 | 29.12 | 34 |

**关键发现**：

- **吞吐量接近线性扩展**：batch=32 达到 3692 tok/s，是 batch=1 的 **75 倍**
- **延迟大幅下降**：2607ms → 34ms，得益于 GPU 计算密度提升
- **GPU 利用率是关键**：单请求时 GPU 大量时间在等待（Compute M. 低），batch 增大填满计算单元
- batch=1 延迟高达 2.6s 的原因：模型加载 + Triton JIT 编译开销集中体现

### 3.2 Output Length vs Latency

固定 batch=1, temperature=0，测试不同 max_tokens 下的延迟：

| Max Tokens | Actual Tokens | Time (s) | Tokens/sec |
|------------|--------------|---------|------------|
| 32 | 32 | 0.45 | 70.9 |
| 64 | 64 | 0.48 | 134.0 |
| 128 | 128 | 0.95 | 135.2 |
| 256 | 132 | 0.99 | 133.7 |
| 512 | 132 | 0.98 | 135.3 |

**关键发现**：

- **稳态吞吐约 135 tok/s**：一旦进入 decode 阶段，速度恒定
- **首 token 延迟约 350ms**：包括 tokenization + prefill + 首次 forward
- **模型自然停在第 132 token**：遇到 EOS token，max_tokens=256 和 512 均提前停止
- 短文本（32 token）的 tok/s 偏低（70.9），因为首 token 开销占比大

### 3.3 延迟分解

以 max_tokens=128 为例（总耗时 0.95s，生成 128 token）：

```
首 token 延迟:    ~0.35s  (tokenization + prefill + 第一次 forward)
Decode 阶段:      ~0.60s  (127 token × 4.7ms/token)
稳态吞吐:          135 tok/s
```

---

## 四、初步发现与思考

### 为什么 batch=1 这么慢？

单请求时，GPU 的计算单元大部分时间在空转。Qwen2.5-1.5B 只有 28 层 × 12 heads，单次 forward 的计算量填不满 RTX 4070S 的 CUDA core。等到 batch=8 以上，多个请求的矩阵乘法和 attention 可以并行，GPU 利用率才真正发挥出来。

这正是 **continuous batching** 的核心价值——不是等到一批请求都到达才一起处理，而是动态地将新到达的请求插入正在执行的 batch 中，最大化 GPU 利用率。

### 为什么稳态约 135 tok/s？

这个数字由模型架构决定：每生成一个 token 需要跑一次完整的 forward pass。1.5B 参数 × 28 层，在 bf16 下，内存带宽和计算能力达到平衡点。如果换成 7B 模型，预计会降到 20-30 tok/s。

---

## 五、下一步

Phase 2 将深入 PagedAttention 源码：
- 阅读 `vllm/core/block_manager.py`：理解 KV cache 的分页分配和回收
- 阅读 `vllm/core/scheduler.py`：理解 continuous batching 的调度策略
- 手动 trace 一次请求的 block table 变化

---

*本系列所有代码和压测数据见 [vllm-deep-dive](https://github.com/freezetheflame/vllm-deep-dive)*
