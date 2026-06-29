---
title: "量化算子从入门到实践：INT8/INT4/FP8 全面指南"
date: 2026-06-29
tags: [量化, INT8, INT4, FP8, GPTQ, AWQ, 推理优化]
---

当你的 LLM 跑在 8×A100 上依然 OOM，当推理延迟死活压不进 100ms，当你想把 70B 模型塞进单张消费级显卡——**量化（Quantization）** 是解决这些问题最成熟的武器。从 INT8 的 Tensor Core 加速到 INT4 的内存减半，再到 FP8 的硬件原生支持，量化技术栈在过去三年里飞速成熟。这篇指南将带你深入每种量化技术的底层原理、算法实现和工程实践，从量化公式到 CUDA 伪代码，从 GPTQ 的 Hessian 矩阵到 FP8 的 scale 管理，一站讲透。

<!--more-->

---

## 1. 🎯 量化的直觉：为什么需要量化？

### 1.1 精度 vs 速度的终极 tradeoff

大模型推理的核心瓶颈有两个：**内存带宽**（权重加载速度）和**计算吞吐**（GEMM 计算速度）。量化同时优化两者：

| 精度格式 | 每参数比特 | 相比 FP16 内存节省 | Tensor Core 相对吞吐 | 典型 perplexity 损失 |
|----------|-----------|-------------------|---------------------|---------------------|
| FP16 | 16 bit | 1× (baseline) | 1× | 0% |
| INT8 | 8 bit | 2× | ~2× | < 0.5% |
| FP8 E4M3 | 8 bit | 2× | ~2× | < 0.3% |
| INT4 (GPTQ/AWQ) | 4 bit | 4× | ~1× (decode 受带宽限制) | < 1% MMLU |
| NF4 | 4 bit | 4× | ~1× | < 1% (QLoRA 训练) |
| INT2 | 2 bit | 8× | ~ | > 3% (实验性) |

量化的直觉很简单：**权重/激活值中携带的信息远多于 16 位浮点所能表达的精度需求**。一个 FP16 权重的高 5 位指数和低 11 位尾数中，真正对模型输出有影响的往往是高位部分。量化就是找到一种"足够好"的低位映射，在尽可能保留信息的同时砍掉冗余比特。

量化误差的来源可以分解为两个部分：

1. **Clipping error（截断误差）**：超出量化范围的极值被截断（clamp）
2. **Rounding error（舍入误差）**：量化区间内的值被四舍五入到最近的量化等级

$$
\text{Total Error} = \underbrace{\sum_{i: x_i > x_{max}} (x_i - x_{max})^2}_{\text{clipping}} + \underbrace{\sum_{i: x_i \leq x_{max}} (x_i - \hat{x}_i)^2}_{\text{rounding}}
$$

不同的量化方法本质上就是在优化这两个误差的平衡——减小 clipping 就会增大 rounding（因为量化步长变大），反之亦然。

### 1.2 量化操作的全景图

从算子层面看，一个量化过程包含三个核心操作：

```
FP16 权重/激活 → [Quantize] → INT8/INT4/FP8 → [Compute] → INT32/FP16 → [Dequantize] → FP16 输出
```

- **Quantize**：高精度 → 低位宽的映射（包含 scale 计算 + rounding + clamping）
- **Compute**：在低位宽下做矩阵乘法（GEMM 或 GEMV）
- **Dequantize**：将低位宽结果还原回高精度（包含 scale 恢复）

这些操作可以**融合**进 GEMM kernel 中，避免额外的 HBM 读写。下面我们从最经典的 INT8 量化开始。

---

## 2. 🔢 INT8 量化：最成熟的量化方案

### 2.1 对称 vs 非对称量化

INT8 量化有两种基本的映射方式，它们的区别在于是否使用 zero_point。

#### 对称量化（Symmetric Quantization）

```
q = clamp(round(x / scale), -127, 127)
scale = max(|x|) / 127
```

对称量化将 FP16 范围映射到 `[-127, 127]`（有符号 INT8），zero_point 恒为 0。优点是 GEMM kernel 实现简单——不需要做 zero_point 的 offset 补偿。缺点是如果数据分布不对称（比如 ReLU 后的激活值都是正的），会浪费一半的表示范围。

```python
def quantize_symmetric(x: torch.Tensor) -> tuple:
    """对称量化：将 FP16 张量映射到 INT8 [-127, 127]"""
    scale = x.abs().max() / 127.0
    q = torch.clamp(torch.round(x / scale), -127, 127).to(torch.int8)
    return q, scale

def dequantize_symmetric(q: torch.Tensor, scale: float) -> torch.Tensor:
    """对称反量化：将 INT8 恢复为 FP16"""
    return q.to(torch.float16) * scale
```

#### 非对称量化（Asymmetric / Affine Quantization）

```
q = clamp(round(x / scale) + zero_point, 0, 255)
scale = (x_max - x_min) / 255
zero_point = round(-x_min / scale)
```

非对称量化使用 zero_point 偏移，将 FP16 范围映射到 `[0, 255]`（无符号 UINT8），完整利用了全部 256 个量化等级。缺点是 GEMM 计算需要额外处理 zero_point：

$$
Y = s_X \cdot s_W \cdot (q_X - z_X) \cdot (q_W - z_W) = s_X \cdot s_W \cdot (q_X q_W - q_X z_W - z_X q_W + z_X z_W)
$$

多出来的 `q_X * Z_W` 和 `Z_X * q_W` 项需要额外的计算和内存开销。

```python
def quantize_asymmetric(x: torch.Tensor) -> tuple:
    """非对称量化：将 FP16 张量映射到 UINT8 [0, 255]"""
    x_min, x_max = x.min(), x.max()
    scale = (x_max - x_min) / 255.0
    zero_point = torch.round(-x_min / scale)
    q = torch.clamp(torch.round(x / scale) + zero_point, 0, 255).to(torch.uint8)
    return q, scale, zero_point

def dequantize_asymmetric(q: torch.Tensor, scale: float, zero_point: int) -> torch.Tensor:
    """非对称反量化"""
    return (q.to(torch.float16) - zero_point) * scale
```

**实战选择：** 对于经过 LayerNorm 的权重（分布近似对称，均值接近 0）使用对称量化；对于 ReLU/SiLU 后的激活值（全为正）使用非对称量化。实际推理引擎中，对称量化更常见，因为 kernel 实现更简洁。

### 2.2 Per-Tensor vs Per-Channel vs Per-Group 粒度

量化粒度决定了**每多少个元素共享一个 scale/zero_point**。粒度越细，量化误差越小，但 scale 的存储和计算开销越大。

```
Per-Tensor:    1 scale 对整个张量  → 存储成本 O(1)，量化误差最大
Per-Channel:   1 scale 每输出通道 → 存储成本 O(C_out)，LLM 主流选择
Per-Group:     1 scale 每 G 个元素 → 存储成本 O(N/G)，精度最好
```

```python
# Per-tensor: 整个权重矩阵一个 scale
w_scale = w.abs().max() / 127.0
w_q = (w / w_scale).round().clamp(-127, 127).to(torch.int8)

# Per-channel: 每输出通道一个 scale
# w.shape = [C_out, C_in]
w_scales = w.abs().max(dim=1).values / 127.0  # [C_out]
w_q = (w / w_scales.view(-1, 1)).round().clamp(-127, 127).to(torch.int8)

# Per-group: 每 group_size 个元素一个 scale
# w.shape = [C_out, C_in], group_size = 128
w_reshaped = w.view(C_out, -1, group_size)  # [C_out, num_groups, group_size]
w_scales = w_reshaped.abs().max(dim=-1).values / 127.0  # [C_out, num_groups]
```

**对 GEMM 的影响：** Per-tensor 最简单，但精度最低（一个 outlier 会压缩所有其他值）。Per-channel 是 LLM INT8 量化的主流选择，scale 可以在 kernel 内预加载到寄存器。Per-group 精度最高但 scale 数量多，通常需要放在 shared memory 中做 prefetch，避免寄存器压力过大。

### 2.3 量化/反量化算子的 CUDA 实现

下面是一个 per-tensor 对称量化的 CUDA kernel 伪代码。重点是**融合**思想——将量化操作嵌入到 GEMM 的 epilogue 中，避免显式的反量化 kernel。

#### 量化 Kernel

```cuda
// INT8 对称量化 kernel: FP16 → INT8
// 每个线程处理 4 个元素，使用 half2 向量化加载
__global__ void quantize_int8_symmetric_kernel(
    const half* __restrict__ x,   // FP16 输入 [N]
    int8_t* __restrict__ q,       // INT8 输出 [N]
    float* __restrict__ scale,    // 输出 scale
    int N
) {
    // 第一步：在 block 内计算 max(abs(x))
    extern __shared__ float s_max[];
    float local_max = 0.0f;
    
    for (int i = threadIdx.x; i < N; i += blockDim.x) {
        float val = __half2float(x[i]);
        local_max = fmaxf(local_max, fabsf(val));
    }
    s_max[threadIdx.x] = local_max;
    __syncthreads();
    
    // 并行归约：blockDim.x 个值归约为 1 个
    for (int s = blockDim.x / 2; s > 0; s >>= 1) {
        if (threadIdx.x < s) {
            s_max[threadIdx.x] = fmaxf(s_max[threadIdx.x], s_max[threadIdx.x + s]);
        }
        __syncthreads();
    }
    
    if (threadIdx.x == 0) {
        float absmax = s_max[0];
        *scale = absmax / 127.0f;
    }
    __syncthreads();
    
    // 第二步：量化（每个线程处理 4 个 half = 2 个 half2）
    float s = (*scale);
    float inv_scale = 1.0f / s;
    
    for (int i = threadIdx.x; i < N; i += blockDim.x) {
        float val = __half2float(x[i]);
        int q_val = __float2int_rn(val * inv_scale);  // round to nearest
        q_val = max(-127, min(127, q_val));           // clamp to [-127, 127]
        q[i] = (int8_t)q_val;
    }
}
```

#### 融合反量化的 GEMM 伪代码

真正的 INT8 GEMM 不会单独做反量化——它融合在 `cublasLtMatmul` 或自定义 CUTLASS kernel 中：

```cuda
// 伪代码：INT8 GEMM + 反量化融合
// C = alpha * (A_q - zp_A) * scale_A * (B_q - zp_B) * scale_B + beta * C_fp16

// 在 CUTLASS 中，这通过 epilogue 的 DequantizeOp 实现：
struct DequantizeOp {
    float scale_a, scale_b;
    int32_t zp_a, zp_b;
    
    __device__ float operator()(int32_t acc, int, int) const {
        // acc = A_q * B_q (INT32 点积结果)
        // 反量化 + zero_point 补偿
        float result = (float)acc * scale_a * scale_b;
        // 简化：假设对称量化，zp_a = zp_b = 0
        return result;
    }
};
```

整个流程：

```
输入: A_fp16 [M, K], B_fp16 [K, N]
  ↓ 量化后
A_int8 [M, K], scale_A, B_int8 [K, N], scale_B
  ↓ Tensor Core INT8 GEMM (DP4A 指令)
C_int32 [M, N]   ← 每个 INT32 元素 = sum(A_int8 * B_int8)
  ↓ epilogue 中反量化
C_fp16 [M, N] = C_int32 * scale_A * scale_B
```

### 2.4 QAT vs PTQ：训练时量化 vs 训练后量化

| 维度 | PTQ (Post-Training Quantization) | QAT (Quantization-Aware Training) |
|------|----------------------------------|-----------------------------------|
| 流程 | 训练完模型 → 少量 calibration 数据 → 直接量化 | 训练/微调中模拟量化噪声 → Fine-tune 权重适应量化 |
| 数据需求 | 128-1024 条无标签校准样本 | 完整训练集或有标签数据 |
| 时间 | 几分钟到几小时 | 数天到数周（需要重新训练） |
| 精度 | INT8 通常 < 0.5% 损失；INT4 需要 GPTQ/AWQ 辅助 | 接近 FP16 baseline |
| 适用 | 推理部署，快速上线 | 对精度极度敏感的场景 |

**PTQ 的核心挑战**：离线收集激活值的 min/max 统计量，但校准数据的选择会影响量化参数。

```python
# PTQ 流程：收集统计量
def ptq_calibrate(model, calib_loader, quant_granularity='per_channel'):
    model.eval()
    
    # 注册 hook 收集每层激活值的统计量
    activations = {}
    def hook_fn(name):
        def hook(module, input, output):
            # 收集激活值 min/max 用于校准 scale
            act = input[0].detach()
            activations[name] = {
                'min': act.min(dim=0).values,
                'max': act.max(dim=0).values
            }
        return hook
    
    # 注册 hooks...
    with torch.no_grad():
        for batch in calib_loader:
            model(batch)  # 前向传播收集激活统计
    
    # 计算量化参数
    for name, stats in activations.items():
        x_min, x_max = stats['min'], stats['max']
        scale = (x_max - x_min) / 255.0
        zero_point = torch.round(-x_min / scale)
        # 存储量化参数...
```

**QAT 的核心挑战**：量化操作的不可导性（round 函数的梯度几乎处处为 0）。解决方案是 **Straight-Through Estimator (STE)**——前向用真实的量化，反向用 fake gradient（将 round 的梯度近似为 1）：

```python
# QAT 中的 STE 伪代码
class FakeQuantize(torch.autograd.Function):
    @staticmethod
    def forward(ctx, x, scale, zero_point, qmin, qmax):
        # 前向：真实量化 + 反量化（模拟量化噪声）
        q = torch.clamp(torch.round(x / scale) + zero_point, qmin, qmax)
        dq = (q - zero_point) * scale
        return dq
    
    @staticmethod
    def backward(ctx, grad_output):
        # 反向：STE——梯度直接通过（跳过 round 的不可导）
        return grad_output, None, None, None, None
```

PyTorch 2.x 中的 `torch.ao.quantization` 和 `torch.ao.quantization.qconfig` 已对 PTQ 和 QAT 提供完整支持，推荐直接使用。

---

## 3. 🧊 INT4 量化：省显存的利器

INT4 量化将每个权重压缩到 4 bit（半字节），相比 FP16 节省 **4 倍** 内存。对于 70B 模型，FP16 权重需要 ~140GB，INT4 只需要 ~35GB——这意味着单张 A100-80G 就能运行。

但 INT4 的量化误差远大于 INT8，需要更复杂的**误差补偿**策略。目前两大主流方案是 GPTQ 和 AWQ。

### 3.1 GPTQ：Hessian-Aware 量化

GPTQ（GPT Post-Training Quantization）基于**最优脑手术框架（Optimal Brain Surgeon, OBS）**，核心思想是：量化的误差不应该被忽略，而应该**传播到后续未量化的列**来补偿。

**原理推导：**

假设 $W \in \mathbb{R}^{d_{out} \times d_{in}}$，量化第 $i$ 列 $W_{:,i}$ 产生量化误差 $\delta_i = \hat{W}_{:,i} - W_{:,i}$。标准 OBS 框架告诉我们，对于一个已经训练好的模型，参数扰动 $\delta$ 导致的输出二阶损失近似为：

$$
L(\delta) = \delta^T H \delta
$$

其中 $H = 2 \cdot X^T X$ 是 Hessian 矩阵（$X$ 是输入激活值）。GPTQ 逐列量化权重，并将误差按 Hessian 逆分布到剩余未量化列：

```python
# GPTQ 伪代码：逐列量化 + Hessian 误差补偿
def gptq_quantize(W: torch.Tensor, H: torch.Tensor, group_size: int = 128):
    """
    W: 权重矩阵 [d_out, d_in]
    H: Hessian 矩阵 = 2 * X^T X + lambda * I  [d_in, d_in]
    """
    # Cholesky 分解 H 的逆
    H_inv = torch.linalg.cholesky(H)
    H_inv = torch.cholesky_inverse(H_inv)
    
    W_hat = W.clone().float()
    
    # 按 group 逐块量化
    for group_start in range(0, W.shape[1], group_size):
        group_end = min(group_start + group_size, W.shape[1])
        
        for col in range(group_start, group_end):
            # 量化当前列
            w_col = W_hat[:, col]
            scale = w_col.abs().max() / 7.0  # INT4 对称量化 [-7, 7]
            q_col = torch.clamp(torch.round(w_col / scale), -7, 7).to(torch.int8)
            
            # 量化误差
            err = w_col - q_col.float() * scale  # [d_out]
            
            # Hessian 逆矩阵对当前列的影响
            h_inv_col = H_inv[col, col]  # 标量
            
            if h_inv_col > 1e-8:
                # 将误差分配到剩余列：err * H_inv[col, col:] / H_inv[col, col]
                delta = err.unsqueeze(1) * H_inv[col, col:group_end].unsqueeze(0) / h_inv_col
                W_hat[:, col:group_end] -= delta
    
    return W_hat  # 剩余的未量化列已被误差补偿调整
```

**关键实现细节：**

1. **Hessian 计算**：$H = 2X^TX + \lambda I$，其中 $X$ 是从 calibration dataset 收集的激活值（shape `[num_samples * seq_len, d_in]`），$\lambda$ 是 damping 系数（通常 $\lambda = 0.01 \cdot \text{trace}(X^TX)/d_{in}$）。

2. **逐列量化 vs 逐块量化**：上面代码对每列独立计算 scale（finest granularity），但实际中常用 **group-wise**（每 128 列共享一个 scale）以减少 scale 存储开销。

3. **Latency 瓶颈**：Hessian 逆矩阵的计算是 $O(d_{in}^3)$，对于 d_in=4096 的 LLaMA 层，单层就需要数分钟。实际实现使用 Cholesky 分解 + 反向替换来数值稳定地求解。

**Marlin Kernel：** GPTQ 的推理 backend 由 Marlin kernel 实现，它将 INT4 权重以 `group_size × 16` 的 tile 格式重排，支持在寄存器内解包并利用 Tensor Core：

```python
# Marlin kernel 的核心思想（伪代码）
# 对每个 16x16 的 FP16 block:
#   1. 从 INT4 权重加载 4 个 INT4 值 → 打包为 1 个 INT32
#   2. 根据 scale 反量化为 FP16
#   3. 使用 mma.sync.aligned.m16n8k16 指令做 FP16 GEMM
# scale 预取到 shared memory，减少 HBM 访问
```

### 3.2 AWQ：Activation-Aware 量化

AWQ（Activation-Aware Weight Quantization）的出发点是一个关键观察：**权重中约 1% 的通道（salient channels）对模型精度至关重要**。这些通道的特点是：对应的激活值有非常大的幅度。

AWQ 的解决方案不是保留这些通道为 FP16（这会破坏统一的 INT4 GEMM），而是通过**按通道缩放（per-channel scaling）**来保护它们：

```python
# AWQ 核心：寻找最优缩放因子 s
# 对每个输出通道:
#   W'' = W * s,  x'' = x / s
# 量化 W'' 时，salient channel 的值会相对缩小，量化误差也减小
# 同时 x'' 的值被放大，但 x (FP16) 本身不会溢出

def awq_optimal_scaling(W: torch.Tensor, X: torch.Tensor, alpha: float = 0.5):
    """
    AWQ 寻找最优 per-channel 缩放因子
    W: [d_out, d_in] 权重
    X: [n_samples, d_in] 校准集激活值
    alpha: 迁移强度
    """
    # 分两步：
    # 1. 计算 per-channel 激活幅度
    act_scale = X.abs().mean(dim=0)  # [d_in]
    
    # 2. 对每个候选缩放因子 s，评估量化后的精度损失
    best_s = torch.ones(d_in)
    
    # 搜索空间：s ∈ [0.5, 1.0], step=0.01
    for s_candidate in torch.arange(0.5, 1.01, 0.01):
        # 按通道缩放
        W_scaled = W * s_candidate  # [d_out, d_in]
        X_scaled = X / s_candidate  # [n_samples, d_in]
        
        # 量化 W_scaled
        scale = W_scaled.abs().max() / 7.0
        W_q = torch.clamp(torch.round(W_scaled / scale), -7, 7)
        W_deq = W_q * scale
        
        # 评估损失：||X * W - X_scaled * W_deq||
        out_original = X @ W.T
        out_quantized = X_scaled @ W_deq.T
        loss = (out_original - out_quantized).pow(2).mean()
        
        # 选择使 loss 最小的 s
        # ...
    
    return best_s
```

**AWQ vs GPTQ 对比：**

| 维度 | GPTQ | AWQ |
|------|------|-----|
| 核心原理 | Hessian 逆矩阵误差补偿 | Activation-aware 通道保护 |
| 校准时间 | 小时级（需计算 Hessian 逆） | 分钟级（只需搜索缩放因子） |
| 精度 (INT4) | MMLU 损失 ~0.8% | MMLU 损失 ~0.5% |
| 共享推理 kernel | Marlin | Marlin（格式兼容） |
| 额外开销 | Hessian 矩阵存储 $O(d_{in}^2)$ | 缩放因子 $O(d_{in})$ |

两者的关系不是互斥的——实践中可以**组合使用**：先用 AWQ 做缩放保护，再用 GPTQ 做误差补偿。

### 3.3 Group-Wise 量化的 Block 大小选择

Group-wise 量化将权重矩阵划分为 `[d_out, d_in / group_size]` 个组，每组共享一个 scale。group_size 的选择是精度 vs 存储开销的 tradeoff：

| group_size | Scale 存储开销 (bits/param) | 精度 | 典型场景 |
|-----------|---------------------------|------|---------|
| 32 | 2 bit (FP16 scale) | 最高（接近 FP16） | 小模型、精度敏感层 |
| 64 | 1 bit | 高 | 中等规模 |
| 128 | 0.5 bit | 良好 | **默认推荐** |
| 256 | 0.25 bit | 可接受 | 大模型、内存极度受限 |
| 512 | 0.125 bit | 较差 | 实验性 |

```python
# Group size 对 scale 存储开销的计算
# 假设 FP16 scale (2 bytes), INT4 权重 (0.5 byte)
# group_size = 128 时:
#   每 128 个权重 (64 bytes) + 1 个 scale (2 bytes) = 66 bytes
#   有效比特率 = 66 * 8 / 128 = 4.125 bits/param (比纯 4 bit 多 3%)
#
# group_size = 32 时:
#   每 32 个权重 (16 bytes) + 1 个 scale (2 bytes) = 18 bytes
#   有效比特率 = 18 * 8 / 32 = 4.5 bits/param (多 12.5%)
```

**layer-wise 自适应 group size：** 更高级的策略是对不同 layer 使用不同的 group size。Attention 的 QKV 投影层对精度更敏感，可以用更小的 group_size（如 64）；FFN 的下投影层容错更强，可以用更大的 group_size（如 256）。这种异构分配在同等精度下可以额外减少 5-10% 的内存占用。

### 3.4 NF4 (NormalFloat4) 在 QLoRA 中的应用

NF4（NormalFloat4）是 QLoRA 中提出的非均匀 4-bit 量化格式，专门为**正态分布的权重**设计。与均匀量化的 INT4 不同，NF4 的量化等级在值域上**非均匀分布**——在 0 附近密集，在两端稀疏：

```python
# NF4 的非均匀量化等级（共 16 个等级）
# 假设权重 z ~ N(0, 1)，NF4 将 N(0,1) 分成 16 个等概率区间
# 然后取每个区间的中位数作为量化值

def create_nf4_levels():
    """创建 NF4 的 16 个量化等级"""
    # 标准正态分布的 16 等分分位数
    import scipy.stats as stats
    num_levels = 16
    quantiles = torch.linspace(0, 1, num_levels + 1)
    # 取量化区间的中位点
    levels = torch.tensor([
        stats.norm.ppf((quantiles[i] + quantiles[i+1]) / 2)
        for i in range(num_levels)
    ])
    # 归一化到 [-1, 1]
    levels = levels / levels.abs().max()
    return levels.to(torch.float16)
```

**NF4 的量化过程（双重重定标）：**

```
原始权重 W (FP16)
  ↓ 1. 绝对最大值重定标到 [-1, 1]
W_norm = W / max(|W|)
  ↓ 2. NF4 分档量化（寻找最近的非均匀等级）
W_q = argmin_{l in levels} |W_norm - l|
  ↓ 3. 存储：4 bit 索引 + FP32 全局 scale
存储: index (4-bit) + scale (FP32, 每 64 个权重共享)
```

**QLoRA 中的 NF4 应用：**

QLoRA（Quantized Low-Rank Adaptation）将预训练模型权重以 NF4 格式存储（冻结），只训练额外的低秩适配器（LoRA adapter，FP16）：

```python
class QLoRALinear(nn.Module):
    """
    QLoRA 层：NF4 量化权重 + FP16 LoRA adapter
    """
    def __init__(self, in_features, out_features, rank=16):
        super().__init__()
        # NF4 量化权重（冻结）
        self.weight_nf4 = nn.Parameter(...)  # [out, in] INT4 存储
        self.weight_scale = nn.Parameter(...)  # FP32 scale
        
        # LoRA adapter（可训练）
        self.lora_A = nn.Parameter(torch.zeros(rank, in_features))
        self.lora_B = nn.Parameter(torch.zeros(out_features, rank))
        
    def forward(self, x):
        # 1. 反量化 NF4 权重（给到 FP16）
        w_deq = self.dequantize_nf4(self.weight_nf4, self.weight_scale)
        
        # 2. 原始权重的输出（冻结）
        out_base = x @ w_deq.T
        
        # 3. LoRA 适配器输出（可训练）
        out_lora = (x @ self.lora_A.T) @ self.lora_B.T
        
        return out_base + out_lora
    
    def dequantize_nf4(self, q, scale):
        """NF4 反量化：4-bit index → FP16"""
        levels = self.get_nf4_levels()  # [16]
        # q: [out, in] 中每个元素是 4-bit index (0-15)
        w_deq = levels[q.long()] * scale.unsqueeze(1)
        return w_deq
```

NF4 相比均匀 INT4 的核心优势：在正态分布数据上，NF4 的量化均方误差（MSE）比均匀 INT4 降低约 **3-4×**。对于 LLM 权重的近似正态分布特性，NF4 是理论上最优的 4-bit 量化格式。

---

## 4. ⚡ FP8 量化：硬件原生的低精度浮点

FP8 不是整数量化，而是**低精度浮点数**——它保留了浮点的指数动态范围。H100（Hopper）的 Tensor Core 原生支持 FP8 GEMM，吞吐是 FP16 的 2 倍。

### 4.1 E4M3 vs E5M2 格式对比

FP8 有两种格式，在范围和精度之间做不同取舍：

| 格式 | 符号位 | 指数位 | 尾数位 | 最大值 | 最小值 (normal) | 精度 (ULP) | 适用场景 |
|------|--------|--------|--------|--------|----------------|-----------|---------|
| E4M3 | 1 | 4 | 3 | ±240 | 2⁻⁶ ≈ 0.0156 | 1/8 = 0.125 | 权重/激活（范围有限） |
| E5M2 | 1 | 5 | 2 | ±57344 | 2⁻¹⁴ ≈ 6.1×10⁻⁵ | 1/4 = 0.25 | 梯度（范围大，需要 Inf/NaN） |

```
E4M3 比特布局: S EEEE MMM
  最大正数: 0 1111 111 = 1.875 * 2^7 = 240
  最小正数: 0 0001 000 = 1.0 * 2^-6 = 0.015625

E5M2 比特布局: S EEEEE MM
  最大正数: 0 11111 11 = 1.75 * 2^15 = 57344
  最小正数: 0 00001 00 = 1.0 * 2^-14 = 0.000061035
```

**E4M3 vs E5M2 的选择策略：**

- **权重和激活 → E4M3**：权重/激活值的范围通常很小（经过 LayerNorm 后多在 [-10, 10] 内），E4M3 的最大值 240 足够覆盖，且多 1 bit 尾数提供更高精度。
- **梯度 → E5M2**：梯度的动态范围非常大（可以从 10⁻⁸ 到 10⁸），E5M2 的 57344 最大范围和更强的 underflow 抵抗能力更适合。
- **KV Cache → E4M3**：注意力分数范围有限（除以 sqrt(d) 后在较小范围内），E4M3 更优。

```python
# FP8 量化的 PyTorch 实现（模拟 FP8 行为）
def quantize_to_e4m3(x: torch.Tensor) -> torch.Tensor:
    """
    模拟 E4M3 量化：将 FP16 量化为 FP8 E4M3（模拟，无硬件支持时用）
    """
    # E4M3 参数
    max_val = 240.0
    min_norm = 2**(-6)  # 0.015625
    
    # Clamp
    x = torch.clamp(x, -max_val, max_val)
    
    # E4M3 精度约 1/8 = 0.125（在 1.0 附近）
    # 量化步长 = max_val / 2^(3-1) = 240 / 4 = 60?... 不对
    # 实际上 E4M3 的精度随指数变化：
    # 在 [0.5, 1.0) 区间，步长 = 2^(-3) * 2^0 = 0.125
    # 在 [8.0, 16.0) 区间，步长 = 2^(-3) * 2^3 = 1.0
    
    # 简化：用 fake quantize 模拟精度损失
    # 对每个值计算最近的 E4M3 表示
    # 这里用一个近似的量化模拟
    if x.is_cuda and torch.cuda.is_available():
        # 真正的 H100 路径：转换到硬件 FP8
        return x.to(torch.float8_e4m3fn).to(torch.float16)
    else:
        # 软件模拟（不精确，仅供演示）
        scale = x.abs().max() / max_val
        if scale > 0:
            x_norm = x / scale
            step = 1.0 / 8.0  # 近似
            x_q = torch.round(x_norm / step) * step
            return x_q * scale
        return x
```

### 4.2 FP8 GEMM 的 Scale 管理

FP8 GEMM 面临一个独特问题：由于 E4M3 的范围有限（最大 240），如果直接做 `A @ B`，中间累加结果很容易溢出。解决方案是**缩放（scaling）**：

```
标准的 FP8 GEMM（带 scale）：
  C_fp16 = (A_fp8 * scale_A) @ (B_fp8 * scale_B)
         = scale_A * scale_B * (A_fp8 @ B_fp8)
```

#### Per-Tensor Scaling（最简单）

每 tensor 一个 scale，在整个 GEMM 之前预先缩放：

```python
# Per-tensor scaling 的 FP8 GEMM
def fp8_gemm_per_tensor(A_fp16, B_fp16):
    # 1. 计算 scale
    scale_A = A_fp16.abs().max() / 240.0
    scale_B = B_fp16.abs().max() / 240.0
    
    # 2. 量化到 FP8
    A_fp8 = (A_fp16 / scale_A).to(torch.float8_e4m3fn)
    B_fp8 = (B_fp16 / scale_B).to(torch.float8_e4m3fn)
    
    # 3. H100 FP8 Tensor Core GEMM
    # 注意：H100 的 mma 指令自动处理 FP8 输入，输出累加到 FP32
    C_fp32 = torch._scaled_mm(
        A_fp8, B_fp8,
        scale_a=scale_A,
        scale_b=scale_B,
        out_dtype=torch.float16
    )
    
    return C_fp32
```

#### Block FP8（FA3 引入的更精细 scale）

Block FP8 将矩阵划分为 tile，每个 tile 有自己的 scale，大幅降低 outlier 的影响：

```python
# Block FP8: 每个 tile 独立 scale
def block_fp8_gemm(A_fp16, B_fp16, block_size=128):
    """
    A_fp16: [M, K]
    B_fp16: [K, N]
    将 A 和 B 划分为 block_size × block_size 的 tile
    每个 tile 有独立的 FP8 scale
    """
    M, K = A_fp16.shape
    K, N = B_fp16.shape
    
    # 计算每个 tile 的 scale
    A_tiles = A_fp16.view(M // block_size, block_size, K // block_size, block_size)
    A_tiles = A_tiles.permute(0, 2, 1, 3)  # [M_blocks, K_blocks, block, block]
    A_scales = A_tiles.abs().amax(dim=(-2, -1)) / 240.0  # [M_blocks, K_blocks]
    
    B_tiles = B_fp16.view(K // block_size, block_size, N // block_size, block_size)
    B_tiles = B_tiles.permute(0, 2, 1, 3)  # [K_blocks, N_blocks, block, block]
    B_scales = B_tiles.abs().amax(dim=(-2, -1)) / 240.0  # [K_blocks, N_blocks]
    
    # 量化每个 tile
    A_fp8_blocks = (A_tiles / A_scales.unsqueeze(-1).unsqueeze(-1)).to(torch.float8_e4m3fn)
    B_fp8_blocks = (B_tiles / B_scales.unsqueeze(-1).unsqueeze(-1)).to(torch.float8_e4m3fn)
    
    # Block FP8 GEMM: 每个输出 tile = sum over K_blocks
    # 对每个 (i, j) 输出 tile:
    #   C[i,j] = sum_k (A_block[i,k] @ B_block[k,j]) * A_scales[i,k] * B_scales[k,j]
    
    # 实际实现中，Block FP8 融合进 FlashAttention v3 的 kernel
    # 在 shared memory 中完成 tile 级别的量化
    pass
```

**Per-tensor vs Block FP8 的效果对比**（FA3 论文数据）：

| Scale 策略 | Perplexity (Wiki-2) | vs Baseline | 额外存储 |
|-----------|--------------------|-------------|---------|
| FP16 baseline | 5.83 | - | 0 |
| FP8 Per-tensor | 5.91 | +0.08 | 2 FP32 scales |
| FP8 Block (128) | 5.85 | +0.02 | ~2KB per tile |
| FP8 Block + Incoherent | 5.83 | +0.00 | 随机旋转矩阵 |

Block FP8 将 perplexity 损失从 per-tensor 的 0.08 降低到 0.02，几乎无损。

### 4.3 Blackwell B200 的 FP4 新趋势

NVIDIA Blackwell (B200) 架构引入了 **FP4 (E2M1)** 和 **FP6 (E3M2/E2M3)** 原生支持，进一步将量化推向低位宽：

| 格式 | 指数位 | 尾数位 | 最大值 | 最小值 | 精度 |
|------|--------|--------|--------|--------|------|
| FP4 (E2M1) | 2 | 1 | ±6 | ±0.5 | 0.5 (在 1.0 附近) |
| FP6 (E2M3) | 2 | 3 | ±7.5 | ±0.25 | 0.125 |
| FP6 (E3M2) | 3 | 2 | ±28 | ±0.0625 | 0.25 |

FP4 的核心优势是 **2× 相对于 FP8 的吞吐提升**（B200 Tensor Core 原生支持 FP4 GEMM），以及 4× 相对于 FP16 的内存节省。但 FP4 的精度非常有限，需要：

1. **Fine-grained scaling**：更小的 block size（如 32）来补偿动态范围不足
2. **Micro-scaling (MXFP4)**：每个 32 元素 block 共享一个 E8M0 格式的 scale
3. **Weight-only 场景**：FP4 更适合权重量化，激活维持 FP8/FP16

```cpp
// Blackwell B200 FP4 GEMM 的伪代码思路
// 4 bit 权重存储在 packed 格式（每字节 2 个 FP4 值）
// 使用新的 mma 指令: mma.fp4.fp8 -> fp16
//
// 每个 thread 加载 2 个 FP4 值（来自同一字节的高 4 位和低 4 位）
// 在寄存器内解包为 FP8，再做 FP8 GEMM
// scale 以 32 元素 block 为单位，使用 E8M0 格式
```

---

## 5. 🔄 SmoothQuant：迁移量化难度

SmoothQuant 解决了 INT8 激活量化的核心难题：**激活值中的 outlier 导致量化困难**。outlier 通常集中在特定通道（约 1% 的通道占据 90% 以上的总幅度），直接 INT8 量化会引入巨大误差。

### 5.1 数学原理：迁移策略

SmoothQuant 的核心洞察是：激活值难量化是因为有小部分通道的幅度特别大。如果把这部分难度**迁移**到权重上，整体量化就变得容易了：

$$
Y = X \cdot W = (X \cdot \text{diag}(s)^{-1}) \cdot (\text{diag}(s) \cdot W) = \hat{X} \cdot \hat{W}
$$

其中 $s$ 是 per-channel 的平滑因子，计算方式为：

$$
s_j = \frac{\max(|X_{:,j}|)^\alpha}{\max(|W_{j,:}|)^{(1-\alpha)}}
$$

- $\alpha = 0$：不迁移，$\hat{X} = X$（激活难量化）
- $\alpha = 1$：完全迁移，$\hat{W} = W$（权重可能溢出）
- $\alpha = 0.5$：推荐值，均衡策略

```python
def smoothquant_calibrate(W, X, alpha=0.5):
    """
    SmoothQuant 迁移因子 s 的计算
    W: [d_out, d_in] 权重矩阵
    X: [n_samples, d_in] 校准集激活值
    alpha: 迁移强度（默认 0.5）
    """
    # 计算 per-channel 的统计量
    max_act = X.abs().max(dim=0).values  # [d_in]，每输入通道的激活最大值
    max_wgt = W.abs().max(dim=0).values  # [d_in]，每输入通道的权重最大值
    
    # 迁移因子
    s = torch.pow(max_act, alpha) / torch.pow(max_wgt.clamp(min=1e-10), 1 - alpha)
    return s  # [d_in]

def smoothquant_transform(W, X, s):
    """
    应用 SmoothQuant 迁移
    - X_hat = X / s (激活值被缩小，容易量化)
    - W_hat = W * s (权重值被放大，略难量化但仍可接受)
    """
    X_hat = X / s  # 激活范围被压缩
    W_hat = W * s  # 权重范围扩大
    return X_hat, W_hat
```

### 5.2 量化算子的实现

SmoothQuant 后的 W8A8 GEMM 有两条路径：

**路径 A：传统 INT8 GEMM（推荐）**

```python
def smoothquant_gemm(X_int8, W_int8, s, scale_X, scale_W):
    """
    SmoothQuant 的 INT8 GEMM
    X_int8: [B, d_in] INT8
    W_int8: [d_out, d_in] INT8
    s: [d_in] 迁移因子
    """
    # 注意：W_hat = W * s，因此 W_hat 的 scale 需要调整
    # scale_W_hat = scale_W * s (per-channel)
    
    # INT8 GEMM 输出
    C_int32 = X_int8 @ W_int8.T  # [B, d_out]
    
    # 反量化（融合 scale 和迁移因子）
    # 原始的 Y = X @ W
    # SmoothQuant 后: Y = X_hat @ W_hat = (X - zX) * sX @ (W - zW) * sW * s
    # 简化（对称量化）：Y = X_int8 * scale_X * s^{-1} @ W_int8 * scale_W * s
    #               = scale_X * scale_W * (X_int8 @ W_int8)  ... s 被抵消了！
    
    # 实际上 W_hat 的 scale 会吸收 s，所以 GEMM 的 scale 计算：
    C_fp16 = C_int32.float() * scale_X * scale_W
    return C_fp16
```

**路径 B：融合进 Triton kernel**

```python
import triton
import triton.language as tl

@triton.jit
def smoothquant_gemm_kernel(
    X_ptr, W_ptr, out_ptr,
    s_ptr,
    scale_X, scale_W,
    M, N, K,
    stride_xk, stride_wn, stride_wk,
    BLOCK_M: tl.constexpr, BLOCK_N: tl.constexpr, BLOCK_K: tl.constexpr,
):
    """
    SmoothQuant 融合 kernel：INT8 GEMM + SmoothQuant 反量化
    将 s 融合进 W 的 scale 中，减少额外 kernel launch
    """
    pid_m = tl.program_id(0)
    pid_n = tl.program_id(1)
    
    offs_m = pid_m * BLOCK_M + tl.arange(0, BLOCK_M)
    offs_n = pid_n * BLOCK_N + tl.arange(0, BLOCK_N)
    offs_k = tl.arange(0, BLOCK_K)
    
    X_block = tl.load(X_ptr + offs_m[:, None] * stride_xk + offs_k[None, :])
    W_block = tl.load(W_ptr + offs_n[:, None] * stride_wn + offs_k[None, :])
    s_block = tl.load(s_ptr + offs_k)  # [BLOCK_K]
    
    # INT8 GEMM (DP4A 模拟)
    acc = tl.dot(X_block.to(tl.float16), W_block.to(tl.float16))
    
    # SmoothQuant 的 scale 反量化
    # scale_combined = scale_X * scale_W (s 被迁移过程吸收)
    scale = scale_X * scale_W
    acc = acc * scale
    
    tl.store(out_ptr + offs_m[:, None] * N + offs_n[None, :], acc)
```

### 5.3 部署中的融合技巧

在实际推理引擎中，SmoothQuant 的迁移因子 $s$ 可以在部署前**离线融合**到权重中：

```
部署前：
  W_deploy = W_hat = W * s    (离线合并到权重)
  推理时：
  X_deploy = X / s             (在线，融合进前一个 LayerNorm 的 epilogue)
  Y = X_deploy @ W_deploy      (标准 INT8 GEMM，无需感知 s 的存在)
```

这意味着 SmoothQuant 在推理时**零额外开销**——权重在离线时已经被修改，激活的除以 s 可以融合到 LayerNorm kernel 中：

```python
# 融合到 LayerNorm 后的激活量化
def fused_layernorm_quant_smooth(x, weight, bias, s, eps=1e-5):
    """
    融合：LayerNorm → SmoothQuant 除以 s → INT8 量化
    """
    mean = x.mean(dim=-1, keepdim=True)
    var = x.var(dim=-1, keepdim=True)
    x_norm = (x - mean) / torch.sqrt(var + eps)
    x_norm = x_norm * weight + bias
    
    # SmoothQuant 除以 s（融合进 epilogue）
    x_scaled = x_norm / s
    
    # INT8 量化
    scale = x_scaled.abs().max() / 127.0
    x_q = torch.clamp(torch.round(x_scaled / scale), -127, 127).to(torch.int8)
    return x_q, scale
```

---

## 6. 🗄️ KV Cache 量化：KIVI 原理

### 6.1 为什么需要 KV Cache 量化

随着序列长度和并发数的增长，KV Cache 是推理 OOM 的首要瓶颈：

| 模型 | FP16 KV (单条, 32K) | 8 并发的 KV | 量化到 INT4 | 量化到 FP8 |
|------|--------------------|------------|------------|------------|
| LLaMA-7B | ~1.5 GB | ~12 GB | ~3 GB | ~6 GB |
| LLaMA-70B | ~10.7 GB | ~86 GB | ~22 GB | ~43 GB |
| LLaMA-405B | ~61 GB | ~488 GB | ~122 GB | ~244 GB |

KV Cache 量化的难点在于：Key 和 Value 的统计特性不同，需要不同的量化策略。

### 6.2 KIVI：Per-Channel Key，Per-Token Value

KIVI（来自论文 *KIVI: A Tuning-Free Asymmetric 2-bit Quantization for KV Cache*）的核心发现：

- **Key 矩阵**有明显的**通道维度（channel-wise）outlier**：某些 head_dim 维度上的值显著大于其他维度 → 适合 per-channel 量化
- **Value 矩阵**的分布近似均匀，但随 token 变化 → 适合 per-token 量化

```
KIVI 量化策略：
  Key:   per-channel 量化（每 head_dim 维一个 scale）
  Value: per-token 量化（每 token 一个 scale）
```

```python
def kivi_quantize_key(K: torch.Tensor, group_size: int = 128):
    """
    KIVI Key 量化：per-channel + per-group
    K: [batch, num_heads, seq_len, head_dim]
    """
    B, H, T, D = K.shape
    
    # Reshape 以支持 group-wise
    K_reshaped = K.reshape(B, H, T, -1, group_size)
    # [B, H, T, num_groups, group_size]
    
    # Per-channel = 对 group 维度量化
    # 对每个 group 计算 scale
    scales = K_reshaped.abs().max(dim=-1, keepdim=True).values / 127.0
    
    # 量化
    K_q = torch.clamp(torch.round(K_reshaped / scales), -127, 127).to(torch.int8)
    
    # 反量化（在注意力计算中融合）
    K_deq = (K_q.float() * scales).reshape(B, H, T, D)
    return K_q, scales  # 存储量化版本

def kivi_quantize_value(V: torch.Tensor):
    """
    KIVI Value 量化：per-token
    V: [batch, num_heads, seq_len, head_dim]
    每个 token 独立计算 scale
    """
    B, H, T, D = V.shape
    
    # Per-token scale: 每个 token 一个 scale
    # V: [B*H, T, D]
    V_2d = V.reshape(B * H, T, D)
    
    # 对每个 token 计算 scale
    scales = V_2d.abs().max(dim=-1, keepdim=True).values / 127.0  # [B*H, T, 1]
    
    # 量化
    V_q = torch.clamp(torch.round(V_2d / scales), -127, 127).to(torch.int8)
    
    return V_q.reshape(B, H, T, D), scales.reshape(B, H, T, 1)
```

### 6.3 融合进 FlashAttention 的 KV Cache 量化

KV Cache 的反量化**必须融合**进 Attention kernel 中，否则单独的反量化 kernel 会抵消所有带宽收益：

```python
# 融合 KIVI 反量化的 FlashAttention 伪代码
def flashattention_with_kivi(
    Q,             # [B, H, T_q, D] FP16
    K_cache_q,     # [B, H, T_k, D/g] INT8 (quantized key cache)
    V_cache_q,     # [B, H, T_k, D] INT8 (quantized value cache)
    K_scales,      # per-channel/key scales
    V_scales,      # per-token/value scales
):
    """
    在 FlashAttention 的 tile 循环中，对每个 K/V tile
    动态反量化后做注意力计算
    """
    for k_tile_idx in range(num_k_tiles):
        # 从 cache 加载量化的 K/V tile
        k_q = load_kv_tile(K_cache_q, k_tile_idx)  # [Br, D] INT8
        v_q = load_kv_tile(V_cache_q, k_tile_idx)  # [Br, D] INT8
        k_s = load_scale_tile(K_scales, k_tile_idx)  # [1, D] or [Br, 1]
        v_s = load_scale_tile(V_scales, k_tile_idx)  # [Br, 1]
        
        # 在 SRAM 上反量化（融合进 tile）
        k_fp16 = (k_q.float() * k_s)  # [Br, D]
        v_fp16 = (v_q.float() * v_s)  # [Br, D]
        
        # 标准 attention 计算（online softmax）
        s = Q_tile @ k_fp16.T / sqrt(D)  # [Br, Br]
        # ... online softmax ...
        o = o * l_new + softmax(s) @ v_fp16
```

### 6.4 KIVI 与其他 KV Cache 量化方法的对比

| 方法 | 格式 | Key 策略 | Value 策略 | Perplexity 损失 (32K) | 额外存储 |
|------|------|---------|-----------|----------------------|---------|
| FP8 | E4M3 | Per-tensor | Per-tensor | < 0.3 | 2 scales/tensor |
| FP8 per-token | E4M3 | Per-token | Per-token | < 0.2 | 2T scales |
| KIVI INT8 | INT8 | Per-channel | Per-token | < 0.3 | T scales (V) |
| KIVI INT4 | INT4 | Per-channel | Per-token | < 0.8 | 0.5 bit/param scales |
| KVQuant | INT4 | Per-channel + outlier | Per-token | < 0.5 | outlier 索引 |

---

## 7. 🧪 量化算子测试：如何验证精度损失？

量化后的验证测试比普通算子测试更复杂，因为量化引入的是**系统性误差**，而非随机数值误差。

### 7.1 测试金字塔

```
                ┌────────────────────────┐
                │   End-to-End 评估      │  ← MMLU/CEval 等基准
                │  (perplexity + 下游)   │      小时级
                └──────────┬─────────────┘
                           │
                ┌──────────▼─────────────┐
                │   Layer-wise 精度测试   │  ← 每层的 cosine sim
                │  (逐层对比 FP16 output) │      分钟级
                └──────────┬─────────────┘
                           │
                ┌──────────▼─────────────┐
                │   单算子精度测试         │  ← random inputs
                │  (量化误差分布分析)      │      秒级
                └──────────┬─────────────┘
                           │
                ┌──────────▼─────────────┐
                │  统计量一致性检查         │  ← min/max/mean/std
                │  (scale, zero_point)    │      秒级
                └────────────────────────┘
```

### 7.2 单算子精度测试

最直接的测试：对随机输入对比 FP16 和量化版本的前向结果。

```python
def test_quantization_accuracy(
    op_name: str,
    fp16_fn,           # FP16 参考函数
    quantized_fn,      # 量化版本函数
    input_shapes: list,
    dtype=torch.float16,
    rtol=1e-2,         # 量化场景下放宽到 1%
    atol=1e-2,
    random_seed=42,
):
    """
    量化精度测试：对比 FP16 参考和量化版本
    """
    results = []
    torch.manual_seed(random_seed)
    
    for shape in input_shapes:
        # 生成随机输入（模拟实际分布）
        x = torch.randn(shape, dtype=dtype, device='cuda') * 0.5
        
        # FP16 参考
        with torch.no_grad():
            ref_out = fp16_fn(x)
        
        # 量化版本
        with torch.no_grad():
            q_out = quantized_fn(x)
        
        # 精度指标
        cos_sim = torch.nn.functional.cosine_similarity(
            ref_out.flatten(), q_out.flatten(), dim=0
        ).item()
        
        mse = ((ref_out - q_out) ** 2).mean().item()
        
        max_rel_err = ((ref_out - q_out).abs() / (ref_out.abs() + 1e-8)).max().item()
        
        all_close = torch.allclose(ref_out, q_out, rtol=rtol, atol=atol)
        
        results.append({
            'shape': shape,
            'cosine_sim': cos_sim,
            'mse': mse,
            'max_rel_err': max_rel_err,
            'allclose': all_close,
        })
        
        print(f"  {shape}: cos={cos_sim:.6f}, mse={mse:.2e}, "
              f"max_rel_err={max_rel_err:.4f}, allclose={all_close}")
    
    return results
```

### 7.3 Layer-Wise 精度测试

单算子测试无法捕捉**误差累积**——量化误差在逐层传递中可能被放大。Layer-wise 测试对比每一层的输出：

```python
@torch.no_grad()
def layerwise_quantization_test(model_fp16, model_quantized, calib_loader):
    """
    逐层对比量化模型的输出误差
    通过 hook 捕获每层的中间激活
    """
    fp16_activations = {}
    quantized_activations = {}
    
    def hook_factory(store_dict, name):
        def hook(module, input, output):
            store_dict[name] = output.detach()
        return hook
    
    # 注册 hook
    hooks = []
    for name, module in model_fp16.named_modules():
        h = module.register_forward_hook(hook_factory(fp16_activations, name))
        hooks.append(h)
    
    # 对校准集前向一次
    for batch in calib_loader:
        model_fp16(batch)
        break  # 仅用第一个 batch
    
    # 移除 hooks 并给量化模型注册
    for h in hooks:
        h.remove()
    
    hooks = []
    for name, module in model_quantized.named_modules():
        h = module.register_forward_hook(hook_factory(quantized_activations, name))
        hooks.append(h)
    
    for batch in calib_loader:
        model_quantized(batch)
        break
    
    for h in hooks:
        h.remove()
    
    # 逐层分析
    layer_metrics = []
    for name in fp16_activations:
        ref = fp16_activations[name]
        q = quantized_activations[name]
        
        cos = torch.nn.functional.cosine_similarity(
            ref.flatten(), q.flatten(), dim=0
        ).item()
        
        snr = 10 * torch.log10(
            (ref ** 2).sum() / ((ref - q) ** 2).sum()
        ).item()
        
        layer_metrics.append({
            'name': name,
            'cosine_sim': cos,
            'snr_db': snr,
            'error_growth': snr if len(layer_metrics) == 0
                else (snr - layer_metrics[-1]['snr_db'])
        })
    
    # 误差可视化
    # 理想曲线：每层的 cos 接近 1.0，SNR 缓慢下降
    # 危险信号：某层 cos < 0.99 或 SNR 骤降 > 10dB
    return layer_metrics
```

### 7.4 End-to-End 模型级测试

最终验证必须回到模型级别的指标：

```python
def end_to_end_quantization_eval(model, tokenizer, eval_tasks):
    """
    End-to-end 评估量化后的模型
    测量: perplexity, MMLU, 以及量化特有的边界测试
    """
    results = {}
    
    # 1. Perplexity（基础语言建模能力）
    ppl = evaluate_perplexity(model, tokenizer, dataset='wikitext2')
    results['perplexity'] = ppl
    
    # 2. 下游任务（量化对下游任务的影响可能不同）
    if 'mmlu' in eval_tasks:
        mmlu_score = evaluate_mmlu(model, tokenizer)
        results['mmlu'] = mmlu_score
    
    # 3. 量化特有测试：重复生成一致性
    # 量化后的模型在相同 prompt 下是否生成相同输出？
    prompts = [
        "The capital of France is",
        "The theory of relativity was proposed by",
    ]
    for prompt in prompts:
        inputs = tokenizer(prompt, return_tensors='pt')
        out1 = model.generate(**inputs, max_new_tokens=50, do_sample=False)
        out2 = model.generate(**inputs, max_new_tokens=50, do_sample=False)
        assert torch.equal(out1, out2), f"量化模型在 {prompt} 上生成不一致！"
    results['greedy_consistency'] = True
    
    return results
```

### 7.5 可视化量化误差分布

```python
def visualize_quantization_error(W_original, W_quantized, layer_name="Layer"):
    """
    分析量化误差的分布
    """
    import matplotlib.pyplot as plt
    
    err = (W_original - W_quantized).flatten().cpu().numpy()
    orig = W_original.flatten().cpu().numpy()
    
    fig, axes = plt.subplots(2, 2, figsize=(12, 8))
    
    # 1. 量化误差直方图
    axes[0, 0].hist(err, bins=100, alpha=0.7)
    axes[0, 0].set_title(f'{layer_name} - Quantization Error Distribution')
    axes[0, 0].set_xlabel('Error')
    
    # 2. 原始值 vs 误差散点图
    axes[0, 1].scatter(orig[:5000], err[:5000], s=0.5, alpha=0.3)
    axes[0, 1].set_title('Original Value vs Quantization Error')
    axes[0, 1].set_xlabel('Original Value')
    axes[0, 1].set_ylabel('Error')
    
    # 3. 误差的通道分布（检测 outlier channel）
    ch_err = (W_original - W_quantized).abs().mean(dim=1).cpu().numpy()
    axes[1, 0].bar(range(len(ch_err)), ch_err)
    axes[1, 0].set_title('Per-Channel Mean Absolute Error')
    axes[1, 0].set_xlabel('Channel')
    
    # 4. SNR 分布
    snr = 20 * np.log10(np.abs(orig) / (np.abs(err) + 1e-10))
    snr = np.clip(snr, -20, 80)
    axes[1, 1].hist(snr, bins=100, alpha=0.7)
    axes[1, 1].set_title('SNR Distribution (dB)')
    axes[1, 1].set_xlabel('SNR (dB)')
    
    plt.tight_layout()
    return fig
```

### 7.6 量化测试通过标准汇总

| 测试层级 | 指标 | INT8 通过标准 | INT4 通过标准 | FP8 通过标准 |
|---------|------|--------------|--------------|--------------|
| 单算子 | Cosine Similarity | ≥ 0.9999 | ≥ 0.999 | ≥ 0.9999 |
| 单算子 | Max Relative Error | < 1% | < 5% | < 1% |
| Layer-wise | Cosine Similarity | ≥ 0.999 | ≥ 0.995 | ≥ 0.999 |
| Layer-wise | SNR drop per layer | < 1 dB | < 3 dB | < 1 dB |
| End-to-end | Perplexity increase | < 0.5 | < 1.0 | < 0.3 |
| End-to-end | MMLU drop | < 1% | < 2% | < 0.5% |
| 边界测试 | NaN/Inf 检测 | 0 出现 | 0 出现 | 0 出现 |
| 一致测试 | Greedy repeatability | 100% 相同 | 100% 相同 | 100% 相同 |

---

## 8. 📊 对比总结表

### 8.1 数据格式对比

| 格式 | 位宽 | 存储缩减 (vs FP16) | 表示类型 | 动态范围 | 精度特征 | 硬件原生支持 |
|------|------|-------------------|---------|---------|---------|------------|
| INT8 对称 | 8 bit | 2× | 均匀整数 | 固定 (±127) | 均匀量化误差 | T4/A100/H100 |
| INT8 非对称 | 8 bit | 2× | 均匀整数 | 灵活 (0-255) | 适应性更好 | T4/A100/H100 |
| FP8 E4M3 | 8 bit | 2× | 浮点 | ±240 | 对数精度 | **H100+ (SM90)** |
| FP8 E5M2 | 8 bit | 2× | 浮点 | ±57344 | 范围优先 | **H100+ (SM90)** |
| INT4 (GPTQ/AWQ) | 4 bit | **4×** | 均匀整数 | 固定 (±7) | 均匀量化误差 | Marlin kernel |
| NF4 | 4 bit | 4× | 非均匀整数 | 归一化到 [-1,1] | **正态最优** | QLoRA 软件 |
| FP4 (E2M1) | 4 bit | 4× | 浮点 | ±6 | 低精度浮点 | **B200 (Blackwell)** |
| INT2 | 2 bit | **8×** | 均匀整数 | 固定 (±1) | 损失较大 | 实验性 |

### 8.2 精度损失对比（LLaMA-2 7B, WikiText-2 perplexity）

| 量化方案 | Perplexity | Δ vs FP16 | MMLU | Δ vs FP16 |
|---------|-----------|-----------|------|-----------|
| FP16 (baseline) | 5.47 | - | 45.3% | - |
| INT8 per-tensor | 5.62 | +0.15 | 44.8% | -0.5% |
| INT8 per-channel | 5.51 | +0.04 | 45.1% | -0.2% |
| SmoothQuant W8A8 | 5.50 | +0.03 | 45.2% | -0.1% |
| FP8 E4M3 per-tensor | 5.53 | +0.06 | 45.0% | -0.3% |
| FP8 E4M3 block | 5.48 | +0.01 | 45.2% | -0.1% |
| GPTQ INT4 (g128) | 5.58 | +0.11 | 44.3% | -1.0% |
| AWQ INT4 (g128) | 5.56 | +0.09 | 44.6% | -0.7% |
| NF4 (QLoRA) | 5.54 (FT后) | +0.07 | 44.8% | -0.5% |
| FP4 E2M1 (模拟) | 6.21 | +0.74 | 41.2% | -4.1% |

> 注：实际数值随模型、校准数据和 kernel 实现浮动，以上为代表性数字。

### 8.3 加速比对比

| 量化方案 | Prefill 加速 | Decode 加速 | 内存节省 | 主要瓶颈 | 典型场景 |
|---------|-------------|-------------|---------|---------|---------|
| INT8 per-tensor | 1.5-2.0× | 1.2-1.5× | ~2× | 激活量化 overhead | 大 batch prefill |
| INT8 per-channel | 1.8-2.0× | 1.5-1.8× | ~2× | scale 预取 | 通用推理 |
| SmoothQuant W8A8 | 1.8-2.0× | 1.5-1.8× | ~2× | 迁移因子融合 | FP16→INT8 迁移 |
| FP8 (H100) | 1.8-2.0× | 1.5-1.8× | ~2× | scale 管理 | H100 原生推理 |
| FP8 block (FA3) | 2.0-2.5× | 1.5-2.0× | ~2× | block scale 计算 | 长序列注意力 |
| GPTQ INT4 (g128) | 1.0-1.2× | **2.0-3.0×** | **~4×** | HBM 带宽 | **LLM 推理首选** |
| AWQ INT4 (g128) | 1.0-1.2× | **2.0-3.0×** | **~4×** | HBM 带宽 | **LLM 推理首选** |
| NF4 (QLoRA) | 0.8-1.0× | 1.5-2.0× | ~4× | 反量化开销 | 微调 / 小 batch |
| FP8 KV Cache | - | 1.1-1.3× | ~2× KV | 反量化融合 | 长上下文 |
| INT4 KV Cache | - | 1.2-1.5× | ~4× KV | 精度损失 | 超长序列 |

### 8.4 适用场景决策树

```
你的量化需求？
│
├── 需要部署到 T4/V100（无 FP8）？
│   ├── 精度敏感 → INT8 per-channel + SmoothQuant (W8A8)
│   └── 显存受限 → AWQ/GPTQ INT4 (W4A16)
│
├── 使用 H100+ 硬件？
│   ├── 训练/微调 → FP8 E4M3/E5M2 (Transformer Engine)
│   └── 推理 → FP8 (最快的 GEMM) 或 AWQ INT4 (最小的显存)
│
├── 需要微调大模型？
│   └── QLoRA (NF4) → 4× 显存节省，lora 适配器可训练
│
├── KV Cache 是瓶颈？
│   ├── 长序列 (32K+) → FP8 KV Cache (硬件加速)
│   ├── 超长序列 (128K+) → KIVI INT4 KV Cache
│   └── 高并发 → FP8 KV Cache + PagedAttention
│
└── 追求极致速度？
    └── FP8 (H100) 或 INT8 (T4/A100) → 配合算子融合和 FlashAttention
```

---

## 🚀 下一步

量化技术仍在快速发展中，以下是一些值得关注的前沿方向：

1. **混合精度量化**：对模型的不同层/不同 token 使用不同 bit-width，在同等内存下获得更好精度。例如：Attention 层用 INT8，FFN 层用 INT4；salient tokens 用更高精度。

2. **量化 + 稀疏化联合优化**：将 2:4 结构化稀疏（NVIDIA Ampere+ 的 2× 加速）与 INT4/FP8 量化结合，总加速可达 8×。

3. **硬件原生 FP4/FP6**：Blackwell B200 的 FP4 Tensor Core 使 4-bit 浮点计算成为可能，MXFP4 micro-scaling 格式有望统一 INT4 和 FP4 的生态。

4. **自适应量化推理**：运行时根据输入的难度动态调整量化精度——easy token 用 INT4，hard token 用 FP16。

5. **量化算子的自动化测试**：将量化误差测试集成到 CI/CD 流水线中，每次 kernel 更新自动运行 end-to-end 评估。

### 推荐资源

- 🔧 [llm-awq](https://github.com/mit-han-lab/llm-awq) — AWQ 官方实现，包含 calibration 和推理代码
- 🔧 [GPTQ-for-LLaMA](https://github.com/qwopqwop200/GPTQ-for-LLaMa) — GPTQ 的 LLaMA 适配
- 🔧 [vLLM](https://github.com/vllm-project/vllm) — 生产级推理引擎，集成了 Marlin kernel 和 FP8 KV Cache
- 📖 [SmoothQuant (arXiv:2211.10438)](https://arxiv.org/abs/2211.10438) — W8A8 量化的代表作
- 📖 [GPTQ (arXiv:2210.17323)](https://arxiv.org/abs/2210.17323) — Hessian-aware INT4 量化的开创性工作
- 📖 [AWQ (arXiv:2306.00978)](https://arxiv.org/abs/2306.00978) — Activation-aware INT4 量化
- 📖 [QLoRA (arXiv:2305.14314)](https://arxiv.org/abs/2305.14314) — NF4 量化 + LoRA 微调
- 📖 [KIVI (arXiv:2402.02750)](https://arxiv.org/abs/2402.02750) — KV Cache 量化的关键工作
- 📖 [FP8 Formats (arXiv:2209.05433)](https://arxiv.org/abs/2209.05433) — FP8 E4M3/E5M2 格式详解
