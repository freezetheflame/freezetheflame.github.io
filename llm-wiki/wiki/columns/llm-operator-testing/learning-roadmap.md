# LLM 算子测试 动手学习路线图

> 完整路线图：从特殊算子认知到精度测试、差分测试、推理引擎测试的逐级进阶
> 建议搭配 [[handoff-to-gpu-agent]] 使用（交接文档包含背景和环境配置）

## 学习目标
- 理解 FlashAttention、GQA、RoPE、SwiGLU、MoE、RMSNorm 等算子的原理
- 能够独立编写算子测试框架（精度测试 + 差分测试）
- 熟练使用 HuggingFace Transformers + vLLM + PyTorch 进行测试
- 找到 LLM 算子测试方向的第一个研究缺口

## 学习路线（8周）

### Week 1: 认识 LLM 特殊算子
加载真实 LLM（如 Llama-3.2-1B），打印模型结构，对照算子清单标出每个算子的位置。

**算子清单**：FlashAttention、GQA、MQA、RoPE、SwiGLU、MoE、RMSNorm、KV Cache

### Week 2: 手写简化版 FlashAttention
- Naive attention → 显存分析 → tiling → online softmax
- 对比 naive vs flash 的数值一致性和速度

### Week 3-4: 精度测试（Predoo 思想移植）
- 生成对抗性输入
- 跨后端对比：PyTorch eager / torch.compile / ONNX Runtime / TensorRT

### Week 5-6: 差分测试（Duo 思想移植）
- 跨框架：PyTorch vs TensorFlow vs JAX
- 跨精度：FP32 vs FP16 vs BF16
- 跨设备：CUDA vs CPU
- Hook 真实 LLM 提取中间算子输出

### Week 7-8: 推理引擎测试
- vLLM / TensorRT-LLM 的算子层异常
- KV Cache 溢出、attention mask 错误、RoPE 频段不匹配
- 复现已知 bug

## 底层实现栈
```
Python (PyTorch/HuggingFace)
  ↓
PyTorch ATen (C++ 算子注册层)
  ↓
cuDNN/cuBLAS（标准库）←→ 手写 CUDA Kernel（如 FlashAttention）
  ↓
GPU 硬件 (NVIDIA CUDA Core)
```

趋势：越来越多的算子转向 Triton (Python DSL → PTX)

## 先修知识
- Python 高级编程
- PyTorch 基础使用
- 基本 Linux 操作

---

**关联页面**：[[handoff-to-gpu-agent]] | [[../ai-se-testing/test-generation]]
