---
title: "深度学习框架算子体系深度解析 —— PyTorch / TensorFlow / ONNX / MLIR / TVM 全面对比"
date: 2026-06-29
tags: [PyTorch, TensorFlow, ONNX, MLIR, TVM, AI Infra, 算子, 编译器]
---

如果你写过一行 `torch.add(a, b)`，你已经在和"算子"打交道了。但同一个算子，在 PyTorch 的 ATen 里是一段 YAML 声明加上 C++ kernel；在 TensorFlow 里是一个 `REGISTER_OP` 宏加一个 OpKernel 类；在 ONNX 里是一个 protobuf Node 定义；在 MLIR 里是一段 Dialect 的 ODS 描述；在 TVM 里又是 TensorIR 中的一段 `T.block`。

同一个名字，五个完全不同的世界。

这篇博客的目标很简单：**帮你建立起算子体系的全局视野**。读完你将理解每个框架的算子设计哲学、注册机制、调度方式、自动微分方案、编译优化策略以及自定义算子扩展路径。我们还会在最后给出一个全面的横向对比，让你在选技术路线时心里有数。

<!--more-->

---

## 🌍 缘起：为什么算子体系如此重要？

AI Infra 界有一个广泛认可的趋势：**算子是连接算法直觉和硬件极限的桥梁**。向上，你要理解 attention、moe、quantization 的数学语义；向下，你要理解 Tensor Core、shared memory、HBM 带宽的物理限制。

而中间层——**框架的算子体系**——决定了：

- 你写一个新的计算模式要花多少功夫（有没有友好的自定义算子 API？）
- 你的模型能不能跨平台部署（导出的中间表示是否标准化？）
- 编译器能帮你做多少优化（有没有层次化 IR 做 progressive lowering？）
- 新硬件接入的成本有多高（要重新实现多少个算子？）

PyTorch、TensorFlow、ONNX、MLIR、TVM 这五个项目，代表了学界和工业界对上述问题的五种不同回答。本文逐一拆解它们的算子设计，最后给出一个全景对比。

---

## 1. PyTorch 算子体系

### 1.1 整体架构概览

PyTorch 的算子体系从下到上分为四个核心层级：

```
+-----------------------------------------+
|  Python API (torch.*, torch.nn.*)       |  <- 用户接口
+-----------------------------------------+
|  torch/csrc/ (pybind11 胶水代码)         |  <- Python <-> C++ 绑定
+-----------------------------------------+
|  ATen (A Tensor Library)                |  <- C++ Tensor 库 + 算子定义
+-----------------------------------------+
|  c10 (Caffe Ten)                        |  <- 核心基础设施 (DispatchKey, TensorImpl)
+-----------------------------------------+
```

- **c10**：最底层的基础设施，定义了 `TensorImpl`、`DispatchKey`、`ScalarType` 等核心类型和 **Dispatcher** 调度器。
- **ATen**：C++ Tensor 库，包含所有原生算子的声明和实现，通过 `native_functions.yaml` 驱动代码生成。
- **torch/csrc/**：Python 与 C++ 的桥接层，使用 pybind11 包装 ATen 接口暴露给 Python。

### 1.2 ATen 注册机制

#### `native_functions.yaml` — 声明式算子注册

PyTorch 原生算子的**声明**集中在一个 YAML 文件中：`aten/src/ATen/native/native_functions.yaml`。每个算子条目的基本结构如下：

```yaml
- func: relu(Tensor self) -> Tensor
  variants: function, method
  dispatch:
    CPU: relu_cpu
    CUDA: relu_cuda
```

| 字段 | 说明 |
|------|------|
| `func` | 算子名称和类型签名 |
| `variants` | 访问方式。`function` 表示可通过 `torch.relu()` 调用；`method` 表示可通过 `tensor.relu()` 调用 |
| `dispatch` | **多设备分发表**，指定不同后端（CPU、CUDA、MPS 等）对应的 kernel 函数 |
| `python_module` | 将算子自动注册到指定 Python 模块（如 `nn`） |
| `autogen` | 自动生成反向函数声明 |
| `tags` | 标签系统，如 `core`, `view`, `inplace_view` 等 |

**代码生成**：`torchgen` 工具解析该 YAML 文件，自动生成 Python 绑定、C++ 头文件、Dispatcher 注册表和 Autograd 包装代码。

#### Dispatcher 调度机制

PyTorch Dispatcher 是算子的核心路由引擎。其工作流程：

```
用户调用 torch.add(a, b)
  |
  v
at::add(a, b)                          <- C++ API 入口
  |
  v
Dispatcher::call()                     <- 提取 DispatchKeySet
  |           +--------------------------+
  |           | Tensor a: CUDA           |
  |           | Tensor b: CUDA           |
  |           | Autograd 启用            |
  |           +--------------------------+
  v
查找 DispatchTable                     <- 多键组合查找
  |
  v
AutogradCUDA kernel                    <- 先走 Autograd 记录计算图
  |
  v
CUDA kernel (add_cuda)                 <- 实际设备执行
```

**DispatchKey 的关键层级**（优先级从高到低）：
1. `Autograd*` — 自动微分相关
2. `CompositeImplicitAutograd` / `CompositeExplicitAutograd` — 复合算子
3. `CPU`, `CUDA`, `MPS`, `XLA`, `PrivateUse1` 等 — 后端设备
4. `FPGA`, `ORT`, `Tracer` — 扩展/追踪

**`CompositeImplicitAutograd`** 是一个非常巧妙的设计：表示该算子可以由其他已注册自动微分的算子组合实现，因此框架可自动推断其反向传播逻辑，无需手动注册 backward kernel。

#### `TORCH_LIBRARY` 宏注册

`TORCH_LIBRARY` 引入使得在不修改 `native_functions.yaml` 的情况下也能注册算子（如第三方扩展）。

```cpp
// 注册自定义算子库
TORCH_LIBRARY(my_ops, m) {
  m.def("warp_perspective(Tensor image, Tensor warp) -> Tensor");
}

// 为特定后端提供实现
TORCH_LIBRARY_IMPL(my_ops, CPU, m) {
  m.impl("warp_perspective", warp_perspective_cpu);
}
```

### 1.3 Autograd 反向传播机制

PyTorch 的自动微分基于**动态计算图**——在每次前向传播时实时构建有向无环图 (DAG)。

**核心组件**：
```
Tensor
  +-- .data           <- 张量数据
  +-- .grad           <- 梯度累积
  +-- .requires_grad  <- 是否需要梯度
  +-- .grad_fn        <- 指向生成该 Tensor 的 Function 节点
```

**Autograd 图构建流程**：
```
前向传播:
z = w * x + b
        |
        v
multiply 节点 (MulBackward)       <- grad_fn = MulBackward0
  |
  +-- w.requires_grad = True
  +-- x.requires_grad = True
        |
        v
add 节点 (AddBackward)            <- grad_fn = AddBackward0
  |
  +-- 来自 Mul 的输出
  +-- b.requires_grad = True
        |
        v
loss = (z - y)^2                 <- grad_fn = MseLossBackward0

反向传播:
loss.backward()
  |
  v
MseLossBackward -> AddBackward -> MulBackward
  |                  |              |
  v                  v              v
dz                dw, dx          db
```

#### 自定义 `torch.autograd.Function`

```python
class MyReLU(torch.autograd.Function):
    @staticmethod
    def forward(ctx, input):
        ctx.save_for_backward(input)
        return input.clamp(min=0)

    @staticmethod
    def backward(ctx, grad_output):
        input, = ctx.saved_tensors
        grad_input = grad_output.clone()
        grad_input[input < 0] = 0
        return grad_input
```

### 1.4 torch.compile / Dynamo 图捕获

PyTorch 2.0 引入的编译栈从根本上改变了算子执行方式：

```
torch.compile(model)
  |
  v
TorchDynamo                    <- Python 字节码级别的图捕获
  |
  v
FX Graph                       <- 中间表示 (torch.fx.Graph)
  |
  v
AOTAutograd                    <- 联合前向+反向图生成
  |
  v
PrimTorch Decomposition        <- 将高层算子分解为约250个原始算子
  |
  v
TorchInductor                  <- 代码生成 (Triton GPU / C++ CPU)
```

**TorchDynamo** 在 Python 字节码层面拦截执行，使用 **PEP 523 (Frame Evaluation API)** 插入 CPython 的 frame 执行钩子，通过 **Guards 机制**缓存已编译图，遇到非 PyTorch 代码时自动进行 **Graph Break**。

**AOTAutograd** 使用 `torch.fx` 的 `__torch_dispatch__` 协议捕获前向 + 反向的完整图，比 Dynamo 更底层——能捕获 C++ Autograd 引擎中执行的 ATen 操作。

### 1.5 PrimTorch Decomposition

**PrimTorch** 定义了约250个 **prim** 算子（原始算子），将所有高层算子（约2000+）分解到这一小集合：

```
高层算子: torch.conv2d, torch.layer_norm, torch.scaled_dot_product_attention
    |
    v  PrimTorch Decomposition
    |
prim 算子: prims.add, prims.mul, prims.conv, prims.sum, prims.broadcast_in_dim...
    |
    v  target-specific lowering
    |
设备后端 kernel (CUDA/CPU/MPS/XLA)
```

这意味着新设备只需实现约250个 prim 算子即可支持几乎所有 PyTorch 功能——接入成本大幅降低。

### 1.6 自定义算子注册

#### C++ Extension 方式（传统）

```cpp
#include <torch/extension.h>

torch::Tensor my_add(torch::Tensor a, torch::Tensor b) {
    return a + b;
}

PYBIND11_MODULE(TORCH_EXTENSION_NAME, m) {
    m.def("my_add", &my_add, "Custom add");
}
```

#### `torch.library` API（推荐方式，PyTorch 2.4+）

```python
from torch.library import Library, impl

lib = Library("mylib", "DEF")
lib.define("my_muladd(Tensor a, Tensor b, float c) -> Tensor")

@impl(lib, "my_muladd", "CompositeImplicitAutograd")
def my_muladd(a, b, c):
    return a * b + c  # 自动获得 backward 支持
```

**关键 API**：

| API | 说明 |
|-----|------|
| `Library(namespace, kind)` | 创建算子库对象。`kind` 可为 `"DEF"` 或 `"IMPL"` |
| `lib.define(schema)` | 定义算子签名 |
| `lib.impl(op_name, backend)` | 为算子注册某后端的实现 |
| `@impl(lib, name, ...)` | 装饰器形式注册 |
| `torch.library.opcheck(op, args)` | 验证自定义算子正确性 |

### 1.7 PyTorch 算子设计哲学

| 特点 | 说明 |
|------|------|
| **由数据驱动的调度** | Dispatcher 根据 Tensor 的 DispatchKey 自动路由到正确后端 |
| **声明式注册** | `native_functions.yaml` 统一描述算子签名和分发规则，代码生成器自动产生绑定 |
| **动态计算图** | 每次前向传播实时构建 Autograd Graph，支持动态控制流 |
| **编译与分解** | PrimTorch 将2000+算子归约为250个 prim，大幅降低接入成本 |
| **开放扩展** | `TORCH_LIBRARY` + `torch.library` 支持第三方算子无缝集成 |

---

## 2. TensorFlow 算子体系

### 2.1 整体架构

```
+-----------------------------------------+
|  Python API (tf.*, tf.raw_ops.*)        |  <- 用户接口
+-----------------------------------------+
|  Graph / MLIR Module                    |  <- 计算图表示
+-----------------------------------------+
|  Op Registry + OpKernel                 |  <- 算子注册 + 核实现
+-----------------------------------------+
|  Runtime (CPU/GPU/TPU/XLA)              |  <- 执行引擎
+-----------------------------------------+
```

与 PyTorch 最大的不同在于：TensorFlow 采用 **静态计算图**（Eager 模式是后来的补充），算子首先注册到全局注册表，构建计算图后再执行。

### 2.2 REGISTER_OP — 算子定义

TensorFlow 使用 `REGISTER_OP` 宏在 C++ 中声明算子的**接口**（输入、输出、属性）：

```cpp
#include "tensorflow/core/framework/op.h"

REGISTER_OP("ZeroOut")
    .Input("to_zero: int32")
    .Output("zeroed: int32")
    .Attr("preserve_index: int = 0");
```

`REGISTER_OP` 是宏展开的静态初始化代码，在加载动态库时自动执行，将算子定义注册到全局 `OpRegistry`。

**OpDef 关键字段**：

| 字段 | 说明 |
|------|------|
| `name` | 算子名称 |
| `input_arg` | 输入张量列表，指定名称和类型 |
| `output_arg` | 输出张量列表 |
| `attr` | 属性参数，编译时确定 |
| `type_constraints` | 类型约束，确保输入输出类型一致性 |

**类型多态**通过 `Attr` + `type_constraint` 实现：

```cpp
REGISTER_OP("MyAdd")
    .Input("a: T")
    .Input("b: T")
    .Output("c: T")
    .Attr("T: {float, double, int32, int64}");
```

### 2.3 OpKernel — 核实现与注册

**OpKernel** 是算子在特定硬件上的实际执行代码。

```cpp
#include "tensorflow/core/framework/op_kernel.h"

class ZeroOutOp : public OpKernel {
 public:
  explicit ZeroOutOp(OpKernelConstruction* context) : OpKernel(context) {
    OP_REQUIRES_OK(context,
        context->GetAttr("preserve_index", &preserve_index_));
  }

  void Compute(OpKernelContext* context) override {
    const Tensor& input = context->input(0);
    Tensor* output = nullptr;
    OP_REQUIRES_OK(context,
        context->allocate_output(0, input.shape(), &output));
    // ... 计算逻辑
  }
 private:
  int preserve_index_;
};

REGISTER_KERNEL_BUILDER(Name("ZeroOut").Device(DEVICE_CPU), ZeroOutOp);
```

**多设备多类型注册**：

```cpp
REGISTER_KERNEL_BUILDER(Name("MyAdd").Device(DEVICE_CPU)
                            .TypeConstraint<float>("T"), MyAddOp<float>);
REGISTER_KERNEL_BUILDER(Name("MyAdd").Device(DEVICE_GPU)
                            .TypeConstraint<float>("T"), MyAddGPUOp<float>);
```

### 2.4 XLA 算子融合与编译

XLA (Accelerated Linear Algebra) 是 TensorFlow 的 JIT 编译器：

```
TensorFlow Graph
      |
      v
XLA Client (tf2xla bridge)         <- TensorFlow 算子 -> HLO 算子映射
      |
      v
HLO (High-Level Optimizer)         <- 中间表示
      |
      +-- HLO 级优化:
      |     +-- 常量折叠、死代码消除
      |     +-- 算子融合 (kernel fusion) -- 核心！
      |     +-- Layout 优化
      |
      v
XLA Backend (LLVM/CUDA/TPU)        <- 代码生成
```

**XLA 算子融合**将多个小算子合并为一个 GPU kernel：

```
融合前:                         融合后:
  a = mul(x, w)                   fused_kernel(x, w, b):
  b = add(a, b)        ->             return relu(add(mul(x, w), b))
  c = relu(b)
```

研究表明 XLA 的算子融合可带来最高 **10.56x** 的加速（特定场景）。自 OpenXLA 项目成立（2023），XLA 已独立于 TensorFlow 成为跨框架编译器，支持 PyTorch、JAX 等前端。

### 2.5 TF 自定义算子

**动态加载方式**（推荐）：

```python
import tensorflow as tf
custom_op_module = tf.load_op_library('./custom_ops.so')
result = custom_op_module.my_add([1, 2, 3], [4, 5, 6])
```

完整的自定义算子流程：编写 C++ OpKernel → 编译为 `.so` → `tf.load_op_library()` 加载 → Python 包装（可选）。

### 2.6 TensorFlow 算子设计哲学

| 特点 | 说明 |
|------|------|
| **静态声明** | `REGISTER_OP` 集中声明接口，与实现解耦 |
| **OpKernel 模式** | 算子接口与设备实现严格分离，同一 Op 可注册多个 Kernel |
| **属性驱动多态** | 通过 `Attr` 实现参数化类型，编译期确定 |
| **图编译优化** | XLA 编译器将 TF 算子降级为 HLO 进行融合优化 |
| **强类型系统** | 编译期类型检查，执行时按类型选择合适的 Kernel |

---

## 3. ONNX 算子标准

### 3.1 ONNX 概述

ONNX (Open Neural Network eXchange) 是微软和 Meta 于 2017 年联合推出的**开放神经网络交换格式**，现由 Linux Foundation AI & Data 管理。它定义了一套**与框架无关的算子标准**，使模型可以在不同框架和运行时之间互操作。

### 3.2 算子集（OpSet）与版本演进

ONNX 使用 **opset（算子集）** 来管理算子的版本演进。每个 opset 版本是一个**不可变**的算子集合契约。

**核心概念**：

```
算子 = (domain, op_type, since_version)
    如: ("ai.onnx", "Conv", 1)
```

- **domain**：域名。`""`（或 `"ai.onnx"`）表示 ONNX 标准算子
- **op_type**：算子名称
- **since_version**：该算子在哪个 opset 版本被引入

**OpSet 演进示例**：

| OpSet | 新增/变更 | 说明 |
|-------|----------|------|
| 1 | 基础算子集 | Conv, Relu, Gemm, Softmax... |
| 7 | Add, Mul 支持多向广播 | 统一广播语义 |
| 9 | 新增 Upsample, Compress | 上采样支持 |
| 11 | 新增 Unique, ConcatFromSequence | 序列操作 |
| 13 | Clip min/max 从属性变为输入 | 灵活动态约束 |
| 15 | BatchNormalization 训练模式 | 训练支持 |
| 20 | AffineGrid | 网格采样 |
| 24 | Attention 算子 | Transformer 支持 |
| 27 | CausalConvWithState | 因果卷积 |

**当前最新 opset 版本**：**28**（截至 ONNX 1.23.0）

### 3.3 算子规范定义

ONNX 算子规范包含完整的输入、输出、属性、类型约束定义。

| 类别 | 示例算子 |
|------|---------|
| 激活 | Relu, Sigmoid, Tanh, Softmax, Clip |
| 算术 | Add, Sub, Mul, Div, Pow, Exp, Log |
| 张量操作 | Reshape, Transpose, Concat, Split, Slice, Gather |
| 卷积池化 | Conv, ConvTranspose, MaxPool, AveragePool |
| 归一化 | BatchNormalization, InstanceNormalization, LayerNormalization |
| 循环/控制流 | Loop, Scan, If |
| 量化 | QuantizeLinear, DequantizeLinear, QLinearConv |
| LLM 相关 | Attention (ops 24), GroupQueryAttention (ops 27) |

### 3.4 ONNX Runtime 执行引擎

**ONNX Runtime (ORT)** 是 ONNX 的参考实现运行时：

```
ONNX Model (.onnx)
      |
      v
Model Loader          <- Protobuf 反序列化
      |
      v
Graph Optimizer       <- 图优化流水线
  +-- Basic: 常量折叠、冗余节点消除
  +-- Extended: 复杂融合 (GEMM+Activation)
  +-- Layout: 内存布局优化
      |
      v
Graph Partitioner     <- 根据 Execution Provider 划分子图
  +-- CPU EP / CUDA EP / TensorRT EP / OpenVINO EP / CoreML EP
      |
      v
Session Execution     <- 按拓扑序执行子图
```

**Execution Provider (EP)** 机制是 ORT 的核心抽象，通过 Graph Partitioner 将计算图分割为不同 EP 负责的子图，支持混合执行。

### 3.5 ONNX 算子设计哲学

| 特点 | 说明 |
|------|------|
| **框架无关契约** | 定义一套统一、完备的算子接口，独立于任何训练框架 |
| **严格版本化** | OpSet 不可变契约，保证向后兼容性 |
| **属性 vs 输入** | 编译期确定的参数设为属性（Attribute），运行时变化的设为输入（Input） |
| **类型约束** | 精确描述算子支持的数据类型组合 |
| **运行时无关** | ONNX 规范不限定实现方式，ORT 是参考实现而非唯一实现 |

---

## 4. MLIR / Torch-MLIR

### 4.1 MLIR 简介

**MLIR (Multi-Level Intermediate Representation)** 是 LLVM 项目下的多层级 IR 编译器框架。在深度学习领域，MLIR 的核心价值在于**定义不同抽象层次的 dialect（方言）**，并在这些 dialect 之间进行渐进式 lowering（降级）。

```
框架前端 (PyTorch/TF/JAX)
      |
      v  +------------------+
      |  | Torch Dialect    | <- 框架特定高层操作
      |  +------------------+
      |          v lowering
      |  +------------------+
      |  | TOSA / StableHLO | <- 硬件无关张量操作集
      |  +------------------+
      |          v lowering
      |  +------------------+
      |  | Linalg Dialect   | <- 结构化线性代数
      |  +------------------+
      |          v lowering
      |  +------------------+
      |  | SCF / Affine     | <- 循环和仿射变换
      |  +------------------+
      |          v lowering
      |  +------------------+
      |  | LLVM Dialect     | <- LLVM IR
      |  +------------------+
      |          v
      |   目标机器码
```

### 4.2 TOSA (Tensor Operator Set Architecture)

**TOSA** 是由 MLIR 社区定义的一套**硬件无关的张量算子集 dialect**，遵循三个设计原则：

- **完备性（Complete）**：基于对数十个主流框架网络的算子频率分析，覆盖计算、归约、逐元素变换、比较、控制流等所有主要类别。
- **最小性（Minimal）**：避免创建复合算子，将融合决策交给编译器后端。限制算子数量以降低硬件实现复杂度。
- **数值精度（Numerical Precision）**：每种算子内嵌量化信息，算子的伪代码精确描述数值计算步骤（包括舍入、溢出），保证不同硬件平台间的数值一致性。

### 4.3 StableHLO

**StableHLO** 是 OpenXLA 项目的一部分，定位为 ML 框架和 ML 编译器之间的**可移植层**：

```
TensorFlow / JAX / PyTorch
      |
      v  (框架侧导出)
StableHLO
      |
      v  (编译器侧消费)
XLA / IREE / 其他编译器
```

**核心特征**：
- 约 100 个操作：`stablehlo.add`, `stablehlo.dot`, `stablehlo.convolution` 等
- SSA 形式（函数式 IR）
- 支持动态维度：`tensor<?x?xf32>`
- 通过 VHLO 版本化机制保证前向兼容性

### 4.4 Linalg Dialect

**Linalg** 的核心抽象是 `linalg.generic`——用一种结构化的方式描述任意张量运算：

```mlir
linalg.generic {
  indexing_maps = [
    affine_map<(i, j, k) -> (i, k)>,   // 输入 A
    affine_map<(i, j, k) -> (k, j)>,   // 输入 B
    affine_map<(i, j, k) -> (i, j)>    // 输出 C
  ],
  iterator_types = ["parallel", "parallel", "reduction"]
} ins(%A, %B : tensor<32x16xf32>, tensor<16x64xf32>)
  outs(%C : tensor<32x64xf32>) {
  ^bb0(%a: f32, %b: f32, %c: f32):
    %mul = arith.mulf %a, %b : f32
    %add = arith.addf %c, %mul : f32
    linalg.yield %add : f32
} -> tensor<32x64xf32>
```

此外还有大量语义化的命名算子：`linalg.matmul`, `linalg.conv_2d_nhwc_hwcf`, `linalg.add` 等。

**Linalg 的设计优势**：
1. **结构化信息完整**：计算结构不会在降低循环时丢失
2. **可逆映射**：迭代空间和数据空间之间的映射可逆
3. **渐进降低**：先 tiling + fusion 优化，再降低到 SCF/Affine loops

### 4.5 Torch-MLIR

**Torch-MLIR** 实现了 PyTorch 到 MLIR 的编译路径：

```
PyTorch Model -> ExportedProgram/FX Graph -> Torch Dialect -> TOSA/Linalg/StableHLO -> 后端编译器
```

Torch Dialect 保留了 PyTorch 算子的完整语义，包括动态形状（symbolic shapes）、自定义 autograd Function 等。

---

## 5. TVM / Relax 算子

### 5.1 TVM 整体架构

Apache TVM 是一个开源深度学习编译器栈，其算子贯穿多个 IR 层次：

```
+-----------------------------------------+
|  Frontends (PyTorch/TF/ONNX/Relay)      |  <- 模型导入
+-----------------------------------------+
|  Relax IR (图级 IR)                      |  <- 新一代图 IR
+-----------------------------------------+
|  TensorIR (张量级 IR)                    |  <- 循环级算子实现
+-----------------------------------------+
|  AutoTVM / AutoScheduler                 |  <- 自动调优
+-----------------------------------------+
|  Backend (LLVM/CUDA/OpenCL/BYOC)        |  <- 代码生成
+-----------------------------------------+
```

### 5.2 Relay IR → Relax IR

**Relax** 是 TVM Unity 中的新一代图级 IR，解决 Relay 在动态形状和异质计算方面的不足。

**Relax 的关键创新**：

| 特性 | 说明 |
|------|------|
| **符号形状** | 支持动态维度，通过 shape function 推导 |
| **Dataflow 块** | 显式标记纯数据流区域，便于编译器优化 |
| **显式 binding** | 变量绑定而非嵌套表达式，易于图变换 |
| **跨 IR 互操作** | 可与 TensorIR 无缝混合（同一 IRModule 内含图级和循环级代码） |

### 5.3 TensorIR — 张量级算子表达

**TensorIR** 是 TVM 的循环级 IR，用于描述算子的具体计算过程：

```python
@T.prim_func
def matmul(
    A: T.Buffer((M, K), "float32"),
    B: T.Buffer((K, N), "float32"),
    C: T.Buffer((M, N), "float32"),
):
    T.func_attr({"global_symbol": "matmul", "tir.noalias": True})
    for i, j, k in T.grid(M, N, K):
        with T.block("update"):
            vi, vj, vk = T.axis.remap("SSR", [i, j, k])
            with T.init():
                C[vi, vj] = T.float32(0)
            C[vi, vj] = C[vi, vj] + A[vi, vk] * B[vk, vj]
```

**关键概念**：
- `T.Buffer`：多维数组的抽象
- `T.block`：计算块，显式标注循环迭代类型（S=spatial, R=reduction）
- `T.axis.remap`：将循环变量映射为 block axis

这种显式的结构化使编译器能够安全地进行 tiling、fusing、向量化等变换。

### 5.4 AutoTVM 自动调优

**AutoTVM** 是 TVM 的算子自动调优框架，核心思想是**在目标硬件上通过搜索找到最优的算子实现**。

```
1. 定义搜索空间 (Template)
2. 搜索最优配置 (XGBTuner)
3. 应用最优配置到算子的 TIR 模板
4. 生成高度优化的 kernel 代码
```

可调优参数包括：tile 大小、循环展开步长、向量化宽度、共享内存使用、线程数配置等。

**AutoScheduler (Ansor)** 是 AutoTVM 的继任者，不需要手动编写模板——它自动从算子的 TIR 定义中提取搜索空间并进行进化搜索。

### 5.5 BYOC (Bring Your Own Codegen) 框架

**BYOC** 允许硬件厂商轻松集成自定义后端：

```
1. 注册 Pattern: 定义哪些算子/子图可以被加速器执行
2. 图分割: FuseOpsByPattern + MergeCompositeFunctions
3. 代码生成: 将 composite function 转换为后端中间表示
4. 运行时调度: composite function 被转发给加速器执行
```

**Pattern 注册示例**：

```python
@tvm.ir.register_op_attr("nn.conv2d", "target.my_backend")
def _is_supported(attrs, args):
    return True

# 融合模式
register_pattern("my_backend.conv2d_relu", [("relax.nn.conv2d"), ("relax.nn.relu")])
```

BYOC 的核心优势：所有相关代码自包含，对 TVM 核心无侵入，支持混合执行（不支持的部分走 CPU/GPU fallback）。

### 5.6 TVM/Relax 算子设计哲学

| 特点 | 说明 |
|------|------|
| **多级 IR** | 图级 (Relax) + 张量级 (TensorIR) + 后端级 (LLVM/CUDA) |
| **结构化计算块** | T.block + axis remap 显式表达循环语义，保证变换安全性 |
| **自动调优驱动** | AutoTVM/AutoScheduler 通过搜索找到最优实现 |
| **可扩展后端** | BYOC 框架使硬件厂商可插拔式集成自定义算子库 |
| **计算与调度分离** | 算子的计算逻辑和调度策略解耦 |

---

## 6. 跨框架对比总结

### 6.1 算子设计哲学对比

| 维度 | PyTorch | TensorFlow | ONNX | MLIR | TVM |
|------|---------|-----------|------|------|-----|
| **注册方式** | YAML + TORCH_LIBRARY | REGISTER_OP 宏 | Protobuf schema | MLIR ODS | Python + C++ Op |
| **调度机制** | DispatchKey 多键查找 | OpKernel 设备/类型匹配 | 无调度（契约） | Dialect lowering | Relax→TIR→backend |
| **自动微分** | Autograd 动态图 + AOTAutograd | tf.GradientTape + XLA | 框架层处理 | Enzyme / 框架侧 | relay gradient pass |
| **编译优化** | torch.compile (Dynamo+Inductor) | XLA (HLO fusion) | ORT Graph Optimizer | Progressive lowering | AutoTVM 搜索 |
| **自定义算子** | torch.library / TORCH_LIBRARY | tf.load_op_library | 自定义 domain | Custom dialect | BYOC / TE |
| **IR 层次** | ATen ops → PrimTorch prims | TF ops → HLO | 单一层次 | 多级 (Torch→TOSA→Linalg→...) | Relax→TensorIR→目标 |
| **动态形状** | 原生支持 | 有限支持 | 有限支持 | 符号形状 | Relax 符号形状 |

### 6.2 算子数量对比

| 框架 | 算子规模 | 说明 |
|------|---------|------|
| PyTorch | ~2000+ | ATen 算子（含全部重载） |
| TensorFlow | ~2000+ | 含全部变体 |
| ONNX (ai.onnx) | ~210+ | 标准算子集（opset 28） |
| TOSA | ~60+ | 精简化算子集 |
| StableHLO | ~100+ | HLO 算子集 |
| Linalg | ~40+命名 + generic | 结构化算子 |

### 6.3 各自适用场景

| 框架 | 优势场景 |
|------|---------|
| **PyTorch** | 研究、原型开发、动态模型、Pythonic 体验 |
| **TensorFlow** | 生产部署、TPU/大规模分布式训练 |
| **ONNX** | 模型互操作、跨框架推理、多硬件部署 |
| **MLIR** | 编译器开发、新硬件接入、多级优化基础设施 |
| **TVM** | 多硬件后端优化、异质计算、边缘设备部署 |

### 6.4 算子体系设计趋势

1. **层次化分解**：单一大算子集 → 多级分解（高层算子 → 原始算子），PrimTorch 和多层 dialect 是代表。
2. **编译融合**：算子融合从手工优化移入编译器（XLA fusion、TorchInductor、TVM tensorize）。
3. **标准化 IR**：ONNX、StableHLO、TOSA 作为框架间互操作的桥梁。
4. **符号动态形状**：从纯静态图走向符号化动态形状（Relax symbolic var、PyTorch SymInt）。
5. **硬件可插拔**：`PrivateUse1`、BYOC、EP 机制体现对非主流硬件的友好接入。
6. **自动微分分离**：反向逻辑从算子定义中分离（CompositeImplicitAutograd、gradient pass）。

---

## 🔮 下一步：如何选择与深入？

### 你的路线图取决于你的角色

| 角色 | 建议路径 |
|------|---------|
| **AI 框架开发者** | 深入 PyTorch ATen / Dispatcher / torch.compile 源码，理解 PrimTorch 的 decompositions |
| **编译器工程师** | 从 MLIR Toy Tutorial 入手，理解 Dialect 定义和 progressive lowering，再关注 StableHLO 和 Linalg |
| **推理引擎开发者** | 看 ONNX Runtime 的 EP 机制、TVM 的 AutoTVM + BYOC、以及 XLA 的算子融合 |
| **新硬件适配者** | 关注 PyTorch `PrivateUse1`、TVM BYOC、TOSA 的精简算子集——哪个路径最短就选哪个 |
| **AI Infra 总体架构师** | 需要理解所有五个体系的核心哲学，才能在做技术选型和架构决策时心中有数 |

### 推荐学习资源

- 📖 **PyTorch Dispatcher** — ezyang's blog 系列，深入理解 `DispatchKey` 和 `TORCH_LIBRARY`
- 📖 **MLIR Toy Tutorial** — mlir.llvm.org，理解 Dialect 定义的最佳起点
- 📖 **ONNX Operator Spec** — onnx.ai，查看每个算子的完整输入输出定义
- 📖 **TVM Book** — tvm.apache.org 官方文档，从 Relay 到 TIR 的完整教程
- 📖 **StableHLO Specification** — openxla.org，理解跨框架 IR 的标准
- 🔧 **Nsight Compute** — GPU kernel 性能分析必备
- 🔧 **TorchBench / ONNX Runtime Perf** — 框架级别的算子性能测试

### 一句话总结

> **PyTorch 让写算子像写 Python 一样简单，TensorFlow 让算子的调度像配置一样严谨，ONNX 让算子像协议一样标准化，MLIR 让算子像乐高一样层次化，TVM 让算子像搜索问题一样自动化。**

五个体系各有侧重，但它们都在做同一件事：**让从算法到硬件的距离再短一点**。理解它们的共性和差异，就是你在 AI Infra 领域最好的投资。

---

## 参考资料

- PyTorch ATen Native Functions README (github.com/pytorch/pytorch)
- PyTorch Dispatcher — ezyang's blog
- PyTorch Custom Operators Tutorial (pytorch.org)
- TensorFlow Adding an Op Guide (tensorflow.org)
- OpenXLA / StableHLO Specification (openxla.org)
- MLIR TOSA / Linalg Dialect Docs (mlir.llvm.org)
- ONNX Operator Specification (onnx.ai)
- ONNX Runtime Graph Optimizations (onnxruntime.ai)
- Apache TVM Documentation (tvm.apache.org)
- TVM BYOC Tutorial (tvm.apache.org)
- XLA Operator Fusion Analysis (arxiv.org/abs/2301.13062)
- Relax: TVM Unity Graph IR RFC

---

> **文档版本**：v1.0 | **最后更新**：2026-06-29 | **作者**：Hermes Agent (Nous Research)
