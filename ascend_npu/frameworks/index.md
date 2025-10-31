# 深度学习框架支持

本目录包含Ascend NPU对各种深度学习框架的支持文档。

## 框架列表

- [MindSpore开发指南](mindspore-guide.md) - 华为自研AI框架详细使用说明

## 支持的框架

### 1. MindSpore（推荐）
华为自研的全场景AI框架，与Ascend NPU深度优化集成：
- 全场景统一：支持端、边、云
- 自动并行：数据并行、模型并行、混合并行
- 隐私保护：差分隐私、联邦学习
- 图算融合：自动优化计算图

### 2. TensorFlow
通过tensorflow-ascend插件支持：
- 支持TensorFlow 2.x版本
- 自动图优化
- 混合精度训练

### 3. PyTorch
通过torch-ascend插件支持：
- 支持PyTorch 1.x版本
- 动态图优化
- 自定义算子支持

### 4. 其他框架
- Caffe：通过Caffe-Ascend支持
- ONNX：支持ONNX模型推理
- PaddlePaddle：实验性支持

## 框架选择建议

### 1. 新项目推荐
对于新项目，推荐使用MindSpore：
- 与Ascend NPU深度集成
- 性能优化更好
- 官方技术支持

### 2. 迁移项目
对于已有项目迁移：
- TensorFlow项目：使用tensorflow-ascend
- PyTorch项目：使用torch-ascend
- Caffe项目：使用Caffe-Ascend

## 安装指南

### MindSpore安装

```bash
# pip安装
pip install mindspore-ascend

# conda安装
conda install mindspore-ascend -c mindspore
```

### TensorFlow安装

```bash
# 安装tensorflow-ascend
pip install tensorflow-ascend
```

### PyTorch安装

```bash
# 安装torch-ascend
pip install torch-ascend
```

## 性能对比

| 框架 | 训练性能 | 推理性能 | 易用性 | 生态完善度 |
|------|----------|----------|--------|------------|
| MindSpore | 优秀 | 优秀 | 优秀 | 良好 |
| TensorFlow | 良好 | 良好 | 良好 | 优秀 |
| PyTorch | 良好 | 良好 | 优秀 | 优秀 |

## 最佳实践

### 1. MindSpore最佳实践
```python
import mindspore as ms
from mindspore import context

# 设置运行环境
context.set_context(mode=context.GRAPH_MODE, device_target="Ascend")
```

### 2. TensorFlow最佳实践
```python
import tensorflow as tf

# 配置Ascend设备
tf.config.experimental.set_device_policy("Ascend")
```

### 3. PyTorch最佳实践
```python
import torch

# 设置Ascend设备
device = torch.device("ascend")
```

## 常见问题

### 1. 框架兼容性
确保框架版本与CANN版本兼容。

### 2. 性能优化
启用框架特定的优化选项。

### 3. 调试问题
使用框架提供的调试工具。

## 相关资源

- [MindSpore官方文档](https://www.mindspore.cn/)
- [TensorFlow-Ascend文档](https://www.huaweicloud.com/ascend/tensorflow)
- [PyTorch-Ascend文档](https://www.huaweicloud.com/ascend/pytorch)
- [Ascend开发者社区](https://www.huaweicloud.com/ascend/community)