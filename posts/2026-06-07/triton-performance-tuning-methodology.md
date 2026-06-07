---
title: "Triton 性能调优方法论：Roofline、Profiling 与瓶颈诊断"
date: 2026-06-07
tags: [AI Infra, Triton, GPU 编程, 性能优化]
---

写完 kernel 只是第一步。让它跑得快，靠的是系统性的性能分析和瓶颈诊断。本文梳理 Triton kernel 优化的完整方法论。

---

## 一、Roofline 模型：你的 kernel 卡在哪里？

GPU 上只有两类瓶颈：

```
                    ▲
   Compute-bound    │  ╔═══════════════════════╗
   (算力不够)        │  ║   Compute Roofline    ║  ← 硬件峰值 FLOPS
                    │  ╚═══════════════════════╝
                    │        /
                    │       /  Memory-bound
                    │      /   (带宽不够)
                    │     /
                    │    /
                    └────────────────────────────────▶
                         Arithmetic Intensity (FLOP/byte)
```

- **Memory-bound**（左半区）：每个 byte 数据只做很少的计算，瓶颈在显存带宽。典型：element-wise ops（ReLU, dropout, LayerNorm）
- **Compute-bound**（右半区）：每个 byte 数据做大量计算，瓶颈在算力。典型：矩阵乘法、卷积

**关键公式**：
```
Operational Intensity = Total FLOPs / Total Bytes Moved

如果是 Memory-bound: 时间 ≈ Bytes / Bandwidth
如果是 Compute-bound: 时间 ≈ FLOPs / Peak FLOPS
```

**你的 RTX 4070 SUPER (AD104) **：
- 峰值 FP32: ~35.5 TFLOPS
- 显存带宽: ~504 GB/s (192-bit GDDR6X @ 21 Gbps)
- 交叉点: ~70 FLOP/byte（低于这个值是 memory-bound）

### 实操：判断你的 kernel 是哪类

```python
# 以 vector add 为例
# 读 2 个 float32 = 8 bytes，写 1 个 float32 = 4 bytes，做了 1 次加法 = 1 FLOP
# AI = 1 / 12 ≈ 0.08 FLOP/byte ← 极度 memory-bound

# 以 matmul (M=N=K=4096) 为例
# FLOPs = 2 * 4096^3 = 137B FLOP
# Bytes ≈ 3 * 4096^2 * 4 = 201MB
# AI = 137B / 201M ≈ 682 FLOP/byte ← compute-bound
```

---

## 二、Triton Profiling 工具链

### 2.1 基础：GPU Event Timer

```python
import torch

start = torch.cuda.Event(enable_timing=True)
end = torch.cuda.Event(enable_timing=True)

# Warmup
for _ in range(10):
    kernel[grid](...)
torch.cuda.synchronize()

# Measure
start.record()
kernel[grid](...)
end.record()
torch.cuda.synchronize()
elapsed_ms = start.elapsed_time(end)
```

**注意事项**：
- 必须 warmup（GPU 频率动态调整，前几次 run 不准确）
- `torch.cuda.synchronize()` 确保 kernel 执行完再计时
- GPU clock 会因温度/功耗 throttling，长时间 benchmark 要监控频率

### 2.2 Triton 内置 Profiler

```bash
TRITON_PRINT_AUTOTUNING=1 python my_kernel.py
```

输出每个 autotune config 的：
- 耗时 (ms)
- Register usage
- Shared memory usage
- Occupancy

```python
# 在代码中获取编译结果
compiled = triton.compile(kernel, signature=..., constants={...})
print(f"Registers: {compiled.n_regs}")
print(f"Shared memory: {compiled.n_spills} bytes")
print(f"PTX: {compiled.asm['ptx'][:500]}")
```

### 2.3 NVIDIA Nsight Systems / Compute

```
# Nsight Systems (时间线，看整体)
nsys profile --stats=true python my_kernel.py

# Nsight Compute (单 kernel 细粒度分析)
ncu --set full -o profile python my_kernel.py
```

Nsight Compute 能告诉你：
- Memory throughput 利用率 (%)
- Compute throughput 利用率 (%)
- Occupancy
- Register spill
- Bank conflict
- 每个 warp 的 stall 原因（long scoreboard、short scoreboard、barrier 等）

**对 Triton kernel 的限制**：Triton 生成的 kernel 名字是自动的（如 `softmax_online_kernel_0d1d2d3d4d5d6`），需要在 ncu 输出里搜索。建议给你的 Triton kernel 设置 `@triton.autotune` 并关注输出中的 kernel name。

---

## 三、常见瓶颈与诊断

### 3.1 寄存器溢出 (Register Spilling)

**症状**：kernel 比预期慢 30-50%

**原因**：每个 SM 的寄存器数量固定（4070 SUPER: 65536 per SM）。如果你的 kernel 用了太多 local 变量，编译器只能把多余的「溢出」到 local memory（实际在 global memory 中，~500 cycles 延迟）。

**诊断**：
```bash
# 方法1: 看 autotune 输出
TRITON_PRINT_AUTOTUNING=1 python my_kernel.py
# 关注 n_regs — 如果接近 255（per-thread limit），问题来了

# 方法2: 查 PTX
kernel.asm['ptx']
# 搜索 st.local 或 ld.local — 出现这些就是 spill 了
```

**解法**：
- 减少 `tl.arange` 的数量（每个 arange 占一个寄存器）
- 用 `tl.maximum` / `tl.where` 代替 if-else（减少寄存器压力）
- 降低 `BLOCK_SIZE`（每个 block 线程少了，per-thread 寄存器多了）
- 调整 `num_warps`（更少的 warp = 更多的 per-thread 寄存器）

### 3.2 Shared Memory Bank Conflict

**症状**：shared memory 访问慢

**原因**：shared memory 有 32 个 bank（和 warp size 一样）。同一 warp 的 32 个线程如果访问了同一个 bank 的不同地址，就会串行化。

**典型场景**：
```python
# 这会导致 bank conflict（stride=32 时同一列在同一 bank）
a = tl.load(a_ptr + offsets[:, None] * stride + offsets[None, :])
```

**诊断**：
```bash
# Nsight Compute 直接报告 bank conflict
ncu --set full --section MemoryWorkloadAnalysis python my_kernel.py

# 手工检查: 看你的 shared memory layout
# 如果同一 warp 的线程访问 shared memory 地址 % 128 == 相同值，就是 bank conflict
```

**解法**：
- 给 shared memory 加 padding（如分配 `[BLOCK_M + pad, BLOCK_K]` 而不是 `[BLOCK_M, BLOCK_K]`）
- 改变数据 layout（如 AoS → SoA）
- 使用 `tl.trans` 重排数据

### 3.3 Occupancy 不足

**症状**：SM 利用率低

**原因**：每个 SM 最多同时驻留的 warp 数由寄存器和 shared memory 用量决定。

```
Max warps per SM = min(
    max_warps_per_sm,      # 4070 SUPER: 48
    regs_per_sm / (n_regs_per_thread * 32),
    shmem_per_sm / shmem_per_block
)
```

Occupancy = (实际驻留 warps) / (最大可能 warps)

**诊断**：
```python
compiled = triton.compile(...)
occupancy = compiled.n_regs  # 越低 occupancy 越高
```

**解法**：
- 有时候 **低 occupancy 反而是对的**：如果 kernel 是 compute-bound，少 warps 但每个 warps 用满计算单元比多 warps 但每个都在等数据好
- 关注的是 latency hiding：有足够 warps 掩盖 memory latency 即可

### 3.4 指令级瓶颈

**症状**：PTX 里出现低效指令序列

**诊断**：直接对比 PTX 输出

```python
ptx = kernel.asm['ptx']
# 搜索:
# - ld.global → global memory load
# - st.global → global memory store
# - mma.sync → Tensor Core 指令（出现则说明用了 Tensor Core）
# - bar.sync → barrier（过多说明同步开销大）
```

---

## 四、Autotuner 深度使用

```python
@triton.autotune(
    configs=[
        triton.Config({'BLOCK_M': 64, 'BLOCK_N': 64, 'BLOCK_K': 32}, num_warps=4, num_stages=2),
        triton.Config({'BLOCK_M': 128, 'BLOCK_N': 128, 'BLOCK_K': 32}, num_warps=8, num_stages=3),
        # ...
    ],
    key=['M', 'N', 'K'],  # cache key — 相同 shape 复用缓存结果
    prune_configs_by={
        'early_config_prune': prune_func,  # 过滤不可行 config
        'perf_model': lambda cfg, M,N,K: estimated_time(cfg),  # 性能模型
        'top_k': 10,  # 只跑 top-k 个 config
    }
)
@triton.heuristics({
    'EVEN_K': lambda args: args['K'] % BLOCK_K == 0,  # 编译期常量折叠
})
@triton.jit
def my_kernel(...):
    ...
```

**Autotune 策略**：
1. **粗搜**：BLOCK 大小从 16 到 256，步长取 2 的幂
2. **细搜**：在粗搜最好的几个 config 附近细化
3. **num_warps 规则**：compute-bound kernel 用少的 warps（4），memory-bound kernel 用多的 warps（8-16）来隐藏延迟
4. **num_stages**：多 stage 做 software pipelining（用 shared memory 换 latency hiding），memory-bound kernel 效果好

**关键参数经验**：
| 参数 | Memory-bound | Compute-bound |
|------|-------------|---------------|
| BLOCK_SIZE | 大 (512-2048) | 中 (128-256) |
| num_warps | 多 (8-16) | 少 (4-8) |
| num_stages | 多 (3-5) | 少 (1-2) |

---

## 五、调试 IR Dump

```bash
# Triton IR (TTIR)
MLIR_ENABLE_DUMP=1 TRITON_DUMP_IR=1 python my_kernel.py

# 只看某个 kernel 的 dump
TRITON_ALWAYS_COMPILE=1 python -c "
import triton
@triton.jit
def my_kernel(...): ...
compiled = triton.compile(my_kernel, signature=...)
print(compiled.asm['ttir'])
print(compiled.asm['ttgir'])
print(compiled.asm['llir'])
print(compiled.asm['ptx'])
"
```

Dump 中各层的作用：
- **TTIR**：看你的 Python DSL 被翻译成了什么 IR——验证 compiler 是否理解正确
- **TTGIR**：看 shared memory layout、memory layout（blocked/mma/slice）——诊断 bank conflict
- **LLVM IR**：看循环展开、向量化、内联的效果
- **PTX**：最终代码生成质量——数 load/store 指令，验证 coalescing

---

## 六、实战优化流程

对任何一个 Triton kernel，按这个顺序来：

```
1. 确定瓶颈类型
   AI = FLOPs / Bytes
   ├─ AI < 70 → memory-bound → 优化重点是减少访存
   └─ AI > 70 → compute-bound → 优化重点是提高 FLOP 利用率

2. Baseline + Profiling
   GPU timer 测 basline → ncu 看 stall reason

3. Autotune 搜索
   先粗后细，关注 register / shmem / occupancy

4. 按瓶颈优化
   Memory-bound:
   ├─ 增大 BLOCK_SIZE（减少 grid launch 开销）
   ├─ 合并访问（确保连续加载）
   ├─ 增加 num_stages（software pipelining）
   └─ 用 vectorized load（tl.load 的 mask 模式自动处理）
   Compute-bound:
   ├─ 确保用上 Tensor Core（tl.dot 在特定 BLOCK 和 dtype 下触发）
   ├─ 减少 warp divergence
   ├─ 寄存器压力优化（降低 num_warps 或 BLOCK_SIZE）
   └─ 循环展开提示

5. 验证
   ncu 对比优化前后 → GPU timer 确认提升
```

---

## 七、自测

用你的 5 个 exercise kernel 做 profiling：

1. 算每个 kernel 的 Arithmetic Intensity，判断是 memory-bound 还是 compute-bound
2. 用 `TRITON_PRINT_AUTOTUNING=1` 查看 register/shared memory 用量
3. 对 memory-bound kernel，尝试增大 BLOCK_SIZE 或 num_stages
4. 对 compute-bound kernel，尝试不同的 num_warps
5. 记录优化前后的性能变化

本文是 Triton 系列的一部分。上一篇：[GPU 编程模型全景图](/posts/2026-06-07/triton-gpu-programming-landscape.html)
