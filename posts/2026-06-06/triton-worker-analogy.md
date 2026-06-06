---
title: "Triton GPU 编程入门（二）：用「工人分卡片」理解算子、Grid 与并行模型"
date: 2026-06-06
tags: [AI Infra, Triton, GPU 编程]
---

上一篇用 Vector Add 跑通了第一个 Triton kernel。本文换一个角度：**不写代码，用类比建立 GPU 并行的心理模型**。这个类比来自一次和 GPT 的讨论，非常直观。

---

## 一、场景：给 1024 张卡片加 1

假设你有一个大箱子，里面装着 **1024 张数字卡片**。你要给每张卡片上的数字加 1。

这就是一个最简单的**算子**（operator）：对一组数据执行同一个操作。

我们把这个场景拆成四个概念：

---

## 二、四个核心概念

### 1. 总数据量 = 1024 张卡片

有多少数据要处理。在 Triton 里，这对应你写的循环终止条件：`offsets < n_elements`。

### 2. 写算子 = 描述"如何对一张卡片加 1"

你写一段规则：`x + 1`。这段规则就是 Triton kernel 的**函数体**。

```python
# 这不只是 Python——这是「对每个数据元素做什么」的描述
def add_one(x):
    return x + 1
```

### 3. Program（工人）= 每个工人负责一部分卡片

你雇了工人来干活。**每个工人只从箱子里取走一部分卡片**（比如 64 张），独立完成工作。

在 Triton 里，每个 "program" 对应 GPU 上的一个 **thread block**（线程块）。一个 program 内部有成百上千个线程，Triton 自动管理这些线程的并行——你不需要手动分配线程。

### 4. Grid = 你需要雇多少工人

```
grid = 总卡片数 ÷ 每个工人负责的卡片数
     = 1024 ÷ 64
     = 16 个工人
```

在 Triton 里：`grid = (triton.cdiv(1024, 64),)` → `(16,)`。

---

## 三、这个类比为什么管用

**写 Triton kernel 的本质**：

1. 描述"对一个数据元素做什么"（算子逻辑）
2. 告诉框架"一共有多少数据"（n_elements）
3. 决定"每个工人分多少数据"（BLOCK_SIZE）
4. 框架自动计算需要多少工人（grid）并调度他们

**你不需要关心的事**（Triton 自动处理）：

- 16 个工人怎么分配到 GPU 的 SM（流处理器）上
- 每个工人内部 256 个线程怎么协作
- 显存访问是否合并（memory coalescing）
- 什么时候用 shared memory、什么时候用 registers

这就解释了为什么 Triton 比 CUDA 好写 10 倍——你只描述"做什么"，不用描述"怎么调度"。

---

## 四、推广到更复杂的算子

### Scalar add（逐元素加 1）

```
每个工人做的事: x + 1
工人之间关系:   完全独立，不需要通信
性能特征:       memory-bound（瓶颈在读写显存，不在计算）
```

### Softmax

```
每个工人做的事: 扫一遍数据找 max → 再扫一遍归一化
工人之间关系:   同一个样本的工人需要共享 max 和 sum
性能特征:       memory-bound（多轮读写）
```

### 矩阵乘法

```
每个工人做的事: 计算 C 的一个 tile = A_tile @ B_tile
工人之间关系:   独立（每个工人负责输出矩阵的不同区域）
性能特征:       compute-bound（瓶颈在计算，Tensor Core 全速运转）
```

### FlashAttention

```
每个工人做的事: 对 Q 的一块 × K 的全部 → online softmax → 乘 V
工人之间关系:   不同 Q 块的工人独立；同一 Q 块的工人需要遍历所有 K 块
性能特征:       compute-bound（但显存存取从 O(n²) 降为 O(1)）
```

---

## 五、Triton 的"自动调度"到底做了什么

回到工人类比。如果你自己管工人（手写 CUDA），你需要：

1. 决定 16 个工人分几班（grid 的 2D/3D 排列）
2. 决定每班工人怎么共享工具（shared memory 分配）
3. 决定工人在仓库里怎么走动不撞到一起（同步 barrier）
4. 决定工人的取货路线以最短路径（memory coalescing）

Triton 做了其中 3 和 4（编译器自动优化），简化了 2（用 `tl.constexpr` 声明 shared memory 大小），只让你决定 1（grid 维度）。这就是「CUDA 的性能，Python 的体验」的本质。

---

## 六、一个反直觉的结论

**Worker 越多不一定越快。**

回到 1024 张卡片的例子：

| 每工人卡片数 | 工人数 | 结果 |
|------------|-------|------|
| 1024 | 1 | 1 个工人搬全部——累死，其他 SM 闲着 |
| 64 | 16 | 刚好填满所有 SM（假设 16 个 SM） |
| 1 | 1024 | 1024 个工人各搬 1 张——调度开销远超计算开销 |

GPU 上同理。BLOCK_SIZE 太小 → 每个 block 的计算不够填满 GPU core，overhead 占比高。BLOCK_SIZE 太大 → 寄存器不够用，溢出到 slow memory。**关键在于找到 sweet spot**——这就是 triton-benchmark 要测的东西。

---

*本系列所有代码见 [triton-benchmark-prep](https://github.com/freezetheflame/triton-benchmark-prep)*
