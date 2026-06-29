---
title: "AI算子入门比较指南"
date: 2026-06-29
tags: [AI算子, CUDA, Triton, PyTorch, 推理优化, 入门教程]
---

如果说大模型是 AI 时代的"应用程序"，那 **AI 算子（Operator）就是 AI Infra 的"指令集"**。从你调用的 `torch.add()` 到 GPU 上实际的矩阵乘法，中间藏着从框架到底层硬件的一整套技术栈。这篇指南面向刚接触 AI Infra 的新手，用**横向对比**的方式，带你走完算子从**编写、注册、优化、测试到跨硬件部署**的全流程。

<!--more-->

---

## 🌍 缘起：为什么需要这本指南？

每次你写一行 `y = F.relu(x)`，PyTorch 会依次经历：
1. 通过 **Dispatcher** 找到对应后端的 kernel
2. 调用 **CUDA** / **Triton** / CPU 的实现
3. 在 GPU 的 **Tensor Core** 或 **CUDA Core** 上执行

如果你是 AI Infra 新人，会发现"算子"这个词在不同语境下指向完全不同的东西——在 CUDA 语境下它是一个 kernel 函数，在 PyTorch 语境下它是 `native_functions.yaml` 里的一行声明，在 ONNX 语境下它是一个 protobuf Node，在硬件厂商语境下它是一段针对特定架构手写的汇编级实现。同一个名字，四个层面，初学者极易混淆。

这篇指南的核心贡献是**建立一张全局地图**：读完你将：

- ✅ 理解算子从底层到框架的 **四个层面**（GPU kernel → 框架 Op → 中间表示 → 硬件适配）
- ✅ 知道每种算子该**用什么工具写**（CUDA / Triton / 库调用）
- ✅ 能比较不同实现方式的**开发效率和性能**优劣
- ✅ 对测试、量化、跨硬件适配有**全局认识**

---

## ⚡ 第一章：底层 GPU 算子 —— CUDA vs Triton vs 库算子

最底层的算子是在 GPU 上直接执行的 kernel。写 GPU kernel 有三种主流方式，它们的**抽象层级、开发效率、性能上限**差异很大。

### 三种实现方式的横向对比

| 维度 | CUDA 手写 Kernel | Triton Tile-Based | cuBLAS/CUTLASS 库 |
|------|-----------------|-------------------|-------------------|
| 抽象层级 | 线程级，每个线程处理 1 个元素 | Tile（块）级，每个 program 处理一个 block | API 调用级，一行命令完成大规模计算 |
| 开发效率 | ⭐⭐ 低。手动管理 shared memory、同步、bank conflict | ⭐⭐⭐⭐ 高。自动管理存储、自动同步、内置 autotune | ⭐⭐⭐⭐⭐ 极高。一行代码调用优化好的库 |
| 性能上限 | ⭐⭐⭐⭐⭐ 可达理论峰值 | ⭐⭐⭐⭐ 接近手写（相差 5-15%） | ⭐⭐⭐⭐⭐ 厂商深度优化，接近理论极限 |
| 可移植性 | ⭐ 平台锁定（只跑 NVIDIA） | ⭐⭐⭐ 多后端（NVIDIA PTX, AMD GCN, Intel 适配中） | ⭐ 平台锁定 |
| 代表工具 | CUDA C++, inline PTX | OpenAI Triton | cuBLAS, CUTLASS, cuDNN |
| 调试难度 | 高。需要 nsight compute、cuda-gdb | 中。Python 生态，可打印调试 | 低。黑盒调用，基本无需调试 |

CUDA 手写的好处是**极致可控**——你可以在 PTX 级别调整指令排布，用 `cp.async` 实现异步拷贝，用 `warp shuffle` 替代 shared memory 做归约。但这些优化需要数月经验积累，而且每换一代 GPU 架构（Volta → Turing → Ampere → Hopper）就要重审一遍优化策略。

Triton 的定位是**降低门槛的领域专用编译器**——你只需描述"每个 block 做什么"，编译器帮你映射到 warp 级线程、自动生成合并内存访问、自动插入同步屏障。对于 80% 的算子场景，Triton 性能足够好。

cuBLAS / cuDNN / CUTLASS 这类库是**产品级选择**——你的推理引擎不应该自己手写 GEMM，除非你有足够的人力和验证预算。厂商库经过了数十万小时的测试和调优。

### 一个例子：ReLU 的三种写法

**CUDA 手写（线程级，每个线程处理一个元素）：**
```cuda
__global__ void relu_kernel(const float* x, float* y, int N) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < N) {
        y[idx] = fmaxf(0.0f, x[idx]);
    }
}
```
这里你手动管理了：grid/block 维度、线程索引计算、边界检查（`if (idx < N)`），以及显式调用 `fmaxf`。如果要达到最佳性能，还要做 float4 向量化加载、使用 `__restrict__` 关键字、用 grid-stride loop 适配任意长度。

**Triton（Tile 级，每个 program 处理一个 BLOCK）：**
```python
@triton.jit
def relu_triton(x_ptr, y_ptr, N, BLOCK: tl.constexpr):
    pid = tl.program_id(axis=0)
    offsets = pid * BLOCK + tl.arange(0, BLOCK)
    mask = offsets < N
    x = tl.load(x_ptr + offsets, mask=mask)
    tl.store(y_ptr + offsets, tl.maximum(x, 0.0), mask=mask)
```
Triton 的写法更接近"算法描述"：一个 `tl.load` 自动处理了合并访存，`mask` 参数自动处理边界，`tl.constexpr` 让编译器可以做编译期循环展开。少了 4-5 行底层细节，而且自动支持 autotune（试不同 BLOCK_SIZE 和 num_warps 找最优配置）。

**cuBLAS 库调用（一行搞定，但仅限于标准操作）：**
```cuda
cublasSgemm(handle, CUBLAS_OP_N, CUBLAS_OP_N, m, n, k, &alpha, dA, lda, dB, ldb, &beta, dC, ldc);
```
注意 cuBLAS 主要针对矩阵乘法（GEMM），ReLU 这种 element-wise 操作一般不会单独调库——你会在 CUTLASS 中把它融合进 GEMM 的 epilogue 阶段。

> 💡 **什么时候用哪种？** 做产品级推理引擎 → 库算子优先（最快最稳）；做自定义融合 kernel → Triton（开发快、性能好）；做新硬件支持或极致优化 → CUDA。**三种不是互斥的**——一个成熟的推理引擎（如 vLLM、TensorRT-LLM）恰恰是三者的混合体。

---

## 🔧 第二章：框架算子 —— PyTorch vs TensorFlow vs ONNX vs MLIR

当你写好一个底层 kernel，怎么让框架认识它？这就是**框架算子注册**做的事。每个框架都有自己的算子注册系统和调度机制。

### 四大框架算子体系的对比

| 维度 | PyTorch ATen | TensorFlow OpKernel | ONNX OpSet | MLIR Dialect |
|------|-------------|---------------------|------------|--------------|
| 算子数量 | ~2000+（分解为 ~250 prim 原始算子） | ~1500+ | ~200（opset 28 版本） | 按需定义，无固定数量 |
| 注册机制 | `native_functions.yaml` 声明 + `TORCH_LIBRARY` 宏 | `REGISTER_OP` + `REGISTER_KERNEL_BUILDER` | opset 版本号管理，不可变契约 | Dialect + Operation 定义 |
| 图捕获方式 | TorchDynamo 字节码级捕获 | 静态图 GraphDef / tf.function | 序列化 protobuf ModelProto | MLIR Pass pipeline |
| 自定义难度 | ⭐⭐⭐ 中。C++ extension + `torch.library` Python API | ⭐⭐⭐⭐ 难。C++ OpKernel + 编译 .so + 动态加载 | ⭐ 无。只需遵循已有标准定义 | ⭐⭐⭐⭐⭐ 极难 |
| 自动微分 | 动态 Autograd Graph（运行时构建 DAG） | 静态 gradient tape（编译期确定） | 无，仅推理交换格式 | 需自定义 gradient dialect |
| 跨框架能力 | 弱（锁 PyTorch 生态） | 弱（锁 TF 生态） | ⭐⭐⭐⭐⭐ 强（生态互通的桥梁） | ⭐⭐⭐ 中等（上下游需适配） |

PyTorch 和 TensorFlow 最大的哲学差异：**PyTorch 是声明式 + 动态调度**（ATen 的 YAML 描述算子签名，Dispatcher 运行时根据 tensor 的 device/dtype 路由）；**TensorFlow 是静态声明 + 编译期绑定**（REGISTER_OP 声明接口，REGISTER_KERNEL_BUILDER 绑定设备和类型，计算图在 session.run() 前完全确定）。

ONNX 介于两者之间——它不做执行，只做**交换格式**。所以你不需要"写"ONNX 算子，而是定义算子的接口规范（输入、输出、属性、类型约束），然后各个框架和运行时实现它。

MLIR 是更底层的编译器基础设施——它不是给应用开发者用的，而是给编译器工程师用的。MLIR 通过多层 Dialect（Torch-MLIR → TOSA → Linalg → Vector → LLVM）逐步 lower 算子，实现多硬件后端的代码生成。

### 从用户视角：写一个自定义算子

**PyTorch（推荐方式，Python 级 API，PyTorch 2.4+）：**
```python
from torch.library import Library, impl

lib = Library("mylib", "DEF")
lib.define("my_muladd(Tensor a, Tensor b, float c) -> Tensor")

@impl(lib, "my_muladd", "CompositeImplicitAutograd")
def my_muladd(a, b, c):
    return a * b + c  # 自动获得 backward 支持，无需写反向
```
这里 `CompositeImplicitAutograd` 是关键——它告诉框架这个算子可以用其他已有算子组合实现，因此自动微分可以**自动推断**反向传播逻辑。如果你需要自定义反向，可以用 `@impl_abstract` + `@impl_backward` 组合。

**TensorFlow（C++ OpKernel 方式，需要编译）：**
```cpp
REGISTER_OP("ZeroOut")
    .Input("to_zero: int32")
    .Output("zeroed: int32");

class ZeroOutOp : public OpKernel {
    void Compute(OpKernelContext* context) override {
        const Tensor& input = context->input(0);
        Tensor* output = nullptr;
        OP_REQUIRES_OK(context,
            context->allocate_output(0, input.shape(), &output));
        // ... 计算逻辑
    }
};
REGISTER_KERNEL_BUILDER(Name("ZeroOut").Device(DEVICE_CPU), ZeroOutOp);
```
TF 的自定义算子流程明显更重：写 C++ → 编译 .so → `tf.load_op_library()` 加载 → 封装 Python 接口。

**ONNX：** 给现有算子加一个属性、或组合已有算子构成复合算子。不写实现代码，只写规范。

> 💡 **给新手的建议**：从 PyTorch 的 `torch.library` API 开始——它是目前最友好的自定义算子入口。想跨框架互通，导出 ONNX 即可，不用所有框架都写一遍。

---

## 🚀 第三章：推理优化算子 —— 量化 vs 注意力 vs 融合

模型训练好之后，算子优化的核心目标是**在尽量不降精度的前提下跑得更快**。目前三大优化技术流派各有所长。

### 三大优化技术的横向对比

| 技术 | 典型加速比 | 精度影响 | 适用场景 | 代表实现 |
|------|-----------|---------|---------|---------|
| INT8 量化 | ~2× 带宽减半 + Tensor Core 2× | LLM perplexity 上升 < 0.5% | 权重/激活通用量化 | SmoothQuant, LLM.int8() |
| INT4 量化 (GPTQ/AWQ) | ~3-4× 内存减至 1/4 | MMLU 损失 < 1% | 大模型推理显存瓶颈 | Marlin kernel, vLLM |
| FP8 量化 (E4M3/E5M2) | ~2×（H100 原生 Tensor Core） | 精度几乎无损（< 0.3% perplexity） | FP8 原生硬件（H100+） | Transformer Engine, TE |
| FlashAttention | ~2-10×（长序列场景） | 数学等价，零精度损失 | 长上下文注意力计算 | FA2, FA3 |
| 算子融合 | ~2-5× 减少 kernel launch 和中间访存 | 数学等价，零精度损失 | element-wise + 归约组合 | CUTLASS EVT, XLA |

### 量化：INT8 / INT4 / FP8 的直观理解

量化本质上是**用更少的比特数表示权重或激活值**。不同位宽的精度-速度权衡：

```
精度损失 ←───────────────→ 速度提升
                        |
                   FP16 (基准)
                        |
              INT8 (2× Tensor Core 吞吐, 0.5% 损失)
                        |
            FP8 E4M3 (2× 原生支持, 0.3% 损失)
                        |
    INT4 AWQ (4× 内存减半, 1% MMLU 损失)
                        |
        INT2 (实验性, 需要复杂的误差补偿)
```

量化又分为**权重量化（W）**、**激活量化（A）** 和 **KV Cache 量化**三个层面。实际部署中最常见的组合是 W4A16（权重 INT4、激活 FP16）和 W8A8（权重和激活都是 INT8）。前者主要省显存（适合 LLM 推理），后者主要提计算速度（适合大 batch 场景）。

GPTQ 和 AWQ 是两种主流的 INT4 量化方法：
- **GPTQ** 基于最优脑手术框架，用 Hessian 矩阵分配量化误差，calibration 需要数小时
- **AWQ** 观察到约 1% 的 salient channels 对精度影响最大，通过 per-channel 缩放保护它们，calibration 只需数分钟
- 两者共享相同的推理 kernel（Marlin kernel），所以最终推理性能一致

### FlashAttention 的三个版本演进

FlashAttention 是近几年**对 AI Infra 影响最大的算法创新之一**，它通过 tiling（分块计算）和 online softmax（单遍流式 softmax），将标准 Attention 的 6 次 HBM 访存降为 2 次。

| 版本 | 核心创新 | 加速比 (vs 标准 Attention) | 硬件要求 |
|------|---------|--------------------------|---------|
| FA1 (2022) | Tiling + Online Softmax，减少 HBM 访存 | ~2-4× | A100+ |
| FA2 (2023) | 外层 Q 循环 + Warp 按行划分 + 减少 rescale | FA1 基础上再 ~2× | A100+ |
| FA3 (2024) | Warp 专业化 + TMA/WGMMA 异步 + FP8 原生支持 | ~1.5-2× vs FA2 (FP16)，~2.6-3× (FP8) | H100+ |

FA1 的核心洞察是：标准 Attention 的中间矩阵 `QK^T`（形状为 N×N）需要写回 HBM 再做 softmax，这浪费了大量带宽。通过 tiling，`QK^T` 的每个 tile 在 SRAM（片上高速缓存）上完成 softmax，只把最终结果写回 HBM。FA2 进一步优化了循环顺序（外层 Q → 外层 K/V），使每个 Q tile 只从 HBM 读一次。FA3 利用 H100 的 TMA 硬件和 WGMMA 指令，实现了计算和搬运的流水线重叠。

### 融合算子：为什么 fused kernel 更快？

**一个简单例子：** `y = relu(add(mul(x, w), b))`

**不融合（4 次 kernel launch + 3 次中间结果读写 HBM）：**
```
HBM: x → mul kernel (读 x,w,写 temp1) → add kernel (读 temp1,b,写 temp2) → relu kernel (读 temp2,写 y)
```
每次 kernel launch 有几十微秒的 CPU→GPU 开销，每次读写中间结果要经过带宽 2TB/s 但延迟极高的 HBM。

**融合（1 次 kernel launch，中间结果留在寄存器）：**
```
HBM: x → fused_kernel{寄存器: mul→add→relu} → y
```
三种算子合并为一个 CUDA kernel，中间结果放在寄存器而非 HBM，访存从 `3+3=6` 次变为 `1+1=2` 次。

> 💡 对于 element-wise 这类 **memory-bound 算子**（计算极简单，瓶颈在访存），融合能节省 60-80% 的时间，是"性价比"最高的优化手段，没有之一。

---

## 🧪 第四章：算子测试 —— 精度测试 vs 差分测试 vs 性能测试

一个算子从写完到上线需要通过层层把关。每次改 kernel 都可能导致精度退化、性能回退，甚至 crash。以下是业界公认的测试金字塔。

### 测试方法对比

| 测试类型 | 测什么 | 典型工具 | 通过标准 | 运行时间 |
|---------|-------|---------|---------|---------|
| 精度测试 | 数值结果是否准确 | Cosine Similarity, ULP, MSE, PSNR | cosine > 0.9999, ULP ≤ 4 | 秒级 |
| 差分测试 | 与参考（如 PyTorch CPU）是否一致 | `torch.allclose()`, 多组随机输入 | rtol=1e-3, atol=1e-5 | 分钟级 |
| 梯度检查 | 反向传播是否正确 | `torch.autograd.gradcheck()` | 有限差分 vs 解析梯度一致 | 分钟级 |
| 性能基准 | 是否达到硬件上限 | Nsight Compute, Roofline model | 接近理论峰值 | 小时级 |
| 边界测试 | NaN/Inf/零值/超大值 | 自定义边界值生成 | 不崩溃、NaN 传播合规 | 秒级 |

### 精度度量标准速查

| 指标 | 含义 | 优秀 | 可接受 | 需排查 |
|------|------|------|--------|--------|
| Cosine Similarity | 方向一致性（对整体缩放不敏感） | ≥ 0.99999 | ≥ 0.9999 | < 0.999 |
| PSNR (dB) | 峰值信噪比 | > 60 | 40-60 | < 40 |
| ULP (FP32) | 最后一位单位（最精细的浮点误差） | ≤ 1 ULP | ≤ 4 ULP | > 16 ULP |
| Max Relative Error | 最大相对误差 | < 1e-5 | < 1e-3 | > 1e-2 |

ULP（Unit in the Last Place）是最严格的精度度量——它直接告诉你两个浮点数之间差了多少个"最小可表示步长"。FP32 下 ≤ 4 ULP 意味着误差不超过 4 个最小步长，对大多数算子来说是完全可接受的。

### 一个完整的算子测试流程

```
写 kernel → 单元测试（单 shape 精度） → 差分测试（多 shape + dtype 组合）
   → 梯度检查（如果可微且需要反向） → 边界测试（NaN/Inf/zero/extreme）
   → 性能基准（Roofline 分析，看是否接近硬件上限） → CI 回归（每次 PR 都跑）
```

典型 CI 流程中，精度测试和边界测试在每次 commit 时触发（秒级），差分测试和梯度检查在 PR 创建时触发（分钟级），性能基准则定期（如每晚）或手动触发（小时级）。

---

## 🔌 第五章：多硬件算子 —— NVIDIA vs AMD vs 华为 Ascend vs Intel

同一个算子在四个主流硬件平台上怎么写？我们用最简单也最经典的 **ReLU（逐元素取最大值）** 来对比。

### 同一段 ReLU 在四个平台的样子

**NVIDIA CUDA（行业基准）：**
```cuda
__global__ void relu(const float* x, float* y, int N) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < N) y[idx] = fmaxf(0.0f, x[idx]);
}
```
CUDA 的编程模型是 brainfuck 级别的简单——grid-index 计算 + do work。复杂的是优化：shared memory tiling、warp shuffle、Tensor Core WMMA、cuBLAS 调参。

**AMD ROCm / HIP（语法几乎相同）：**
```cpp
#include <hip/hip_runtime.h>
__global__ void relu(const float* x, float* y, int N) {
    int i = hipBlockIdx_x * hipBlockDim_x + hipThreadIdx_x;
    if (i < N) y[i] = fmaxf(0.0f, x[i]);
}
```
HIP 在设计之初就是 CUDA 的 API 级兼容。`hipify` 工具可以自动转换大部分 CUDA 代码。主要差异：AMD 的 wavefront 是 64 线程（CUDA 的 warp 是 32 线程），这意味着 shuffle 指令的行为不同，`__shfl_down_sync` 的掩码需要调整。

**华为 Ascend C（达芬奇架构的三级存储决定了编程范式）：**
```cpp
__aicore__ void relu(GM put_in, GM put_out) {
    LocalTensor<float> inLocal = LocalTensor<float>(BLOCK_LENGTH);
    LocalTensor<float> outLocal = LocalTensor<float>(BLOCK_LENGTH);
    DataCopy(inLocal, put_in + startIdx, BLOCK_LENGTH);   // HBM → UB
    Max(outLocal, inLocal, 0.0f, BLOCK_LENGTH);           // 计算
    DataCopy(put_out + startIdx, outLocal, BLOCK_LENGTH); // UB → HBM
}
```
Ascend C 的编程风格非常**显式**——你必须手动声明 Local Tensor（Unified Buffer 上的片上内存），手动 DataCopy 搬运数据，再手动写回。这反映了达芬奇架构独特的存储层次：Global Memory（HBM）→ L2 Cache → Unified Buffer（片上 SRAM，~几 MB）→ L0 Buffer → Cube/Vector 计算单元。

**Intel SYCL / oneAPI（统一编程模型，可跨 CPU/GPU/FPGA）：**
```cpp
sycl::queue q;
q.submit([&](sycl::handler& h) {
    sycl::accessor acc_x{x, h, sycl::read_only};
    sycl::accessor acc_y{y, h, sycl::write_only};
    h.parallel_for(n, [=](auto i) {
        acc_y[i] = sycl::max(acc_x[i], 0.0f);
    });
});
```
SYCL 基于 C++ 标准的异构编程模型，强调**跨平台**——同一段代码可以编译到 Intel CPU（用 AVX-512/AMX）、Intel GPU（用 XMX）、甚至 FPGA。代价是性能调优更复杂，需要深入理解底层硬件原语。

### 硬件平台全面对比

| 维度 | NVIDIA | AMD | 华为 Ascend | Intel |
|------|--------|-----|------------|-------|
| 编程语言 | CUDA C++ | HIP C++ | Ascend C / TBE DSL | SYCL / DPC++ |
| 核心加速单元 | Tensor Core (4×4 MMA) | Matrix Core (Wave32/64) | Cube Unit (16×16×16) | AMX TILE + TMUL |
| 算子库 | cuBLAS, cuDNN, CUTLASS | rocBLAS, MIOpen, CK | CANN 算子库 | oneDNN, oneMKL |
| 编译器 | nvcc（基于 LLVM/EDG） | hipcc（基于 Clang/LLVM） | TBE 编译器（基于 TVM 扩展） | DPC++（基于 Clang/LLVM） |
| 统一框架支持 | Triton (PTX), MLIR, CUDA Graph | Triton (GCN), MLIR, HIP Graph | Triton 适配中, CANN Graph | SYCL 原生跨平台 |
| 生态成熟度 | ⭐⭐⭐⭐⭐ 垄断级 | ⭐⭐⭐ 追赶中 | ⭐⭐⭐ 国内强势 | ⭐⭐ 小众但增长中 |
| 学习曲线 | 陡（需理解 GPU 架构细节） | 中等（CUDA 程序员可平滑迁移） | 中等（C++ 风格，文档中文） | 中等（类 C++ 模板） |

### 统一编译框架的救赎

**Triton** 和 **MLIR** 正在改变"写一套算子锁一个平台"的困境——它们的目标是：你写一次 kernel，自动编译到多个硬件后端。

```
Triton Python DSL
    ↓
Triton IR → MLIR Triton Dialect → MLIR (Arith/SCF/Vector/GPU)
    ↓                     ↓                     ↓
 NVIDIA PTX          AMD GCN              SPIR-V (Intel)
```

Triton 官方已支持 NVIDIA（PTX）和 AMD（GCN）后端。华为 Ascend 的适配也在社区推进中——核心思路是将 Triton Dialect 降级到已有的 MLIR Vector/GPU Dialect，再通过 Ascend 的编译器生成达芬奇架构的机器码。

MLIR（Multi-Level Intermediate Representation）提供了更通用的框架：它在编译器中定义一层层的 Dialect，上层 Dialect（如 Torch-MLIR）逐步 lowering 到下层 Dialect（如 Linalg → Vector → LLVM），最终生成目标机器码。不同硬件厂商只需实现从 Vector/GPU Dialect 到自家后端的最后一段 lowering 即可。

> 💡 **给新手的建议**：先从 NVIDIA CUDA 入手学算子开发（生态最成熟、资料最多、工具最完善），然后通过 Triton 理解跨平台抽象，最后按需了解 AMD HIP / Ascend C / Intel SYCL。**不要一开始就试图覆盖所有平台**——精力有限，不值得。

---

## 🎯 结语与下一步

### 本文核心速览

| 层面 | 关键结论 |
|------|---------|
| 底层 GPU 算子 | 产品用库，自定义用 Triton，极限优化用 CUDA。三种不是互斥的 |
| 框架算子 | 入门从 PyTorch `torch.library` 开始，跨框架互通靠 ONNX |
| 推理优化 | 先融合再量化，FlashAttention 是长序列的必选项 |
| 算子测试 | 精度 + 差分 + 性能，三项缺一不可。边界测试容易被忽视 |
| 多硬件适配 | Triton + MLIR 是未来趋势，但仍需理解各平台的内存模型和加速单元 |

### 推荐学习路径

```
1. 基础阶段（1-2 周）
   ├── 理解 PyTorch autograd 机制 + torch.compile
   └── 写第一个 Triton kernel（如 fused softmax）

2. 进阶阶段（2-4 周）
   ├── 深入学习 CUDA 内存模型（global/shared/register）
   ├── 理解 CUDA Graph 和 CUDA stream 并发
   └── 用 Nsight Compute 分析一个 kernel 的 roofline

3. 优化阶段（4-8 周）
   ├── 学习 FlashAttention 的原理和实现
   ├── 动手做一次 GPTQ / AWQ 量化
   └── 用 CUTLASS 写一个 fused GEMM + ReLU kernel

4. 拓宽阶段（持续）
   ├── 了解 AMD HIP 和 hipify 迁移
   ├── 读 MLIR Toy Tutorial 理解 Dialect 概念
   └── 看看 Ascend C 和 Intel SYCL 的编程范式
```

**资源推荐：**
- 📖 [OpenAI Triton 官方教程](https://triton-lang.org) — 从 vector add 到 FlashAttention 的完整教程
- 📖 [CUDA Programming Guide](https://docs.nvidia.com/cuda/cuda-c-programming-guide/) — 必读的权威参考
- 📖 [FlashAttention 论文 (arXiv:2205.14135)](https://arxiv.org/abs/2205.14135) — 理解 IO-aware 算法的开山之作
- 📖 [StableHLO 规范](https://github.com/openxla/stablehlo) — MLIR 在 AI 编译中的应用参考
- 🔧 [Nsight Compute](https://developer.nvidia.com/nsight-compute) — GPU kernel 性能分析必备工具
- 🔧 [vLLM / Marlin kernel](https://github.com/vllm-project/vllm) — 生产级推理引擎，看它如何混合使用 cuBLAS + Triton + 自研 kernel

AI 算子是连接**算法直觉**和**硬件极限**的桥梁——向上你要理解 attention、moe、quantization 的数学原理，向下你要理解 Tensor Core、shared memory、HBM 带宽的物理限制。希望这篇指南能帮你建立起完整的全局视野，找到属于你自己的突破口 🚀
