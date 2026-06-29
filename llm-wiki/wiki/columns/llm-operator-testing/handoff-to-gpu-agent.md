# 🚀 LLM算子测试 学习计划 — GPU Agent 交接文档

> 本文件是用户从 Hermes Agent (Flash模型, 无GPU) 交接给 GPU 机器的 agent 的文档
> 完整路线图在同一个目录下的 `learning-roadmap.md`

## 学生背景
- **身份**：南京大学研一新生，导师房春荣（深度学习框架测试方向）
- **前期准备**：已阅读完整的学习路线图
- **目标**：通过动手实操，掌握 LLM 特殊算子的测试方法
- **技术栈**：Python、PyTorch、基本 Linux，**CUDA/Triton 从零开始**

## 需要 GPU Agent 做的

### 1. 环境准备
```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/nightly/cu121
pip install transformers accelerate flash-attn triton
pip install vllm
```

### 2. 按路线图推进（8周计划）
核心任务链：

| 阶段 | 交付物 | 难度 |
|:---|:---|---:|
| Week 1 | 加载真实 LLM，`print(model)` 分析 layer，找到所有算子的位置 | ⭐ |
| Week 2 | 从零实现简化版 FlashAttention (naive → tiling → online softmax) | ⭐⭐⭐ |
| Week 3-4 | 精度测试：Predoo 思想移植到 LLM 算子，eager vs compile vs ONNX | ⭐⭐⭐ |
| Week 5-6 | 差分测试：跨框架/跨精度/跨设备，hook 真实 LLM 提取中间算子 | ⭐⭐⭐⭐ |
| Week 7-8 | 推理引擎测试：复现 vLLM 已知 bug，理解 LLM 推理异常模式 | ⭐⭐⭐⭐⭐ |

### 3. 教学风格要求
- **以动手为主**：每节课都要有能跑起来的 Python 脚本
- **循序渐进**：先在 PyTorch 高层理解算子行为，再深入 CUDA/Triton
- **跟实验室工作衔接**：时时提醒 "这个思路跟 Predoo 的 XX 方法是一脉相承的"

### 4. 特别提醒
- 精度测试时特别注意 FP16/BF16 下的数值问题（LLM 算子测试的核心关注点）
- 如果有跑不通的地方，不要卡死，换一条路线继续，记下问题后续再排查

## 对于 GPU Agent 的话
> 你好，我是南京大学研一新生，导师房春荣做深度学习框架测试方向。我想在 GPU 环境下学习 **LLM 算子测试**，从 FlashAttention/GQA/RoPE 这些特殊算子的动手实验开始，到精度测试、差分测试、推理引擎测试逐步深入。完整学习路线图在同目录下的 `learning-roadmap.md`，你按路线图一步步带我动手做。全程以跑代码为主，不要只讲概念。

---

**关联页面**：[[learning-roadmap]] | [[../ai-se-testing/index]]
