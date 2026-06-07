---
title: "Triton 矩阵乘法深度拆解：从内存层次到分块策略"
date: 2026-06-07
tags:
  - triton
  - gpu
  - matmul
  - 高性能计算
---

矩阵乘法是现代深度学习最核心的算子。从 Transformer 的 Attention 到 MLP 的投影层，底层都是矩阵乘法。如果只学一个 Triton kernel，那一定是 matmul。

本文结合 Triton 官方 Tutorial、知乎上的优秀笔记以及实际踩坑经验，从 GPU 内存层次出发，逐步拆解 Triton matmul 的设计思路。

本文参考了知乎博主「自然卷633」的《Triton 概念与编程入门笔记》。他在文中对指针算术、Group 分组策略的讲解非常清晰，感谢他的分享。

## 1. Triton 的双重身份

在开始写 kernel 之前，先搞清楚 Triton 到底是什么。

**Triton 既是编程语言，也是编译器**。作为编程语言，它是一门基于 Python 的 DSL（Domain Specific Language），让你用类 Python 语法编写 GPU kernel。作为编译器，它是 `torch.compile` 的默认后端，负责将 Torch IR 转化为高效的 GPU 代码。

和 CUDA 的关系可以这样理解：

- **CUDA** 像是微单相机：调整每一个曝光参数，极限画质但学习曲线陡峭。一个工业级 GEMM 用 CUDA 手写，优化到极致可能需要上千行代码。
- **Triton** 像是手机相机：拿起就拍，自动对焦，出片基本过关。同样的 matmul，Triton 大约 30 行就能达到 cuBLAS 的 80-90% 性能。

Triton 的编程哲学是 **Block-wise Programming**：Block 以上的——矩阵怎么分块、块之间怎么调度——归用户管；Block 内部的——线程怎么分配、寄存器怎么用——归编译器自动处理。

## 2. 为什么需要分块？GPU 内存层次

理解 tiling 之前，必须先理解 GPU 的内存体系。我们以 RTX 4070 Super 为例：

| 内存层级 | 带宽 | 延迟 | 容量 |
|----------|------|------|------|
| Global Memory (HBM) | ~450 GB/s | ~400 cycles | 12 GB |
| L2 Cache | ~2 TB/s | ~200 cycles | 48 MB |
| Shared Memory (SRAM) | ~10 TB/s | ~20 cycles | 128 KB/SM |
| Register | ~40 TB/s | ~1 cycle | 256 KB/SM |

### 朴素 matmul 为什么慢？

对于 C = A @ B，其中 A 是 M×K，B 是 K×N：

```python
for i in range(M):
    for j in range(N):
        for k in range(K):
            C[i,j] += A[i,k] * B[k,j]
```

每个 A[i,k] 被加载了 N 次，每个 B[k,j] 被加载了 M 次。对于 M=N=K=4096 的 fp32 矩阵，朴素方法需要从 HBM 读取约 512 GB 的数据——但算力只需要 0.001 秒就能完成计算。这是典型的 **memory-bound** 问题：GPU 的计算单元在等数据。

### Tiling 的核心思想

把矩阵切成小块（tile），每次将一个 tile 从慢速的 HBM 搬到快速的 SRAM，在 SRAM 上反复计算，算完再搬下一块：

```
每个 A 元素只从 HBM 读一次 → 总数据量从 512 GB 降到 ~256 MB
减少了 2000 倍的内存读取
```

## 3. Tiled Matmul 算法

Triton 的 Grid 是二维的：`(cdiv(M, BLOCK_M), cdiv(N, BLOCK_N))`。每个 program 独立计算 C 的一个 `[BLOCK_M, BLOCK_N]` 输出子块。

```
pid_m = program_id(0)    # 在 M 方向第几个块
pid_n = program_id(1)    # 在 N 方向第几个块

rm = pid_m * BLOCK_M + arange(0, BLOCK_M)   # [BLOCK_M]
rn = pid_n * BLOCK_N + arange(0, BLOCK_N)   # [BLOCK_N]

acc = zeros([BLOCK_M, BLOCK_N], float32)

for k in range(0, K, BLOCK_K):
    rk = k + arange(0, BLOCK_K)              # [BLOCK_K]
    a_tile = A[rm, rk]                       # [BLOCK_M, BLOCK_K]
    b_tile = B[rk, rn]                       # [BLOCK_K, BLOCK_N]
    acc += dot(a_tile, b_tile)               # Tensor Core 一次完成

C[rm, rn] = acc
```

K 维度的循环是唯一需要串行执行的部分——每次处理 BLOCK_K 列/行，用 Tensor Core 一次完成 `[BLOCK_M, BLOCK_K] @ [BLOCK_K, BLOCK_N]` 的矩阵乘法并累加。

## 4. 指针算术：从首地址到二维 Tile

Triton kernel 中怎么用指针访问二维矩阵？这是新手最容易困惑的地方。

PyTorch 中，一个张量的数据以**一维数组**按行连续存储在显存中。`tensor.stride(0)` 告诉你从第 i 行到第 i+1 行需要跳过多少个元素，`tensor.stride(1)` 则是列方向上的步长。对于行主序的 M×K 矩阵：

```python
A.stride(0) = K   # 沿 M 方向走一步跳过 K 个元素（一整行）
A.stride(1) = 1   # 沿 K 方向走一步跳过 1 个元素
```

那么 A[rm, rk] 这个二维 tile 的指针范围就是：

```python
# rm: [BLOCK_M] 行索引, rk: [BLOCK_K] 列索引
# 注意 [:, None] 和 [None, :] 的广播方向！
a_ptrs = a_ptr + rm[:, None] * stride_am + rk[None, :] * stride_ak
# 结果: shape [BLOCK_M, BLOCK_K] 的地址矩阵
```

这是整个 kernel 中最精巧的一行。`rm[:, None]` 把 `[BLOCK_M]` 变成 `[BLOCK_M, 1]`，在列方向广播；`rk[None, :]` 把 `[BLOCK_K]` 变成 `[1, BLOCK_K]`，在行方向广播。两者相加，恰好生成 `[BLOCK_M, BLOCK_K]` 的地址矩阵。

K 维度循环时，只需要在指针上向前移动 BLOCK_K 个元素：

```python
a_ptrs += BLOCK_K * stride_ak  # stride_ak = 1 (行主序)
b_ptrs += BLOCK_K * stride_bk  # stride_bk = N
```

不需要重新计算整个地址矩阵——这是性能关键。

## 5. 进阶：Group 分组与 L2 Cache 优化

基础的 tiled matmul 已经能跑出不错的性能，但离工业级还有距离。Triton 官方 Tutorial 引入了一个重要的优化：**Group 分组**。

问题出在 L2 Cache。GPU 的所有内存访问都必须经过 L2 Cache。如果按简单的行主序顺序处理 C 的各个子块，会导致相邻 program 加载的数据不能复用 L2 Cache 中的内容。

解决方法：将 C 矩阵沿 M 方向分组，每组包含 `GROUP_SIZE_M` 个 `BLOCK_M` 块。组内 program 共享 A 矩阵的同一个区域，提高 L2 命中率。

```
grid 从 2D 变成 1D: total_programs = cdiv(M, BLOCK_M) * cdiv(N, BLOCK_N)

每个 program 自己解码位置:
  pid = program_id(0)
  num_pid_m = cdiv(M, BLOCK_M)
  num_pid_n = cdiv(N, BLOCK_N)
  num_pid_in_group = GROUP_SIZE_M * num_pid_n

  group_id = pid // num_pid_in_group
  first_pid_m = group_id * GROUP_SIZE_M
  pid_m = first_pid_m + (pid % group_size_m)
  pid_n = (pid % num_pid_in_group) // group_size_m
```

以 M=N=K=2048, BLOCK_M=BLOCK_N=128, GROUP_SIZE_M=8 为例：

- Grid 总共 16×16=256 个 program
- 每个 Group 包含 8×16=128 个 program（M 方向 8 个 block，N 方向覆盖全部 16 列）
- 两个 Group 共享 A 矩阵的上半和下半区域
- 这比简单的行主序排序节省了约 40% 的 L2 Cache 数据换出

## 6. 完整实现骨架

```python
@triton.jit
def matmul_kernel(
    a_ptr, b_ptr, c_ptr,
    M, N, K,
    stride_am, stride_ak,
    stride_bk, stride_bn,
    stride_cm, stride_cn,
    BLOCK_M: tl.constexpr,
    BLOCK_N: tl.constexpr,
    BLOCK_K: tl.constexpr,
    GROUP_M: tl.constexpr,
):
    pid = tl.program_id(0)
    # ... Group 解码逻辑（见上节）...
    
    rm = pid_m * BLOCK_M + tl.arange(0, BLOCK_M)
    rn = pid_n * BLOCK_N + tl.arange(0, BLOCK_N)
    
    acc = tl.zeros([BLOCK_M, BLOCK_N], dtype=tl.float32)
    
    for k in range(0, tl.cdiv(K, BLOCK_K)):
        rk = k * BLOCK_K + tl.arange(0, BLOCK_K)
        
        a = tl.load(a_ptr + rm[:, None] * stride_am + rk[None, :] * stride_ak,
                    mask=rk[None, :] < K, other=0.0)
        b = tl.load(b_ptr + rk[:, None] * stride_bk + rn[None, :] * stride_bn,
                    mask=rk[:, None] < K, other=0.0)
        
        acc = tl.dot(a, b, acc)   # Tensor Core
    
    # Store
    mask_m = rm[:, None] < M
    mask_n = rn[None, :] < N
    tl.store(c_ptr + rm[:, None] * stride_cm + rn[None, :] * stride_cn,
             acc, mask=mask_m & mask_n)
```

## 7. 你的代码 vs 工业级：差距在哪

基础 tiled matmul 在 RTX 4070S 上大约能达到 30-40 TFLOPS。cuBLAS 同硬件可达 100+ TFLOPS。差距来源：

| 优化项 | 基础版 | 工业级 | 大约提升 |
|--------|--------|--------|----------|
| Shared Memory 显式管理 | 依赖寄存器/编译器 | 手动分配 SRAM，减少寄存器压力 | 1.5-2x |
| Double Buffering | 串行加载+计算 | 加载下一块的同时计算当前块 | 1.3x |
| Bank Conflict 规避 | 无 | Padding + swizzle 模式 | 1.2x |
| L2 Cache 分组 | 无 | GROUP_SIZE_M 分组 | 1.3x |
| Auto-tuning | 固定 BLOCK 大小 | `@triton.autotune` 搜索最优配置 | 1.5x |

这些优化不需要一次全搞懂。先跑通基础版本，然后逐项叠加——每一个优化都会让你对 GPU 架构的理解深一层。

## 8. 常见陷阱速查

1. **累加器用 float32**：即使输入是 fp16，`acc` 必须是 float32。`tl.dot` 的 dtype 由累加器决定。
2. **Mask 只加在必要的维度**：A[rm, rk] 中 M 维不会越界（grid 已保证），只需 mask K 维度：`rk[None, :] < K`。
3. **tl.dot 数值误差**：Tensor Core 使用 TF32，与 PyTorch fp32 参考有 ~2% 误差。测试时用 `atol=5e-2` 而非 `1e-4`。
4. **BLOCK_K 不宜过小**：太小（如 16）导致加载开销占比高。常见范围：32-128。
5. **`[:, None]` / `[None, :]` 方向**：搞反了会导致 shape mismatch 的编译错误——也是最常见的调试时间杀手。

## 9. 延伸阅读

- [Triton 官方 Matmul Tutorial](https://triton-lang.org/main/getting-started/tutorials/03-matrix-multiplication.html) — 本文核心参考
- [谈谈对 OpenAI Triton 的阅读](https://zhuanlan.zhihu.com/p/594410270) — Triton 编译链条解析
- [从 MLIR 理解 Triton](https://zhuanlan.zhihu.com/p/628103559) — 代码生成流程
- [自然卷633: Triton 概念与编程入门笔记](https://zhuanlan.zhihu.com/p/12789107689) — 本文重要参考，Group 分组的数值示例非常直观
