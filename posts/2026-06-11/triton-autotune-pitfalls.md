---
title: Triton Autotune 实战踩坑笔记
date: 2026-06-11
tags: [triton, gpu, autotune, debugging]
---

`@triton.autotune` 看起来只是加个 decorator，实际踩了四个坑。

## 背景：Ex06 Autotune Matmul

给之前的 tiled matmul kernel 加 autotune，扫描 BLOCK_M/N/K、num_warps、num_stages 的组合空间，让 Triton 自动给不同 shape 选最优配置。

写完一跑，1024² 和 4096² 报 ✗，只有 2048² 通过。以为是 kernel 算错了，其实 kernel 没问题。

---

## Bug 1：fp16 误差阈值过严

```python
# 原始代码 — 对 fp16 太紧
status = "✓" if max_err < 0.02 else "✗"
```

1024×1024 fp16 matmul 的输出值域在 ~100-300，fp16 在这一段的 ULP 约 0.25。max_err = 0.125 意味着误差仅 **0.5 ULP**，已经是最优水平。0.02 的阈值适合 fp32，对 fp16 是误杀。

**教训：fp16 始终用 `torch.allclose(rtol=1e-2, atol=1.0)`，别用绝对阈值。**

```
fp16 精度参考：
  值 ≈ 1.0   → 1 ULP ≈ 0.001
  值 ≈ 256   → 1 ULP ≈ 0.25
  值 ≈ 1024  → 1 ULP ≈ 1.0
  值 ≈ 65504 → 1 ULP ≈ 64  (fp16 最大值附近)
```

---

## Bug 2：grid 硬编码（致命）

```python
# 错误：grid 在调用前算好，不知道 autotune 选了什么
grid = (triton.cdiv(M, 64), triton.cdiv(N, 64))
matmul_autotuned_kernel[grid](a, b, c, M, N, K, ...)

# 正确：grid 是 lambda，接收 META 字典
grid = lambda META: (
    triton.cdiv(M, META['BLOCK_M']),
    triton.cdiv(N, META['BLOCK_N']),
)
matmul_autotuned_kernel[grid](a, b, c, M, N, K, ...)
```

**原理：** `@triton.autotune` 在运行时会选中 best config，把 BLOCK_M/N/K 等参数通过 `META` 字典注入。如果 grid 硬编码 64，而 autotune 选了 BLOCK_M=128，则只覆盖一半的行/列——mask 挡住溢出的部分，但会有大片输出区域完全没被计算。

之前只有 `BLOCK_M=64` 一个 config 才碰巧对。

**这是 autotune 跟普通 `@triton.jit` 最大的区别：约束参数不再由调用者传递，而是 autotune 注入。grid 必须跟着变。**

---

## Bug 3：prune 函数签名

```python
# 错误 — Triton 3.6 实际调用为 prune(configs, named_args, **kwargs)
def prune_config(configs):
    ...

# 正确
def prune_config(configs, named_args, **kwargs):
    M = named_args['M']
    N = named_args['N']
    K = named_args['K']
    ...
```

Triton 3.6 源码（`triton/runtime/autotuner.py:262`）：

```python
pruned_configs = self.early_config_prune(self.configs, self.nargs, **kwargs)
```

`self.nargs` 是包含 M/N/K 的 dict，`**kwargs` 含 grid 等运行时参数。

不同 Triton 版本的 API 有差异，报错时直接去看 `triton/runtime/autotuner.py` 的调用处最稳。

---

## Bug 4：config 空间只有一个配置

autotune = 扫描多个 config → 给每个 shape 选最佳。只有一个 config 等于没 autotune。

**Config 空间应该覆盖：**

| 维度 | 范围 | 原因 |
|------|------|------|
| BLOCK_M | 64, 128, 256 | tile 高度 — 影响 CTA 数量 |
| BLOCK_N | 64, 128, 256 | tile 宽度 — 影响计算/访存比 |
| BLOCK_K | 32, 64 | K 维度步长 — 宽 K 减少循环次数 |
| num_warps | 4, 8 | 线程数 — 影响寄存器压力和 occupancy |
| num_stages | 2, 3, 4 | pipeline 深度 — 换 latency hiding |

最终用了 10 个 config，组合以上维度。

---

## 不同 Shape 为什么选不同 Config

```
1024³ → BLOCK_M=64, BLOCK_N=128, BLOCK_K=32, num_warps=4, stages=3
2048³ → BLOCK_M=64, BLOCK_N=64,  BLOCK_K=64, num_warps=4, stages=3
4096³ → BLOCK_M=64, BLOCK_N=128, BLOCK_K=32, num_warps=4, stages=3
```

**1024³ 和 4096³ 选了同一配置（wide tile BLOCK_N=128），2048³ 选了 deep tile BLOCK_K=64。为什么？**

直觉应该是"形状越大 tile 越大"，但数据显示：

- **小矩阵（1024³）**：1024/64 = 16 个 CTA/维，共 256 个 CTA。56 个 SM 每个只跑 4-5 个 wave。用 N=128 **减少 CTA 总数到 128**，减少 launch overhead。
- **中矩阵（2048³）**：2048/64 = 32 个 CTA/维，共 1024 个 CTA。每个 SM 跑 ~18 个 CTA，已经够密集。此时 **增加 K 维度（64→减少循环次数）** 收益更大——每次 K 迭代都要从 global memory 重新加载 tile，减少迭代次数比减少 CTA 开销更有效。
- **大矩阵（4096³）**：4096/64 = 64 个 CTA/维，共 4096 个 CTA。每个 SM 跑 ~73 个 CTA，非常密集。回归 N=128 减少 half 的 CTA，此时 **减少 grid launch 又变得重要**。

**规律：中等规模的矩阵 compute-bound 靠 K loop 优化，小/大矩阵偏向减少 grid launch overhead。**

---

## 最终性能

| 形状 | 选中 Config | Triton | cuBLAS |
|------|-----------|:------:|:------:|
| 1024³ | N=128 K=32 | 47.5 TFLOPS | 43.1 TFLOPS |
| 2048³ | N=64 K=64 | 66.3 TFLOPS | 66.3 TFLOPS |
| 4096³ | N=128 K=32 | 68.4 TFLOPS | 71.2 TFLOPS |

小矩阵甚至反超 cuBLAS（47.5 vs 43.1），中大矩阵持平。

---

## 要点总结

1. **fp16 精度别用绝对误差阈值** — `allclose` 是标准做法
2. **autotune 的 grid 必须是 lambda** — 读 `META` 获取注入的 BLOCK 尺寸
3. **prune 签名查源码** — Triton 版本间有差异，`triton/runtime/autotuner.py` 是权威
4. **config 空间要有覆盖** — tile size × warps × stages，至少 8-12 个
5. **autotune 的价值在于 shape 选择不同 config** — 没有万能配置，不同规模各有最优
