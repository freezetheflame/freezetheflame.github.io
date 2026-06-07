---
title: "GPU 编程模型全景图：从 CUDA 到 Triton，理解算子的编译与抽象层次"
date: 2026-06-07
tags: [AI Infra, Triton, GPU 编程, CUDA, MLIR, TileLang]
---

要深入理解 Triton 为什么这样设计、它的 IR 栈在做什么、以及何时该用 Triton 何时不该，你需要先建立 GPU 编程模型的「全景认知」。这篇文章梳理从底层到上层的整个栈，帮你建立坐标系。

---

## 一、为什么要关心编程模型？

一个简单的矩阵乘法，至少有下面这些写法：

| 方式 | 代码量 | 性能天花板 | 可移植性 |
|------|--------|------------|----------|
| cuBLAS 调用 | 1 行 | ★★★★★（厂商优化） | NVIDIA only |
| CUDA C++ 手写 | 200 行 | ★★★★★（理论峰值） | NVIDIA only |
| Triton | 30 行 | ★★★★（接近 cuBLAS） | NVIDIA + AMD(ROCm) |
| TileLang | 30 行 | ★★★★ | NVIDIA + 更多后端 |
| TVM TensorIR | 50 行 | ★★★★ | 多后端 |
| PyTorch eager | 1 行 | ★★ | 跨平台 |

核心问题：**抽象层次决定了「生产力 vs 性能」的 tradeoff**。每往上一层，你放弃一些精细控制，换取更少代码和更好的可移植性。

---

## 二、三层抽象：你在哪一层写代码？

```
┌─────────────────────────────────────────────────┐
│  层 3: 图/算子编译器     XLA, TVM Relay         │  ← 编译器自动生成 kernel
│  ("编译器帮你写 kernel")   OpenAI compiler,       │
│                           torch.compile          │
├─────────────────────────────────────────────────┤
│  层 2: Block/Tile DSL    Triton, TileLang,       │  ← 你写算子的分块逻辑
│  ("用 Python 写 kernel")  TensorIR, Pallas(JAX)  │     编译器处理分块内的细节
├─────────────────────────────────────────────────┤
│  层 1: 线程级编程         CUDA C++, OpenCL,      │  ← 你控制每个 thread 做什么
│  ("手动管理每个线程")      HIP, SYCL             │
├─────────────────────────────────────────────────┤
│  层 0: 汇编/IR           PTX, SASS, SPIR-V,      │  ← 编译器输出 / 逆向分析
│                           AMD GCN Assembly       │
└─────────────────────────────────────────────────┘
```

Triton 正好卡在**层 2**：你负责分块策略（如何把大矩阵切成 tile），编译器负责 tile 内的线程调度、内存合并、寄存器分配。这就是它「30 行 vs 200 行」差异的来源。

---

## 三、编译栈的纵向解剖

以 NVIDIA GPU 为例，完整的编译栈是这样的：

```
Python/Triton DSL
      │
      ▼
Triton IR (TTIR)        ← 高层 IR，保留 tile 语义
      │
      ▼
Triton GPU IR (TTGIR)   ← 映射到 GPU 概念：shared memory, layout
      │
      ▼
LLVM IR (NVVM)          ← 通用编译优化（循环展开、内联、向量化）
      │
      ▼
PTX                     ← NVIDIA 的并行线程执行伪汇编
      │
      ▼
SASS (GPU 机器码)        ← 由 GPU 驱动 JIT 编译，真正的二进制
```

关键洞察：**Triton 的编译器替你完成了 CUDA C++ 程序员手工做的事情**：
- 决定 grid/block 大小
- 分配 shared memory 并管理 bank conflict
- 安排 warp 内的线程分工
- 插入 memory fence / synchronization

但 Triton **不替你决定分块策略**。块的大小、循环嵌套、数据加载顺序——这些仍然是你写的。这就是 Triton kernel 的核心挑战：找到最优的 tile 参数。

---

## 四、各编程模型逐一展开

### 4.1 CUDA — 线程级编程的基准线

CUDA 的编程模型是 **SPMD（Single Program, Multiple Data）**：你写一个函数（kernel），GPU 同时启动成千上万个线程执行同一个函数，每个线程用自己的 thread ID 来决定处理哪部分数据。

```
线程层级:
  Thread (1 个执行单元)
    ↓ 32 个 thread 组成
  Warp (最小调度单位, SIMT)
    ↓ 多个 warp 组成
  Block (共享 shared memory 的线程组)
    ↓ 多个 block 组成
  Grid (整个 kernel 启动)
```

CUDA 程序员需要手动处理：
- **内存层次**：全局内存 → L2 cache → shared memory → 寄存器
- **合并访问（coalescing）**：同一 warp 的线程应访问连续的全局内存地址
- **bank conflict**：shared memory 有 32 个 bank，多个线程访问同一 bank 会串行化
- **occupancy**：每个 SM 能同时驻留多少 warp，取决于寄存器和 shared memory 用量

**示例：CUDA Vector Add 的思维负担**

```cuda
__global__ void vec_add(float *a, float *b, float *c, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;  // 手工计算全局索引
    if (idx < n) {                                     // 边界检查
        c[idx] = a[idx] + b[idx];                      // 实际计算
    }
}
```

看起来简单对吧？但这是因为 vector add 是**最 trivial** 的例子。一旦涉及 shared memory、寄存器溢出、warp divergence，代码量就爆炸了——一个高性能 matmul kernel 动辄 500 行。

### 4.2 OpenCL / SYCL / HIP — 跨厂商的 CUDA 等价物

- **OpenCL**：最老牌的跨平台 GPU 编程框架。API 极其冗长（platform → device → context → queue → buffer → kernel → enqueue...），写起来痛苦。
- **SYCL**：Intel 主导的「单源 C++」方案，kernel 和 host 代码写在同一个 C++ 文件里。DPC++ 是其主力实现。
- **HIP**：AMD 的「CUDA 兼容层」，API 几乎 1:1 映射，可以用 `hipify` 工具自动转换 CUDA 代码。

这三个和 CUDA 属于**同一抽象层次**（层 1），只是 API 风格和厂商绑定不同。

### 4.3 PTX 和 SASS — 编译器可以看到的东西

- **PTX**（Parallel Thread Execution）：NVIDIA 的伪汇编，是 CUDA C++ 和 GPU 机器码之间的中间表示。用 `nvcc -ptx` 可以查看。它是虚拟 ISA，由 GPU 驱动在运行时 JIT 编译成真正的机器码。
- **SASS**（Shader Assembly）：真正的 GPU 机器码，用 `cuobjdump -sass` 查看。不同 GPU 架构（SM 版本）的 SASS 完全不同。

理解 PTX 对 Triton 程序员有价值：当你 `triton.compile` 一个 kernel 并用 `kernel.asm['ptx']` 查看输出时，你看到的就是 PTX。这是验证编译器生成质量的最终手段。

### 4.4 Triton — Block 级编程的核心设计

Triton 的核心设计哲学：

**你只关心 block（tile）级别的操作，编译器处理 block 内部的并行细节。**

```
Kernel 视角对比:

CUDA 的你:
  "我有 N 个线程，线程 0 加载 data[0]，线程 1 加载 data[1]..."
  → 你必须自己管理每个线程的地址计算

Triton 的你:
  "我有一个大小为 BLOCK_SIZE 的块，把这个块的数据加载进来"
  → triton.language.load(pointer, mask, ...) 帮你处理
```

Triton 引入的关键概念：

| 概念 | 说明 |
|------|------|
| `tl.program_id(axis)` | 拿到当前 block 在 grid 中的坐标（替代 CUDA 的 blockIdx） |
| `tl.arange(0, N)` | 生成一个 block 内的偏移向量（替代 threadIdx） |
| `tl.load/tl.store` | 以 block 为单位加载/存储，编译器自动处理合并 |
| `tl.dot` | 矩阵乘法原语，自动调用 Tensor Core |
| block pointer | 一种特殊的指针类型，让编译器更好地优化连续访问 |
| `@triton.autotune` | 自动搜索最优的 block size / num_warps / num_stages |

**Triton IR 的三个层次**：

```
TTIR (Triton IR)
  ├─ 和 Python DSL 一一对应，保留高级语义
  │  triton.language.load  →  tt.load
  │  triton.language.dot   →  tt.dot
  │
  ▼
TTGIR (Triton GPU IR)
  ├─ 引入 GPU 硬件概念
  │  共享内存分配、数据布局（mma, blocked, slice）、warp 调度
  │  triton-opt 工具可以在此层做优化 pass
  │
  ▼
LLVM IR (via NVVM dialect)
  └─ 标准的 LLVM IR + NVVM 内建函数
     交由 LLVM 后端生成 PTX
```

理解这个管道对于调试很关键：`TRITON_INTERPRET=1` 走 TTIR 解释执行，`MLIR_ENABLE_DUMP=1` 可以看到每一层的 IR dump。

### 4.5 TileLang — 另一个 Python GPU DSL

TileLang 是清华大学和微软等机构开发的 Python DSL，核心思想和 Triton 很像：**block-level programming**。但它有几个不同的设计选择：

| 特性 | Triton | TileLang |
|------|--------|----------|
| IR 基础 | 自己的 MLIR dialect | TIR (Tensor IR) / TVM 生态 |
| 编译器后端 | Triton → LLVM → PTX | TIR → CUDA / OpenCL / ROCm / 等 |
| 并发模型 | 隐式（编译器处理） | 更显式的 warp 级原语 |
| 生态位置 | 独立运行时 | TVM 生态的一部分 |
| Python 集成 | `@triton.jit` 装饰器 | `@tilelang.jit` 装饰器 |

TileLang 的一个优势是：它的 TIR 表示可以直接对接 TVM 的自动调优系统（AutoTVM / MetaSchedule），在多后端支持上更成熟。

### 4.6 TVM / TensorIR — 编译器驱动的方法

Apache TVM 的 TensorIR（TIR）是更底层的张量计算 IR。它可以表示任意的循环嵌套 + 张量操作，比 Triton IR 更通用但也更冗长。

```python
# TensorIR 示例：矩阵乘法（伪代码）
@tvm.script.ir_module
class Matmul:
    @T.prim_func
    def main(A: T.Buffer(...), B: T.Buffer(...), C: T.Buffer(...)):
        for i, j, k in T.grid(M, N, K):
            with T.block("C"):
                vi, vj, vk = T.axis.remap("SSR", [i, j, k])
                with T.init():
                    C[vi, vj] = 0.0
                C[vi, vj] += A[vi, vk] * B[vk, vj]
```

然后通过一系列的 **schedule primitive**（split, reorder, bind, cache_read, cache_write...）将这个 naive 版本变换成优化的 GPU 版本。这种「计算 + 调度分离」的设计来自 Halide 的传统。

Triton 走的是相反的方向：你直接写优化后的版本，编译器负责正确生成代码；TVM 是你写 naive 版本，调度原语帮你优化。

### 4.7 MLIR GPU 方言 — IR 基础设施

MLIR（Multi-Level IR）是 LLVM 项目下的编译器基础设施，核心理念是「你可以定义自己的 IR dialect，然后在不同 dialect 之间做 lowering」。

与 GPU 相关的关键 dialect：

| Dialect | 用途 |
|---------|------|
| `gpu` | 通用的 GPU 操作：launch、barrier、alloc |
| `nvvm` | NVIDIA 特有的操作：threadIdx, shared memory, Tensor Core |
| `rocdl` | AMD 特有的操作 |
| `spirv` | Vulkan/OpenCL 的 SPIR-V |
| `triton` | Triton 自己的 dialect（TTIR） |
| `triton_gpu` | Triton 的 GPU dialect（TTGIR） |
| `linalg` | 线性代数操作，可以 lower 到 GPU |

当你看到 Triton 编译器源码里的 `triton/lib/Dialect/` 目录时，里面就是这些 dialect 的定义和转换 pass。

---

## 五、Triton vs TileLang vs CUDA：选型对比

**什么时候该用 Triton？**
- 写 AI kernel（matmul, attention, normalization, activation...）
- 性能要求接近 cuBLAS / FlashAttention 水平，但不想写 CUDA
- 需要在不同 NVIDIA GPU 上运行（编译器自动适配 SM 版本）
- 快速原型验证一个新的算子设计

**什么时候该用 CUDA？**
- 你需要精细控制 warp 级别的行为（warp shuffle, 特殊 barrier）
- 你需要非矩阵乘法类的复杂 kernel（图算法、排序、哈希表）
- Triton 编译器生成的代码不够好，且 autotune 也找不到好配置
- 你需要和 NVIDIA 的库（cuDNN, cuBLAS, cutlass）深度集成

**什么时候该用 TileLang？**
- 你需要不仅仅跑在 NVIDIA GPU 上（CPU, AMD, Intel GPU, 嵌入式 NPU）
- 你在 TVM 生态中工作，想用 AutoTVM / MetaSchedule 自动调优
- TIR 的显式循环嵌套更适合你的问题

---

## 六、理解 IR 层次如何帮你写出更好的 Triton Kernel

知道编译栈在做什么，你能诊断三类常见问题：

### 6.1 寄存器溢出
**症状**：kernel 跑得比预期慢得多
**根因**：你用了太多 local 变量，编译器必须把寄存器 spill 到 local memory（实际上是 global memory，巨慢）
**诊断**：`kernel.asm['ptx']` 里搜 `st.local` / `ld.local`；或用 `TRITON_PRINT_AUTOTUNING=1` 看 register usage

### 6.2 Shared Memory Bank Conflict
**症状**：shared memory 访问成为瓶颈
**根因**：你的数据布局导致同一 warp 的多个线程访问了 shared memory 的同一个 bank
**诊断**：看 TTGIR dump 里的 shared memory layout（`MLIR_ENABLE_DUMP=1`）；必要时加 padding 改变数据布局

### 6.3 编译器优化失败
**症状**：手写的 CUDA kernel 比等价的 Triton kernel 快很多
**根因**：Triton 编译器某一步没有做你期望的优化（循环展开不充分、指令调度差、Tensor Core 不命中等）
**诊断**：对比 `triton.compile` 输出的 PTX 和你手写 CUDA 的 PTX；必要时提 issue 或 fallback 到 CUDA

---

## 七、进一步阅读

- [Triton 官方文档 -- MLIR 编译流程](https://triton-lang.org/main/programming-guide/chapter-2/related-work.html)
- [CUDA C++ Programming Guide -- Memory Hierarchy](https://docs.nvidia.com/cuda/cuda-c-programming-guide/index.html#memory-hierarchy)
- [TileLang 论文: Tile-Based DSL for GPU Programming](https://arxiv.org/abs/2308.01575)
- [MLIR GPU Dialect 文档](https://mlir.llvm.org/docs/Dialects/GPU/)
- [NVIDIA PTX ISA Reference](https://docs.nvidia.com/cuda/parallel-thread-execution/)

---

本文是 Triton 系列的一部分：

1. [Triton GPU 编程入门（一）：从 Vector Add 到 GPU 执行模型](/posts/2026-06-06/triton-intro-vector-add/)
2. [Triton GPU 编程入门（二）：用「工人分卡片」理解算子、Grid 与并行模型](/posts/2026-06-06/triton-worker-analogy/)
3. 本文 ←
