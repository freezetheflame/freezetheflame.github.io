# 第一个Ascend NPU示例：手写数字识别

本教程将指导您使用MindSpore和Ascend NPU训练一个简单的手写数字识别模型。

## 数据集准备

我们将使用MNIST数据集，这是一个经典的手写数字识别数据集。

```python
import mindspore as ms
from mindspore import nn, ops, context
from mindspore.dataset import vision, transforms
import mindspore.dataset as ds

# 设置运行环境
context.set_context(mode=context.GRAPH_MODE, device_target="Ascend", device_id=0)

# 下载并处理MNIST数据集
def create_dataset(data_path, batch_size=32, repeat_size=1):
    # 定义数据集
    mnist_ds = ds.MnistDataset(data_path)
    
    # 定义数据处理操作
    resize_op = vision.Resize((32, 32))
    rescale_op = vision.Rescale(1.0 / 255.0, 0.0)
    hwc2chw_op = vision.HWC2CHW()
    type_cast_op = transforms.TypeCast(ms.int32)
    
    # 应用数据处理操作
    mnist_ds = mnist_ds.map(operations=type_cast_op, input_columns="label")
    mnist_ds = mnist_ds.map(operations=[resize_op, rescale_op, hwc2chw_op], input_columns="image")
    
    # 打乱数据集
    mnist_ds = mnist_ds.shuffle(buffer_size=10000)
    
    # 设置batch大小和重复次数
    mnist_ds = mnist_ds.batch(batch_size, drop_remainder=True)
    mnist_ds = mnist_ds.repeat(repeat_size)
    
    return mnist_ds
```

## 定义网络结构

我们使用LeNet-5网络结构：

```python
class LeNet5(nn.Cell):
    def __init__(self, num_class=10, num_channel=1):
        super(LeNet5, self).__init__()
        # 定义卷积层和池化层
        self.conv1 = nn.Conv2d(num_channel, 6, 5, pad_mode='valid')
        self.conv2 = nn.Conv2d(6, 16, 5, pad_mode='valid')
        self.pool = nn.MaxPool2d(2, 2)
        
        # 定义全连接层
        self.fc1 = nn.Dense(16 * 5 * 5, 120)
        self.fc2 = nn.Dense(120, 84)
        self.fc3 = nn.Dense(84, num_class)
        
        # 定义激活函数
        self.relu = nn.ReLU()
        self.flatten = nn.Flatten()
        
    def construct(self, x):
        # 前向传播
        x = self.pool(self.relu(self.conv1(x)))
        x = self.pool(self.relu(self.conv2(x)))
        x = self.flatten(x)
        x = self.relu(self.fc1(x))
        x = self.relu(self.fc2(x))
        x = self.fc3(x)
        return x
```

## 定义训练过程

```python
# 创建网络实例
network = LeNet5()

# 定义损失函数
net_loss = nn.SoftmaxCrossEntropyWithLogits(sparse=True, reduction='mean')

# 定义优化器
net_opt = nn.Momentum(network.trainable_params(), learning_rate=0.01, momentum=0.9)

# 定义训练网络
train_net = nn.TrainOneStepCell(network, net_opt)
train_net.set_train()
```

## 训练模型

```python
# 加载数据集
train_dataset = create_dataset("./datasets/Mnist/train", 32, 1)

# 训练模型
num_epochs = 10
for epoch in range(num_epochs):
    for batch, (data, label) in enumerate(train_dataset.create_tuple_iterator()):
        loss = train_net(data, label)
        
        # 每100个batch打印一次损失值
        if batch % 100 == 0:
            print(f"Epoch: {epoch}, Batch: {batch}, Loss: {loss}")
            
print("训练完成！")
```

## 模型评估

```python
# 定义评估网络
eval_net = nn.WithEvalCell(network, net_loss, False)
eval_net.set_train(False)

# 加载测试数据集
test_dataset = create_dataset("./datasets/Mnist/test", 32, 1)

# 评估模型
acc = 0
eval_steps = 0
for data, label in test_dataset.create_tuple_iterator():
    output, loss = eval_net(data, label)
    # 计算准确率
    pred = ops.ArgMaxWithValue(axis=1)(output)[0]
    equal = ops.Equal()(pred, label)
    acc += equal.sum().asnumpy()
    eval_steps += len(label)
    
print(f"测试准确率: {acc / eval_steps}")
```

## 模型保存

```python
# 保存模型
ms.save_checkpoint(network, "lenet_mnist.ckpt")
print("模型已保存")
```

## 模型推理

```python
# 加载模型
param_dict = ms.load_checkpoint("lenet_mnist.ckpt")
ms.load_param_into_net(network, param_dict)

# 进行推理
def predict(image):
    network.set_train(False)
    output = network(image)
    predicted = ops.ArgMaxWithValue(axis=1)(output)[0]
    return predicted

# 使用测试数据进行推理
for data, label in test_dataset.create_tuple_iterator():
    prediction = predict(data)
    print(f"预测结果: {prediction}, 实际标签: {label}")
    break
```

## 性能优化

### 1. 启用自动混合精度

```python
# 设置自动混合精度
context.set_context(enable_graph_kernel=True)
network.to_float(ms.float16)
```

### 2. 启用图算融合

```python
# 启用图算融合
context.set_context(enable_graph_kernel=True)
```

### 3. 使用Profiler分析性能

```python
from mindspore.profiler import Profiler

# 创建Profiler
profiler = Profiler(output_path='./profiler_data')

# 训练代码
# ...

# 分析性能数据
profiler.analyse()
```

## 总结

通过这个示例，您已经学会了：

1. 如何在Ascend NPU上搭建深度学习环境
2. 如何使用MindSpore构建和训练神经网络
3. 如何评估和保存模型
4. 如何进行模型推理
5. 如何优化模型性能

## 下一步

1. 尝试更复杂的网络结构
2. 学习[性能优化技巧](../performance/)
3. 探索[MindSpore高级特性](../frameworks/mindspore-guide.md)
4. 尝试其他深度学习框架在Ascend NPU上的应用