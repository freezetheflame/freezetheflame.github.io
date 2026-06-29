---
title: "推理优化与量化算子深度技术调研"
date: 2026-06-29
tags: [推理优化, 量化, FlashAttention, MoE, 融合算子, 推测解码, 技术调研]
---

如果你正在构建 LLM 推理服务，总会在某个时刻碰上这样的问题：一个 70B 参数的模型怎样才能在单张 H100 上跑出可以接受的延迟？为什么别人的服务支持 128K 上下文而你的一到 16K 就 OOM？KV Cache 到底能不能省？——这些问题最终都会落到一个共同的方向上：**推理优化算子**。

推理优化不是某一招鲜的技术，而是一套组合拳。从权重用多少比特表示（量化），到注意力机制怎么在 GPU 上高效实现（FlashAttention），到稀疏激活的专家网络如何部署（MoE），再到如何把多个小算子合并成一个大算子减少访存（融合），最后到用草稿-验证范式打破自回归的串行瓶颈（推测解码）——这五大领域构成了现代 LLM 推理引擎的技术骨架。

<!--more-->

这篇调研面向 LLM 推理优化开发者，按**量化算子 → FlashAttention → MoE 算子 → 融合算子 → 推测解码**的路径，逐章深挖原理、实现思路和性能关键点。每章都配有代码片段和对比表，方便你快速理解不同方案的取舍。

---

## 1. 量化算子

### 1.1 概述

量化将高精度浮点权重/激活值映射到低位宽表示，核心目标是**减少内存占用和访存带宽**，同时尽量保持模型精度。对于 LLM 推理，量化主要在以下三个层面展开：

| 层面 | 典型精度 | 收益 |
|------|----------|------|
| 权重量化 (W) | INT4, INT8, FP8 | 模型加载减半/减至 1/4 |
| 激活量化 (A) | INT8, FP8 E4M3/E5M2 | GEMM 计算加速 |
| KV Cache 量化 | FP8, INT8, INT4 | 长序列支持、高并发 |

### 1.2 INT8 对称/非对称量化

**原理：**

- **对称量化**：`q = round(x / scale)`，zero_point = 0。映射范围 `[-127, 127]`（有符号）。适用于权重分布接近零对称的场景（如经过 LayerNorm 之后的激活值）。
- **非对称量化**：`q = round(x / scale) + zero_point`，zero_point 非零。映射范围 `[0, 255]`（无符号）。能更好地拟合非对称分布。

```python
# 对称量化
scale = max(|x|) / 127
q = torch.clamp(torch.round(x / scale), -127, 127).to(torch.int8)

# 非对称量化
x_min, x_max = x.min(), x.max()
scale = (x_max - x_min) / 255
zero_point = torch.round(-x_min / scale)
q = torch.clamp(torch.round(x / scale) + zero_point, 0, 255).to(torch.uint8)
```

**实现思路：**

- Per-tensor（整个张量一个 scale）最简单但精度低；Per-channel（每输出通道一个 scale）是 LLM INT8 的主流选择。
- 去量化（dequant）通常融合进下游 GEMM kernel：`x_deq = (q - zp) * scale`，在 Tensor Core 计算前完成类型转换。
- 对于 W8A8 INT8，需要同时对权重和激活做量化，GEMM 调用 `cublasLtMatmul` 的 INT8 路径或自定义 CUTLASS kernel。

**性能关键点：**

- INT8 Tensor Core 吞吐是 FP16 的 2×（理论值），实际受制于 scale 的额外计算和 memory-bound 的激活量化。
- 激活量化需要收集统计量（absmax 或 min/max），引入额外 kernel launch 开销——融合进前一个算子（如 LayerNorm+Quant）可以消除。
- 非对称量化需要额外的 zero-point 处理，GEMM kernel 如果做了 INT8 对称优化则无法直接复用。

### 1.3 INT4 量化 — GPTQ 与 AWQ

#### GPTQ (GPT Post-Training Quantization)

**原理：** 基于最优脑手术（OBS/OBD）框架的二次误差最小化。逐列量化权重，用已量化列的误差补偿未量化列。

```python
# 伪代码：GPTQ 逐列量化
for col in range(W.shape[1]):
    q_col = quantize(W_hat[:, col])          # 量化当前列
    err = W_hat[:, col] - dequantize(q_col)  # 量化误差
    # 将误差按 Hessian 逆矩阵分配到剩余列
    W_hat[:, col:] -= err * H_inv[col, col:] / H_inv[col, col]
```

**实现要点（Marlin kernel）：**

- 权重重排为 `group_size × 16` 的块状布局，支持连续的向量化加载。
- 使用 `mma`（matrix multiply-accumulate）指令在 FP16 下计算，INT4 权重在寄存器内解包。
- 支持 group-wise scale（典型 group_size=128），scale 在 shared memory 中做预取。

**性能关键点：**

- Marlin kernel（vLLM 默认后端）在 A100 上接近 FP16 GEMM 的理论带宽利用率。
- GPTQ 的 Hessian 计算（`H = 2 * X^T X + λI`）成本高，calibration dataset 通常取 128 条样本即可。
- Group size 越小精度越高但 scale 存储开销越大（`group_size=128` 时 scale 占 0.5 bit/param）。

#### AWQ (Activation-aware Weight Quantization)

**原理：** 观察到权重中约 1% 的"salient channels"（对应激活值幅度大的通道）对精度影响最大。AWQ 不直接保留这些通道为 FP16，而是通过**按通道缩放**来保护它们：

```python
# AWQ 核心：寻找最优缩放因子 s
# 对每个输出通道：W'' = W * s, x'' = x / s
# 选择 s 使得量化后的 W'' 在 salient channel 上误差最小
for channel in salient_channels:
    s = argmin || Q(W * s) * (x / s) - W*x ||
```

**实现要点：**

- AWQ 与 GPTQ 共享相同的 kernel 后端（Marlin），模型格式兼容。
- 缩放因子通过搜索得到，通常在 [0.5, 1.0] 区间内以 0.01 步长搜索。
- 与 GPTQ 相比，AWQ 不需要 Hessian 逆矩阵计算，calibration 更快（分钟级 vs 小时级）。

**性能关键点：**

- AWQ INT4 在精度上通常优于 GPTQ（同等 bit-width），特别是在 4-bit 场景下 MMLU 损失 < 1%。
- Marlin kernel 同时支持 GPTQ 和 AWQ，只需在加载时解析不同的模型格式。
- 在 decode 阶段（batch=1），W4A16 的 GEMV 主要由 HBM 带宽瓶颈，INT4 的 4× 内存减半带来的收益直接转化为 ~2× 速度提升。

### 1.4 FP8 量化 — E4M3 / E5M2

**两种格式对比：**

| 格式 | 指数位 | 尾数位 | 最大范围 | 精度 |
|------|--------|--------|----------|------|
| E4M3 | 4 | 3 | ±240 | 更高（尾数多 1 bit） |
| E5M2 | 5 | 2 | ±57344 | 范围更大（梯度场景） |

**原理：**

- FP8 不是整数量化，而是低精度浮点。硬件（H100/H200/B200 Tensor Core）原生支持 FP8 GEMM。
- KV Cache 量化用 FP8 E4M3 更合适，因为注意力分数范围有限。
- 权重+激活 W8A8 FP8 通常保留 99%+ 精度（perplexity 上升 < 0.3%）。

**实现思路：**

```python
# FP8 量化（对称、per-tensor）
from float8_experimental import Float8Linear

# H100 硬件路径：直接设置 dtype 为 torch.float8_e4m3fn
q = q.to(torch.float8_e4m3fn)
k = k.to(torch.float8_e4m3fn)
# 注意：H100 FP8 GEMM 需要 scale，存储在额外 tensor 中
```

**性能关键点：**

- H100 SM90 Tensor Core 的 FP8 吞吐为 1.979 TFLOPS（是 FP16 的 2×）。
- FP8 需要 2:1 的 scale 存储（每 tensor 一个 FP32 scale），但相对模型权重可忽略。
- Transformer Engine（NVIDIA）自动处理 FP8 的 scaling factor 管理和 delayed scaling。
- FP8 KV Cache 将单条序列 KV cache 减半，在长上下文场景（32K+ tokens）下收益显著。

### 1.5 SmoothQuant

**原理：** INT8 激活量化困难的原因在于激活值存在**异常值（outliers）**——集中在特定通道且幅度远大于平均值。SmoothQuant 通过**平滑迁移量化难度**解决此问题：

```
Y = X · W
  = (X · diag(s)^(-1)) · (diag(s) · W)   # 迁移
  = X_hat · W_hat                          # X_hat 易量化, W_hat 略难一点
```

关键思路：将激活的量化难度"平滑"转移到权重上，通过一个 per-channel 的平滑因子 s。

**实现思路：**

```python
# SmoothQuant 迁移因子计算
alpha = 0.5  # 迁移强度，典型值 0.5
s = (per_channel_max(X)^alpha) / (per_channel_max(W)^(1-alpha))

# 迁移后的张量
X_hat = X / s       # 激活值范围被压缩，易于 INT8 量化
W_hat = W * s       # 权重范围扩大，略难量化但仍可接受
```

**性能关键点：**

- SmoothQuant 是**训练后量化（PTQ）**，无需重训练。
- 在 OPT-66B 上实现 W8A8 INT8 且精度损失 < 1%。
- Migration factor `alpha` 控制迁移强度：alpha=0 不迁移（激活难量化），alpha=1 完全迁移（权重可能溢出）。
- 实际部署时迁移因子可以融合进权重做离线处理，推理时只做激活量化。

### 1.6 KV Cache 量化

**为什么需要量化 KV Cache：** KV Cache 随着序列长度和并发数线性增长，是推理 OOM 的主要瓶颈。

| 场景 | FP16 KV Cache | FP8 KV Cache | INT4 KV Cache |
|------|---------------|--------------|---------------|
| LLaMA-70B, 32K ctx | ~10.7 GB/req | ~5.4 GB/req | ~2.7 GB/req |
| 并发 8 req | ~86 GB | ~43 GB | ~22 GB |

**实现思路：**

```python
# FP8 KV Cache 量化（per-token, per-channel 两种粒度）
# per-token: 每个 token 计算自己的 scale
scale_k = k.abs().max(dim=-1, keepdim=True).values / 240.0  # E4M3 max
k_q = (k / scale_k).to(torch.float8_e4m3fn)

# per-channel (per head): 每个 head_dim 维度一个 scale
scale_k = k.abs().max(dim=-2, keepdim=True).values / 240.0
```

**主要方法对比：**

| 方法 | 精度 | 粒度 | 硬件要求 |
|------|------|------|----------|
| FP8 E4M3 | 高质量 | Per-tensor / per-token | H100+ |
| INT8 per-token | 高质量 | Per-token asymmetric | 通用 (Triton) |
| KIVI (INT4) | 中高质量 | K per-channel, V per-token | 通用 |
| KVQuant (INT4) | 中高质量 | 带 outlier 感知 | 通用 |
| ZipCache (INT4) | 高质量 | 混合精度 | 通用 |

**性能关键点：**

- KV Cache 量化对**注意力分布的质量**有直接影响——量化误差会改变 softmax 输出分布。
- 在长上下文检索任务上，FP8 KV Cache 通常 < 0.5 点精度损失；INT4 方案需要仔细调优。
- **推测解码 + KV Cache 量化的交互是隐藏陷阱**：量化后的 logit 分布偏移可能降低 draft token 接受率 0.3 - 1.5，需要重新调优 num_speculative_tokens。
- 去量化必须融合进 Attention kernel（如 FlashAttention 的 FP8 变体），否则单独的 dequant kernel 会抵消带宽收益。

---

## 2. FlashAttention 系列

### 2.1 背景：GPU 存储器层次与 Attention 的 IO 瓶颈

现代 GPU 有两层关键存储：

| 层级 | 容量 (A100) | 带宽 | 特性 |
|------|-------------|------|------|
| SRAM (片上) | ~20 MB (192KB/SM) | ~19 TB/s | 极快但极小 |
| HBM (显存) | 40-80 GB | ~1.5-2.0 TB/s | 大容量但慢 |

标准 Attention：`O = softmax(QK^T / sqrt(d)) * V` 需要将中间矩阵 `S = QK^T`（N×N）写入 HBM，再读回做 softmax，存在 **6 次 HBM 访存**（Q/K 读、S 写、S 读、P 写、P/V 读、O 写）。FlashAttention 通过 tiling 将中间结果保持在 SRAM 中，只需 **2 次 HBM 访存**（一次读 Q/K/V blocks，一次写 O）。

### 2.2 FlashAttention v1 — IO-Aware Tiling + Online Softmax

**核心算法 — Tiling：**

```
# 外层循环：遍历 K/V 的 tile
for k_tile, v_tile in zip(tile(K, Bc), tile(V, Bc)):
    # 内层循环：遍历 Q 的 tile
    for q_tile in tile(Q, Br):
        m = -inf    # 每行的 running max
        l = 0       # 每行的 running sum (normalizer)
        o = 0       # 每行的 running output

        s = q_tile @ k_tile.T          # Br * Bc, 在 SRAM
        s = s / sqrt(d)                 # scaling
        s = apply_mask(s)               # causal mask

        m_new = max(m, row_max(s))
        l = l * exp(m - m_new) + row_sum(exp(s - m_new))
        o = o * exp(m - m_new) + exp(s - m_new) @ v_tile
        m = m_new

    out[q_tile] = o / l                 # 归一化后写回 HBM
```

**Online Softmax 原理：** 标准 softmax 需要看到所有 logits 才能计算分母 `sum(exp(s_j))`。Online softmax 通过维护 running max `m` 和 running sum `l`，在逐 block 流式处理中正确更新：

```python
# 数学推导：从已知 m_old, l_old 到新 block 的合并
m_new = max(m_old, max(s_new))          # 新全局最大值
l_new = l_old * exp(m_old - m_new) + sum(exp(s_new - m_new))
o_new = o_old * exp(m_old - m_new) + sum(exp(s_new - m_new) @ v_new)
# 最终: out = o / l
```

**性能关键点：**

- Tile 大小选择受 SRAM 容量约束：`Br * Bc * d * dtype_size * 3 <= SRAM_per_SM`。
- 典型值：`Br=128, Bc=128, d=128` 时 tile 占用约 192KB（接近 SRAM 上限）。
- FA1 外层循环是 K/V tile（先遍历 K/V），每个 Q tile 需要多次从 HBM 读取。

### 2.3 FlashAttention v2 — 更好的并行性与工作分配

**相对于 FA1 的主要改进：**

| 改进点 | FA1 | FA2 |
|--------|-----|-----|
| 循环顺序 | 外层 K/V, 内层 Q | **外层 Q, 内层 K/V** |
| Warp 分配 | Q tile 内按列划分 | **Q tile 内按行划分** |
| 非 matmul 操作 | 每个 block 内做 rescale | **推迟到最后做一次 rescale** |
| Softmax 归一化 | 每个 block 内部 | 全局 scale 后统一归一化 |

**外层 Q 循环的优势：**

- 每个 Q tile 加载一次后流式处理所有 K/V tiles，最后**一次**写入 HBM（FA1 是每次内层迭代都写回再读取）。
- GPU 实现**顺序写**而非分散写，合并访存效率更高。
- 减少 HBM 写入量：`O(Br * d)` 而非 `O(Br * Bc * #tiles)`。

**Warp 按行划分：**

- 每个 warp 负责 Q tile 中连续的若干行。在最后归一化（除以 l）时所有 warp 可以独立进行，无需跨 warp 同步。
- FA1 按列划分导致每次 rescale 需要跨 warp 通信。

**性能数据：**

- FA2 在 A100 上达到 140 TFLOPS（FP16），约 50-70% 的理论峰值。
- 相比于 FA1 的 2-4x 加速，FA2 进一步提升了 2x。

### 2.4 FlashAttention v3 — Hopper GPU 上的异步与低精度

**核心改进（三方面）：**

#### 1. Warp Specialization（Warp 专业化）
- 将 warp 分为两组：**GEMM warp**（负责 matmul）和 **Softmax warp**（负责 softmax 归一化）。
- 两组 warp 通过 shared memory 异步通信，实现**流水线并行**——当一个 GEMM warp 计算下一组数据时，softmax warp 处理上一组结果。

#### 2. TMA + 异步执行
- H100 的 TMA（Tensor Memory Accelerator）硬件单元负责 HBM 到 SRAM 的数据搬运。
- WGMMA（Warpgroup Matrix Multiply-Accumulate）指令允许在 GEMM 计算过程中同时进行数据加载。
- 采用**ping-pong 调度**：两个 buffer 轮流加载/计算，消除 stall。

#### 3. FP8 低精度支持
- 利用 H100 原生 FP8 Tensor Core（E4M3）。
- 引入 **block quantization**：每个 tile 计算独立的 scale，相比 per-tensor FP8 误差降低 2.6x。
- 使用**非相干处理（incoherent processing）**：对 Q/K 做随机旋转减少 FP8 量化误差的相关性。

**性能数据：**

| 指标 | FA2 (H100) | FA3 (H100 FP16) | FA3 (H100 FP8) |
|------|------------|------------------|----------------|
| TFLOPS | 350 (35%) | 740 (75%) | ~1,200 |
| vs FA2 加速比 | 1x | 1.5-2.0x | 2.6-3.0x |
| 精度误差 | --- | --- | 比 baseline FP8 低 2.6x |

### 2.5 PagedAttention — vLLM 的内存管理核心

**原理：** 受 OS 虚拟内存分页启发，将 KV Cache 切分为固定大小的 block（page）。

**数据结构：**

```
Logical KV Stream   Block Table   Physical Blocks
  Token 0-15    -->   Block 0   -->   Physical Block 7
  Token 16-31   -->   Block 1   -->   Physical Block 3
  Token 32-47   -->   Block 2   -->   Physical Block 12
```

**实现要点：**

- Block 大小通常为 16 tokens（平衡碎片和寻址开销）。
- **Copy-on-Write**：共享前缀的请求可以指向同一物理块（如系统 prompt 在 8 个并发请求间共享）。
- 自定义 CUDA kernel 通过 block table 间接寻址，在注意力计算中**动态 gather** 物理块。
- 分配器维护 free list，分配/释放为 O(1)。

**性能收益：**

- 内存碎片从传统方式的 60-80% 降低到 < 4%。
- 单条 KV cache 仅最后一个 block 有浪费（平均 waste = block_size/2 tokens）。
- 并行采样（一个 prompt 生成多个 continuation）通过 block 共享节省大量内存。
- 结合 prefix caching（自动检测共享前缀），首 token 延迟降低 60-90%。

### 2.6 Multi-head Latent Attention (MLA) — DeepSeek 的核心创新

**动机：** 标准 MHA 的 KV cache 随 head 数线性增长。DeepSeek-V2/V3 提出 MLA，通过**低秩压缩**大幅压缩 KV cache。

**核心思想：**

```
# 标准 MHA:
K = X @ W_K               # [n, d] -> [n, h, d_k]
V = X @ W_V               # [n, d] -> [n, h, d_v]
# KV cache 存储: h * d_k + h * d_v  per token

# MLA (压缩版本):
c_KV = X @ W_DKV          # [n, d] -> [n, d_c]   # 压缩到低维
K = c_KV @ W_UK           # [n, d_c] -> [n, h, d_k]  # 上投影
V = c_KV @ W_UV           # [n, d_c] -> [n, h, d_v]  # 上投影
# KV cache 只需存储: d_c per token (d_c << h * d_k)
```

**Matrix Absorption（矩阵吸收）—— 关键推理优化：**

在 decode 阶段，不需要显式重建完整 K/V。因为：

```
O = softmax(Q @ K^T / sqrt(d)) @ V
  = softmax(Q @ (c_KV @ W_UK)^T / sqrt(d)) @ (c_KV @ W_UV)
  = softmax((Q @ W_UK^T) @ c_KV^T / sqrt(d)) @ c_KV @ W_UV
```

即：Q 和 W_UK 可以预乘，V 投影 W_UV 可以推迟到输出时再乘。这样 KV cache 只需缓存低维的 `c_KV`。

**FlashMLA（DeepSeek 开源实现）：**

- 基于 FlashAttention 2/3 和 CUTLASS 的高效 MLA kernel。
- 同时支持 prefill（dense attention）和 decode（sparse page attention）。
- 稀疏 MLA prefill kernel 支持 top-k 稀疏（通过 indices 参数指定要关注的 KV token）。
- 在 Blackwell (B200) 上达到优秀的硬件利用率。

### 2.7 Ring Attention — 序列维度分布式 Attention

**动机：** 当序列长度超过单 GPU 内存容量（如 1M+ tokens），需要在多 GPU 上按**序列维度**切分 Attention。

**原理：**

```
GPU 0: Q[0:N/4], K[0:N/4], V[0:N/4]
GPU 1: Q[N/4:N/2], K[N/4:N/2], V[N/4:N/2]
GPU 2: Q[N/2:3N/4], K[N/2:3N/4], V[N/2:3N/4]
GPU 3: Q[3N/4:N], K[3N/4:N], V[3N/4:N]

# 每个 GPU 在自己的 Q 块上，做 online softmax
# 然后通过 ring 拓扑传递 K/V 块：
#   GPU 0 -> GPU 1 -> GPU 2 -> GPU 3 -> GPU 0
# 每轮计算 partial attention，更新 running max/sum
# 经过 N 轮后，每个 GPU 持有完整的 O
```

**性能关键点：**

- 通信可以**重叠**在计算上：发送当前 K/V 块的同时计算当前块的注意力。
- 通信量：每轮 `d * Bc`（K 和 V 各传一个 block），总共 N/Bc 轮。
- 相对于 head-parallelism（DeepSpeed Ulysses），Ring Attention 不受 head 数限制，可以扩展到更多 GPU。
- 在 cross-attention 场景（如多模态 LLM 的视觉特征很长），Q 小 KV 大，LV-XAttn 等变体将通信量降低到 Ring Attention 的 0.48%。

---

## 3. MoE 算子

### 3.1 概述

MoE（Mixture of Experts）层以稀疏激活的方式扩展模型容量：

```
# 每层 MoE 前向
logits = router(x)                              # [B, E], E = expert count
weights, indices = top_k(logits, k=2)            # 每 token 选 top-2 expert
weights = softmax(weights)                       # 归一化权重

# Dispatch: 将 token 分配到对应 expert
dispatched = dispatch(x, indices)                # [T_k, d], 每个 expert 上的 token

# Expert 计算（每个 expert 是独立 FFN）
expert_outputs = expert_fn(dispatched)           # 可并行

# Combine: 加权合并输出
output = combine(expert_outputs, indices, weights)
```

### 3.2 Top-k Routing + Dispatch + Combine

**Router 实现：**

```python
class Router(nn.Module):
    def __init__(self, d_model, n_experts, top_k=2):
        super().__init__()
        self.gate = nn.Linear(d_model, n_experts, bias=False)
        self.top_k = top_k

    def forward(self, x):
        # x: [B, d_model]
        logits = self.gate(x)                    # [B, n_experts]
        weights, indices = logits.topk(self.top_k, dim=-1)  # [B, k], [B, k]
        weights = F.softmax(weights, dim=-1)
        return weights, indices
```

**Dispatch 的两种实现策略：**

1. **基于 scatter/gather：** 根据 indices 将 token 重新排列到 expert 对应的连续内存中。问题是**不规则访存**——不同 token 去不同 expert，导致 HBM 访问模式低效。
2. **基于 Mask（One-hot 矩阵乘）：**
   ```python
   # 构建 dispatch mask [B, E]
   mask = F.one_hot(indices, num_classes=E).float()  # [B, k, E]
   mask = mask.sum(dim=1)                            # [B, E]
   # 对每个 expert e：取 mask[:, e] > 0 的 token
   ```

**Combine 实现：**

```python
# 每个 token 的最终输出 = sum(weight_e * expert_output_e for e in top_k)
# 实现：将 expert 输出 scatter back 到原始 token 位置
output = torch.zeros_like(x)
for e in range(n_experts):
    token_indices = (indices == e).nonzero()
    output[token_indices] += weights[token_indices] * expert_outputs[e]
```

### 3.3 Megablocks — 基于 Block Sparse 的高效 MoE

**核心思想：** 将 MoE 的计算重新表述为**块稀疏矩阵乘法（block-sparse GEMM）**。

传统 MoE Dispatch 中，每个 expert 需要独立的 GEMM，导致大量小 GEMM launch 和 HBM 带宽浪费。Megablocks 将所有 expert 的 token 拼接为一个稀疏矩阵：

```
# 所有 token 排列后：[T, d]，但根据 expert 分组
# 构建 block-sparse mask：将分组信息编码为稀疏模式
# 一次大的 block-sparse GEMM 搞定所有 expert 的计算

Megablocks block-sparse GEMM:
  out[Ti, :] = in[Ti, :] @ W_e  (对每个 expert e)
  -> 转化为: out = block_sparse_matmul(in_grouped, W_all, mask)
```

**性能关键点：**

- 相比 Tutel 的 padding 方案（补零到最大 expert 容量），Megablocks **不丢弃 token、不填充**。
- Block-sparse GEMM 的稀疏模式由 routing 动态决定，在 GPU 上需要高效的 metadata 管理。
- 在 Mixtral 8x7B 上训练加速达 40%（vs Tutel），吞吐 2.4x 优于密集模型（相同 FLOP 预算）。
- 限制：当 expert 数量很多（64+）且分布极度倾斜时，block-sparse 调度的固定 tile 大小会导致利用率下降。

### 3.4 Tutel — 优化的 MoE 通信与计算

**Tutel 的关键优化：**

1. **All-to-All 通信优化：** 在 expert parallelism 场景下，每个 GPU 持有部分 expert，需要 all-to-all 通信来路由 token。Tutel 将 all-to-all 与 FFN 计算做**重叠（overlap）**。
2. **Capacity Factor 调度：** 支持正（固定容量上限）、零（自适应）、负（自动扩展）三种 capacity factor 策略。
3. **Auxiliary Loss 管理：** 内置 load balancing loss，可配置 `a2a_ffn_overlap_degree` 控制通信与计算重叠深度。

```python
# Tutel 配置示例
moe_layer = tutel_moe.moe_layer(
    gate_type={'type': 'top', 'k': 2},
    experts={'count_per_node': 2, 'type': 'ffn'},
    model_dim=4096,
    a2a_ffn_overlap_degree=2,  # all-to-all 与一半的 GEMM 重叠
)
```

### 3.5 Expert Parallelism — 多 GPU Expert 部署

**原理：** 将不同的 expert 分配到不同的 GPU 上。每个 GPU 只计算分配给它的 expert。

```
# Token 路由流程（以 4 GPU、16 Expert、每 GPU 4 Expert 为例）
GPU 0: Expert 0-3     GPU 1: Expert 4-7
GPU 2: Expert 8-11    GPU 3: Expert 12-15

Step 1: 每个 GPU 的本地 router 计算每个 token 的目标 expert
Step 2: All-to-All 通信，将 token 发送到目标 GPU
Step 3: 每个 GPU 计算本地的 expert FFN
Step 4: All-to-All 通信，将结果送回原始 GPU
Step 5: Combine 加权合并
```

**性能关键点：**

- **通信是瓶颈**：all-to-all 的通信量正比于 token 数和 hidden dim。Expert 越多，通信占比越大。
- MoE 使用**数据并行 + expert 并行**混合：attention 层数据并行，FFN 层 expert 并行。
- 通信重叠：Tutel 和 DeepSpeed-MoE 都支持将 all-to-all 与 GEMM 计算重叠。
- **负载不均衡问题**：某些 expert 接收更多 token 导致 straggler。使用 capacity factor + auxiliary loss 缓解。

---

## 4. 融合算子

### 4.1 概述

融合算子（Fused Operators）将多个连续的 kernel 调用合并为一个，主要收益：
1. **减少 kernel launch 开销**（CUDA kernel launch latency ~5-15 us）
2. **减少 HBM 中间结果的读写**（带宽瓶颈下尤为关键）
3. **增加计算密度**（提高算术强度，从 memory-bound 转为 compute-bound）

### 4.2 Fused QKV Projection

**动机：** 标准实现中，Q、K、V 的线性投影是三个独立的 `nn.Linear` -> 三个 kernel launch + 三次 HBM 读写。

**融合方式：**

```python
# 未融合:
Q = x @ W_Q           # [B, d] -> [B, h*d_k]
K = x @ W_K           # [B, d] -> [B, h*d_k]
V = x @ W_V           # [B, d] -> [B, h*d_v]
# HBM 写入: 3x (B * h * d) 个元素

# 融合: 单次大 GEMM
QKV = x @ [W_Q | W_K | W_V]   # [B, d] -> [B, h*d_k + h*d_k + h*d_v]
# 然后 split
Q, K, V = torch.split(QKV, [h*d_k, h*d_k, h*d_v], dim=-1)
# HBM 写入: 1x (B * (2*h*d_k + h*d_v)) 个元素
```

**性能关键点：**

- 单次大 GEMM 相比三次小 GEMM：提高 Tensor Core 利用率，减少 kernel launch 3 倍。
- split 操作是纯元数据操作（view/stride 变化），几乎零开销。
- GQA/MQA 情况下 Q 的 head 数与 K/V 不同，需分别处理 W_Q 和 W_KV 融合。

### 4.3 FlashAttention + MLP 融合

**动机：** Transformer block = Attention + FFN。中间结果 `attn_out` 从 SRAM 写回 HBM，又被 FFN 读取。融合后直接在 SRAM 中完成整个 block。

**实现思路：**

```
# 标准 block（2 次 HBM 读写交界）:
attn_out = attention(Q, K, V)       # -> HBM
ffn_out = FFN(LayerNorm(attn_out))  # <- HBM (读 attn_out)
x = x + attn_out + ffn_out

# 融合 block（去掉中间 HBM 写入）:
# attention 的最后一次输出不进 HBM，直接留给 FFN
# 需要将 FFN 的第一层 GEMM 也放到同一个 kernel 中
```

**挑战：**
- Attention 和 FFN 的 tile 策略不同（attention 需要 K/V 分块流式处理，FFN 是标准 GEMM）。
- 需要额外的 shared memory 来传递 attention 输出到 FFN，增加了 SRAM 压力。
- 现有实现（NVIDIA FasterTransformer / TensorRT-LLM）在 batch=1 时收益明显，大 batch 时 tiles 策略复杂化。

### 4.4 LayerNorm + Quantization 融合

**动机：** Activation quantization 需要收集统计量（absmax 或 min/max），这些统计量通常紧跟 LayerNorm 之后的激活分布。如果先做 LayerNorm 写回 HBM，再加载做量化，浪费带宽。

**融合方式：**

```python
# 未融合:
x = layer_norm(hidden_states)  # 输出 FP16 -> HBM
# ... 后续量化
scale = x.abs().max() / 127
x_q = (x / scale).to(torch.int8)

# 融合 (LayerNorm + Quant in one kernel):
def fused_layernorm_quant(x, gamma, beta):
    # Step 1: 在 SRAM 中计算 mean/var
    mean = x.mean(dim=-1, keepdim=True)
    var = x.var(dim=-1, keepdim=True)
    # Step 2: 在 SRAM 中归一化
    x_norm = (x - mean) / torch.sqrt(var + eps) * gamma + beta
    # Step 3: 在 SRAM 中收集量化 scale
    scale = x_norm.abs().max(dim=-1, keepdim=True).values / 127.0
    x_q = (x_norm / scale).to(torch.int8)
    # 一次性写回 HBM: x_q + scale
    return x_q, scale
```

**性能关键点：**

- 消除了一次 FP16 激活值的 HBM 写入再读取（2x B*d 个元素）。
- 统计量的收集在 SRAM 中做 reduction 即可，无需额外 kernel。
- 类似的：**RMSNorm + Quant**、**LayerNorm + RoPE** 等变体同样有效。

### 4.5 RoPE + QK GEMM 融合

**动机：** RoPE（Rotary Position Embedding）需要在 Q 和 K 上应用旋转矩阵，然后将 Q 和 K^T 做矩阵乘。拆分做的话：Q/K 旋转 -> HBM 写 -> QK GEMM 读。

**融合方式：**

```
# 融合 kernel: RoPE -> QK 点积 (不写中间结果)

1. 加载 Q tile 和 K tile 到 SRAM
2. 在 SRAM 中计算旋转后的 Q'' 和 K''
   Q''[i, :d/2] = Q[i, :d/2]*cos(theta_i) - Q[i, d/2:]*sin(theta_i)
   Q''[i, d/2:] = Q[i, :d/2]*sin(theta_i) + Q[i, d/2:]*cos(theta_i)
3. 直接计算 S = Q'' @ K''^T
4. 继续 softmax -> attn_out
```

**性能关键点：**

- RoPE 的 cos/sin 值可以预计算并缓存在 constant memory。
- 融合后消除中间矩阵的 HBM 读写（2x B*d 个元素）。
- 特别在 decode 阶段（batch=1），RoPE 占比显著，融合收益更大。

### 4.6 GEMM + Activation + Bias 融合

**动机：** FFN 中常见模式 `y = Act(x @ W^T) + bias`，拆分会导致中间结果写回 HBM。

**典型模式：**

```
# SwiGLU FFN:
gate = x @ W_gate            # GEMM
up = x @ W_up                # GEMM
hidden = SiLU(gate) * up     # element-wise
out = hidden @ W_down        # GEMM

# 融合后 (Fused SwiGLU):
# gate 和 up 的 GEMM 融合为一个，减少一次重读 x 的 HBM 带宽
fused_result = x @ [W_gate | W_up]   # 单次 GEMM
gate, up = split(fused_result)
hidden = SiLU(gate) * up              # SRAM 中完成
```

**NVIDIA 的实现（FasterTransformer Gated FFN kernel）：**

- 将 `W_gate` 和 `W_up` 拼接为 `[W_gate; W_up]`，单次 GEMM 计算。
- Activation（SiLU/GELU）在寄存器中计算，与 element-wise multiply 融合。
- Bias add 也融合到同一 kernel 中：`out += bias`。

**性能关键点：**

- 融合后 GEMM 形状更大（d_model -> 2* intermediate_size），Tensor Core 利用率更高。
- 消除了 `x` 的第二次加载（原本 gate 和 up 各加载一次 x）。
- 如果模型使用 FP8 推理，W8A8 GEMM + dequant + activation 也可以融合。

---

## 5. 推测解码算子

### 5.1 概述

自回归解码的瓶颈：每步生成一个 token，需要串行执行完整模型前向。推测解码通过**草稿 + 验证**范式打破此瓶颈。

**基本流程：**

1. **Draft（提议）：** 用一个轻量模型或头快速生成 K 个候选 token。
2. **Verify（验证）：** 目标模型并行 forward 这 K 个 token，一次前向验证整个序列。
3. **Accept（接受）：** 从验证结果中选择最长可接受前缀，丢弃其余。

### 5.2 Speculative Decoding — 标准草稿-验证框架

**数学基础：**

- 草稿模型 `M_q` 生成 K 个 token：`x_{t+1}, ..., x_{t+K} ~ M_q(*|x_{<=t})`
- 目标模型 `M_p` 验证：一次 forward 计算所有位置的概率分布 `p(*|x_{<=t}, x_{t+1}, ...)`
- **拒绝采样**保证输出分布与 `M_p` 完全一致（lossless）：
  ```
  for i in 1..K:
    r ~ uniform(0, 1)
    if r < min(1, p(x_{t+i}) / q(x_{t+i})):
      accept, continue
    else:
      # resample from adjusted distribution
      break
  ```

**算子实现要点：**

```python
# 并行验证的核心：一次 forward 计算出所有 draft token 位置的 logits
# 利用 causal mask 保证正确性
def verify(draft_tokens, kv_cache):
    # draft_tokens: [K] --- 欲验证的 K 个 token
    # 将 draft tokens 拼接到已有序列后
    all_tokens = concat(prev_tokens, draft_tokens)  # [prompt_len + K]

    # 一次 forward 计算所有 token 的 logits
    logits = model.forward(all_tokens, kv_cache)  # [prompt_len + K, vocab]

    # 取出每个 draft token 位置的目标分布和草稿分布
    for i in range(K):
        p_i = softmax(logits[prompt_len + i - 1])  # 目标模型分布
        q_i = draft_probs[i]                        # 草稿模型分布
        # 拒绝采样检查
        if accept(p_i, q_i, draft_tokens[i]):
            accepted += 1
        else:
            break
    return accepted_count
```

**性能关键点：**

- **加速比上限：** `E[加速比] = (1 - gamma^K) / (1 - gamma) / (1 + K/verification_cost)`，其中 gamma 是每步接受率。
- 实际部署中 `K` 通常取 3-7，过大会导致验证成本的边际收益递减。
- 草稿模型和目标模型的分布差异过大时接受率低，建议分布对齐（distill）。
- N-gram 草稿（基于 prompt 中的模式匹配）不需要额外模型，在摘要等场景接受率可达 60-80%。

### 5.3 Medusa — 多解码头 + Tree Attention

**核心创新：** 在目标模型顶部分支多个**轻量解码头**（不依赖独立草稿模型），每个头预测一个未来位置的 token。

```
# Medusa 架构
Last Hidden State h_t  (d_model)
         |
    +----+----+----+
    |    |    |    |
Head 0  Head1 Head2 Head3  (每个头 = MLP + LayerNorm)
    |    |    |    |
  t+1   t+2  t+3  t+4     (预测位置)
```

**Tree Attention — 关键算子：**

- 每个头产生 top-5 候选 token -> 构建候选树的组合空间。
- 例如 Head0 选 5 个候选，Head1 从每个候选再选 5 个 -> 总共 5^3=125 个候选路径。
- **Tree Attention Mask**：通过非平凡的 causal mask 允许树内并行计算注意力。

```
# Tree Attention Mask 示例（简化）：
# 根节点 r, 子节点 a, b (来自 r), 孙节点 c (来自 a), d (来自 b)
# Mask:
#   r  a  b  c  d
# r 1  0  0  0  0
# a 1  1  0  0  0
# b 1  0  1  0  0   <- b 看不到 a
# c 1  1  0  1  0   <- c 只能看到 a 路径
# d 1  0  1  0  1   <- d 只能看到 b 路径
```

**验证与接受：**

- 单次 forward 计算出所有候选路径的 logits。
- 标准的拒绝采样或者 **typical acceptance**（设定概率阈值，避免过度拒绝）。
- **贪婪解码**下：选择 logits 与草稿一致的若干前缀中最长的那条。

**性能数据：**

| 版本 | 训练方式 | 加速比 | 精度损失 |
|------|----------|--------|----------|
| Medusa-1 | 只训练 head（冻结 backbone） | 2.2x | 无（lossless） |
| Medusa-2 | 联合训练 backbone + head | 2.3-3.6x | 可忽略 |

**实现要点：**

```python
# Medusa 树状注意力 forward
def medusa_tree_attention(q, k, v, tree_mask):
    # q: [B, total_candidates, h, d_k]
    # tree_mask: [total_candidates, total_candidates]

    scores = torch.einsum("bthd,bshd->bhts", q, k) / sqrt(d_k)
    scores = scores.masked_fill(~tree_mask, float('-inf'))
    attn = torch.softmax(scores, dim=-1)
    out = torch.einsum("bhts,bshd->bthd", attn, v)
    return out

# 路径验证
logits = model(input_ids)  # [B, total_candidates, vocab]
for path in candidate_paths:
    # 检查路径上的每个 token 是否被接受
    if all(verify_token(logits[:, pos, :], path_tokens[pos]) for pos in path):
        longest_accepted = path
```

### 5.4 并行验证算子（Rejection Sampling / Typical Acceptance）

**核心算子的 CUDA 实现思路：**

```python
# 并行验证 kernel (伪代码)
@cuda.jit
def verify_kernel(
    draft_tokens,      # [batch, K] --- 每个请求的草稿 token
    target_logits,     # [batch, K+1, vocab] --- 目标模型 logits
    draft_probs,       # [batch, K, vocab] --- 草稿模型概率
    accepted_count,    # [batch] --- 输出：接受的 token 数
    rng_states,        # 随机数状态
):
    bid = cuda.blockIdx.x  # batch 维度并行
    for pos in range(K):
        token = draft_tokens[bid, pos]
        p = softmax_one(target_logits[bid, pos])
        q = draft_probs[bid, pos]

        # 拒绝采样判断
        r = rand(rng_states)
        if r < min(1.0, p[token] / q[token]):
            accepted_count[bid] += 1
        else:
            # 不接受的 token，从分布 max(0, p - q) 重新采样
            break
```

**性能关键点：**

- 验证是 **embarrassingly parallel**（每个 batch 位置独立），非常适合 GPU 并行。
- Batched verification：将多个请求的 draft tokens 拼在一起，共用一次目标模型 forward。
- 在 batch size 较大时（>16），推测解码的收益递减，因为目标模型已经充分利用 GPU 资源了。

---

## 场景化选择指南

### 推荐方案速查

| 场景 | 推荐量化方案 | 推荐 Attention | 推荐 MoE 策略 | 可考虑加速 |
|------|-------------|----------------|---------------|-----------|
| 高吞吐在线服务 (H100) | FP8 W8A8 + FP8 KV Cache | FlashAttention-3 + PagedAttention | Megablocks + Expert Parallelism | 连续批处理 |
| 低成本部署 (A100/RTX 4090) | AWQ INT4 W4A16 | FlashAttention-2 + PagedAttention | Tutel + Capacity Factor | Medusa-1 |
| 边缘端/CPU | GGUF Q4_K_M | 滑动窗口 Attention | --- | N-gram 推测 |
| 超长上下文 (100K+) | FP8 KV Cache 或 INT4 KV Cache (KIVI) | FlashAttention-2/3 + Ring Attention | --- | Prefix Caching |
| 大批量离线推理 | INT8 W8A8 (SmoothQuant) | FlashAttention-2 | Megablocks block-sparse | Speculative Decoding |

### 实现优先级

从工程实施角度，建议的算子实现优先级：

1. **第一优先级（基座必须）：** Fused QKV Projection → FlashAttention-2/3 → PagedAttention → INT8/FP8 量化
2. **第二优先级（吞吐优化）：** Fused SwiGLU (GEMM+Act+Bias) → KV Cache 量化 → Continuous Batching
3. **第三优先级（高级优化）：** LayerNorm+Quant 融合 → RoPE+QK 融合 → Medusa Tree Attention
4. **第四优先级（分布式/极大规模）：** Expert Parallelism → Megablocks/Tutel → Ring Attention → MLA

---

## 结语与下一步

### 五条核心经验

1. **量化是最快见效的手段**——INT4 在 decode 阶段直接给 ~2× 速度提升，F8 在 H100 上几乎零精度损失。优先从 KV Cache 量化开始，收益立竿见影。
2. **FlashAttention 是长上下文的必选项**——从 FA1 到 FA3 每一代翻倍的性能提升证明 IO-aware 算法的威力。如果你还在用 PyTorch 的 `scaled_dot_product_attention` 且序列超过 4K，切换到 FA2/FA3 是性价比最高的优化。
3. **融合算子收益被低估了**——LayerNorm+Quant 融合和 RoPE+QK 融合在 decode 阶段节省 30-50% 的 HBM 访存，而实现难度远低于写一个新的注意力 kernel。
4. **MoE 的核心矛盾是通信 vs 计算**——Megablocks 的 block-sparse 方案在单机多卡场景表现优异，但跨机部署时 all-to-all 通信依然是瓶颈。优先用 capacity factor + 通信重叠来缓解。
5. **推测解码与量化有隐藏交互**——KV Cache 量化会轻微改变 logit 分布，可能使 draft token 接受率下降 0.3-1.5 个百分点。如果同时启用，务必重新调优 num_speculative_tokens。

### 推荐的学习与实践路径

如果你希望进一步深入推理优化，以下路径可以参考：

```
1. 基础搭建（1-2 周）
   ├── 用 vLLM 部署一个量化模型（AWQ INT4 或 FP8）
   ├── 理解 PagedAttention 的内存管理
   └── 用 Nsight Compute 分析 kernel 的 roofline

2. 内核优化（2-4 周）
   ├── 用 Triton 实现一个 fused Layernorm + RoPE kernel
   ├── 对比未融合 vs 融合的 HBM 访存差异
   └── 动手实现一个简单的 SmoothQuant

3. 高级实战（4-8 周）
   ├── 在 H100 上部署 FP8 FlashAttention-3
   ├── 配置 MoE 模型并调优 capacity factor
   └── 接入 Medusa 或自训练一个草稿模型做推测解码
```

### 延伸阅读

- 📖 [FlashAttention 系列论文](https://arxiv.org/abs/2205.14135) — IO-aware 算法的开山之作，三篇连读理解演进
- 📖 [vLLM 源码](https://github.com/vllm-project/vllm) — 生产级推理引擎，看它如何混合 cuBLAS + Triton + 自研 kernel
- 📖 [DeepSeek-V2 技术报告](https://arxiv.org/abs/2405.04434) — MLA 的原型，理解低秩 KV cache 的精妙设计
- 📖 [Megablocks 论文](https://arxiv.org/abs/2211.15841) — Block-sparse MoE 的高效实现
- 📖 [SmoothQuant 论文](https://arxiv.org/abs/2211.10438) — W8A8 量化的实用指南
- 🔧 [FlashMLA (DeepSeek 开源)](https://github.com/deepseek-ai/FlashMLA) — Blackwell 上的高效 MLA kernel
- 🔧 [TensorRT-LLM](https://github.com/NVIDIA/TensorRT-LLM) — NVIDIA 官方推理优化套件，融合算子参考实现

推理优化不是买一张更贵的 GPU 就能解决的问题。真正优雅的推理引擎，是量化精度与模型质量的精妙平衡，是 FlashAttention 里每一轮 tiling 与 online softmax 的数学等价变换，是融合算子中每一比特 HBM 访存的锱铢必较。**从理解这些算子开始，你就有了驾驭大模型"最后一公里"的能力。** 🚀

---

*文档生成日期：2026年6月*
*参考来源：FlashAttention 系列论文、vLLM 源码、DeepSeek 技术报告、Megablocks/Tutel 论文、Medusa 论文、NVIDIA TensorRT-LLM 文档、SmoothQuant 论文、vLLM 文档等。*
