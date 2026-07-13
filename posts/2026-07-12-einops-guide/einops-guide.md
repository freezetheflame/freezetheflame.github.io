---
layout: post
title: "einops 实用指南：用可读的方式重排、归约和重复张量"
date: 2026-07-12 10:00:00 +0800
categories: [深度学习, PyTorch]
tags: [einops, PyTorch, tensor, deep-learning, attention, CNN]
description: "系统介绍 einops 的 rearrange、reduce、repeat、pack/unpack 与 einsum，用 PyTorch 示例展示深度学习中常见张量变换模式。"
math: true
---

`einops` 是一个用于张量变换的 Python 库，它把 `reshape`、`transpose`、`permute`、`view`、`sum`、`mean`、`repeat` 等操作统一成一种接近数学记号的字符串表达式。它的核心价值不是"能做原生框架做不到的事"，而是让张量操作更可读、更难写错、更容易维护。

在 PyTorch、TensorFlow、JAX、NumPy 中，张量变换经常会写成：

```python
x = x.view(b, h, w, c).permute(0, 3, 1, 2).contiguous()
```

这段代码对机器很清楚，对人却不够直观：每个维度代表什么？为什么要这样交换？维度是否匹配？`einops` 的写法更接近"声明我要什么"：

```python
from einops import rearrange

x = rearrange(x, 'b h w c -> b c h w')
```

左边描述输入维度，右边描述输出维度。`b h w c -> b c h w` 直接表达"把 NHWC 转成 NCHW"。

---

## 1. 安装与基本用法

安装：

```bash
pip install einops
```

常用导入：

```python
from einops import rearrange, reduce, repeat, pack, unpack, einsum
```

在 PyTorch 中使用：

```python
import torch
from einops import rearrange, reduce, repeat

x = torch.randn(2, 3, 4)
y = rearrange(x, 'b c t -> b t c')

print(y.shape)  # torch.Size([2, 4, 3])
```

`einops` 支持多个后端，包括 PyTorch、TensorFlow、JAX、NumPy 等。实际计算仍由对应框架完成，`einops` 主要负责解析模式并调用合适的底层张量操作。

---

## 2. einops 的核心概念

`einops` 最常用的三个函数是：

| 函数 | 作用 | 典型用途 |
|------|------|---------|
| `rearrange` | 重排、合并、拆分维度 | `transpose`、`permute`、`reshape`、`flatten`、patch 提取 |
| `reduce` | 对某些维度做归约 | `sum`、`mean`、`max`、`min`、池化 |
| `repeat` | 重复或扩展维度 | 增加 batch、复制 token、广播式扩展 |

### 模式字符串

模式字符串的基本形式：

```python
'输入维度表达式 -> 输出维度表达式'
```

例如：

```python
rearrange(x, 'b c h w -> b h w c')
```

含义是：
- 输入张量维度顺序是 `batch, channel, height, width`
- 输出张量维度顺序是 `batch, height, width, channel`

### 合并维度

括号表示把多个维度组合成一个维度：

```python
rearrange(x, 'b c h w -> b (c h w)')
```

这会把 `c, h, w` 展平成一个维度。

### 拆分维度

也可以把一个维度拆成多个维度，但需要显式提供至少一个维度大小：

```python
rearrange(x, 'b c (h w) -> b c h w', h=2, w=2)
```

如果 `h * w` 与原维度大小不匹配，`einops` 会直接报错。

---

## 3. 为什么 einops 比原生 PyTorch/TensorFlow 更适合表达张量操作

### 3.1 维度语义更明确

原生 PyTorch：

```python
x = x.permute(0, 2, 3, 1)
```

这段代码只告诉我们"第 0、2、3、1 个维度重排"，但没有告诉我们每个维度是什么。

`einops`：

```python
x = rearrange(x, 'b c h w -> b h w c')
```

这里每个轴都有名字：`b` 是 batch，`c` 是 channel，`h` 是 height，`w` 是 width。

### 3.2 复杂变换可以一步表达

例如把图像切成 patch，原生 PyTorch 往往需要 `reshape + permute + reshape` 多步操作。`einops` 可以写成：

```python
patches = rearrange(
    images,
    'b c (h ph) (w pw) -> b (h w) (ph pw c)',
    ph=16, pw=16,
)
```

这行代码直接表达了：
- 输入是 `b c height width`
- 每个 patch 大小是 `ph * pw`
- 输出是 `b num_patches patch_dim`

### 3.3 更容易发现 shape 错误

如果维度大小不匹配，`einops` 会给出较清晰的错误。例如：

```python
rearrange(torch.randn(2, 3, 5), 'b c (h w) -> b c h w', h=2, w=3)
```

最后一维大小是 `5`，但 `h * w = 6`，因此会报错。相比手写 `view`，这种错误更容易定位。

### 3.4 可跨框架迁移

同样的模式字符串可以用于 PyTorch、TensorFlow、JAX、NumPy。更换后端时，大部分张量变换逻辑不需要重写。

---

## 4. `rearrange`：重排、转置、reshape、flatten

先创建一个简单张量：

```python
import torch
from einops import rearrange

x = torch.arange(2 * 3 * 4).reshape(2, 3, 4)

print(x.shape)  # torch.Size([2, 3, 4])
```

这里我们把三个维度记作 `b c t`（b=2, c=3, t=4）。

### 4.1 转置 / permute

把 `b c t` 变成 `b t c`：

```python
y = rearrange(x, 'b c t -> b t c')

print(y.shape)  # torch.Size([2, 4, 3])
```

等价 PyTorch 写法：`y = x.permute(0, 2, 1)`。

### 4.2 flatten：展平多个维度

把 `c` 和 `t` 合并：

```python
flat = rearrange(x, 'b c t -> b (c t)')

print(flat.shape)  # torch.Size([2, 12])
```

等价 PyTorch：`flat = x.reshape(2, 12)`。但 `einops` 更清楚地表达了 `(c t)` 是由哪些维度合并得到的。

### 4.3 拆分维度

把长度为 `4` 的维度拆成 `2 * 2`：

```python
z = rearrange(x, 'b c (h w) -> b c h w', h=2, w=2)

print(z.shape)  # torch.Size([2, 3, 2, 2])
```

### 4.4 合并 batch 和时间维

深度学习中经常需要把 batch 和 sequence 合并，送入某个只接受二维输入的模块：

```python
x = torch.randn(2, 5, 16)  # b n d

y = rearrange(x, 'b n d -> (b n) d')

print(y.shape)  # torch.Size([10, 16])
```

恢复原形状：

```python
x_restored = rearrange(y, '(b n) d -> b n d', b=2, n=5)

print(x_restored.shape)  # torch.Size([2, 5, 16])
```

---

## 5. `reduce`：对维度做 sum、mean、max

`reduce` 的模式同样是 `'输入维度 -> 输出维度'`。出现在输入中但没有出现在输出中的维度，会被归约掉。

```python
import torch
from einops import reduce

x = torch.arange(2 * 3 * 4).reshape(2, 3, 4).float()

# 沿时间维求和
sum_t = reduce(x, 'b c t -> b c', 'sum')
print(sum_t)
# tensor([[ 6., 22., 38.],
#         [54., 70., 86.]])

# 沿 c 和 t 维求均值
mean_ct = reduce(x, 'b c t -> b', 'mean')
print(mean_ct)  # tensor([ 5.5000, 17.5000])

# 沿 channel 维取最大值
max_c = reduce(x, 'b c t -> b t', 'max')
print(max_c)
# tensor([[ 8.,  9., 10., 11.],
#         [20., 21., 22., 23.]])
```

### 全局平均池化

CNN 中常见的 global average pooling：

```python
features = torch.randn(8, 64, 14, 14)  # b c h w

pooled = reduce(features, 'b c h w -> b c', 'mean')

print(pooled.shape)  # torch.Size([8, 64])
```

---

## 6. `repeat`：重复与扩展张量

```python
import torch
from einops import repeat

v = torch.tensor([1, 2, 3])

x = repeat(v, 'c -> b c', b=2)

print(x)
# tensor([[1, 2, 3],
#         [1, 2, 3]])
```

### 增加新维度

```python
x = torch.tensor([[1, 2, 3], [4, 5, 6]])

y = repeat(x, 'b c -> b c r', r=2)

print(y.shape)  # torch.Size([2, 3, 2])
```

### 为每个样本重复出多个候选

这在 beam search、contrastive learning 等场景中很常见：

```python
x = torch.randn(4, 128)  # b d

candidates = repeat(x, 'b d -> b k d', k=10)

print(candidates.shape)  # torch.Size([4, 10, 128])
```

---

## 7. space-to-depth 与 depth-to-space

创建一张 `1 x 1 x 4 x 4` 的图像：

```python
import torch
from einops import rearrange

image = torch.arange(1 * 1 * 4 * 4).reshape(1, 1, 4, 4)

print(image[0, 0])
# tensor([[ 0,  1,  2,  3],
#         [ 4,  5,  6,  7],
#         [ 8,  9, 10, 11],
#         [12, 13, 14, 15]])
```

### 7.1 space-to-depth

把每个 `2 x 2` 空间块移动到 channel 维：

```python
s2d = rearrange(
    image,
    'b c (h ph) (w pw) -> b (c ph pw) h w',
    ph=2, pw=2,
)

print(s2d.shape)  # torch.Size([1, 4, 2, 2])
```

### 7.2 depth-to-space

恢复回原图：

```python
restored = rearrange(
    s2d,
    'b (c ph pw) h w -> b c (h ph) (w pw)',
    ph=2, pw=2,
)

print(torch.equal(restored, image))  # True
```

---

## 8. `pack` 与 `unpack`：处理可变形状片段

`einops.pack` 和 `einops.unpack` 适合把多个张量沿某个"打包维度"拼接起来，并保存恢复所需的形状信息。

典型例子：把一个 CLS token 和一组 patch tokens 拼成 Transformer 的输入。

```python
import torch
from einops import pack, unpack

cls_token = torch.randn(2, 1, 8)      # b 1 d
patch_tokens = torch.randn(2, 4, 8)   # b n d

tokens, packed_shapes = pack([cls_token, patch_tokens], 'b * d')

print(tokens.shape)       # torch.Size([2, 5, 8])
print(packed_shapes)      # [torch.Size([1]), torch.Size([4])]

cls_restored, patches_restored = unpack(tokens, packed_shapes, 'b * d')

print(cls_restored.shape)     # torch.Size([2, 1, 8])
print(patches_restored.shape) # torch.Size([2, 4, 8])
```

这里的 `*` 表示"需要被打包的中间维度"。相比手动记录每段长度，`pack/unpack` 更不容易出错。

---

## 9. 多头注意力中的 reshape 模式

Transformer 中的多头注意力经常需要在 `b n (h d) <-> b h n d` 之间转换。

```python
import torch
from einops import rearrange

batch, seq_len, num_heads, head_dim = 2, 5, 4, 8
embed_dim = num_heads * head_dim

q = torch.randn(batch, seq_len, embed_dim)

q_heads = rearrange(q, 'b n (h d) -> b h n d', h=num_heads)

print(q_heads.shape)  # torch.Size([2, 4, 5, 8])
```

经过注意力计算后，合并 heads：

```python
out_heads = torch.randn(batch, num_heads, seq_len, head_dim)

out = rearrange(out_heads, 'b h n d -> b n (h d)')

print(out.shape)  # torch.Size([2, 5, 32])
```

这比下面这种原生写法更清晰：

```python
q_heads = q.view(batch, seq_len, num_heads, head_dim).permute(0, 2, 1, 3)
```

`einops` 写法直接写出了语义：`embed_dim = h * d`。

---

## 10. 图像 patch 提取

Vision Transformer 中常见操作是把图像切成 patch，再把每个 patch 展平成 token。

```python
images = torch.randn(1, 3, 4, 4)  # b c h w

# patch 大小 2x2
patches = rearrange(
    images,
    'b c (h ph) (w pw) -> b (h w) (ph pw c)',
    ph=2, pw=2,
)

print(patches.shape)  # torch.Size([1, 4, 12])
```

恢复：

```python
restored = rearrange(
    patches,
    'b (h w) (ph pw c) -> b c (h ph) (w pw)',
    h=2, w=2, ph=2, pw=2, c=3,
)

print(torch.equal(restored, images))  # True
```

对于标准的 ViT 设置（ImageNet，224x224，patch=16）：

```python
images = torch.randn(32, 3, 224, 224)

patches = rearrange(
    images,
    'b c (h ph) (w pw) -> b (h w) (ph pw c)',
    ph=16, pw=16,
)

print(patches.shape)  # torch.Size([32, 196, 768])
# 196 = (224/16)^2, 768 = 16*16*3
```

---

## 11. 与爱因斯坦求和记号的关系

`einops` 的名字来自 Einstein operations。它的模式表达式借鉴了爱因斯坦求和记号的思想：用符号表示轴，用重复或消失的符号表示组合、变换或归约。

`einops` 也提供了 `einsum`：

```python
import torch
from einops import einsum

x = torch.randn(2, 3, 4)
w = torch.randn(4, 5)

y = einsum(x, w, 'b t d, d o -> b t o')

print(y.shape)  # torch.Size([2, 3, 5])
```

相比 `torch.einsum('btd,do->bto', x, w)`，空格分隔的写法更适合在复杂模型中阅读和维护。

注意：`rearrange/reduce/repeat` 主要处理轴变换；`einsum` 主要处理乘法与求和。

---

## 12. 深度学习中的常见模式

### 12.1 CNN：NCHW 与 NHWC 转换

```python
x = torch.randn(8, 3, 224, 224)  # NCHW

x_nhwc = rearrange(x, 'b c h w -> b h w c')

print(x_nhwc.shape)  # torch.Size([8, 224, 224, 3])
```

### 12.2 CNN：全局平均池化

```python
features = torch.randn(8, 512, 7, 7)

pooled = reduce(features, 'b c h w -> b c', 'mean')

print(pooled.shape)  # torch.Size([8, 512])
```

### 12.3 批处理：合并 batch 和时间维

```python
x = torch.randn(4, 10, 128)

x_flat = rearrange(x, 'b t d -> (b t) d')

print(x_flat.shape)  # torch.Size([40, 128])

# 恢复
x_restore = rearrange(x_flat, '(b t) d -> b t d', b=4, t=10)

print(x_restore.shape)  # torch.Size([4, 10, 128])
```

### 12.4 Transformer：合并和拆分 attention heads

```python
x = torch.randn(2, 16, 64)  # b n d

x_heads = rearrange(x, 'b n (h d) -> b h n d', h=8)

print(x_heads.shape)  # torch.Size([2, 8, 16, 8])

# 恢复
x_merge = rearrange(x_heads, 'b h n d -> b n (h d)')

print(x_merge.shape)  # torch.Size([2, 16, 64])
```

---

## 13. 性能考虑

- **实际计算仍由底层框架完成** — einops 最终调用 PyTorch 的 reshape、permute 等操作
- **能返回 view 时通常返回 view** — 纯 reshape/permute 不复制数据
- **需要改变内存布局时可能产生 copy** — 某些 permute 后再 reshape 需要 `contiguous`
- **模式解析有轻微开销** — 对超大张量可忽略；极小张量的高频内循环中，原生操作可能略快

实用建议：
- 模型结构代码、数据预处理、复杂 shape 变换 → 优先 einops
- 极端性能敏感的内循环 → benchmark 比较
- 需要控制内存连续性时 → 显式检查 `.is_contiguous()` 并在必要时 `.contiguous()`

---

## 14. 最佳实践

### 使用有语义的轴名

推荐：`rearrange(x, 'b c h w -> b h w c')`
不推荐：`rearrange(x, 'a b c d -> a c d b')`

### 拆分维度时显式传参

```python
rearrange(x, 'b (h w) c -> b h w c', h=14, w=14)
```

### 在注释中写出关键 shape

```python
# x: [batch, num_patches, patch_dim]
x = rearrange(x, 'b (h w) (ph pw c) -> b c (h ph) (w pw)',
              h=14, w=14, ph=16, pw=16, c=3)
```

### 优先使用 einops layer

`einops` 还提供适合神经网络模块的层：

```python
from einops.layers.torch import Rearrange, Reduce
import torch.nn as nn

model = nn.Sequential(
    Rearrange('b c h w -> b (c h w)'),
    nn.Linear(3 * 32 * 32, 10),
)
```

这种写法可以把 shape 变换直接放进 `nn.Sequential`。

---

## 15. 小结

`einops` 用统一的模式字符串表达张量重排、归约、重复和打包操作。它特别适合深度学习代码，因为模型中的张量维度通常有明确语义：batch、channel、height、width、sequence、head、embedding 等。

核心记法可以总结为：

```python
rearrange(x, 'b c h w -> b h w c')       # 重排维度
rearrange(x, 'b c h w -> b (c h w)')     # 合并维度
rearrange(x, 'b (h w) c -> b h w c')     # 拆分维度
reduce(x, 'b c h w -> b c', 'mean')      # 归约维度
repeat(x, 'b d -> b k d', k=10)          # 重复/扩展维度
```

在工程实践中，`einops` 的最大价值是让 shape 变换从"位置索引操作"变成"带语义的声明式表达"。对于 CNN、Transformer、ViT、多头注意力、图像 patch、批处理 reshape 等场景，它通常比原生 `view/reshape/permute` 更容易阅读和维护。

### 进一步资源
- [einops 官方文档](https://einops.rocks/)
- [einops GitHub](https://github.com/arogozhnikov/einops)
- [PyTorch 张量视图文档](https://pytorch.org/docs/stable/tensor_view.html)
