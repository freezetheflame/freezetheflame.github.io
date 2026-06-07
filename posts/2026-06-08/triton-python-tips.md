---
title: "Triton & Python 技巧录"
date: 2026-06-08
tags: [Triton, Python, GPU 编程, 技巧]
---

写 Triton kernel 和做 GPU profiling 时踩到的坑，记录下来。持续更新。

---

## 1. GPU Timer 的 lambda 陷阱

用 `torch.cuda.Event` 计时时，最常见的错误是把 kernel 调用直接写进 `measure()` 参数：

```python
# ❌ 错误 — kernel 在传入 measure 之前就执行了
timer.measure(kernel[grid](x, out, N, BLOCK_SIZE=BLOCK_SIZE))
```

`kernel[grid](...)` 会立即执行并返回 `None`（Triton kernel 没有返回值），然后 `measure(None)` 试图计时一个 `None`……什么也测不到。

正确写法：用一个**零参数 callable** 把调用包起来：

```python
# ✅ 正确 — lambda 延迟执行
timer.measure(lambda: kernel[grid](x, out, N, BLOCK_SIZE=BLOCK_SIZE))
```

等价的替代写法：

```python
from functools import partial

# 方式 B：partial
timer.measure(partial(kernel[grid], x, out, N, BLOCK_SIZE=BLOCK_SIZE))

# 方式 C：具名函数
def run():
    kernel[grid](x, out, N, BLOCK_SIZE=BLOCK_SIZE)
timer.measure(run)
```

**小结**：lambda 最简洁。关键原则是「传入一个还没执行的函数，而不是执行结果」。

---

## 2. TRITON_PRINT_AUTOTUNING=1 什么时候才有用？

这个环境变量只在 kernel 用了 `@triton.autotune` 装饰器时才打印寄存器数、shared memory、occupancy。裸 `@triton.jit` 不会触发。

```python
# 这样不会打印任何东西
@triton.jit
def my_kernel(...): ...

# 这样才能看到 autotune 输出
@triton.autotune(configs=[...], key=[...])
@triton.jit
def my_kernel(...): ...
```

如果不想写 autotune 但又想拿编译信息，可以用 `triton.compile()` 拿到 `CompiledKernel` 对象，它的 `.metadata` 里有 `shared`、`num_warps`、`num_stages`。寄存器数仍然只能走 autotune 或 Nsight。

---

## 3. Triton 3.6 没有 tl.math.tanh

直接手写：`tanh(z) = (exp(2z) - 1) / (exp(2z) + 1)`

```python
@triton.jit
def tanh_kernel(x_ptr, out_ptr, n, BLOCK_SIZE: tl.constexpr):
    pid = tl.program_id(0)
    offs = pid * BLOCK_SIZE + tl.arange(0, BLOCK_SIZE)
    mask = offs < n
    x = tl.load(x_ptr + offs, mask=mask)
    y = (tl.exp(2 * x) - 1) / (tl.exp(2 * x) + 1)
    tl.store(out_ptr + offs, y, mask=mask)
```

---

## 4. tl.load 的 other 参数：mask 位的默认值陷阱

`tl.load(ptr, mask=mask)` 在 mask=False 的位置默认填 **0**。这对 sum/dot 没问题（0 对累加无影响），但对 max/min/product 会引入假数据：

```python
# ❌ 陷阱：max 规约 + 默认 other=0
x = tl.load(ptr + offs, mask=mask)          # mask 位填 0
m = tl.max(x)                                # 如果真实数据全是负数，max = 0（错了！）

# ✅ 修法：选对规约操作透明的 other 值
x = tl.load(ptr + offs, mask=mask, other=-float('inf'))  # max 用 -inf
m = tl.max(x)                                 # -inf 不会赢过任何真实值
```

| 规约操作 | 该填的 `other` | 默认 0 行不行 |
|---------|---------------|:----------:|
| sum / dot | 0 | ✅ |
| max | -inf | ✗ |
| min | +inf | ✗ |
| product | 1 | ✗ |

**典型场景**：softmax 的 max 规约需要 `other=-float('inf')`，matmul 的 dot 用默认 0 就行。

---

## 5. 对 1D 向量做规约：别忘了 axis=0

Triton 的 1D 向量用 `axis=0` 规约才能压成标量：

```python
x = tl.load(...)                    # shape: [BLOCK_SIZE]

# ✅ axis=0 → 标量
block_max = tl.max(x, axis=0)       # → scalar
block_sum = tl.sum(x, axis=0)       # → scalar

# ❌ 省略 axis → 不确定行为（各 backend 可能不同）
block_max = tl.max(x)               # 不建议
```

在 online softmax 里 `m` 和 `d` 必须始终保持标量，所以每个 block 的 max/sum 都要加 `axis=0` 显式归约。
