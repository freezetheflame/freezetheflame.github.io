---
title: "AI算子测试与验证完全指南"
date: 2026-06-29
tags: [AI算子, 算子测试, 精度测试, 差分测试, 性能基准, CI, 调试工具, CUDA]
---

如果你写过 GPU kernel —— 不管是 CUDA 还是 Triton —— 一定经历过这样的场景：写了一个自以为完美的 fused kernel，一跑精度差了两个数量级；改了几行 shared memory 访问模式，性能翻倍但某个边界 case 崩了；提交 PR 后 CI 跑了一小时，结果 golden value 不匹配。**算子开发中，测试和验证的精力投入往往不亚于实现本身。**

这篇指南面向 AI Infra 测试工程师与算子开发者，系统梳理算子测试与验证的五大模块——**精度测试、差分测试、性能基准测试、回归/CI、调试工具**——提供可落地的方法论与完整工具链参考。

<!--more-->

---

## 📖 缘起：算子为什么这么难测？

一个成熟的 AI 推理引擎（如 vLLM、TensorRT-LLM）中，一个算子的生命周期是这样的：

```
写 kernel → 单元测试（单 shape 精度） → 差分测试（多 shape + dtype 组合）
   → 梯度检查（如果可微且需要反向） → 边界测试（NaN/Inf/zero/extreme）
   → 性能基准（Roofline 分析，看是否接近硬件上限） → CI 回归（每次 PR 都跑）
```

这段流程里每一环都可能出问题：浮点运算的精度取舍、不同实现之间的语义等价、硬件利用率是否达标、回归测试是否覆盖全面。五个测试类别各有独立的工具和判定标准，缺少任何一个，线上的某个 corner case 就可能暴雷。

本文从这五个维度逐一展开，每个模块都附带可直接复用的代码和最佳实践。

---

## 🎯 第一章：精度测试 — 算子的"合格证"

精度测试是算子验证的基石，核心目标是量化自定义 CUDA/Triton 实现与参考实现（如 PyTorch）之间的数值差异，并判定是否在可接受范围内。

### 1.1 核心度量指标

#### Cosine Similarity（余弦相似度）

衡量两个输出张量在方向上的相似度，对整体偏移不敏感，适合检测形状正确但局部数值偏差的场景。

```python
import torch

def cosine_similarity(a: torch.Tensor, b: torch.Tensor) -> float:
    a_flat = a.flatten().to(torch.float64)
    b_flat = b.flatten().to(torch.float64)
    dot = torch.dot(a_flat, b_flat)
    norm = torch.norm(a_flat) * torch.norm(b_flat)
    return (dot / norm).item()
```

- **判定标准**：FP32 下 `cos >= 0.9999` 通常可接受；BF16/FP16 下可放宽至 `0.999`。
- **局限**：对整体幅度缩放不敏感（如 `out = 2 * ref` 仍可能有高余弦值），需配合其他指标使用。

#### PSNR（Peak Signal-to-Noise Ratio）

```python
def psnr(ref: torch.Tensor, out: torch.Tensor, max_val: float = 1.0) -> float:
    mse = torch.mean((ref.to(torch.float64) - out.to(torch.float64)) ** 2).item()
    if mse == 0:
        return float('inf')
    return 10 * torch.log10(torch.tensor(max_val ** 2 / mse)).item()
```

- **经验阈值**：> 60 dB 优秀，40-60 dB 可接受，< 40 dB 需排查。

#### MSE（Mean Squared Error）

```python
def mse(ref: torch.Tensor, out: torch.Tensor) -> float:
    return torch.mean((ref.to(torch.float64) - out.to(torch.float64)) ** 2).item()
```

#### Max Relative Error（最大相对误差）

```python
def max_relative_error(ref: torch.Tensor, out: torch.Tensor) -> float:
    ref_f64 = ref.to(torch.float64)
    out_f64 = out.to(torch.float64)
    abs_err = torch.abs(out_f64 - ref_f64)
    abs_ref = torch.abs(ref_f64)
    mask = abs_ref > 1e-12
    if mask.any():
        return (abs_err[mask] / abs_ref[mask]).max().item()
    return abs_err.max().item()
```

#### ULP-Based Comparison（基于 ULP 的比较）

**ULP（Unit in the Last Place）** 是衡量浮点误差最精细的方式，表示两个浮点数之间相隔多少个可表示值。

```python
import struct, numpy as np

def float_to_bits(f):
    return struct.unpack('I', struct.pack('f', f))[0]

def ulp_distance(a: np.float32, b: np.float32) -> int:
    a_bits = float_to_bits(a)
    b_bits = float_to_bits(b)
    if a_bits & 0x80000000:
        a_bits = 0x80000000 - (a_bits & 0x7FFFFFFF)
    if b_bits & 0x80000000:
        b_bits = 0x80000000 - (b_bits & 0x7FFFFFFF)
    return abs(int(a_bits) - int(b_bits))

def ulp_check(ref: torch.Tensor, out: torch.Tensor, max_ulp: int = 2) -> tuple:
    ref_np = ref.cpu().to(torch.float32).numpy().ravel()
    out_np = out.cpu().to(torch.float32).numpy().ravel()
    ulps = np.array([ulp_distance(np.float32(a), np.float32(b))
                     for a, b in zip(ref_np, out_np)])
    max_ulp_val = int(ulps.max())
    exceed_ratio = (ulps > max_ulp).mean()
    return max_ulp_val <= max_ulp, max_ulp_val, exceed_ratio
```

**ULP 判定经验法则**：

| 数据类型 | 宽松 | 适中 | 严格 |
|---------|------|------|------|
| FP32 | ≤ 16 ULP | ≤ 4 ULP | ≤ 1 ULP |
| FP16 | ≤ 8 ULP | ≤ 2 ULP | 精确匹配 |
| BF16 | ≤ 8 ULP | ≤ 2 ULP | 精确匹配 |

### 1.2 随机输入生成策略

```python
def generate_random_inputs(shape, dtype=torch.float32, seed=42):
    torch.manual_seed(seed)
    inputs = []
    # uniform [-1, 1]
    inputs.append(torch.rand(*shape, dtype=dtype, device='cuda') * 2 - 1)
    # normal
    inputs.append(torch.randn(*shape, dtype=dtype, device='cuda'))
    # extreme
    scale = 1e3 if dtype in [torch.float32, torch.bfloat16] else 1e2
    inputs.append(torch.randn(*shape, dtype=dtype, device='cuda') * scale)
    # subnormal
    inputs.append(torch.rand(*shape, dtype=dtype, device='cuda') * 1e-40)
    return inputs

def generate_input_pairs(shape, n_pairs=10, dtype=torch.float32):
    pairs = []
    for i in range(n_pairs):
        a = torch.randn(*shape, dtype=dtype, device='cuda')
        b = torch.randn(*shape, dtype=dtype, device='cuda')
        pairs.append((a, b))
    return pairs
```

### 1.3 边界值、NaN 与 Inf 测试

```python
def generate_boundary_values(dtype=torch.float32):
    finfo = torch.finfo(dtype)
    return {
        'zero': torch.tensor(0.0, dtype=dtype),
        'one': torch.tensor(1.0, dtype=dtype),
        'max': torch.tensor(finfo.max, dtype=dtype),
        'min': torch.tensor(finfo.min, dtype=dtype),
        'eps': torch.tensor(finfo.eps, dtype=dtype),
        'tiny': torch.tensor(finfo.tiny, dtype=dtype),
        'nan': torch.tensor(float('nan'), dtype=dtype),
        'inf': torch.tensor(float('inf'), dtype=dtype),
        'neg_inf': torch.tensor(-float('inf'), dtype=dtype),
    }

def test_boundary_values(op, shape=(4, 4), dtype=torch.float32):
    boundary = generate_boundary_values(dtype)
    results = {}
    for name, val in boundary.items():
        try:
            inp = torch.full(shape, val.item(), dtype=dtype, device='cuda')
            out = op(inp)
            has_nan = torch.isnan(out).any().item()
            has_inf = torch.isinf(out).any().item()
            results[name] = {'ok': True, 'has_nan': has_nan, 'has_inf': has_inf}
        except Exception as e:
            results[name] = {'ok': False, 'error': str(e)}
    return results
```

**测试清单**：
- 输入全部为 NaN → 输出是否全部为 NaN（或按约定处理）
- 输入包含 Inf → 是否有意义（如加法 `inf + 1 = inf`）
- 输入为零 → 是否存在除零
- 输入为极其微小的次正规数 → 是否被 flush-to-zero
- 输入为极大值 → 是否上溢到 Inf

### 1.4 Gradcheck（梯度检查）

验证自定义算子的反向传播实现是否正确，通过有限差分法数值对比自动梯度。

```python
# 基本用法
def my_op(x): return x ** 2

x = torch.randn(4, 4, dtype=torch.float64, device='cuda', requires_grad=True)

passed = torch.autograd.gradcheck(
    my_op, (x,),
    eps=1e-6, atol=1e-5, rtol=1e-3,
    raise_exception=False,
)

# 自定义 Function
class MyReLU(torch.autograd.Function):
    @staticmethod
    def forward(ctx, x):
        ctx.save_for_backward(x)
        return x.clamp(min=0)
    @staticmethod
    def backward(ctx, grad_output):
        x, = ctx.saved_tensors
        grad_input = grad_output.clone()
        grad_input[x < 0] = 0
        return grad_input

# 二阶梯度检查
torch.autograd.gradgradcheck(my_op, (x,))

# Fast Mode（推荐用于 CI）
passed_fast = torch.autograd.gradcheck(
    my_op, (x,), fast_mode=True, raise_exception=False
)
```

**重要注意事项**：
1. **必须使用 `float64`**：gradcheck 默认要求双精度输入，低精度可能导致假阳性失败。
2. **非可微点**：在 ReLU 的 `x=0` 等非可微点，数值梯度与解析梯度天然不一致。
3. **`nondet_tol` 参数**：若算子在确定性的浮动，设置 `nondet_tol=1e-5` 可放宽检查。
4. **fast_mode**：使用随机向量投影而非全 Jacobian 矩阵，速度快几个数量级。

---

## 🔬 第二章：差分测试 — 同一语义，不同实现

差分测试（Differential Testing）的核心思想：同一计算语义的不同实现，对相同输入应产生（近似）相同的输出。

### 2.1 PyTorch vs CUDA 实现对比

```python
from typing import Callable, Dict, List

def diff_test(ref_func, test_func, input_gen, n_trials=10,
              rtol=1e-3, atol=1e-5, verbose=True):
    results = []
    for i in range(n_trials):
        inputs = input_gen()
        with torch.no_grad():
            ref_out = ref_func(*inputs)
            test_out = test_func(*inputs)
        
        result = {'trial': i, 'passed': True}
        
        if ref_out.shape != test_out.shape:
            result['passed'] = False
            result['shape_mismatch'] = (ref_out.shape, test_out.shape)
            results.append(result)
            continue
        
        ok = torch.allclose(ref_out, test_out, rtol=rtol, atol=atol)
        if not ok:
            result['passed'] = False
            result['max_diff'] = (ref_out - test_out).abs().max().item()
        results.append(result)
    
    pass_rate = sum(1 for r in results if r['passed']) / len(results)
    if verbose:
        print(f"Diff test: {pass_rate*100:.1f}% passed "
              f"({sum(1 for r in results if r['passed'])}/{n_trials})")
    return {'pass_rate': pass_rate, 'n_trials': n_trials, 'results': results}
```

### 2.2 算子等价性验证

**VOLTA 等价性检查器**（2025, Microsoft Research + Stanford）：
- 首个针对 GPU kernel 的等价性检查器，支持卷积、矩阵乘法、注意力机制
- 基于 PTX 中间表示，形式化验证两个 kernel 的语义等价
- 参考：arXiv:2511.12638

**统计等价性验证**：

```python
def statistical_equivalence_check(ref_func, test_func, n_inputs=100,
                                  shapes=None, dtypes=None,
                                  rtol=1e-3, atol=1e-5):
    if shapes is None:
        shapes = [(1, 64), (32, 128), (256, 1024)]
    if dtypes is None:
        dtypes = [torch.float32, torch.float16, torch.bfloat16]
    
    stats = {'total': 0, 'passed': 0, 'failures': []}
    for shape in shapes:
        for dtype in dtypes:
            for i in range(max(1, n_inputs // (len(shapes) * len(dtypes)))):
                stats['total'] += 1
                a = torch.randn(*shape, device='cuda', dtype=dtype)
                b = torch.randn(*shape, device='cuda', dtype=dtype)
                try:
                    with torch.no_grad():
                        ref_out = ref_func(a, b)
                        test_out = test_func(a, b)
                    if torch.allclose(ref_out, test_out, rtol=rtol, atol=atol):
                        stats['passed'] += 1
                    else:
                        stats['failures'].append({
                            'shape': shape, 'dtype': dtype,
                            'max_diff': (ref_out - test_out).abs().max().item()
                        })
                except Exception as e:
                    stats['failures'].append({
                        'shape': shape, 'dtype': dtype, 'error': str(e)
                    })
    
    stats['pass_rate'] = stats['passed'] / stats['total']
    return stats
```

### 2.3 批量差分框架设计

```
批量差分框架架构：
┌─────────────────────────────────────────────┐
│              Test Orchestrator              │
├─────────────────────────────────────────────┤
│           Operator Registry                 │
│  op_name -> {ref_impl, test_impl, shapes,   │
│              dtypes, tolerances}            │
├─────────────────────────────────────────────┤
│         Input Generator Factory             │
│  random / boundary / nan_inf / stress       │
├─────────────────────────────────────────────┤
│         Comparison Engine                   │
│  cosine / MSE / ULP / allclose / gradcheck  │
├─────────────────────────────────────────────┤
│         Reporter & Visualization            │
│  JSON report / HTML dashboard / CI artifact │
└─────────────────────────────────────────────┘
```

```python
from dataclasses import dataclass, field

@dataclass
class OperatorTestCase:
    name: str
    ref_impl: Callable
    test_impl: Callable
    shapes: List[Tuple] = field(default_factory=lambda: [(256, 256)])
    dtypes: List[torch.dtype] = field(default_factory=lambda: [torch.float32])
    tolerances: Dict = field(default_factory=lambda: {'atol': 1e-5, 'rtol': 1e-3})

class BatchDiffTestRunner:
    def __init__(self):
        self.cases = []
    
    def register(self, case):
        self.cases.append(case)
    
    def run_all(self, verbose=True):
        all_results = {}
        for case in self.cases:
            case_results = []
            for shape in case.shapes:
                for dtype in case.dtypes:
                    a = torch.randn(*shape, device='cuda', dtype=dtype)
                    b = torch.randn(*shape, device='cuda', dtype=dtype)
                    try:
                        ref_out = case.ref_impl(a, b)
                        test_out = case.test_impl(a, b)
                        ok = torch.allclose(ref_out, test_out,
                            rtol=case.tolerances['rtol'],
                            atol=case.tolerances['atol'])
                        case_results.append({
                            'shape': shape, 'dtype': str(dtype), 'passed': ok
                        })
                    except Exception as e:
                        case_results.append({
                            'shape': shape, 'dtype': str(dtype),
                            'passed': False, 'error': str(e)
                        })
            n_pass = sum(1 for r in case_results if r['passed'])
            all_results[case.name] = {
                'status': 'pass' if n_pass == len(case_results) else 'fail',
                'pass_rate': n_pass / len(case_results),
            }
            if verbose:
                print(f"[{all_results[case.name]['status'].upper()}] {case.name}: "
                      f"{n_pass}/{len(case_results)}")
        return all_results
```

---

## ⚡ 第三章：性能基准测试 — 算子的"速度计"

性能测试的目标是量化算子的速度、吞吐量、硬件利用率，并与理论极限（Roofline）对比。

### 3.1 Warm-Up 与延迟测量

```python
import time, numpy as np

def benchmark_kernel(func, inputs, n_warmup=10, n_iters=100):
    # Warm-up
    for _ in range(n_warmup):
        func(*inputs)
    torch.cuda.synchronize()
    
    # 计时（使用 CUDA Events）
    start_events = [torch.cuda.Event(enable_timing=True) for _ in range(n_iters)]
    end_events = [torch.cuda.Event(enable_timing=True) for _ in range(n_iters)]
    
    for i in range(n_iters):
        start_events[i].record()
        func(*inputs)
        end_events[i].record()
    
    torch.cuda.synchronize()
    
    latencies = np.array([
        start_events[i].elapsed_time(end_events[i]) for i in range(n_iters)
    ])
    
    total_bytes = sum(
        inp.element_size() * inp.numel() for inp in inputs
        if isinstance(inp, torch.Tensor)
    )
    avg_lat = float(np.mean(latencies))
    throughput_gbps = (total_bytes / 1e9) / (avg_lat / 1e3)
    
    return {
        'avg_ms': avg_lat,
        'median_ms': float(np.median(latencies)),
        'p99_ms': float(np.percentile(latencies, 99)),
        'p999_ms': float(np.percentile(latencies, 99.9)),
        'min_ms': float(latencies.min()),
        'max_ms': float(latencies.max()),
        'std_ms': float(latencies.std()),
        'throughput_gbps': throughput_gbps,
    }
```

### 3.2 Throughput 测量

```python
def measure_throughput(func, input_generator,
                       batch_sizes=[1, 4, 16, 64, 256],
                       duration_sec=1.0):
    results = {}
    for bs in batch_sizes:
        inputs = input_generator(bs)
        for _ in range(10):
            func(*inputs)
        torch.cuda.synchronize()
        
        start = time.perf_counter()
        count = 0
        while time.perf_counter() - start < duration_sec:
            func(*inputs)
            count += bs
        torch.cuda.synchronize()
        elapsed = time.perf_counter() - start
        results[bs] = count / elapsed
    return results
```

### 3.3 Roofline Model（屋顶线模型）

Roofline 模型将 kernel 的计算强度映射到硬件性能上限。

```
Roofline 基本概念：
  AI = FLOPs / Bytes
  实际性能 <= min(计算峰值, 内存带宽 x AI)
  AI < 转折点 -> 内存受限，AI >= 转折点 -> 计算受限
```

**Nsight Compute Roofline 分析**：

```bash
ncu --set full -o report --kernel-name regex:my_kernel python run.py
ncu --section SpeedOfLight_RooflineChart --launch-skip 2 --launch-count 1 -o roofline_report python run.py
```

**关键指标**：

| 指标 | 含义 | 优化方向 |
|------|------|---------|
| Duration | kernel 执行时间 | 总体目标 |
| Compute (SM) Throughput | SM 计算利用率 (%) | near 100% |
| Memory Throughput | 内存带宽利用率 (%) | near 100% |
| Arithmetic Intensity | FLOP/Byte | > 转折点则计算受限 |

**程序化估算**：

```python
def roofline_estimate(flops, bytes_read, bytes_written,
                      compute_peak_tflops, mem_bw_gbps):
    total_bytes = bytes_read + bytes_written
    ai = flops / total_bytes if total_bytes > 0 else float('inf')
    ridge_point = (compute_peak_tflops * 1e12) / (mem_bw_gbps * 1e9)
    return {
        'arithmetic_intensity': ai,
        'ridge_point': ridge_point,
        'is_compute_bound': ai >= ridge_point,
        'is_memory_bound': ai < ridge_point,
        'roofline_ceiling_us': max(
            flops / (compute_peak_tflops * 1e12) * 1e6,  # compute limit
            total_bytes / (mem_bw_gbps * 1e9) * 1e6      # memory limit
        ),
    }

# A100 SXM: FP16=312 TFLOPS, HBM2e=2 TB/s
```

### 3.4 Nsight Compute (ncu) 深入分析

```bash
# 基本用法
ncu python run_kernel.py
ncu -o kernel_report --set full python run_kernel.py

# 特定 kernel 过滤
ncu --kernel-name "::my_matmul_kernel" python run_kernel.py
ncu --launch-skip 5 --launch-count 3 python run_kernel.py

# 自定义指标集
ncu --set basic --set memory --set compute \
    --section SpeedOfLight --section SpeedOfLight_RooflineChart \
    python run_kernel.py

# 导出 CSV
ncu --csv --print-summary per-kernel -o report python run_kernel.py
ncu --import report.ncu-rep --csv > report.csv
```

**排查速查**：
1. Memory Throughput < 60% → 访存模式差
2. ALU Utilization < 30% → 指令级并行度不足
3. L1/TEX Hit Rate < 50% → 数据局部性差
4. Branch Efficiency < 90% → warp 发散过多
5. Occupancy < 25% → 活跃 warp 太少

### 3.5 PyTorch Profiler

```python
import torch.profiler as profiler

def profile_with_pytorch(func, inputs, name="kernel_profile"):
    with profiler.profile(
        activities=[
            profiler.ProfilerActivity.CPU,
            profiler.ProfilerActivity.CUDA,
        ],
        record_shapes=True,
        profile_memory=True,
    ) as prof:
        func(*inputs)
    
    print(prof.key_averages().table(
        sort_by="cuda_time_total", row_limit=20))
    prof.export_chrome_trace(f"{name}.trace.json")
    return prof
```

---

## 🔄 第四章：回归测试与 CI — 守好"每次改动"

### 4.1 Golden Value 测试

```python
import numpy as np
from pathlib import Path

class GoldenValueManager:
    def __init__(self, golden_dir="./golden"):
        self.golden_dir = Path(golden_dir)
        self.golden_dir.mkdir(parents=True, exist_ok=True)
    
    def _path(self, op_name, dtype, shape):
        shape_str = "x".join(str(s) for s in shape)
        return self.golden_dir / op_name / f"{dtype}-shape_{shape_str}.npy"
    
    def save_golden(self, op_name, output):
        path = self._path(op_name, output.dtype, output.shape)
        path.parent.mkdir(parents=True, exist_ok=True)
        np.save(path, output.cpu().numpy())
    
    def verify_golden(self, op_name, output, rtol=1e-3, atol=1e-5):
        path = self._path(op_name, output.dtype, output.shape)
        if not path.exists():
            raise FileNotFoundError(f"Golden not found: {path}")
        golden = torch.from_numpy(np.load(path)).to(output.device, output.dtype)
        ok = torch.allclose(output, golden, rtol=rtol, atol=atol)
        if not ok:
            print(f"[FAIL] {op_name}: max_diff="
                  f"{(output - golden).abs().max().item():.6e}")
        return ok
```

**最佳实践**：
- 按 `(算子名, 数据类型, 形状)` 三元组建立目录结构
- 每个版本存一份，支持版本间 diff
- 确定性算子用精确匹配，非确定性算子用统计比较
- 大型 golden 文件用 Git LFS

### 4.2 覆盖率统计

```python
class OperatorCoverageTracker:
    def __init__(self):
        self.matrix = {}  # op_name -> {dtype -> [shapes]}
    
    def record(self, op_name, dtype, shape):
        if op_name not in self.matrix:
            self.matrix[op_name] = {}
        dtype_str = str(dtype).split('.')[-1]
        if dtype_str not in self.matrix[op_name]:
            self.matrix[op_name][dtype_str] = []
        self.matrix[op_name][dtype_str].append(tuple(shape))
    
    def print_matrix(self):
        all_dtypes = ['float32', 'float16', 'bfloat16']
        operators = sorted(self.matrix.keys())
        header = f"{'Operator':<20}" + "".join(f"{dt:>10}" for dt in all_dtypes)
        print(header)
        print("-" * len(header))
        for op in operators:
            row = f"{op:<20}"
            for dt in all_dtypes:
                if dt in self.matrix[op]:
                    n = len(self.matrix[op][dt])
                    row += f"{'✓(' + str(n) + ')':>10}"
                else:
                    row += f"{'✗':>10}"
            print(row)
```

### 4.3 测试矩阵管理

```yaml
# test_matrix.yaml
version: "1.0"
matrix:
  operators:
    - name: relu
      shapes: ["(256, 256)", "(1024, 1024)", "(1, 1, 32, 32, 32)"]
      dtypes: ["float32", "float16", "bfloat16"]
      tests: ["precision", "boundary", "gradcheck", "performance"]
    
    - name: layer_norm
      shapes: ["(256, 1024)", "(32, 128, 768)"]
      dtypes: ["float32", "float16"]
      tests: ["precision", "gradcheck"]
      normalized_shape: ["[-1]", "[-1, -1]"]
    
    - name: flash_attention
      shapes: ["(2, 8, 128, 64)", "(1, 16, 512, 128)"]
      dtypes: ["float16", "bfloat16"]
      tests: ["precision", "performance"]
      causal: [true, false]
  
  skips:
    - operator: softmax
      dtype: int8
      reason: "int8 not supported"
```

### 4.4 CI 流水线设计（GitHub Actions）

```yaml
# .github/workflows/operator_test.yml
name: Operator Tests
on:
  pull_request:
    paths: ['kernels/**', 'tests/**', '**/*.cu']

jobs:
  precision-tests:
    runs-on: [self-hosted, gpu]
    strategy:
      matrix:
        dtype: [float32, float16, bfloat16]
    steps:
      - uses: actions/checkout@v4
      - run: pip install torch --index-url https://download.pytorch.org/whl/cu124
      - run: python -m pytest tests/test_precision.py --dtype ${{ matrix.dtype }}

  gradcheck:
    runs-on: [self-hosted, gpu]
    steps:
      - uses: actions/checkout@v4
      - run: python -m pytest tests/test_gradcheck.py -x --dtype float64

  performance-regression:
    runs-on: [self-hosted, gpu]
    steps:
      - uses: actions/checkout@v4
      - run: python benchmarks/run_all.py --output perf_results.json
      - run: |
          python scripts/compare_perf.py --current perf_results.json \
            --baseline golden/perf_baseline.json --threshold 0.05

  golden-value-test:
    runs-on: [self-hosted, gpu]
    steps:
      - uses: actions/checkout@v4
      - run: python tests/test_golden.py --verify --fail-fast
```

---

## 🛠️ 第五章：调试工具 — 问题最后的"定位神器"

### 5.1 cuda-gdb（CUDA 调试器）

```bash
# 编译时添加调试符号
nvcc -G -g -Xcompiler -rdynamic -o my_kernel my_kernel.cu
nvcc -lineinfo -o my_kernel_opt my_kernel.cu  # 保留优化+行号

# 启动
cuda-gdb --args ./my_kernel arg1 arg2

# 常用命令
(cuda-gdb) set cuda break_on_error on
(cuda-gdb) set cuda memcheck on
(cuda-gdb) break kernel_name
(cuda-gdb) break my_kernel.cu:42
(cuda-gdb) cuda block (0,0,0)
(cuda-gdb) cuda thread (0,0,0)
(cuda-gdb) cuda warp 0
(cuda-gdb) print variable
(cuda-gdb) print *array@10

# 条件断点
(cuda-gdb) break kernel_func if (threadIdx.x == 0 && blockIdx.x == 0)

# 在 Python 中配合使用
import os
os.environ['CUDA_LAUNCH_BLOCKING'] = '1'  # 使 kernel 同步执行
```

### 5.2 compute-sanitizer（CUDA 正确性检查）

```bash
# 1. memcheck — 内存越界/未初始化检测
compute-sanitizer --tool memcheck ./my_kernel
compute-sanitizer --tool memcheck \
    --destroy-on-device-error kernel \
    --leak-check full \
    --report-api-errors all \
    python test_my_kernel.py

# 2. racecheck — 共享内存数据竞争检测
compute-sanitizer --tool racecheck ./my_kernel

# 3. initcheck — 未初始化全局内存检测
compute-sanitizer --tool initcheck ./my_kernel

# 4. synccheck — 同步原语误用检测
compute-sanitizer --tool synccheck ./my_kernel

# 与 PyTorch 结合
export CUDA_LAUNCH_BLOCKING=1
compute-sanitizer --tool memcheck python -c "
import torch
x = torch.randn(10, 10, device='cuda')
# y = my_custom_op(x)
"
```

**常见错误解释**：

| Sanitizer 输出 | 含义 | 常见原因 |
|---------------|------|---------|
| Invalid __global__ write of size 4 | 全局内存越界写入 | 索引错误，未检查边界 |
| Misaligned address | 内存地址未对齐 | 指针未按 16/32/128 字节对齐 |
| Race between Read/Write access | 共享内存数据竞争 | 缺少 __syncthreads() |
| Uninitialized __global__ memory read | 读取未初始化全局内存 | cudaMalloc 后未 memset |

### 5.3 数值异常检测

```python
def check_numerical_anomalies(tensor, name="tensor", report_nan=True,
                               report_inf=True, report_zero=False,
                               report_extreme=False, extreme_threshold=1e10):
    issues = []
    if report_nan:
        n = torch.isnan(tensor).sum().item()
        if n > 0:
            issues.append(f"[NAN] {name}: {n} NaN values")
    if report_inf:
        n = torch.isinf(tensor).sum().item()
        if n > 0:
            issues.append(f"[INF] {name}: {n} Inf values")
    if report_zero:
        n = (tensor == 0).sum().item()
        if n > 0:
            issues.append(f"[ZERO] {name}: {n} zeros ({n/tensor.numel()*100:.1f}%)")
    if report_extreme:
        v = tensor.abs().max().item()
        if v > extreme_threshold:
            issues.append(f"[EXTREME] {name}: max|value|={v:.2e}")
    return issues

# 逐层 NaN/Inf 追踪（通过 hook）
def anomaly_check_mid_kernel(model):
    def make_hook(name):
        def hook(module, inp, out):
            issues = check_numerical_anomalies(out, f"{name}.output")
            if issues:
                print(f"[ANOMALY in {name}]")
                for i in issues:
                    print(f"  {i}")
        return hook
    for name, module in model.named_modules():
        module.register_forward_hook(make_hook(name))
    return model

# PyTorch 全局检测
torch.autograd.set_detect_anomaly(True)
```

### 5.4 compare 脚本设计

```python
#!/usr/bin/env python3
"""compare_tensors.py — 张量比较与差异分析工具"""

import argparse, numpy as np

def compare_tensors(ref, out, rtol=1e-3, atol=1e-5, top_k=10):
    assert ref.shape == out.shape, f"Shape mismatch: {ref.shape} vs {out.shape}"
    
    ref_f64 = ref.to(torch.float64)
    out_f64 = out.to(torch.float64)
    diff = out_f64 - ref_f64
    abs_diff = diff.abs()
    
    result = {
        'shape': list(ref.shape),
        'dtype': str(ref.dtype),
        'num_elements': ref.numel(),
        'global_stats': {
            'cosine_similarity': (
                torch.dot(ref_f64.flatten(), out_f64.flatten()) /
                (torch.norm(ref_f64.flatten()) * torch.norm(out_f64.flatten()))
            ).item(),
            'mse': torch.mean(diff ** 2).item(),
            'mae': torch.mean(abs_diff).item(),
            'max_abs_diff': abs_diff.max().item(),
            'max_relative_error': (
                (abs_diff / (ref_f64.abs() + 1e-15)).max().item()
            ),
        },
        'allclose': torch.allclose(ref_f64, out_f64, rtol=rtol, atol=atol),
    }
    
    # 分类统计
    within = (abs_diff <= rtol * ref_f64.abs() + atol)
    result['classification'] = {
        'exact_match': (abs_diff == 0).sum().item(),
        'within_tolerance': within.sum().item(),
        'outside_tolerance': (~within).sum().item(),
        'outside_pct': (~within).sum().item() / ref.numel() * 100,
    }
    
    # Top-K
    if top_k > 0:
        vals, idxs = torch.topk(abs_diff.flatten(), min(top_k, abs_diff.numel()))
        result['top_k_diffs'] = [
            {
                'index': int(idx),
                'index_nd': list(np.unravel_index(int(idx), ref.shape)),
                'ref_val': ref_f64.flatten()[idx].item(),
                'out_val': out_f64.flatten()[idx].item(),
                'abs_diff': val.item(),
            }
            for val, idx in zip(vals, idxs)
        ]
    
    return result


def print_report(r):
    gs = r['global_stats']
    print("=" * 60)
    print(f"  Shape: {r['shape']}  Elements: {r['num_elements']:,}")
    print("=" * 60)
    print(f"  AllClose: {r['allclose']}")
    print(f"  Cosine Sim : {gs['cosine_similarity']:.10f}")
    print(f"  MSE        : {gs['mse']:.10e}")
    print(f"  Max Abs    : {gs['max_abs_diff']:.10e}")
    print(f"  Max Rel Err: {gs['max_relative_error']:.10e}")
    
    c = r['classification']
    t = r['num_elements']
    print(f"  Exact Match : {c['exact_match']:>10,} ({c['exact_match']/t*100:5.1f}%)")
    print(f"  Within Tol  : {c['within_tolerance']:>10,} ({c['within_tolerance']/t*100:5.1f}%)")
    print(f"  Outside Tol : {c['outside_tolerance']:>10,} ({c['outside_tolerance']/t*100:5.1f}%)")

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('ref')
    parser.add_argument('out')
    parser.add_argument('--rtol', type=float, default=1e-3)
    parser.add_argument('--atol', type=float, default=1e-5)
    parser.add_argument('--top-k', type=int, default=10)
    args = parser.parse_args()
    
    def load(p):
        if p.endswith('.npy'):
            return torch.from_numpy(np.load(p)).cuda()
        return torch.load(p).cuda()
    
    r = compare_tensors(load(args.ref), load(args.out),
                        rtol=args.rtol, atol=args.atol, top_k=args.top_k)
    print_report(r)
```

---

## 📋 附：工具链速查表

| 类别 | 工具/方法 | 用途 | 关键命令/接口 |
|------|----------|------|-------------|
| 精度测试 | torch.allclose | 张量级近似比较 | `torch.allclose(a, b, rtol=1e-3, atol=1e-5)` |
| | Cosine Similarity | 方向相似度 | 自定义实现 |
| | ULP Distance | 最小精度单位比较 | 自定义实现 |
| | Gradcheck | 梯度正确性验证 | `torch.autograd.gradcheck(func, inputs)` |
| 差分测试 | diff_test() | 参考 vs 待测实现 | 自定义框架 |
| | VOLTA | 形式化等价验证 | arXiv:2511.12638 |
| 性能测试 | benchmark_kernel() | 延迟/吞吐量测量 | 自定义框架 |
| | ncu | 硬件级性能分析 | `ncu --set full python script.py` |
| | PyTorch Profiler | 算子级性能分析 | `torch.profiler.profile(...)` |
| | Roofline | 性能瓶颈分类 | `ncu --section SpeedOfLight_RooflineChart` |
| 回归/CI | Golden Value | 输出回归检测 | 自定义管理 |
| | Test Matrix | 结构化测试覆盖 | YAML 驱动 |
| | Coverage Tracker | 覆盖矩阵统计 | 自定义类 |
| 调试工具 | cuda-gdb | CUDA kernel 调试 | `cuda-gdb --args ./app` |
| | compute-sanitizer | 内存/竞争/初始化检测 | `compute-sanitizer --tool memcheck ./app` |
| | compare_tensors.py | 张量差异分析 | 自定义脚本 |
| | NaN/Inf Hook | 逐层异常检测 | `set_detect_anomaly(True)` + hook |
| 硬件规格 | A100 SXM | FP16: 312 TFLOPS, HBM2e: 2 TB/s |
| | H100 SXM | FP16: 989 TFLOPS, HBM3: 3.35 TB/s |

---

## 🚀 下一步

### 核心速览

| 模块 | 一句话总结 |
|------|---------|
| 精度测试 | 用 Cosine / ULP / PSNR 等多个指标从不同角度衡量数值误差 |
| 差分测试 | 同一语义的不同实现，对相同输入应有近似相同的输出 |
| 性能基准 | 用 CUDA Events 计时 + Roofline 模型判断是计算受限还是内存受限 |
| 回归/CI | Golden Value 检测精度退化，测试矩阵确保覆盖率，CI 流水线自动化验证 |
| 调试工具 | 先 compute-sanitizer 排除内存/竞争问题，再 cuda-gdb 逐行调试 |

### 关键原则

1. **永远对比参考实现**——PyTorch 原生是最可靠的 baseline
2. **精度与性能不可偏废**——先保证正确，再优化速度
3. **测试需要矩阵化**（算子 × 数据类型 × 形状 × 测试类型），不能凭感觉
4. **调试从 compute-sanitizer 开始，而非 cuda-gdb**——先排除内存/竞争问题

### 推荐阅读

- 📖 [CUDA Programming Guide](https://docs.nvidia.com/cuda/cuda-c-programming-guide/) — 浮点运算的权威参考
- 🔧 [Nsight Compute](https://developer.nvidia.com/nsight-compute) — GPU kernel 性能分析必备工具
- 📖 [VOLTA 等价性检查器](https://arxiv.org/abs/2511.12638) — GPU kernel 形式化验证的前沿研究
- 🔧 [compute-sanitizer 文档](https://docs.nvidia.com/cuda/compute-sanitizer/) — 内存/竞争检测官方指南
- 📖 [Roofline Model 入门](https://crd.lbl.gov/assets/pubs_presos/parlab08-roofline-talk.pdf) — 性能分析的理论基础

算子测试不是写完 kernel 之后的"加个 pytest 就完事"——它是一个从数值精度到硬件性能、从本地调试到 CI 回归的**系统工程**。希望这篇指南能帮你建立起完整的测试体系，让每个算子都能安心上线 🚀
