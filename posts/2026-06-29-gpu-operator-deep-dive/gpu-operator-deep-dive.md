---
title: "底层 GPU 算子深度解析：从 CUDA Kernel 到 Triton、cuBLAS、CUTLASS 与 Thrust"
date: 2026-06-29
tags: [GPU算子, CUDA, Triton, CUTLASS, cuBLAS, cuDNN, Thrust, AI Infra, 高性能计算]
---

如果说 AI 框架是建造大模型的"蓝图"，那**底层 GPU 算子就是刻在硅片上的"微指令"**。从你调用的 `torch.add()` 到 GPU 上真正执行的万亿次浮点运算，中间隔着从 CUDA Kernel 手写到厂商库调用的五个技术层次。无论你是刚接触 AI Infra 的新手，还是正在打磨推理引擎的工程老兵，理解这五个层次的实现原理和取舍逻辑，都是写出高性能算子的必修课。

> **本文核心内容**：系统性地覆盖 CUDA Kernel 算子（Element-wise、Reduce、Scan、Matrix Multiply）、Triton 算子（Tile-Based 编程模型、FlashAttention）、cuBLAS/cuDNN 库算子（GEMM 调优、卷积算法选择、cudnnFrontend 融合）、CUTLASS 算子（模板化 GEMM、Epilogue Visitor Tree、Hopper WGMMA/TMA），以及 Thrust/CUB 库算子（Device-Wide 原语、Decoupled Look-back、Radix Sort）。文末附性能分类总结和实现选择指南。

<!--more-->

---

## 🌍 缘起：为什么连"最底层的算子"也有这么多写法？

我最初接触 GPU 编程时有一个强烈的困惑：**同样是一个矩阵乘法，为什么有人写 CUDA C++、有人用 Triton Python、有人直接调 cuBLAS、有人搬出 CUTLASS 模板？** 它们底层不都是同一个 GPU 在执行吗？

答案是：**每一层代表的抽象代价（Abstraction Tax）与性能控制力之间的不同取舍**。

| 维度 | CUDA 手写 Kernel | Triton Tile-Based | cuBLAS/CUTLASS 库 |
|------|-----------------|-------------------|-------------------|
| 抽象层级 | 线程级，每个线程处理 1 个元素 | Tile（块）级，每个 program 处理一个 block | API 调用级，一行命令完成大规模计算 |
| 开发效率 | ⭐⭐ 低。手动管理 shared memory、同步、bank conflict | ⭐⭐⭐⭐ 高。自动管理存储、自动同步、内置 autotune | ⭐⭐⭐⭐⭐ 极高。一行代码调用优化好的库 |
| 性能上限 | ⭐⭐⭐⭐⭐ 可达理论峰值 | ⭐⭐⭐⭐ 接近手写（相差 5-15%） | ⭐⭐⭐⭐⭐ 厂商深度优化，接近理论极限 |
| 可移植性 | ⭐ 平台锁定（只跑 NVIDIA） | ⭐⭐⭐ 多后端（NVIDIA PTX, AMD GCN, Intel 适配中） | ⭐ 平台锁定 |
| 代表工具 | CUDA C++, inline PTX | OpenAI Triton | cuBLAS, CUTLASS, cuDNN |
| 调试难度 | 高。需要 nsight compute、cuda-gdb | 中。Python 生态，可打印调试 | 低。黑盒调用，基本无需调试 |

写 CUDA Kernel 的好处是**极致可控**——你可以在 PTX 级别调整指令排布，用 `cp.async` 实现异步拷贝，用 `warp shuffle` 替代 shared memory 做归约。但这些优化需要数月经验积累，而且每换一代 GPU 架构（Volta → Turing → Ampere → Hopper）就要重审一遍优化策略。Triton 的定位是**降低门槛的领域专用编译器**——你只需描述"每个 block 做什么"，编译器帮你搞定一切。cuBLAS/cuDNN/CUTLASS 这类库是**产品级选择**——你的推理引擎不应该自己手写 GEMM，除非你有足够的人力和验证预算。

下面我们从最底层开始，逐层深入。

---

## ⚡ 第一章：CUDA Kernel 算子 —— 从线程到 Tensor Core

CUDA Kernel 是 GPU 编程的原子单位。本节覆盖四种最核心的算子模式：Element-wise、Reduce、Scan 和 Matrix Multiply。

### 1.1 Element-wise 算子：最简单的，也是最容易被忽视的

Element-wise 是最基础的 GPU 算子类别——每个输出元素是输入元素的一对一映射，**不存在跨线程的数据依赖**。典型算子包括 ReLU、Sigmoid、GELU、LayerNorm。

#### ReLU：从 naive 到向量化

ReLU 是最简单的激活函数：`f(x) = max(0, x)`。Naive 实现只有几行：

```cuda
__global__ void relu_kernel(const float* x, float* y, int N) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < N) {
        y[idx] = fmaxf(0.0f, x[idx]);
    }
}
```

但 naive 实现通常只用到 ~20% 的显存带宽。利用 **float4 向量化加载/存储**，每次处理 4 个元素，可以获得 4x 有效吞吐提升：

```cuda
__global__ void relu_vec4_kernel(const float* __restrict__ x,
                                  float* __restrict__ y, int N) {
    int idx = (blockIdx.x * blockDim.x + threadIdx.x) * 4;
    if (idx + 3 < N) {
        float4 reg_x = reinterpret_cast<const float4*>(&x[idx])[0];
        float4 reg_y;
        reg_y.x = fmaxf(0.0f, reg_x.x);
        reg_y.y = fmaxf(0.0f, reg_x.y);
        reg_y.z = fmaxf(0.0f, reg_x.z);
        reg_y.w = fmaxf(0.0f, reg_x.w);
        reinterpret_cast<float4*>(&y[idx])[0] = reg_y;
    }
}
```

**性能关键点：**
- ReLU 是 **memory bandwidth bound** 算子（计算极简单，瓶颈在显存吞吐）
- 使用 `__restrict__` 关键字帮助编译器生成更优的 load/store 指令
- Vectorized load/store (float4/int4) 可将有效带宽利用提升至接近硬件峰值
- Grid-stride loop 适配任意大小输入

#### Sigmoid：计算更重，但依旧是 memory-bound

```cuda
__global__ void sigmoid_kernel(const float* __restrict__ x,
                                float* __restrict__ y, int N) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < N) {
        y[idx] = 1.0f / (1.0f + __expf(-x[idx]));
    }
}
```

**优化技巧：** 使用 `__expf()` 快速数学版本；对于 FP16 输入使用 half-precision intrinsic；与前/后算子融合减少 global memory round-trip。

#### LayerNorm：需要跨线程协作的关键算子

LayerNorm 在 transformer 中极其关键，涉及 mean + variance + normalize 三个阶段，是 element-wise 类别中计算最重的：

```cuda
__global__ void layernorm_kernel(const float* __restrict__ x,
    const float* __restrict__ gamma, const float* __restrict__ beta,
    float* __restrict__ y, int N, float eps) {
    int row = blockIdx.x;
    int tid = threadIdx.x;
    extern __shared__ float smem[];

    // Phase 1: compute mean (warp reduce)
    float sum = 0.0f;
    for (int i = tid; i < N; i += blockDim.x)
        sum += x[row * N + i];
    for (int offset = 16; offset > 0; offset /= 2)
        sum += __shfl_down_sync(0xffffffff, sum, offset);
    if (tid % 32 == 0) smem[tid / 32] = sum;
    __syncthreads();
    if (tid < (blockDim.x + 31) / 32) {
        sum = smem[tid];
        for (int offset = 16; offset > 0; offset /= 2)
            sum += __shfl_down_sync(0xffffffff, sum, offset);
    }
    float mean = sum / N;
    __syncthreads();

    // Phase 2: variance (类似 reduce)
    float var_sum = 0.0f;
    for (int i = tid; i < N; i += blockDim.x) {
        float diff = x[row * N + i] - mean;
        var_sum += diff * diff;
    }
    // ... warp reduction ...
    float variance = var_sum / N;
    float inv_std = rsqrtf(variance + eps);
    __syncthreads();

    // Phase 3: normalize
    for (int i = tid; i < N; i += blockDim.x) {
        int idx = row * N + i;
        y[idx] = (x[idx] - mean) * inv_std * gamma[i] + beta[i];
    }
}
```

**LayerNorm 优化技巧：**
- **向量化内存访问**：使用 float4 加载，4x 吞吐提升
- **Warp shuffle 替代 shared memory**：warp 内使用 `__shfl_down_sync`，避免 bank conflict
- **两阶段 reduction**：warp-level → shared memory → warp 0 final reduce
- **使用 `rsqrtf`** 代替 `1.0f / sqrtf()`，单条指令完成倒数平方根
- **Fusion**：将 mean 和 variance 计算融合到一个 pass（Welford 算法）

---

### 1.2 Reduce 算子：树形归约的艺术

Reduce 算子将一组数值归约为单个值（sum, max, min）。核心理念是**树形归约**：每个线程两两配对，以对数步数完成归约。

```cuda
__device__ float warp_reduce_sum(float val) {
    for (int offset = 16; offset > 0; offset /= 2)
        val += __shfl_down_sync(0xffffffff, val, offset);
    return val;  // lane 0 持有最终结果
}
```

**渐进优化版本对比（来自 CUDA-Prefix-Sum-Optimization 项目）：**

| 版本 | 优化技术 | 关键特点 |
|------|---------|---------|
| v1 | Naive GPU | 直接并行，bank conflict 严重 |
| v2 | Shared Memory Tree | 树形归约，stride 步长访问 |
| v3 | Bank Conflict Free | 交错寻址避免 bank conflict |
| v4 | No Divergence | 循环展开消除 warp divergence |
| v5 | Warp Primitives | `__shfl_down_sync` 替代 shared memory |
| v6 | Inter-Block | 多 block 协作处理大输入 |

**完整 block-level reduction：**
```cuda
template<int BLOCK_SIZE>
__device__ float block_reduce_sum(float val) {
    int lane = threadIdx.x % 32;
    int warp_id = threadIdx.x / 32;
    val = warp_reduce_sum(val);
    __shared__ float shared[32];
    if (lane == 0) shared[warp_id] = val;
    __syncthreads();
    if (warp_id == 0) {
        val = (lane < (BLOCK_SIZE + 31) / 32) ? shared[lane] : 0.0f;
        val = warp_reduce_sum(val);
    }
    return val;
}
```

#### Softmax 与 Online Softmax

Softmax 是 Attention 机制的核心算子。传统实现需要 3 次 memory pass（求 max → 求 sum → normalize），而 **Online Softmax**（Milakov & Gimelshein, NVIDIA 2018）将其压缩为 2 次：

```cuda
float m = -INFINITY;
float d = 0.0f;
for each value x_i:
    float m_new = max(m, x_i);
    d = d * expf(m - m_new) + expf(x_i - m_new);
    m = m_new;
// 最终: softmax(x_i) = exp(x_i - m) / d
```

CUDA 实现：

```cuda
__global__ void online_softmax_kernel(const float* __restrict__ x,
                                       float* __restrict__ y, int N) {
    int row = blockIdx.x;
    int tid = threadIdx.x;
    float max_val = -INFINITY;
    float sum_exp = 0.0f;

    for (int i = tid; i < N; i += blockDim.x) {
        float xi = x[row * N + i];
        float new_max = fmaxf(max_val, xi);
        sum_exp *= __expf(max_val - new_max);
        sum_exp += __expf(xi - new_max);
        max_val = new_max;
    }
    // ... warp reduction on max_val & sum_exp ...

    // Final normalization
    for (int i = tid; i < N; i += blockDim.x)
        y[row * N + i] = __expf(x[row * N + i] - global_max) / global_sum;
}
```

Online Softmax 是 **FlashAttention 的核心组件之一**（tiled online softmax）。

---

### 1.3 Scan 算子：Prefix Sum 的 GPU 之路

Scan（Prefix Sum，前缀和）是 GPU 上最核心的并行原语之一。Blelloch 算法分为两个阶段：**Up-sweep（上扫描）** 和 **Down-sweep（下扫描）**。

```cuda
// Up-sweep (reduce phase)
for (int stride = 1; stride < blockDim.x; stride *= 2) {
    int idx = (threadIdx.x + 1) * stride * 2 - 1;
    if (idx < blockDim.x) sdata[idx] += sdata[idx - stride];
    __syncthreads();
}

// Down-sweep
if (threadIdx.x == 0) sdata[blockDim.x - 1] = 0;
__syncthreads();
for (int stride = blockDim.x / 2; stride > 0; stride /= 2) {
    int idx = (threadIdx.x + 1) * stride * 2 - 1;
    if (idx + stride < blockDim.x) {
        float tmp = sdata[idx];
        sdata[idx] = sdata[idx + stride];
        sdata[idx + stride] += tmp;
    }
    __syncthreads();
}
```

#### Warp-Level Scan

```cuda
__device__ float warp_inclusive_scan(float val) {
    for (int offset = 1; offset < 32; offset *= 2) {
        float n = __shfl_up_sync(0xffffffff, val, offset);
        if (threadIdx.x % 32 >= offset) val += n;
    }
    return val;
}
```

对于大规模输入，CUB 库使用 **Decoupled Look-back 算法**（Merrill & Garland, 2016）：每个 block 处理一段连续数据，block 级别 scan 后利用原子操作和全局 flag 传递跨 block 的 carry 值，单 pass 完成，总数据移动约 ~2n，接近 memcpy 速度。

---

### 1.4 Matrix Multiply 算子：从 < 5% 到 90%+ 的优化之路

GEMM 是 GPU 计算中最重要也最复杂的一类算子。从 naive 实现到极致优化，性能差异巨大：

| 层次 | 优化技术 | TFLOPS 效率 |
|------|---------|------------|
| Naive | 三重循环 | < 5% |
| Tiled | Shared memory tiling | ~20-30% |
| Bank conflict free | Padding, swizzle | ~40-50% |
| Vectorized | float4 load/store | ~50-60% |
| Warp-level | Warp tiling + shuffle | ~60-70% |
| Tensor Core | WMMA API (m16n16k16) | ~80%+ |
| SASS tuning | Reuse cache, instruction scheduling | ~90%+ |

#### Tiled GEMM 核心思想

```
C[M][N] = A[M][K] @ B[K][N]

分块: C tile 大小为 BM x BN
      A tile 大小为 BM x BK
      B tile 大小为 BK x BN

for k = 0 to K step BK:
    load A_tile[BM][BK] -> shared memory
    load B_tile[BK][BN] -> shared memory
    __syncthreads()
    for i in BM: for j in BN: for kk in BK:
        C[i][j] += A_tile[i][kk] * B_tile[kk][j]
    __syncthreads()
```

**优化关键点：**
- Tile 形状选择：BM/BN/BK 的比例影响 occupancy 和 shared memory 使用量
- Double buffering：两个 shared memory buffer，load 与 compute 重叠
- `cp.async` (SM80+)：异步拷贝，减少同步开销
- Bank conflict avoidance：shared memory padding 或 swizzle 重排

#### Tensor Core WMMA API

```cuda
#include <mma.h>
using namespace nvcuda;

wmma::fragment<wmma::matrix_a, 16, 16, 16, half, wmma::col_major> a_frag;
wmma::fragment<wmma::matrix_b, 16, 16, 16, half, wmma::row_major> b_frag;
wmma::fragment<wmma::accumulator, 16, 16, 16, float> c_frag;

wmma::load_matrix_sync(a_frag, A_shared, 16);
wmma::load_matrix_sync(b_frag, B_shared, 16);
wmma::load_matrix_sync(c_frag, C, 16);
wmma::mma_sync(c_frag, a_frag, b_frag, c_frag);  // Tensor Core
wmma::store_matrix_sync(C, c_frag, 16, wmma::mem_row_major);
```

#### Batched GEMM

```cuda
cublasGemmStridedBatchedEx(
    handle, CUBLAS_OP_N, CUBLAS_OP_N, m, n, k, &alpha,
    dA, CUDA_R_16F, lda, strideA,
    dB, CUDA_R_16F, ldb, strideB, &beta,
    dC, CUDA_R_16F, ldc, strideC, batch_count,
    CUDA_R_32F, CUBLAS_GEMM_DEFAULT_TENSOR_OP
);
```

---

## 🔧 第二章：Triton 算子 —— Tile-Based 编程革命

Triton（由 OpenAI 开发）是近年 GPU 编程领域最重要的发展之一。它是一种 Python-based GPU kernel DSL，核心理念是 **tile/block 级编程**，而非 CUDA 的**线程级编程**。

### 2.1 Triton 语言特点

| 维度 | CUDA | Triton |
|------|------|--------|
| 抽象级别 | 线程级 | Tile（block）级 |
| 内存管理 | 手动 shared memory | 自动管理 |
| 同步 | 手动 `__syncthreads()` | 自动插入 |
| 内存合并 | 手动 | 编译器自动优化 |
| 指针操作 | 手动 | 编译器生成 |
| 编程语言 | C++ 扩展 | Python-like DSL |
| 编译 | nvcc AOT | JIT 编译 |
| 自动调优 | 无 | 内置 autotuning |

#### 对比示例：Vector Add

**CUDA：**
```cuda
__global__ void vector_add_cuda(const float* a, const float* b, float* c, int N) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < N) c[idx] = a[idx] + b[idx];
}
```

**Triton：**
```python
import triton
import triton.language as tl

@triton.jit
def vector_add_triton(a_ptr, b_ptr, c_ptr, N, BLOCK: tl.constexpr):
    pid = tl.program_id(axis=0)
    offsets = pid * BLOCK + tl.arange(0, BLOCK)
    mask = offsets < N
    a = tl.load(a_ptr + offsets, mask=mask)
    b = tl.load(b_ptr + offsets, mask=mask)
    tl.store(c_ptr + offsets, a + b, mask=mask)
```

Triton 的写法更接近"算法描述"：一个 `tl.load` 自动处理了合并访存，`mask` 参数自动处理边界，少了 4-5 行底层细节。

#### 内置 Autotune

```python
@triton.autotune(
    configs=[
        triton.Config({'BLOCK_SIZE': 64}, num_warps=4),
        triton.Config({'BLOCK_SIZE': 128}, num_warps=4),
        triton.Config({'BLOCK_SIZE': 128}, num_warps=8),
        triton.Config({'BLOCK_SIZE': 256}, num_warps=8),
    ],
    key=['N'],
)
@triton.jit
def tuned_kernel(...): ...
```

### 2.2 Fused Softmax (Triton)

相比 PyTorch 的 5-kernel launch (amax + sub + exp + sum + div)，Triton 单 kernel 完成：

```python
@triton.jit
def fused_softmax_kernel(x_ptr, y_ptr, M, N, stride_x, stride_y, BLOCK_N: tl.constexpr):
    row = tl.program_id(0)
    row_start = row * stride_x
    col_offsets = tl.arange(0, BLOCK_N)
    mask = col_offsets < N
    x = tl.load(x_ptr + row_start + col_offsets, mask=mask, other=-float('inf'))
    m = tl.max(x, axis=0)
    e = tl.exp(x - m)
    l = tl.sum(e, axis=0)
    y = e / l
    tl.store(y_ptr + row * stride_y + col_offsets, y, mask=mask)
```

### 2.3 FlashAttention in Triton

核心是 **tiling + online softmax**：

```python
@triton.jit
def flash_attention_kernel(Q_ptr, K_ptr, V_ptr, O_ptr, seq_len, head_dim,
    stride_qn, stride_qd, stride_kn, stride_kd, stride_vn, stride_vd,
    stride_on, stride_od, scale, BLOCK_Q: tl.constexpr, BLOCK_KV: tl.constexpr, HEAD_DIM: tl.constexpr):

    q_tile = tl.program_id(0)
    q_off = q_tile * BLOCK_Q + tl.arange(0, BLOCK_Q)
    d_off = tl.arange(0, HEAD_DIM)
    q_mask = q_off < seq_len

    Q = tl.load(Q_ptr + q_off[:, None] * stride_qn + d_off[None, :] * stride_qd, mask=q_mask[:, None], other=0.0)

    # Initialize online softmax state
    m = tl.full([BLOCK_Q], float("-inf"), dtype=tl.float32)
    l = tl.zeros([BLOCK_Q], dtype=tl.float32)
    O = tl.zeros([BLOCK_Q, HEAD_DIM], dtype=tl.float32)

    # Iterate over all K/V tiles
    for kv_start in range(0, seq_len, BLOCK_KV):
        kv_off = kv_start + tl.arange(0, BLOCK_KV)
        kv_mask = kv_off < seq_len

        K = tl.load(K_ptr + kv_off[:, None] * stride_kn + d_off[None, :] * stride_kd, mask=kv_mask[:, None], other=0.0)
        V = tl.load(V_ptr + kv_off[:, None] * stride_vn + d_off[None, :] * stride_vd, mask=kv_mask[:, None], other=0.0)

        S = tl.dot(Q, tl.trans(K)) * scale
        S = tl.where(kv_mask[None, :], S, float("-inf"))

        # Online softmax update
        m_new = tl.maximum(m, tl.max(S, axis=1))
        alpha = tl.exp(m - m_new)
        p = tl.exp(S - m_new[:, None])
        l = alpha * l + tl.sum(p, axis=1)
        O = O * alpha[:, None] + tl.dot(p, V)
        m = m_new

    # Final normalization
    O = O / l[:, None]
    tl.store(O_ptr + q_off[:, None] * stride_on + d_off[None, :] * stride_od, O, mask=q_mask[:, None])
```

**关键洞察：**
- 每次循环处理 `BLOCK_KV x HEAD_DIM` 的 K/V tile
- `m/l/O` 是 query tile 的 running state
- `alpha = exp(m_old - m_new)` 修正旧 tile 的贡献
- 内存复杂度从 O(N²) 降至 O(N)

### 2.4 Triton vs CUDA 性能对比

**FP16 MatMul (4096x4096)：**

| 实现 | Time (ms) | Speedup |
|------|-----------|---------|
| PyTorch (Naive) | 480 ms | 1x |
| CUDA (Hand-tuned) | 14 ms | 34x |
| Triton | 12 ms | 40x |
| Tensor Core (cuBLAS) | 3.2 ms | 150x |

**Fused Softmax (1024x1024)：**

| 实现 | Time | 说明 |
|------|------|------|
| PyTorch unfused (5 kernels) | 1.8 ms | 多次 memory round-trip |
| CUDA fused | 0.44 ms | 手动融合 |
| Triton | 0.32 ms | 自动融合 |
| FlashAttention | 0.20 ms | 极端优化 |

**FlashAttention Forward (RTX 4070 Laptop, head_dim=64)：**

| batch x tokens | PyTorch | CUDA | Triton |
|-------------|---------|------|--------|
| 32x512 | 3.90 ms | 0.53 ms | 0.66 ms |
| 16x1024 | 7.45 ms | 0.99 ms | 1.12 ms |
| 8x2048 | 14.47 ms | 1.92 ms | 2.15 ms |
| 4x4096 | 28.57 ms | 3.79 ms | 4.21 ms |

**结论：**
- Triton 通常达到 hand-tuned CUDA 的 **90-105%**
- Memory-bound 算子（softmax, element-wise）Triton 有时超越 naive CUDA
- Compute-bound 算子（large GEMM）cuBLAS 仍最优
- 开发效率：Triton 代码量约为 CUDA 的 **1/5**

---

## 🏛 第三章：cuBLAS/cuDNN 库算子 —— 产品级选择

当你构建推理引擎或训练框架时，**不要自己手写标准 GEMM**——用厂商库。

### 3.1 cuBLAS GEMM 调优

使用 Tensor Core 的必要条件：

```cuda
// 启用 Tensor Core
cublasSetMathMode(handle, CUBLAS_TENSOR_OP_MATH);

cublasGemmEx(handle, transa, transb, m, n, k, &alpha,
             A, CUDA_R_16F, lda,
             B, CUDA_R_16F, ldb,
             &beta, C, CUDA_R_16F, ldc, CUDA_R_32F, algo);
```

**必要条件：**
1. `CUBLAS_TENSOR_OP_MATH`
2. k, lda, ldb, ldc 需为 8 的倍数（FP16）或 16 的倍数（INT8）
3. m 需为 4 的倍数
4. 输入类型：FP16, BF16, TF32, FP8, INT8

**调优技巧：**
- Math mode: `CUBLAS_TENSOR_OP_MATH` vs `CUBLAS_DEFAULT_MATH`
- Compute type: `CUDA_R_32F` 最高精度，`CUDA_R_16F` 更快
- Leading dimension 对齐：确保 `lda % 8 == 0`
- 小矩阵使用 batched GEMM 代替逐个调用

### 3.2 cuDNN 卷积算子

卷积算法选择至关重要：

| 算法 | 最佳适用场景 |
|------|-------------|
| IMPLICIT_GEMM | 通用场景，卷积展开为矩阵乘 |
| IMPLICIT_PRECOMP_GEMM | 通用场景（默认），预计算索引加速 |
| FFT | 大 kernel (>=7x7) |
| FFT_TILING | 大 kernel + 大 feature map |
| WINOGRAD | 小 kernel (3x3)，减少乘法次数 |
| DIRECT | 特定条件（小 batch, 小 feature map） |

**Implicit GEMM 原理**：卷积通过 **im2col** 转换为矩阵乘法，但在 shared memory 中隐式完成 im2col，无内存膨胀。

```python
torch.backends.cudnn.benchmark = True  # 自动 benchmark 选择最优算法
```

### 3.3 cudnnFrontend 自定义图融合

cudnnFrontend 允许将多个算子融合为单个 cuDNN kernel：

```cpp
// Conv + Bias + ReLU 融合
auto convOp = cudnn_frontend::OperationBuilder(
    CUDNN_BACKEND_OPERATION_CONVOLUTION_FORWARD_DESCRIPTOR)
    .setxDesc(inputDesc).setwDesc(filterDesc).setyDesc(outputDesc).build();

auto biasOp = cudnn_frontend::OperationBuilder(
    CUDNN_BACKEND_OPERATION_POINTWISE_DESCRIPTOR)
    .setxDesc(outputDesc).setbDesc(biasDesc)
    .setyDesc(biasOutputDesc).setpwDesc(biasDesc).build();

auto reluOp = cudnn_frontend::OperationBuilder(
    CUDNN_BACKEND_OPERATION_POINTWISE_DESCRIPTOR)
    .setxDesc(biasOutputDesc).setyDesc(finalOutputDesc)
    .setpwDesc(reluDesc).build();

auto opGraph = cudnn_frontend::OperationGraphBuilder()
    .setHandle(handle).setOperation(convOp)
    .setOperation(biasOp).setOperation(reluOp).build();
```

**优势**：减少 kernel launch 次数、减少 global memory 中间写回。

---

## 🧩 第四章：CUTLASS 算子 —— 高度可定制的模板化线性代数

CUTLASS 是 NVIDIA 开源的模板化线性代数库，提供了比 cuBLAS 更灵活、但仍保留极致性能的 kernel 构建方式。

### 4.1 CUTLASS 层次结构

```
Grid (CTA mapping)
  CTA Tile (mainloop)
    Prologue: global -> shared memory
    Mainloop: shared -> MMA compute
    Epilogue: accumulator -> output
  Thread-level (Warp tiling)
  Instruction-level (MMA / Tensor Core)
```

#### CUTLASS 2.x GEMM 示例

```cpp
using Gemm = cutlass::gemm::device::Gemm<
    half, cutlass::layout::RowMajor,          // A
    half, cutlass::layout::ColumnMajor,       // B (NT layout)
    half, cutlass::layout::RowMajor,          // C
    float,                                     // accumulator
    cutlass::arch::OpClassTensorOp,            // Tensor Core
    cutlass::arch::Sm80                        // Ampere+
>;

Gemm gemm_op;
gemm_op({ {m, n, k}, {A, lda}, {B, ldb}, {C, ldc}, {D, ldd}, {alpha, beta} });
```

### 4.2 Epilogue 融合 (EVT)

**Epilogue Visitor Tree** 是 CUTLASS 最强大的特性之一。它将 epilogue 建模为一棵树形结构，每个 visitor 负责一个操作。accumulator 按顺序通过 visitor 树，无需修改 mainloop：

```
EVT 示例: D = GELU(alpha * C + bias) + residual
    Store (最终写入 global)
    +- Add (残差连接)
       +- Load (残差)
       +- GELU
          +- Add (bias)
             +- Scale (alpha)
             |   +- Accumulator
             +- Load (bias)
```

**优势：**
- 无需修改 mainloop 即可实现融合
- 编译时类型推导保证正确性
- 典型融合：GEMM + Bias + ReLU/GELU + Residual + LayerNorm

### 4.3 CUTLASS 3.x Hopper 特性

Hopper (SM90) 架构引入了两项革命性特性：**WGMMA** 和 **TMA**。

#### WGMMA (Warpgroup MMA)

| 特性 | WMMA (SM70-SM89) | WGMMA (SM90) |
|------|------------------|--------------|
| 参与线程 | 1 warp (32) | 1 warpgroup (128) |
| Tile 大小 | 16x16x16 | 64x64x16 或更大 |
| Operand B 来源 | Register 或 Shared | **必须在 Shared Memory** |
| 同步方式 | 同步 | 异步 (wgmma.mma_async) |
| 描述符 | 无需 | 需要 GMMA Descriptor |

**CuTe 封装：**
```cpp
TiledMMA tiled_mma = make_tiled_mma(
    SM90_64x64x16_F16F16F16_SS<GMMA::Major::MN, GMMA::Major::MN>{});
ThrMMA thr_mma = tiled_mma.get_thread_slice(threadIdx.x);

Tensor tCsA = thr_mma.partition_A(sA); // (MMA, MMA_M, MMA_K, PIPE)
Tensor tCsB = thr_mma.partition_B(sB);

Tensor tCrA = thr_mma.make_fragment_A(tCsA); // GMMA DescriptorIterator
Tensor tCrB = thr_mma.make_fragment_B(tCsB);

Tensor tCgC = thr_mma.partition_C(gC);
Tensor tCrC = thr_mma.make_fragment_C(tCgC);
clear(tCrC);

gemm(tiled_mma, tCrA(_,_,_,pipe), tCrB(_,_,_,pipe), tCrC);
```

#### TMA (Tensor Memory Accelerator)

TMA 是 Hopper 引入的专用硬件，用于异步加载多维 tensor tile 到 shared memory：

| 特性 | cp.async (SM80) | TMA (SM90) |
|------|-----------------|------------|
| 单位 | 单次 copy (16 bytes) | 多维 tensor tile |
| 地址计算 | 手动 | 硬件自动 |
| 维度 | 1D | 1D/2D/3D box |
| 多播 | 无 | 支持 cluster multicast |

```cpp
// Host 端创建 TMA descriptor
TMA tma_a = make_tma_copy(GMMA::ss::Sm90TmaLoad{}, tAgA, tAsA, tma_a_desc);

// Device 端使用
copy(tma_a.with(producer_mbar[pipe]), tAgA(_, k_tile), tAsA(_, pipe));
```

#### Warp Specialization

- **Producer warp**: TMA load (global → shared)
- **Consumer warp**: WGMMA compute (shared → register → Tensor Core)

```
Stage 0: [TMA load A0, B0] || [WGMMA: A0 x B0 -> C]
Stage 1: [TMA load A1, B1] || [WGMMA: A1 x B1 -> C]  (ping-pong)
```

**H100 FP16 GEMM 性能参考 (M=N=K=4096)：**

| 实现 | Latency | TFLOPS | Efficiency |
|------|---------|--------|------------|
| cuBLAS | ~0.8 ms | ~170 | ~17% |
| CUTLASS WGMMA | ~0.7 ms | ~195 | ~20% |
| Hopper 理论峰值 | - | 989 | 100% |

---

## 📚 第五章：Thrust/CUB 库算子 —— 原语级工具箱

**Thrust** 类似 C++ STL，适合快速原型开发；**CUB** 提供 block-level 和 device-level 低层次原语，追求极致性能。

### 5.1 基础用法

**Thrust：**
```cpp
#include <thrust/device_vector.h>
#include <thrust/reduce.h>
#include <thrust/scan.h>
#include <thrust/sort.h>

// Reduce
int sum = thrust::reduce(d_vec.begin(), d_vec.end(), 0, thrust::plus<int>());

// Scan
thrust::inclusive_scan(d_in.begin(), d_in.end(), d_out.begin());

// Sort
thrust::sort(d_vec.begin(), d_vec.end());

// Transform + Reduce (fused)
int result = thrust::transform_reduce(
    d_vec.begin(), d_vec.end(), square<int>(), 0, thrust::plus<int>());
```

**CUB Device-Level 原语：**
```cpp
#include <cub/cub.cuh>

// 两步调用: 先获取临时空间大小, 再执行
void* d_temp = nullptr;
size_t temp_bytes = 0;

cub::DeviceReduce::Sum(d_temp, temp_bytes, d_in, d_out, num_items);
cudaMalloc(&d_temp, temp_bytes);
cub::DeviceReduce::Sum(d_temp, temp_bytes, d_in, d_out, num_items);

// Scan
cub::DeviceScan::InclusiveSum(d_temp, temp_bytes, d_in, d_out, num_items);

// Radix Sort
cub::DeviceRadixSort::SortKeys(d_temp, temp_bytes, d_keys, d_keys_out, num_items);
```

### 5.2 实现原理

**CUB DeviceReduce：** 每个 CTA 的 block-level reduce（shared memory + warp shuffle）→ CTA 间通过 atomics 或额外 kernel launch 合并。

**CUB DeviceScan：** 核心是 **Decoupled Look-back**（Merrill & Garland, 2016）：

```
CTA0: [a0, ..., ax] -> scan_internal + aggregate0
CTA1: [ax+1, ..., a2x] -> scan_internal + aggregate1
                           | look back
                          aggregate0 -> offset1 = aggregate0
                           | apply offset
                          output = scan_internal + offset1
```

性能：单 pass 完成，数据移动 ~2n，近 memcpy 速度。

**CUB DeviceRadixSort：** 三阶段——Upsweep（统计 digit 出现次数）→ Scan（全局 digit offset）→ Downsweep（根据 offset scatter key）。

**算法对比：**

| 算法 | 时间复杂度 | 适用场景 | 自定义比较器 |
|------|-----------|---------|------------|
| DeviceRadixSort | O(n * b/r) | 内置数值类型 | 否 |
| DeviceSegmentedRadixSort | O(n * b/r) | 多段独立序列 | 否 |
| DeviceMergeSort | O(n log n) | 自定义结构体/比较器 | 是 |

---

## 📊 总结：一张表看懂所有算子

### 性能分类总结

| 算子类型 | Bound 类型 | 优化重点 | 推荐实现 |
|---------|-----------|---------|---------|
| Element-wise | Memory-bound | Vectorized load/store, fusion | Triton / CUDA |
| LayerNorm | Memory/Compute | Warp shuffle, Welford | CUDA / Triton |
| Softmax | Memory-bound | Online softmax, warp reduce | Triton / CUDA |
| Reduce | Memory-bound | Tree reduction, warp shuffle | CUB / Thrust |
| Scan | Memory-bound | Decoupled look-back | CUB |
| GEMM (小) | Memory-bound | Tiling, tensor core | cuBLAS / CUTLASS |
| GEMM (大) | Compute-bound | Tensor Core, pipelining | cuBLAS / CUTLASS |
| Convolution | Compute-bound | Implicit GEMM, Winograd | cuDNN |
| Sort | Memory-bound | Radix sort | CUB / Thrust |

### 选择指南

1. **性能优先、成熟操作**：优先 cuBLAS/cuDNN（SASS level 调优）
2. **定制融合、灵活性高**：CUTLASS（C++ template）或 Triton（Python DSL）
3. **快速原型验证**：Thrust（类似 STL）
4. **底层算子构建**：CUB（最精细控制）
5. **极致优化**：CUDA C++ + SASS 调优（维护成本极高）

---

## 🚀 下一步

底层 GPU 算子的世界正在快速演进，几个值得关注的趋势：

1. **Triton 崛起**：PyTorch 2.x 已将其作为默认 kernel 后端（TorchInductor），在 90-105% of hand-tuned CUDA 的性能下，将开发效率提升了一个数量级。

2. **Hopper/Blackwell 新特性**：TMA + WGMMA 是下一代 GEMM 的标准范式。Warp Specialization（Producer/Consumer 分离）正在重塑 kernel 的架构设计。

3. **FP8 低精度革命**：H100 FP8 理论峰值达 1979 TFLOPS，算子实现需要适配新的数值范围和累加策略。

4. **Kernel Fusion 自动化**：从手动融合 → CUTLASS EVT 声明式 → 编译器自动融合（TorchInductor + Triton），这个趋势正在降低融合算子的开发门槛。

5. **跨平台可移植性**：Triton 对 AMD GPU 和 Intel GPU 的支持正在成熟，加上 MLIR 的多层 lowering 能力，"write once, run anywhere" 的 GPU 编程愿景越来越近。

> **延伸阅读**：本文是底层 GPU 算子专题的第一篇。下一篇将深入**框架算子层**（PyTorch ATen / TensorFlow OpKernel / ONNX / MLIR），讲解算子注册、自动微分和图捕获机制。欢迎持续关注。

---

> 本文档由 AI Infra 调研生成，技术术语均保留英文。代码片段为说明性伪代码，实际使用需适配具体 GPU 架构和 CUDA 版本。
