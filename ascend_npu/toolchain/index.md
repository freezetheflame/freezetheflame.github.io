# 软件工具链

本目录包含Ascend NPU软件工具链的相关文档。

## 文档列表

- [基础概念](basic-concepts.md) - Ascend NPU核心概念介绍

## 工具链组件

### 1. CANN（Compute Architecture for Neural Networks）

Ascend异构计算架构，为上层AI框架和应用提供统一的开发接口。

#### 主要组件：
- **驱动层**：提供硬件驱动和设备管理
- **芯片使能层**：包括算子库、CCE编译器等
- **运行时层**：提供任务调度、内存管理等功能
- **中间表示层**：包括GE图引擎等
- **应用使能层**：提供AI框架接口

### 2. 算子库（Operator Library）

Ascend NPU提供丰富的算子库，包括：
- 基础算子：卷积、池化、激活函数等
- 通信算子：AllReduce、Broadcast等
- 图算子：BatchNorm、Dropout等

### 3. 编译工具

#### ATC（Ascend Tensor Compiler）
模型转换工具，将主流AI框架的模型转换为Ascend NPU可执行的OM格式模型。

```bash
# ATC使用示例
atc --model=model.onnx --framework=5 --output=model --soc_version=Ascend310
```

#### AOE（Ascend Optimization Engine）
模型优化工具，对已编译的模型进行性能优化。

```bash
# AOE使用示例
aoe --model=model.om --output=model_optimized.om --soc_version=Ascend310
```

#### AIPP（Atlas Image Pre-Processing Pipeline）
图像预处理工具，在模型推理前对输入数据进行预处理。

### 4. 调试工具

#### ASCEND-SLOG
系统日志工具，用于收集和分析Ascend设备的运行日志。

#### MSC_VER
模型校验工具，验证模型文件的完整性和正确性。

#### PROFILER
性能分析工具，分析模型运行时的性能瓶颈。

### 5. 部署工具

#### ModelBox
AI应用开发框架，提供模型部署和应用开发能力。

#### MindX
Ascend全流程开发套件，包含模型转换、推理、部署等工具。

## 安装和配置

### 环境要求
- Ubuntu 18.04 LTS或20.04 LTS
- Python 3.7或更高版本
- 64GB以上内存（推荐）
- 100GB以上磁盘空间

### 安装步骤

1. **安装驱动**
```bash
# 下载并安装驱动
chmod +x Ascend-hdk-*.run
sudo ./Ascend-hdk-*.run
```

2. **安装CANN工具包**
```bash
# 下载并安装CANN
chmod +x Ascend-cann-toolkit-*.run
sudo ./Ascend-cann-toolkit-*.run --install
```

3. **配置环境变量**
```bash
# 添加到~/.bashrc
export ASCEND_HOME=/usr/local/Ascend
export PATH=$ASCEND_HOME/bin:$PATH
export LD_LIBRARY_PATH=$ASCEND_HOME/lib64:$LD_LIBRARY_PATH
export PYTHONPATH=$ASCEND_HOME/python/site-packages:$PYTHONPATH
```

## 开发流程

使用Ascend工具链进行AI开发的一般流程：

1. **环境准备**
   - 安装驱动和CANN
   - 配置环境变量
   - 安装AI框架

2. **模型开发**
   - 使用AI框架开发和训练模型
   - 验证模型精度

3. **模型转换**
   - 使用ATC将模型转换为OM格式
   - 配置AIPP（如需要）

4. **性能优化**
   - 使用AOE优化模型性能
   - 使用Profiler分析性能瓶颈

5. **应用部署**
   - 集成模型到应用中
   - 进行端到端测试

## 常见问题

### 1. 安装问题
- 确保系统版本兼容
- 检查依赖包是否完整
- 确认用户权限设置

### 2. 环境变量问题
- 确认环境变量配置正确
- 重启终端使配置生效
- 检查路径是否正确

### 3. 工具使用问题
- 查看工具帮助文档
- 检查输入文件格式
- 确认设备状态正常

## 相关资源

- [CANN官方文档](https://www.huaweicloud.com/ascend/cann)
- [Ascend工具链下载](https://www.huawei.com/ascend/toolchain)
- [Ascend开发者社区](https://www.huaweicloud.com/ascend/community)
- [Ascend技术白皮书](https://www.huawei.com/ascend/whitepaper)