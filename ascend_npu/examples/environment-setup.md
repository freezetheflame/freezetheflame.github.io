# Ascend NPU环境搭建指南

本指南将帮助您在Ubuntu系统上搭建Ascend NPU开发环境。

## 硬件要求

- 支持的Ascend NPU设备（如Atlas 200 DK、Atlas 300等）
- Ubuntu 18.04 LTS或Ubuntu 20.04 LTS
- x86_64架构

## 软件要求

- Python 3.7或更高版本
- pip 20.0或更高版本
- Docker（可选，用于容器化部署）

## 安装步骤

### 1. 安装驱动

```bash
# 下载驱动安装包
wget https://ascend.huawei.com/repository/A300-3000/23.0.RC1/Ascend-hdk-3.7.0-aarch64.run

# 执行安装
chmod +x Ascend-hdk-3.7.0-aarch64.run
sudo ./Ascend-hdk-3.7.0-aarch64.run
```

### 2. 安装CANN

```bash
# 下载CANN包
wget https://ascend.huawei.com/repository/A300-3000/23.0.RC1/Ascend-cann-toolkit_7.0.RC1_linux-aarch64.run

# 执行安装
chmod +x Ascend-cann-toolkit_7.0.RC1_linux-aarch64.run
sudo ./Ascend-cann-toolkit_7.0.RC1_linux-aarch64.run --install
```

### 3. 配置环境变量

将以下内容添加到`~/.bashrc`文件中：

```bash
# Ascend环境变量
export ASCEND_HOME=/usr/local/Ascend
export PATH=$ASCEND_HOME/bin:$PATH
export LD_LIBRARY_PATH=$ASCEND_HOME/lib64:$LD_LIBRARY_PATH
export PYTHONPATH=$ASCEND_HOME/python/site-packages:$PYTHONPATH
export ASCEND_VERSION=nnrt/latest
export DRIVER_VERSION=latest
```

然后执行：

```bash
source ~/.bashrc
```

### 4. 安装MindSpore

```bash
# 使用pip安装
pip install mindspore-ascend

# 验证安装
python -c "import mindspore; print(mindspore.__version__)"
```

### 5. 验证安装

创建一个简单的测试脚本`test_ascend.py`：

```python
import numpy as np
import mindspore as ms
from mindspore import ops

# 设置运行设备为Ascend
ms.context.set_context(device_target="Ascend", device_id=0)

# 创建张量
x = ms.Tensor(np.ones([1, 3, 3, 4]).astype(np.float32))
y = ms.Tensor(np.ones([1, 3, 3, 4]).astype(np.float32))

# 执行加法操作
add = ops.Add()
output = add(x, y)

print("Output:", output)
```

运行测试：

```bash
python test_ascend.py
```

如果能看到输出结果，说明环境搭建成功。

## 常见问题解决

### 1. 驱动安装失败

- 确保系统内核版本与驱动兼容
- 检查是否有其他驱动冲突
- 重启系统后重试

### 2. 环境变量未生效

- 确认`.bashrc`文件修改正确
- 执行`source ~/.bashrc`重新加载环境变量
- 重启终端或重新登录

### 3. Python包安装失败

- 检查Python版本是否符合要求
- 使用虚拟环境隔离依赖
- 确保pip版本较新

### 4. 权限问题

- 确保当前用户在ascendgroup组中
- 使用sudo执行需要管理员权限的操作

## 性能优化建议

1. **使用最新版本**：定期更新驱动和软件包到最新稳定版本
2. **合理配置资源**：根据实际需求配置内存和计算资源
3. **启用优化选项**：在MindSpore中启用图算融合和自动并行等优化选项

## 下一步

环境搭建完成后，您可以：

1. 学习[MindSpore基础教程](../frameworks/mindspore-guide.md)
2. 尝试[第一个深度学习示例](first-example.md)
3. 探索[性能优化技巧](../performance/)