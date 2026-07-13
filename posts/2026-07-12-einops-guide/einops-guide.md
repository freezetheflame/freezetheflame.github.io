# Einops 完全指南：重塑张量操作的读写体验

如果你写过 PyTorch 或 NumPy 的张量变换，大概率写过类似这样的代码：

```python
x = x.permute(0, 2, 3, 1).reshape(batch, -1, 3)
```

每次看到这种全靠索引数字的写法，心里都会冒出一个问题：**这行代码到底在干什么？**

[Einops](https://github.com/arogozhnikov/einops) 就是为了解决这个问题而生的。它用可读的字符串模式替代 `transpose`、`reshape`、`squeeze`、`stack`、`concatenate`、`repeat`、`tile` 等一整套操作，而且同时支持 NumPy、PyTorch、JAX、TensorFlow、MLX 等主流框架。

> einops 被 ICLR 2022 接收为 Oral 论文。GitHub 9,500+ stars，Andrej Karpathy 亲自推荐。

## 安装

```bash
pip install einops
```

## 核心思想：用模式字符串描述变换

einops 的所有操作都基于一个统一的思路：**用字符串描述张量各维度的变换方式**。

例如将形状 `[batch, channel, height, width]` 的图像数据转为 `[batch, height, width, channel]`：

```python
from einops import rearrange

# 传统写法
y = x.transpose(0, 2, 3, 1)

# einops 写法
y = rearrange(x, 'b c h w -> b h w c')
```

代码一目了然：`b` 保持不动，`c` 移到末尾，`h` `w` 放在中间。**不需要背索引位置**。

---

## 三大核心操作

### 1. rearrange — 元素重排

`rearrange` 可以替代：`transpose`、`reshape`、`view`、`squeeze`、`unsqueeze`、`stack`、`concatenate`。

**维度交换：**

```python
rearrange(x, 'b c h w -> b h w c')    # 等价于 .transpose()
rearrange(x, 'h w c -> w h c')         # 交换 height 和 width
```

**维度压缩（类似于 reshape）：**

```python
rearrange(x, 'b h w c -> b (h w c)')   # 展平为向量
rearrange(x, 'b h w c -> (b h) w c')   # batch 和 height 合并
```

**维度拆分：**

```python
# 将 6 张图拆成 2 组 × 3 张
rearrange(x, '(b1 b2) h w c -> b1 b2 h w c', b1=2)
```

**拼接多张图片：**

```python
# 将多张图片沿水平方向拼接
rearrange(images, 'b h w c -> h (b w) c')
```

**编解码中的典型操作：**

```python
# Vision Transformer: 将图像打成 patch
# x shape: [b, c, h, w] → patches: [b, (h/ph)*(w/pw), ph*pw*c]
rearrange(x, 'b c (h p1) (w p2) -> b (h w) (p1 p2 c)', p1=16, p2=16)
```

### 2. reduce — 带缩并的重排

在 `rearrange` 的基础上增加归约操作（mean、sum、max、min、prod 等）。

```python
from einops import reduce

# 全局平均池化
reduce(x, 'b c h w -> b c', 'mean')

# 2×2 平均池化
reduce(x, 'b c (h 2) (w 2) -> b c h w', 'mean')

# 在 batch 维度上取最大值
reduce(images, 'b h w c -> h w c', 'max')

# 通道维度的全局求和
reduce(x, 'b c h w -> b h w', 'sum')
```

**在神经网络中的典型用法：**

```python
# 在 Transformer 中做 attention pooling
# scores shape: [b, heads, seq_len, seq_len]
attention_weights = reduce(scores, 'b h i j -> b i j', 'mean')  # 多头平均
```

### 3. repeat — 复制元素

复制元素沿新轴或已有轴。

```python
from einops import repeat

# 沿新轴复制（类似 unsqueeze + expand）
repeat(x, 'h w c -> h new_axis w c', new_axis=5)

# 沿已有轴复制（类似 repeat/tile）
repeat(x, 'h w c -> h (repeat w) c', repeat=3)

# 直接用数字代替命名轴
repeat(x, 'h w c -> h 5 w c')       # 沿新轴复制 5 份
repeat(x, 'h w c -> (2 h) (2 w) c') # 放大两倍
```

---

## 进阶操作

### 4. pack & unpack — 打包/解包多维张量

`0.6` 版本引入，用于把多个形状不完全一致的张量打包成单个张量，处理完再解包。

```python
from einops import pack, unpack

# 打包：类 token + image tokens + text tokens
packed, ps = pack([
    class_token,       # shape: [b, c]
    image_tokens,      # shape: [b, h, w, c]
    text_tokens        # shape: [b, t, c]
], 'b * c')            # * 表示可以变化的维度

# 经过 transformer 处理...
output = transformer(packed)

# 按原结构解包
class_emb, image_emb, text_emb = unpack(output, ps, 'b * c')
```

这比手动做 stack/pad/split 要可靠得多。

### 5. einsum — 更清晰的爱因斯坦求和

```python
from einops import einsum

# 标准的 batch 矩阵乘法
C = einsum(A, B, 'b t1 head c, b t2 head c -> b head t1 t2')

# 支持多字母轴名，比 torch.einsum 更可读
attention = einsum(Q, K, 'b h s d, b h t d -> b h s t')
```

### 6. EinMix — 用于 Mixer 架构的通用线性层

```python
from einops.layers.torch import EinMix

# MLP-Mixer 风格的混合层
mixer = EinMix(
    'b h w c -> b h w d',
    weight_shape='h c d',   # 仅 h 维度参数共享
    bias_shape='h d',
    c=64, d=128
)
```

---

## 实际应用场景

### 在 PyTorch 模型中的用法

einops 提供了 `torch.nn.Module` 风格的封装：

```python
from einops.layers.torch import Rearrange, Reduce

model = nn.Sequential(
    # 输入: [batch, 1, 28, 28] → 打平
    Rearrange('b c h w -> b (c h w)'),
    nn.Linear(784, 256),
    nn.ReLU(),
    # 输出: [batch, 256]
)

# Vision Transformer 的 patch 嵌入层
patch_embed = Rearrange(
    'b c (h p1) (w p2) -> b (h w) (p1 p2 c)',
    p1=16, p2=16
)
```

### 注意力机制中的用法

```python
def attention(Q, K, V):
    # Q, K, V: [batch, seq_len, d_model]
    # 分头: [batch, heads, seq_len, d_k]
    Q = rearrange(Q, 'b n (h d) -> b h n d', h=8)
    K = rearrange(K, 'b n (h d) -> b h n d', h=8)
    V = rearrange(V, 'b n (h d) -> b h n d', h=8)

    scores = einsum(Q, K, 'b h i d, b h j d -> b h i j')
    attn = scores.softmax(dim=-1)

    out = einsum(attn, V, 'b h i j, b h j d -> b h i d')
    out = rearrange(out, 'b h n d -> b n (h d)')
    return out
```

### 批量图像处理

```python
# 将 6 张 96×96 的图片交错排布
rearrange(images, '(b1 b2) h w c -> (h b1) (w b2) c', b1=2)
# 效果：3 行 2 列的图像网格

# Space-to-Depth（用于 Super-Resolution / YOLO）
rearrange(x, 'b (h p1) (w p2) c -> b h w (c p1 p2)', p1=2, p2=2)
```

---

## 为什么推荐使用 einops

1. **可读性** — 模式字符串本身就是文档。`'b c h w -> b h w c'` 的含义比 `.permute(0, 2, 3, 1)` 直观得多。

2. **防错** — 索引数字出错的概率远高于命名字符串。einops 还能在运行时校验维度匹配。

3. **一致性** — 一种语法覆盖 reshape、transpose、reduce、repeat 等数种操作，不需要记不同的 API。

4. **跨框架** — 同样的语法在 PyTorch、JAX、TensorFlow、NumPy、MLX 之间完全通用。切换框架不需要重写张量操作代码。

5. **可编译** — 从 `0.7` 开始完全支持 `torch.compile`，无运行时开销。

---

## 资源

- [官方文档](https://einops.rocks/) — 交互式教程和完整 API 参考
- [GitHub 仓库](https://github.com/arogozhnikov/einops)
- [ICLR 2022 论文](https://openreview.net/pdf?id=oapKSVM2bcj)
- 安装：`pip install einops`
