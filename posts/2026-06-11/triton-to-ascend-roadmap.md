---
title: 从 Triton 到 Ascend NPU — 跨后端 Kernel 开发路线图
date: 2026-06-11
tags: [triton, gpu, ascend, npu, backend, internship]
---

学了 9 个 Triton exercise 之后，你写的 kernel 跑在 NVIDIA GPU 上。但 Triton 的定位不只是"CUDA 的 Python 替代品"——它是**跨后端的 kernel 语言**。这篇文章梳理 Triton 的编译架构、Ascend NPU 的编程模型、以及"给 Ascend 适配 Triton kernel"到底意味着什么。

## Triton 的编译器架构

Triton kernel 不直接编译成 GPU 指令。中间有一层 **Triton IR**：

```
Triton Python (.py)
       │ @triton.jit
       ▼
Triton IR (中间表示)
       │ triton.compile()
       ▼
后端代码生成
   ├── NVIDIA:  Triton IR → TritonGPU IR → LLVM IR → PTX → SASS
   ├── AMD:     Triton IR → TritonGPU IR → LLVM IR → AMDGCN
   ├── Intel:   Triton IR → TritonGPU IR → SPIR-V → GPU binary
   └── Ascend:  Triton IR → ? → AscendC → DaVinci binary
```

关键点：Triton IR 是 **硬件无关的**。`tl.load`、`tl.dot`、`tl.sum` 这些操作在你写的时候不关心目标硬件是 NVIDIA、AMD 还是 Ascend。硬件相关的部分在下层——代码生成器负责把 Triton IR 映射到特定硬件的指令集。

## Triton 3.0 的 Backend Plugin

Triton 3.0 引入了 **backend plugin** 机制，让第三方可以注册自己的后端，而不需要修改 Triton 核心代码。

```python
# triton/backends/ascend/  (your work!)
#   driver.py:     内存分配、数据搬运、同步
#   compiler.py:   Triton IR → AscendC → 可执行文件
#   target_info.py: warp size, shared memory size, max threads...

# 然后用户只需:
@triton.jit
def my_kernel(...):
    ...

# 指定后端
my_kernel[grid](a, b, c, backend="ascend")
```

华为的 `torch_npu` 团队已经在做这件事。你的实习大概率是参与 **compiler.py** 的编写——把 Triton IR 里的操作翻译成 AscendC (华为 NPU 的 C-like kernel 语言)。

## Ascend NPU 的硬件模型

跟 NVIDIA GPU 的对应关系：

| 概念 | NVIDIA GPU | Ascend NPU |
|------|-----------|------------|
| 计算单元 | SM (Streaming Multiprocessor) | AI Core (DaVinci) |
| 线程模型 | CUDA thread / warp (32 threads) | AscendC block / core |
| 内存层级 | Global → L2 → Shared → Reg | DDR/HBM → L2 → L1 → UB → Reg |
| 矩阵乘法 | Tensor Core (mma.sync) | Cube Unit (矩阵计算加速器) |
| 向量计算 | CUDA Core | Vector Unit |
| 标量计算 | CUDA Core | Scalar Unit |
| 编程语言 | CUDA C++ / PTX | AscendC (类 C++) |

关键区别：

**1. 异构计算单元（Cube + Vector + Scalar）**
```
Ascend AI Core 内部有三类运算器：
  Cube Unit:   矩阵乘法（类似 Tensor Core）
  Vector Unit: 向量加减乘除、激活函数
  Scalar Unit: 标量计算、控制流

三者可以同时执行！比如 Cube 做 matmul 时，Vector 同时做 GELU，
Scalar 同时做地址计算。这叫 "融合算子" 的真正含义。
```

**2. 片上内存 UB（Unified Buffer）**
```
NVIDIA: Shared Memory (程序员显式管理) + L1 Cache (硬件自动)
Ascend: UB (Unified Buffer) — 更大的片上 SRAM，程序员控制
        UB 大小约 192KB-256KB (比 NVIDIA 的 128KB Shared Mem 大)
```

**3. 没有 warp 概念**
```
NVIDIA: 32 线程同步执行 (warp)，warp shuffle 通信
Ascend: 单指令多数据 (SIMD) 风格，没有 warp-level primitive
        → tl.dot 的实现方式完全不同
```

## 实际要做什么：从 Triton IR 到 AscendC

假设你写了一个 Triton matmul kernel。编译器看到的 Triton IR 大概是：

```
%a = tt.load %a_ptr[%rm, %rk]     // 从 global 加载 tile
%b = tt.load %b_ptr[%rk, %rn]
%c = tt.dot %a, %b                 // 矩阵乘法
tt.store %c_ptr[%rm, %rn], %c     // 存回 global
```

你的 compiler.py 需要把这些操作翻译成 AscendC：

```cpp
// AscendC equivalent:
LocalTensor<float16> aTile = inA[rm][rk];     // 从 GM 搬到 UB
LocalTensor<float16> bTile = inB[rk][rn];
LocalTensor<float>  cTile;
Matmul<cubePara>()(aTile, bTile, cTile);      // Cube Unit 做 matmul
outC[rm][rn] = cTile;                          // 写回 GM
```

核心挑战：

**1. 内存搬家的效率**
Triton 的 `tl.load` 有 mask 和边界处理。在 Ascend 上需要映射到高效的 DMA 拷贝（DataCopy 指令）。

**2. tl.dot 的映射**
NVIDIA 上 `tl.dot` 编译成 `mma.sync`（Tensor Core 指令）。Ascend 上映射成 Cube Unit 指令，但 tile 形状、数据布局、精度都有不同约束。

**3. 流水线**
NVIDIA 有 `num_stages`（pipeline stages）做 latency hiding。Ascend 有类似的流水机制，但实现方式不同——你需要在 AscendC 里显式地用 `Pipe` 和 `double buffer`。

**4. 控制流**
Triton 的 `for` 循环、`if` 分支在有 warp 概念的 GPU 上开销小。在 Ascend 上需要更小心地处理分支发散。

## 你的学习路线

```
已掌握 (Ex00-09):              下一步 (实习准备):
  Triton kernel 编写 ✓           AscendC 语法和编程模型
  FlashAttention ✓              Cube Unit 的 tile 约束
  Matmul tiling ✓               UB 内存管理
  Operator fusion ✓             DataCopy / Pipe 流水
  Autotuning ✓                  Ascend 的 profiler (msprof)
  GQA ✓                         torch_npu 的运行环境
```

### 推荐的 Ascend 热身步骤

1. **读 AscendC 官方文档** — `Add` 和 `Matmul` 两个例子
2. **理解 Cube Unit 的约束** — 为什么输入必须是 `16×16` 的倍数？怎么处理不规则 shape？
3. **对比 Triton FA kernel 和 AscendC FA kernel** — 同一个算法在不同硬件上的实现差异
4. **搭建环境** — Atlas 推理卡 + CANN 软件栈 + torch_npu

### 跟 NVIDIA 学到的知识的可迁移性

好消息：你学的 90% Triton 知识直接可迁移。

| 知识 | NVIDIA 专用 | 跨后端通用 |
|------|:---------:|:--------:|
| Tiling 策略 | | ✓ |
| 在线 softmax 算法 | | ✓ |
| Operator fusion 模式 | | ✓ |
| Roofline 分析 | | ✓ |
| Autotune 思想 | | ✓ |
| Shared memory 使用 | warp 相关 | 大部分 |
| tl.dot 行为 | Tensor Core 相关 | 需适配 |

所以 9 个 exercise 没有白做——算法和系统层面的理解完全可迁移。需要重新学的只是代码生成那一层：如何把你的 kernel 意图忠实地翻译成 Ascend 的指令。

## 总结

Triton 之于 Ascend，就像 LLVM 之于新 CPU 架构。你不需要为 Ascend 重写所有 kernel——你只需要写一个 **back-end plugin**，让 Triton 编译器知道"怎么把 Triton IR 翻译成 Ascend 能跑的东西"。

这是一个编译器工程师 + kernel 工程师的交叉角色。你已有的 Triton kernel 编写经验让你理解"上层想表达什么"，现在需要补充"下层怎么执行"。
