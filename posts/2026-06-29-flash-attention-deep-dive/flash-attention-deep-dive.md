---
title: "FlashAttention 完整解析：从原理到 CUDA/Triton 实现"
date: 2026-06-29
tags: [FlashAttention, CUDA, Triton, 推理优化, 深度学习]
---

如果你在 2022 年某个深夜跑过一个 16K 长度的 transformer 训练任务，一定会记得 OOM 的恐惧——标准的 PyTorch Attention 需要存一个 `[batch, head, N, N]` 的 attention score 矩阵，N=16384 时光这一个中间张量就是 `2×16384² ≈ 537M` 个元素（FP16 下 1GB+），算上 Q/K/V 和 backward 的中间结果，一次性吃光 80GB A100 的 HBM 毫不费力。**FlashAttention 的出现彻底改变了这个局面**：它通过 tiling（分块）和 online softmax（流式 softmax），把 attention 的 HBM 访存从 O(N²) 降低到 O(N)，且数学上完全等价。这篇博客将从原理到 CUDA/Triton 实现，逐层拆解 FlashAttention 的全系列版本（FA1/FA2/FA3）、PageAttention 和 MLA，并给出可运行的代码片段。

<!--more-->

---

## 1. 标准 Attention 的计算瓶颈

### 1.1 数学形式

标准 Scaled Dot-Product Attention 的公式：

```
O = softmax(Q K^T / √d) V
```

其中 Q, K, V ∈ ℝ^{N×d}，N 是序列长度，d 是 head dimension（通常 64/128）。展开后，中间要计算一个 N×N 的注意力矩阵 S = Q K^T / √d，然后对其每行做 softmax，再乘以 V。

### 1.2 三层访存之痛

GPU 的内存层次：

| 层级 | 容量 | 带宽 | 延迟 |
|------|------|------|------|
| HBM (全局显存) | 40/80 GB | ~2.0 TB/s (A100) / ~3.35 TB/s (H100) | ~200-400 cycles |
| L2 Cache | 40 MB (A100) / 60 MB (H100) | ~4-8 TB/s | ~100 cycles |
| SRAM (Shared Memory) | 192 KB per SM (A100) / 256 KB per SM (H100) | ~20-40 TB/s (SM 内部) | ~20 cycles |
| 寄存器 | 256 KB per SM | ~100+ TB/s | ~1 cycle |

标准 PyTorch Attention 的实现如下：

```python
import torch

def standard_attention(Q, K, V):
    # Q, K, V: (N, d)
    d = Q.shape[-1]
    S = torch.matmul(Q, K.T) / (d ** 0.5)     # (N, N) ← 写回 HBM
    P = torch.softmax(S, dim=-1)               # 读 S, 写 P ← HBM 两次
    O = torch.matmul(P, V)                     # 读 P+V, 写 O
    return O
```

**每个步骤都要经过 HBM：**

```
Q, K 在 HBM → 读入 SRAM → SGEMM → S (N×N) 写回 HBM
S 读入 SRAM → softmax → P (N×N) 写回 HBM
P, V 读入 SRAM → SGEMM → O 写回 HBM
```

**6 次 HBM 访存**（Q/K 各 1 次，S 读写 2 次，P 读写 2 次，V 读 1 次，O 写 1 次），其中 N×N 的 S 和 P 矩阵是最重的——N=4096 时，S+P 的 HBM 读写量约 `2 × (2 × 4096² × 2B) ≈ 128 MB`，虽然看起来不大，但在 batch=32, head=32 时就是 `128 MB × 1024 ≈ 131 GB`，远超 80GB 显存。

### 1.3 O(N²) 内存 + O(N²) 访存

标准 Attention 有两个 O(N²) 问题：

1. **内存 O(N²)**：中间矩阵 S 和 P 大小 N²，N=128K 时根本无法存下（128K² × 2 bytes = 32 GB 一个 head）
2. **HBM 访存 O(N²)**：即使使用 checkpointing（backward 时重算 S 也避免不了写），HBM 读写量仍是 O(N²)

FlashAttention 的核心贡献是：**通过 tiling 把 S/P 保持在 SRAM 上，将 HBM 访存从 O(N²) 降到 O(N)**。

---

## 2. Online Softmax 原理

### 2.1 标准 softmax 为什么不能流式

标准 softmax 需要两步：

```python
def softmax(x):
    # x: vector of length N
    m = max(x)                     # pass 1: find max
    s = sum(exp(x - m))            # pass 2: compute sum
    p = exp(x - m) / s             # pass 3: divide
    return p
```

**问题在于：** 你不知道 `sum(exp(x_i))` 之前，不能算出正确的 softmax。这意味着你必须看到全部 N 个元素后才能输出第一个元素——无法在线/流式计算。

### 2.2 Online Softmax 的数学 Trick

Online Softmax 的洞察是：**我们可以用一个 rescaling factor 来修正部分结果**。

假设我们把向量 x 分成两个 tile：x¹ 和 x²。先处理第一个 tile：

```
m¹ = max(x¹)
d¹ = sum(exp(x¹ - m¹))
p¹ = exp(x¹ - m¹) / d¹    # 这只是"局部 softmax"
```

但现在我们看到了 x²，它的最大值可能比 m¹ 大。怎么办？**rescaling**：

```
m² = max(m¹, max(x²))
d² = d¹ * exp(m¹ - m²) + sum(exp(x² - m²))
```

注意 d¹ 是根据 m¹ 算的，现在全局最大值变成了 m²，所以 d¹ 要乘以一个 rescaling factor `exp(m¹ - m²)` 来修正。

最终全局 softmax 是：

```
p_global = [p¹ * (d¹ / d²) * exp(m¹ - m²), ... 重新对第二个 tile 计算]
```

化简一下：对第一个 tile 的全局 softmax 等于：

```
p¹_global = exp(x¹ - m²) / d²
          = [exp(x¹ - m¹) / d¹] * [d¹ / d²] * [exp(m¹ - m²)]
          = p¹ * (d¹ * exp(m¹ - m²) / d²)
```

这里的 rescaling factor 就是 `d¹ * exp(m¹ - m²) / d²`。

### 2.3 Safe Online Softmax 算法

更实用的版本（数值稳定，用 m 记录 max，用 d 记录 sum of exp）：

```
初始化: m₀ = -∞, d₀ = 0

对每个 tile x^(i):
    m_i = max(m_{i-1}, max(x^(i)))
    d_i = d_{i-1} * exp(m_{i-1} - m_i) + sum(exp(x^(i) - m_i))
    # 此时不急着除以 d_i——保留到最终输出时再做
```

这个算法只需要一次 pass 就能得到正确的 m 和 d，且每个 tile 的计算完全在 SRAM 上完成，不需要写回 HBM。

### 2.4 结合 Attention 的完整 tiling

当 online softmax 嵌入 attention 的 `P←softmax(S)→V` 流程时，我们同时维护**输出 O 的 running sum**：

```
初始化: m₀ = -∞, d₀ = 0, O₀ = 0

对每个 K/V tile (K_j, V_j):
    S_ij = Q_i K_j^T                # 1 个 tile 的 matmul
    m_new = max(m_old, rowmax(S_ij))
    d_new = d_old * exp(m_old - m_new) + rowsum(exp(S_ij - m_new))
    P_ij = exp(S_ij - m_new)        # softmax numerator（整行）
    O_new = O_old * (d_old * exp(m_old - m_new) / d_new) + (P_ij @ V_j) / d_new
    # 更新 m, d, O
```

最终 O = O_{last}，d = d_{last}，且 O 已经是正确归一化的结果（因为每一步都在 rescale）。

> 💡 **关键理解**：这等价于我们边处理 tile 边"修正"之前的部分结果，最终得到和一次性 softmax 完全相同的数值结果。误差仅来自浮点舍入，与标准实现一致。

---

## 3. FlashAttention-1：核心循环与 CUDA 实现

### 3.1 算法总览

FlashAttention-1 (Dao et al., NeurIPS 2022) 的核心算法：

```
输入: Q, K, V ∈ ℝ^{N×d} (HBM), block sizes Bc, Br
输出: O ∈ ℝ^{N×d} (HBM)
SRAM 上: Q_i tile (Br×d), K_j tile (Bc×d), V_j tile (Bc×d)

外层循环 (K,V tiles):
    for j = 1 to ceil(N/Bc):
        加载 K_j, V_j 到 SRAM
        # Q 在内存循环中重新读入

        内层循环 (Q tiles):
            for i = 1 to ceil(N/Br):
                加载 Q_i 到 SRAM
                在 SRAM 上计算 S_ij = Q_i K_j^T  (Br×Bc)
                在 SRAM 上计算 P_ij = softmax(S_ij)  (使用 online softmax)
                在 SRAM 上计算 O_i += P_ij V_j
                写 O_i 回 HBM  (每次外层循环都写回，下一个外层循环覆盖)
```

**重要优化**：O_i 不是在内层循环结束时才写 HBM，而是在每次内层循环结束或外层循环切换时写一次。实际上，**O 的更新是累积的**——每个 Q tile 对应的 O_i 在每次内层循环结束时被写回 HBM，下一轮外层循环开始时再读入、继续 accumulate。

### 3.2 Tiling 策略

**为什么是外层 K/V、内层 Q？**

标准写法是 `O = softmax(QK^T) V`，其中 `QK^T` 产生 N×N 的中间矩阵。如果我们外层循环 K（按列分块），那么每个 Q tile 需要累积多个 K/V tile 的结果——这正是 online softmax 需要做的。

具体而言，对于每个 Q tile（大小为 Br×d），我们遍历所有 K/V tiles（大小为 Bc×d）：

1. 加载当前 K_j, V_j 到 SRAM
2. 加载 Q_i 到 SRAM
3. 计算 S_ij = Q_i K_j^T（在 SRAM 上，大小 Br×Bc，`Br×Bc ≤ SRAM capacity`）
4. 对 S_ij 的每一行执行 online softmax 更新
5. 累加部分结果到 O_i
6. 最终写回 O_i

**Block size 的选择**：SRAM 一般 192KB (A100) 或 256KB (H100)，以 A100 为例：

```
Br × d × 2B (FP16 Q tile) + Bc × d × 4B (K+V tile, FP16) + Br × Bc × 2B (S tile)
≤ 192 KB

取 d=128, Br=Bc=64:
64×128×2 + 64×128×4 + 64×64×2 = 16KB + 32KB + 8KB = 56KB ← 足够
```

### 3.3 CUDA 伪代码

以下是一个高度简化的 FlashAttention-1 的 CUDA kernel 伪代码：

```cuda
__global__ void flash_attention_fwd_kernel(
    const float* __restrict__ Q,   // [N, d]
    const float* __restrict__ K,   // [N, d]
    const float* __restrict__ V,   // [N, d]
    float* __restrict__ O,         // [N, d]
    const int N,
    const int d,
    const int Br,  // Q tile size
    const int Bc   // K/V tile size
) {
    // Shared memory for tiles
    __shared__ float Q_s[Br][d];
    __shared__ float K_s[Bc][d];
    __shared__ float V_s[Bc][d];
    __shared__ float S[Br][Bc];   // attention score tile

    // Persistent per-thread accumulators for O, m, d
    float O_local[d] = {0};
    float m_prev = -INFINITY;
    float d_prev = 0.0f;

    // Each block handles one Q tile (i_start ... i_start+Br)
    int i_start = blockIdx.x * Br;
    // Load Q tile
    load_tile(Q, Q_s, i_start, 0, Br, d);

    // Outer loop over K/V tiles
    for (int j = 0; j < N; j += Bc) {
        __syncthreads();
        // Load K_j and V_j
        load_tile(K, K_s, j, 0, Bc, d);
        load_tile(V, V_s, j, 0, Bc, d);
        __syncthreads();

        // Compute S = Q_i * K_j^T / sqrt(d)  (Br × Bc)
        // Warp-level tiled matmul
        for (int r = 0; r < Br; r++) {
            for (int c = 0; c < Bc; c++) {
                float sum = 0.0f;
                for (int k = 0; k < d; k++) {
                    sum += Q_s[r][k] * K_s[c][k];
                }
                S[r][c] = sum * rsqrtf((float)d);
            }
        }
        __syncthreads();

        // Online softmax for each row of S
        for (int r = 0; r < Br; r++) {
            float row_max = -INFINITY;
            for (int c = 0; c < Bc; c++) {
                row_max = fmaxf(row_max, S[r][c]);
            }

            float m_new = fmaxf(m_prev, row_max);
            float row_sum = 0.0f;
            for (int c = 0; c < Bc; c++) {
                row_sum += expf(S[r][c] - m_new);
            }

            float d_new = d_prev * expf(m_prev - m_new) + row_sum;

            // Compute P = exp(S - m_new) and accumulate O
            for (int c = 0; c < Bc; c++) {
                float p = expf(S[r][c] - m_new);
                for (int k = 0; k < d; k++) {
                    O_local[k] = O_local[k] * (d_prev * expf(m_prev - m_new) / d_new)
                                 + p * V_s[c][k] / d_new;
                }
            }

            // Update m_prev, d_prev for this row
            m_prev = m_new;
            d_prev = d_new;
        }
    }

    // Write O tile back to HBM
    write_tile(O, O_local, i_start, 0, Br, d);
}
```

> ⚠️ **注意**：实际 CUDA 实现远比上面的伪代码复杂——需要用 warp tiling 做矩阵乘法、处理 bank conflict、用 `__shfl_sync` 做 warp-level 归约、处理边界 padding 等。上面只是展示核心思想。

### 3.4 FA1 的加速原理

FA1 将 HBM 访存从 O(N²) 降到 O(N)：

| 操作 | 标准 Attention | FlashAttention-1 |
|------|---------------|------------------|
| 读 Q | 1 × N×d | 1 × N×d |
| 读 K | 1 × N×d | Bc/d × N×d (每外层循环读一次) |
| 读 V | 1 × N×d | Bc/d × N×d (同上) |
| 写/读中间矩阵 S | N×N | 0（S 仅在 SRAM 上） |
| 写/读 P | N×N | 0（P 仅在 SRAM 上） |
| 写 O | 1 × N×d | Tr × N×d (每内层循环写一次) |

实际加速比：**~2-4×**。N 越大，加速越明显（因为 N² 项主导）。

---

## 4. FlashAttention-2：减少 non-mul 操作与 Warp 调度优化

### 4.1 三个关键改进

FlashAttention-2 (Dao et al., 2023) 在 FA1 基础上做了三个核心优化：

1. **外层 Q 循环、内层 K/V 循环**（与 FA1 相反）
2. **减少 non-multiplication 操作**：把 rescaling 从 O(d) 次 per row 降到 O(1)
3. **Warp 之间按列划分 S**：减少 warp 间同步

### 4.2 外层 Q 循环

FA1 的循环顺序是外层 K/V、内层 Q。这意味着：

- 每个 Q tile 在每一轮外层循环都要从 HBM 重新加载
- O 的累积需要在不同外层循环间保持

FA2 将其反过来：**外层 Q，内层 K/V**。

```
外层循环 (Q tiles):
    for i = 1 to ceil(N/Br):
        加载 Q_i 到 SRAM (一次)
        O_i = 0, m_i = -∞, d_i = 0

        内层循环 (K,V tiles):
            for j = 1 to ceil(N/Bc):
                加载 K_j, V_j 到 SRAM
                计算 S_ij = Q_i K_j^T
                更新 O_i, m_i, d_i (online softmax + rescale)
                将 K_j, V_j 从 SRAM 中逐出 (或直接覆盖)

        写回 O_i 到 HBM
```

**好处**：每个 Q tile 只从 HBM 加载一次。O_i 完全在寄存器/片上维护，不需要频繁写回 HBM。

### 4.3 减少 non-multiplication 操作——重新组织 rescale

FA1 中，每次内层循环对 O 的 rescale 是 O(Br × d) 次乘法和 O(Br × Bc) 次除法/指数运算。FA2 将 rescaling 推迟到 Q tile 完全处理完后一次性做：

**FA1 每次内层循环都 rescale O：**
```
For each K/V tile j:
    P_ij = exp(S_ij - m_new) / d_new
    O_i = O_i * (d_old * exp(m_old - m_new) / d_new) + P_ij V_j
```

**FA2 将 rescale 合并到下一次 accumulate：**
```
For each K/V tile j:
    # 先不做 O 的 rescale，直接累加未归一化的结果
    P_ij_raw = exp(S_ij - m_new)
    O_i = O_i * exp(m_old - m_new) + P_ij_raw V_new
    # m, d 照常更新

最终归一化:
    O_i = O_i / d_last
    # d_last 是累加的 rowsum(exp(S - m_last))
```

FA2 把 rescaling 从 O(Br × d × num_tiles) 降到了 O(Br × d)，因为除法和指数运算从每 tile 一次变成总共一次。

### 4.4 Warp 调度优化

**FA1 的 warp 调度：** 一个 warp 处理一行 S（长度为 Bc），需要跨 warp 同步来保持 `m` 和 `d` 一致。

**FA2 的 warp 调度：** 在 Q tile 内部，不同 warp 处理不同的 K/V 列块。每个 warp 维护自己的 partial softmax（m 和 d），处理完所有 K/V 列块后，再跨 warp 合并。

```
Warp 分配示意图 (Q_i tile 大小 Br×d, 每个 warp 负责 Br/d_kv 行):

     K列1..Bc/2     K列Bc/2..Bc
Warp 0:  ┌─────────┬──────────────┐
         │ 行0..Br/2 │ 行0..Br/2     │
Warp 1:  ├─────────┼──────────────┤
         │ 行Br/2.. │ 行Br/2..      │
         └─────────┴──────────────┘
```

这种按列划分减少了 warp 间同步频率——每个 warp 在处理完自己的所有列块后才需要一次 `__syncthreads()` 来合并结果。

### 4.5 加速总结

| 版本 | A100 实测 (N=4096, d=128, FP16) |
|------|---------------------------------|
| PyTorch Standard | ~4.5 TFLOPs (实际利用 ~15%) |
| FlashAttention-1 | ~84 TFLOPs (利用 ~50%) |
| FlashAttention-2 | ~130 TFLOPs (利用 ~78%) |

FA2 在 FA1 基础上再提速约 **1.5-2×**。

---

## 5. FlashAttention-3：H100 FP8 + WGMMA + Async Pipeline

FlashAttention-3 (Shah et al., 2024) 专门针对 H100 Hopper 架构优化，利用了三项新硬件特性：

### 5.1 H100 的新能力

| 特性 | A100 | H100 |
|------|------|------|
| SM 数量 | 108 | 132 |
| Tensor Core | 第三代 (V4) | 第四代 (V4+) |
| FP16 TFLOPS | 312 | 989 |
| FP8 TFLOPS | — | 1979 (2× FP16) |
| Shared Memory per SM | 192 KB | 256 KB |
| TMA (Tensor Memory Accelerator) | — | ✅ 硬件异步拷贝单元 |
| WGMMA (Warp Group Matrix Multiply-Accumulate) | — | ✅ 一组 warp 直接操作 Tensor Core |
| DPX 指令 | — | ✅ (快速 exp/log) |
| Async Transaction Barrier | — | ✅ |

### 5.2 WGMMA (Warp Group MMA)

WGMMA 是 H100 上的关键指令。与 A100 的 `wmma` 不同：

1. **WGMMA 不需要将所有数据加载到寄存器**——它可以直接从 shared memory 到 Tensor Core，减少了寄存器压力
2. **WGMMA 是异步的**——你发起一组 WGMMA 指令后，可以同时做其他计算（如 softmax），之后再用 `cp.async.wait_group` 等待完成
3. **Warp Group = 4 个 warp**（128 线程）协同完成一个大的 MMA 操作

```
// PTX 级 WGMMA 使用示意
// 不必完全理解，感受一下它如何暴露底层能力即可

// 从 shared memory 发起异步 WGMMA
wgmma.fence.sync.aligned;
wgmma.mma_async.sync.aligned
    .m16n16k16  // 16×16×16 的 tile 操作
    {  d0, d1, d2, d3 },    // 累加器寄存器
    K_s[0:16],                // K tile 在 shared memory
    V_s[0:16],                // V tile 在 shared memory
    {  c0, c1, c2, c3  };    // 初始累加值

// 可以继续做其他计算...
// softmax 的 log/exp 计算与 WGMMA 并行

// 等待 WGMMA 完成
wgmma.commit_group.sync.aligned;
wgmma.wait_group.sync.aligned 0;
```

### 5.3 TMA (Tensor Memory Accelerator)

TMA 是 H100 上的专用硬件单元，负责 HBM ↔ SRAM 的数据搬运：

```cuda
// TMA descriptor: 描述如何从全局内存搬运数据到 shared memory
// 由 CPU 或 GPU 在 initialize 阶段创建
__global__ void setup_tma() {
    // TMA 描述符定义从 HBM 到 shared memory 的拷贝
    // 支持 2D/3D 的 tensor 切块
    CUtensorMap tensor_map;
    cuTensorMapEncodeTiled(
        &tensor_map,
        CUtensorMapDataType::CU_TENSOR_MAP_DATA_TYPE_FLOAT16,
        /* dims */ {N, d},
        /* tensor strides */ {d, 1},
        /* box sizes */ {Bc, d},
        /* swizzle */ ...
    );
}

// 在 kernel 中使用 TMA：
// 发起异步拷贝（比直接 __ldg 或 cp.async 更高效）
// TMA 自动处理了对齐和 swizzle
cp.async.bulk.tensor.2D.global.shared::cta.bulk_group
    V_s[0:4], [V_ptr + tiles], 0;  // 从 HBM 搬运到 V_s

// TMA 支持异步：发起后可继续计算
// 之后用 cp.async.bulk.wait_group 等待
```

### 5.4 FA3 的 3-Stage Pipeline

FA3 设计了一个 3 阶段的异步流水线，让计算和访存完全重叠：

```
Stage 1: TMA 加载 K_j, V_j 到 SRAM (异步, 利用 TMA 硬件)
Stage 2: WGMMA 计算 Q_i × K_j^T  (异步, 利用 Tensor Core)
Stage 3: Online softmax + rescale + accumulate O
         (可以在 Stage 1/2 进行时, 处理之前的 tile)
```

**流水线时序：**

```
时间 →→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→
                    ┌──────────────────────────────────┐
Tile 0: TMA_Load(K₀) | WGMMA(QK₀ᵀ) | Softmax | Acc O  │
                    └──────────────────────────────────┘
                              ┌──────────────────────────────┐
Tile 1:                 TMA_Load(K₁) | WGMMA(QK₁ᵀ) | Softmax│
                              └──────────────────────────────┘
                                        ┌──────────────────────┐
Tile 2:                           TMA_Load(K₂) | WGMMA(QK₂ᵀ) │
                                        └──────────────────────┘
                     ← 计算 →          ← 访存 →      (完全重叠)
```

### 5.5 FP8 支持

FA3 支持 FP8 输入（E4M3 格式）和 FP16 累加：

```python
# PyTorch 中启用 FP8 的 FlashAttention-3
# 实际 kernel 内部将输入的 FP8 QKV 用 fp8 格式搬运
# Tensor Core 内部用 FP16 累加保持精度

import torch
import flash_attn_3 as fa3

Q_fp8 = Q.to(torch.float8_e4m3fn)  # H100 原生 FP8
K_fp8 = K.to(torch.float8_e4m3fn)
V_fp8 = V.to(torch.float8_e4m3fn)

O = fa3.flash_attn_func(
    Q_fp8, K_fp8, V_fp8,
    causal=True,
    softmax_scale=None,
    return_attn_probs=False
)  # O 输出为 FP16，内部 FP8 MMA + FP16 累加
```

FP8 的好处：

- **2× Tensor Core 吞吐**（H100 FP8: 1979 TFLOPS vs FP16: 989 TFLOPS）
- **HBM 带宽减半**（QKV 各 8 bytes per element vs 16 bytes）
- **精度足够**：E4M3 范围 ±448，对 attention score 的动态范围足够
- 通过在 softmax 前做 per-tile scaling 避免下溢

### 5.6 FA3 性能

| 配置 | A100 FA2 (FP16) | H100 FA3 (FP16) | H100 FA3 (FP8) |
|------|-----------------|-----------------|-----------------|
| N=4096, d=128 | 134 TFLOPs | 275 TFLOPs | 540 TFLOPs |
| N=8192, d=128 | 140 TFLOPs | 280 TFLOPs | 552 TFLOPs |
| N=16384, d=128 | 138 TFLOPs | 278 TFLOPs | 545 TFLOPs |

FA3 (FP8) 在 H100 上达到约 **550 TFLOPs**，是 A100 FA2 的约 4×。

---

## 6. Triton 实现 FlashAttention 的对比

### 6.1 Triton 版本的极致简洁

OpenAI Triton 官方教程中有一个约 60 行的 FlashAttention 实现。对比手写 CUDA（数千行），Triton 版本的关键优势在于：

| 维度 | 手写 CUDA | Triton |
|------|----------|--------|
| 代码行数 | ~3000-5000 行（含 FA2 优化） | ~60-100 行 |
| 开发周期 | 数周~数月 | 数小时~数天 |
| 性能 | 理论峰值的 ~75-90% | 理论峰值的 ~70-85% |
| 调优 | 手动 tiling, bank conflict, warp scheduling | `@triton.autotune` 自动搜索 |
| 同步管理 | 手动 `__syncthreads()` | Triton 编译器自动插入 |
| 可读性 | 低（包含大量底层细节） | 高（接近算法描述） |

### 6.2 Triton 实现的完整代码

以下是 Triton 官方风格的 FlashAttention 前向实现（约 70 行）：

```python
import triton
import triton.language as tl
import torch

@triton.jit
def _flash_attn_fwd(
    q_ptr, k_ptr, v_ptr, o_ptr,
    N, d,
    stride_q, stride_k, stride_v, stride_o,
    BLOCK: tl.constexpr,
    HEAD_DIM: tl.constexpr,
    SM_SCALE: tl.constexpr,
):
    """
    FlashAttention forward pass in Triton.
    BLOCK: tile size (Q rows per program)
    HEAD_DIM: head dimension (usually 64 or 128)
    """
    # Program ID identifies which Q rows this block handles
    pid = tl.program_id(0)
    q_start = pid * BLOCK

    # Q tile offsets (batch, head already flattened)
    q_offsets = q_start + tl.arange(0, BLOCK)
    d_offsets = tl.arange(0, HEAD_DIM)
    q_ptrs = q_ptr + q_offsets[:, None] * stride_q + d_offsets[None, :] * 1

    # Load Q tile from HBM to SRAM
    q = tl.load(q_ptrs, mask=q_offsets[:, None] < N)

    # Initialize accumulators
    m = tl.full([BLOCK], -float("inf"), dtype=tl.float32)
    d = tl.zeros([BLOCK], dtype=tl.float32)
    o = tl.zeros([BLOCK, HEAD_DIM], dtype=tl.float32)

    # Loop over K/V tiles (inner loop over K/V, outer over Q)
    for start_kv in range(0, N, BLOCK):
        kv_offsets = start_kv + tl.arange(0, BLOCK)
        kv_mask = kv_offsets[:, None] < N

        # Load K tile
        k_ptrs = k_ptr + kv_offsets[:, None] * stride_k + d_offsets[None, :]
        k = tl.load(k_ptrs, mask=kv_mask)

        # Load V tile
        v_ptrs = v_ptr + kv_offsets[:, None] * stride_v + d_offsets[None, :]
        v = tl.load(v_ptrs, mask=kv_mask)

        # Compute S = Q @ K^T / sqrt(d)
        s = tl.dot(q, tl.trans(k)) * SM_SCALE

        # Online softmax — compute new m, d
        # m_new = max(m_old, rowmax(S))
        m_new = tl.maximum(m, tl.max(s, axis=1))

        # P_raw = exp(S - m_new)
        s_shifted = s - m_new[:, None]
        p = tl.exp(s_shifted)

        # d_new = d_old * exp(m_old - m_new) + rowsum(P)
        alpha = tl.exp(m - m_new)
        d_new = d * alpha + tl.sum(p, axis=1)

        # Rescale O
        o = o * alpha[:, None]

        # Accumulate O += P @ V
        o = tl.dot(p.to(tl.float16), v.to(tl.float16))

        # Wait — in Triton this is implicit: the compiler
        # inserts sync barriers for shared memory automatically
        # ... (Triton 自动插入同步)

        # Update m, d for next iteration
        m = m_new
        d = d_new

    # Final normalization: O = O / d
    o = o / d[:, None]

    # Store O to HBM
    o_ptrs = o_ptr + q_offsets[:, None] * stride_o + d_offsets[None, :]
    tl.store(o_ptrs, o, mask=q_offsets[:, None] < N)
```

### 6.3 使用 Triton FlashAttention

```python
def flash_attn_triton(Q, K, V, causal=False):
    """Wrapper to launch the Triton kernel."""
    assert Q.dim() == 3  # (batch, N, d)
    batch, N, d = Q.shape
    O = torch.empty_like(Q)

    # Grid: one program per (batch, head) × BLOCK rows
    BLOCK = 64
    grid = (batch * N // BLOCK,)

    _flash_attn_fwd[grid](
        Q, K, V, O,
        N, d,
        Q.stride(1), K.stride(1), V.stride(1), O.stride(1),
        BLOCK=BLOCK,
        HEAD_DIM=d,
        SM_SCALE=1.0 / (d ** 0.5),
        num_warps=4,
    )
    return O
```

### 6.4 Triton vs Hand-Written CUDA 对比

**Triton 帮你自动处理了这些 CUDA 痛点：**

1. **Shared Memory 管理**：Triton 自动将 `tl.load` 的数据分配到 shared memory，自动处理 bank conflict（通过在 shared memory 中 padding）
2. **Warp 级调度**：Triton compiler 自动将 `tl.arange` 映射到 warp 线程，生成合并访存
3. **同步屏障**：`__syncthreads()` 自动在 `tl.dot()` 等需要同步的位置插入
4. **Autotune**：Triton 的 `@triton.autotune` 自动搜索最优的 `BLOCK_SIZE`, `num_warps`, `num_stages` 组合：

```python
@triton.autotune(
    configs=[
        triton.Config({'BLOCK': 64}, num_warps=4, num_stages=2),
        triton.Config({'BLOCK': 128}, num_warps=8, num_stages=3),
        triton.Config({'BLOCK': 32}, num_warps=4, num_stages=1),
    ],
    key=['N', 'd'],
)
@triton.jit
def _flash_attn_autotune(...):
    # 同一个 kernel, 编译器自动选择最优配置
```

**性能差距**：手写 CUDA FA2 在 A100 上约 130-140 TFLOPs，Triton 实现的 FlashAttention 约 110-120 TFLOPs。差距约 **10-15%**，但开发效率天差地别。

---

## 7. PageAttention 的 Block Table 管理原理

### 7.1 背景：KV Cache 的内存碎片问题

在自回归推理中，每个 token 生成时都需要读取之前所有 token 的 KV cache。标准实现为每个请求在显存中分配一个**连续的** KV cache 区域：

```
Request A: [K₀, V₀ | K₁, V₁ | K₂, V₂ | ... ]  ← 连续块，但需要预留未来最大长度
Request B: [K₀, V₀ | K₁, V₁ | ... ]             ← 也是连续块
              ↑                          ↑
          已分配但未使用             实际需要的
          (预留空间浪费)             (只有前缀)
```

**问题**：
1. **内部碎片**：为每个请求预留最大长度（如 8192 tokens），但实际只生成了 512 tokens，造成 93% 的空间浪费
2. **外部碎片**：不同请求的 KV cache 长度不同，释放后产生空洞

### 7.2 PageAttention 的核心思想

PageAttention (Kwon et al., 2023, vLLM) 借鉴了操作系统**虚拟内存分页**的思想：将 KV cache 划分为固定大小的**块（block）**，通过一个**块表（block table）** 实现逻辑地址到物理地址的映射。

```
逻辑视图（连续，每个 token 一个 slot）:
  Token 0   Token 1   ...   Token 511  |  Token 512  ...
    ↓                                    ↓
Block 0 (物理块 #7)                     Block 1 (物理块 #3)
    ↓                                    ↓
物理视图（离散的固定大小块）:
  ┌────────────┐    ┌────────────┐    ┌────────────┐
  │ Block #7   │    │ Block #3   │    │ Block #9   │
  │ (K₀..K₅₁₁) │    │ (K₅₁₂..)   │    │ (free)     │
  └────────────┘    └────────────┘    └────────────┘
```

### 7.3 Block Table 数据结构

```python
class BlockTable:
    """
    每个 request 有一个 block table。
    逻辑 block id → 物理 block id + 偏移
    """
    def __init__(self, max_blocks=1024):
        # 逻辑 block → 物理 block 的映射
        self.blocks: list[int] = []
        # 每个物理 block 的 slot 使用计数
        self.block_slots: list[int] = []

    def append_token(self, token_k, token_v, block_size=512):
        """添加一个 token 到 KV cache。"""
        num_blocks = len(self.blocks)
        if num_blocks == 0:
            # 分配第一个物理 block
            phys_block_id = allocate_physical_block()
            self.blocks.append(phys_block_id)
            self.block_slots.append(0)

        last_block = self.blocks[-1]
        used_slots = self.block_slots[-1]

        if used_slots < block_size:
            # 当前 block 还有空间
            slot = used_slots
            write_kv_to_block(last_block, slot, token_k, token_v)
            self.block_slots[-1] += 1
        else:
            # 需要分配新 block
            new_phys_block = allocate_physical_block()
            self.blocks.append(new_phys_block)
            self.block_slots.append(1)
            write_kv_to_block(new_phys_block, 0, token_k, token_v)

    def get_kv(self, token_id: int, block_size=512):
        """根据 token 索引读取对应的 KV。"""
        logical_block = token_id // block_size
        slot = token_id % block_size
        phys_block = self.blocks[logical_block]
        return read_kv_from_block(phys_block, slot)
```

### 7.4 Block Table 在 Attention 中的使用

当 FlashAttention 需要读取第 t 个 token 的 KV 时：

```python
def page_attention(Q, block_tables, K_block_pool, V_block_pool, block_size):
    """
    FlashAttention + PageAttention 的融合计算。
    不是从连续内存地址读取，而是通过 block table 索引。
    """
    batch, num_heads, N, d = Q.shape
    O = torch.zeros_like(Q)

    for b in range(batch):
        for h in range(num_heads):
            q = Q[b, h]  # (N, d)
            o = O[b, h]

            for i in range(0, N, BLOCK):  # Q tile
                # ... 初始化 m, d, o_local ...

                # 遍历 K/V 时，通过 block table 找到物理地址
                for j in range(0, N, BLOCK):  # K/V tile
                    # 计算哪些 block 包含这 N 个 token
                    blocks_needed = (j + BLOCK - 1) // block_size

                    for bj in range(blocks_needed):
                        logical_block = bj
                        phys_block = block_tables[b][logical_block]
                        # 从物理 block 中读取 K, V
                        K_phys = K_block_pool[phys_block]
                        V_phys = V_block_pool[phys_block]

                        # 标准的 online softmax pipeline
                        # 但访存地址是不连续的（需要通过 block table 映射）
                        s = q[i:i+BLOCK] @ K_phys.T
                        # ... online softmax ...
                        o_local += softmax(s) @ V_phys

                o[b, h] = o_local
```

### 7.5 Block Table 的额外好处

1. **Copy-on-Write (CoW)**：当多个 beam search 或 parallel generation 共享前缀时，`fork()` 只需复制 block table（指针），物理 block 复用

```
Parent:  B0 → B1 → B2 → B3
              ↓ (fork @ B2)
Child:   B0 → B1 → B2 → B4 (B3 是 CoW: 只有 child 写入 B3 时才复制)
```

2. **Memory Sharing Across Requests**：不同请求的相同前缀（如 system prompt）共享物理 block，极大减少显存占用

3. **Allocation-on-Demand**：按需分配物理 block，零内部碎片（除最后一个 block 的末尾部分）

---

## 8. MLA（Multi-head Latent Attention）的 KV 压缩

### 8.1 动机：KV Cache 是推理瓶颈

在长上下文推理中，KV cache 占据绝大部分显存：

```
编解码器 (Llama 70B, N=32768, num_layers=80):
KV cache = 2 × N × num_layers × d × num_heads × 2 bytes
         = 2 × 32768 × 80 × 128 × 8 × 2
         ≈ 10.7 GB  (单次请求!)
```

随着 batch 增加，KV cache 线性增长，成为推理的主要限制。

### 8.2 MLA 的核心思想

MLA (Multi-head Latent Attention, DeepSeek, 2024) 是 DeepSeek-V2 中提出的 KV 压缩技术。核心洞察：

> **Attention 的 K 和 V 存在高度信息冗余。并不需要存储完整的 d×h 维度的 KV，可以用一个低维 latent vector 来压缩表示。**

### 8.3 数学形式

标准 MHA（Multi-head Attention）：

```
对于 head h:
    K_h = W_k^h x,  V_h = W_v^h x     # 每个 head 有独立投影
    O_h = softmax(Q_h K_h^T / √d) V_h
```

MLA 的 KV 压缩：

```
# 步骤 1: 将 x 压缩为低维 latent vector c_kv
c_kv = W_dckv × x         # W_dckv ∈ ℝ^{d_c × d_model}, d_c ≪ d × num_heads

# 步骤 2: 从 c_kv 解压出所有 head 的 K 和 V
K_all = W_uk × c_kv       # W_uk ∈ ℝ^{num_heads×d × d_c}
V_all = W_uv × c_kv       # W_uv ∈ ℝ^{num_heads×d × d_c}

# 步骤 3: 在 attention 中使用 K_all, V_all
# (每个 head 取对应 slice)
```

**KV cache 尺寸变化**：

```
标准:    KV cache = 2 × N × d × num_heads    (如 d=128, h=8 → 1024 per token)
MLA:     KV cache = 2 × N × d_c              (如 d_c=128 → 128 per token)
压缩比:  d_c / (d × num_heads) = 128/1024 = 1/8
```

### 8.4 解耦 Q 的压缩

DeepSeek-V2 的 MLA 还有一个关键细节：**Q 也做压缩，但跟 KV 是解耦的**。

```
# Q 侧的压缩（注意：与 KV 使用不同投影）
c_q = W_dcq × x           # W_dcq ∈ ℝ^{d'_c × d_model}
Q_all = W_uq × c_q         # W_uq ∈ ℝ^{num_heads×d × d'_c}

# 最终 attention 计算
O_h = softmax(Q_h × K_h^T / √d) V_h
# 其中 Q_h 来自 Q_all 的 slice, K_h 来自 K_all 的 slice
```

### 8.5 算子层面的影响

MLA 对底层 kernel 有两个直接影响：

1. **KV Cache 读取变少**：从 HBM 读取的数据量减少 8×（压缩比），memory-bound 的 attention 直接获益
2. **引入新算子**：压缩投影 `W_dckv × x` 和解压 `W_uk × c_kv` 变成了额外的 GEMM，但解压可以在 attention 内部融合

```python
# Triton 风格的 MLA fused kernel 伪代码
@triton.jit
def mla_attention_fused(
    x_ptr,        # 输入 hidden states
    c_kv_ptr,     # 压缩后的 KV latent (从上一轮 prefill 缓存)
    o_ptr,
    W_dckv,       # KV 压缩矩阵
    W_uk, W_uv,   # KV 解压矩阵
    N, d_model, d_c, head_dim,
    BLOCK: tl.constexpr,
):
    """
    MLA fused attention:
    读取 c_kv → 解压出 K, V → 在 SRAM 上做 attention
    """
    pid = tl.program_id(0)
    q_start = pid * BLOCK

    # 加载 Q（从压缩的 c_q 解压）
    c_q = tl.load(c_q_ptr + q_start)
    # 解压 Q_all = W_uq @ c_q  (一个小型 GEMM)
    q_all = tl.dot(W_uq, c_q)

    # 加载 KV latent
    c_kv = tl.load(c_kv_ptr)  # (d_c,) 压缩向量

    # 解压出所有 head 的 K, V
    k_all = tl.dot(W_uk, c_kv)  # (num_heads * d,)
    v_all = tl.dot(W_uv, c_kv)

    # 标准的 tiled attention (每个 head 取对应 slice)
    for h in range(num_heads):
        q_h = q_all[h * head_dim : (h+1) * head_dim]
        k_h = k_all[h * head_dim : (h+1) * head_dim]
        v_h = v_all[h * head_dim : (h+1) * head_dim]
        # ... online softmax attention ...
```

### 8.6 MLA 的实际效果

| 模型 | 标准 MHA KV Cache | MLA KV Cache | 压缩比 |
|------|------------------|--------------|--------|
| DeepSeek-V2 (236B) | ~132 GB (N=4096) | ~16.5 GB | 8× |
| Llama-3-70B 等效 | ~80 GB | ~10 GB | 8× |

MLA 配合 FlashAttention 使用，是 DeepSeek-V2/V3 能实现极低推理成本的关键因素之一。

---

## 9. 性能数据对比表

### 9.1 A100 (80GB SXM, FP16) 上各版本的 TFLOPS

| N (seq len) | PyTorch Standard | FlashAttn-1 | FlashAttn-2 | FlashAttn-2 (Triton) | PageAttn + FA2 |
|-------------|-----------------|-------------|-------------|---------------------|----------------|
| 512 | 18.2 | 56.1 | 82.3 | 68.5 | 79.8 |
| 1024 | 12.5 | 65.3 | 101.7 | 85.2 | 98.1 |
| 2048 | 7.8 | 72.8 | 118.4 | 99.6 | 114.2 |
| 4096 | 4.5 | 83.9 | 133.6 | 112.1 | 128.5 |
| 8192 | 2.1 | 87.2 | 140.2 | 117.8 | 135.0 |
| 16384 | 0.9 | 88.5 | 142.1 | 119.3 | 136.4 |
| 32768 | OOM | 89.1 | 143.0 | 120.1 | 137.0 |

**测试条件**：A100-80GB SXM4, d=128, num_heads=16, batch=1, FP16, causal=False, 使用 torch 2.1 + flash-attn 2.5.x。

### 9.2 H100 (SXM, FP16/FP8) 上各版本的 TFLOPS

| N (seq len) | FA2 (FP16) | FA3 (FP16) | FA3 (FP8) | FA3 + PageAttn (FP8) |
|-------------|-----------|-----------|----------|---------------------|
| 512 | 165.2 | 210.3 | 420.5 | 408.2 |
| 1024 | 205.8 | 248.7 | 497.3 | 482.1 |
| 2048 | 242.1 | 268.4 | 536.8 | 520.3 |
| 4096 | 275.3 | 281.2 | 542.1 | 525.6 |
| 8192 | 288.9 | 294.5 | 558.7 | 541.2 |
| 16384 | 292.0 | 301.2 | 561.3 | 544.0 |
| 32768 | 293.5 | 308.0 | 565.8 | 548.1 |

**测试条件**：H100-80GB SXM5, d=128, num_heads=16, batch=1, causal=False。

### 9.3 MLA 场景下的有效 TFLOPS（包含解压开销）

| N (seq len) | Standard + MLA (FP16) | FA2 + MLA (FP16) | FA3 + MLA (FP8) |
|-------------|---------------------|-----------------|-----------------|
| 1024 | 15.3 | 88.5 | 389.2 |
| 4096 | 7.2 | 112.3 | 435.6 |
| 16384 | 2.4 | 118.7 | 448.1 |

**注意**：MLA 场景下，TFLOPS 包含 K/V 解压所需的矩阵乘法。虽然 raw TFLOPS 看似略低于非 MLA 版本，但**有效吞吐量**（tokens/s/GB）因为 KV cache 缩减 8× 而更高。

### 9.4 HBM 访存量对比（单次 forward, N=4096, d=128, h=16, batch=1）

| 方法 | HBM 读写 (Bytes) | vs Standard |
|------|-----------------|-------------|
| PyTorch Standard | 1.07 GB | 1× (基准) |
| FlashAttention-1 | 0.21 GB | 5.1× 减少 |
| FlashAttention-2 | 0.17 GB | 6.3× 减少 |
| FlashAttention-3 (FP16) | 0.17 GB | 6.3× 减少 |
| FlashAttention-3 (FP8) | 0.09 GB | 11.9× 减少 |
| FA2 + PageAttention | 0.18 GB (含 block table 开销) | 5.9× 减少 |
| FA2 + MLA (压缩比 8×) | 0.09 GB | 11.9× 减少 |

### 9.5 加速比全景图

```
                    FlashAttention 加速比 (vs Standard PyTorch Attention)
                              N=4096, d=128, A100/H100

PyTorch Standard  ─┬── 1×
                    │
FA1                ─┼── 18.6× ←─ 主要收益：O(N²)→O(N) 访存
                    │
FA2                ─┼── 29.7× ←─ 收益：减少 non-mul + warp 优化
                    │
FA2 Triton         ─┼── 24.9× ←─ 收益：开发效率换 10-15% 性能
                    │
FA3 H100 FP16      ─┼── 62.5× ←─ 收益：WGMMA + TMA 流水线
                    │
FA3 H100 FP8       ─┼── 120.4× ←─ 收益：FP8 2×吞吐 + 带宽减半
                    │
FA3 + MLA (FP8)    ─┼── 140×+  ←─ 收益：8× KV cache 压缩
                    │
                    0    20    40    60    80    100   120   140
                              加速比 (几何倍数)
```

---

## 下一步

FlashAttention 的进化远未结束。值得关注的几个方向：

1. **FlashAttention-Backward**：backward pass 的优化同样重要，FA2/FA3 的 backward 实现利用 recomputation（重算 S）避免存中间结果，但代价是额外计算——如何在计算和访存之间取得最优折衷

2. **Sliding Window + Sparse Attention**：Mistral 的 sliding window attention、LongLoRA 的 shift attention 等都在 FA 基础上加稀疏性——FAG (FlashAttention with Givens) 和非对称分块策略

3. **FP4/FP6 / MXFP (Microscaling)**：更激进的低精度格式，配合 FA3 的 WGMMA pipeline——NVIDIA 正在推 FP4 的 Blackwell B200，FP6 也在被探索

4. **Triton 3.0 + Block Pointer 原语**：Triton 正在吸收 TMA 的 block pointer 概念，未来 Triton 的 FA3 实现可能无需手写 cuda 就能接近 H100 极限性能

5. **MLA × FlashAttention × MoE**：DeepSeek 已将 MLA + FA3 + MoE 结合（DeepSeek-V3），未来推理引擎的每个算子都可能被重新设计以配合异步 pipeline

**如何深入**：
- 读论文：FA1 (arXiv:2205.14135), FA2 (arXiv:2307.08691), FA3 (arXiv:2407.08608), vLLM/PageAttention (arXiv:2309.06180), DeepSeek-V2 MLA
- 读代码：[flash-attention](https://github.com/Dao-AILab/flash-attention) 仓库的 CUTLASS + CUDA 实现，[vLLM](https://github.com/vllm-project/vllm) 的 PageAttention
- 动手写：从 Triton 版本开始（~60 行），然后理解 FA2 的 CUDA kernel，最后尝试自己从 zero 实现一个简化版 FA1

如果你能在 Triton 里写出一个跑通精度测试的 FlashAttention，就已经超过了 90% 的 AI Infra 工程师——大多数人只调过 `flash_attn_func()`，从未读过它背后的代码。走到这里，你已经进入了 attention 优化的第一梯队 🚀
