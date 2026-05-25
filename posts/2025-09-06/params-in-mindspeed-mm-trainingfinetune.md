---
title: Params in MindSpeed-MM Training&amp;Finetune
date: 2025-09-06
tags: [AI, 深度学习, LLM, MindSpeed]
---

\n

[MindSpeed-MM: 华为昇腾面向大规模分布式训练的多模态大模型套件，支撑多模态生成、多模态理解。](<https://gitee.com/ascend/MindSpeed-MM/>)

\n\n\n\n

## **训练相关参数配置（位于各个bash脚本中）：**

\n\n\n\n**参数名（及其常用别名，备注中会阐释一些细微差异）**| **参数简介**| **参数格式说明**| **参数示例**| **约束范围**| **必须同时配置的参数**| **支撑的模型or模型范围**| **是否被train/finetune必须**| **额外备注**  
---|---|---|---|---|---|---|---|---  
nproc_per_node| 指一台物理机器上几个GPU（NPU）| int| 8| 不超过机器最大GPU数量| | all| 必须|   
nnodes| 表示整个分布式训练集群由多少台物理机器组成| int| 1| 参与计算是机器数量| | all| 必须|   
node_rank| 每个节点必须有唯一的rank值，主节点(rank=0)负责协调工作| int| 0| 至少有一个节点为0| | | 必须|   
master_addr| 所有工作节点通过此地址连接到主节点进行初始化和通信| ip string| localhost| 可访问的有效节点地址| | | 必须|   
master_port| 通信端口| port string| 4567| 有效的端口| | | 必须|   
tensor-model-parallel-size（TP）| 模型张量并行度，将模型层内的张量拆分到多个GPU上计算| int| 8| 不大于卡实际数量，必须可以整除模型的hidden_size num_attention_heads ffn_hidden_size 等（暂时没完全统计，不确定vit是否也收到TP约束）| 模型参数encoder中的| 详见仓库readme| 必须|   
pipeline-model-parallel-size（PP）| 管道并行度。将模型层序列拆分成多个阶段分配到不同GPU。| int| 2| | 模型参数encoder中的pipeline_num_layers（数组长度与PP相等）| | |   
context parallel（CP）| **将长上下文拆分成块，分配到不同设备并行计算** ，同时优化通信模式| int| 4| | | | |   
（）| | | | | | | |   
micro-batch-size（MBS）|  微批次大小。每个GPU在一次前向/后向传播中处理的样本数。| int| | | | | |   
context-parallel-algo| 指定上下文并行的算法| string| ulysses_cp_algo | mindspeed目前支持（todo）| 需要填CP，以及算法基于的并行方式（比如sequence-parallel）| | |   
global-batch-size（GBS）| | int| GBS=((WORLD_SIZE*MBS/CP/TP))| | | | |   
tokenizer-type| 指定分词器类型，`NullTokenizer`表示**不使用实际分词逻辑** （通常用于预处理后的token ID直接输入场景）| tokenizer string| Null_Tokenizer| | | | |   
seq-length| 模型处理的**单序列最大token数量**|  int| 1024| | | | |   
vocab-size| 词汇表大小| int| 151936| | | | |   
make-vocab-size-divisible-by| **调整词汇表为该值的整数倍**|  int| 1| | 建议与tp值保持一致| all| | 张量并行（Tensor Parallelism）要求embedding层均匀分割。设为8可确保8卡并行时每卡处理相同size的embedding  
normalization| **均方根归一化**|  model string | RMSNorm| 必须是Norm模型| 无| all| |   
use-fused-rmsnorm| **融合式RMSNorm**|  none| | 需要使用rmsnorm| \--normalization RMSNorm| ——| |   
swiglu| **门控线性单元激活函数**|  none| | 需要模型支持该激活| 无| | |   
use-fused-swiglu| **融合式SwiGLU CUDA实现**|  none| | | \--swiglu| | |   
lr| 学习率| float| 1.0e-5| | | | |   
lr-decay-style| **余弦退火学习率调度**|  method string| cosine| | lr，但不受其数值影响| some| |   
lr-warmup-fraction| **学习率预热比例** ,避免初始大梯度导致的训练不稳定| float| 0.1| | | | |   
weight-decay| **L2正则化系数**|  float| 0| | | | | 预训练：0.1 (GPT-3)  
微调：0.01或0（依赖任务）  
小模型：0.01-0.05  
train-iters| **总训练迭代步数** ,防止梯度爆炸，尤其在长序列训练中| int| 10000| | | | | **典型值** ：禁用：0.0  
稳定训练：1.0  
小模型：0.1-0.5  
  
adam-beta1| **Adam优化器一阶动量衰减率**|  float| 0.9| | | | | 一般采取原始Adam论文取值0.9  
adam-beta2| **Adam优化器二阶动量衰减率**|  float| 0.999| | | | | **问题** ：过大的β2可能导致早期训练不稳定，可尝试0.95  
no-gradient-accumulation-fusion| **禁用梯度累积融合**|  none| none| | | | | **禁用场景** ：遇到NaN梯度或显存不足时  
seed| **全局随机种子**|  int| 42| | | | |   
bf16| **bfloat16混合精度训练**|  none| none| | | | |   
use-flash-attn| **启用FlashAttention优化** 通过IO感知算法减少注意力计算的HBM访问| none| none| | | | |   
use-distributed-optimizer| **分布式优化器（ZeRO-3级）** 将优化器状态（动量、方差）分散到所有设备| none| none| | | | |   
\--no-load-optim & \--no-load-rng| **不保存优化器状态/随机状态**| | | | | | | **背景** ：优化器状态通常占检查点70%+空间  
num_workers| 加载子进程数| int| | | | | |   
| | | | | | | |   
\n\n\n\n

## 模型相关参数配置（位于model.json中，需要和bash脚本中一些参数完成联动）

\n\n\n\n

注意，当开启PP时，`model.json`中配置的`vision_encoder`和`text_decoder`的`pipeline_num_layer`参数控制了各自的PP切分策略。对于流水线并行，要先处理`vision_encoder`再处理`text_decoder`。

\n\n\n\n

比如7b默认的值`[32,0,0,0]`、`[1,10,10,7]`，其含义为PP域内第一张卡先放32层`vision_encoder`再放1层`text_decoder`、第二张卡放`text_decoder`接着的10层、第三张卡放`text_decoder`接着的10层、第四张卡放`text_decoder`接着的7层，`vision_encoder`没有放完时不能先放`text_decoder`（比如`[30,2,0,0]`、`[1,10,10,7]`的配置是错的）

\n\n\n\n

### 🔧 可安全修改的参数（用于模块测试）

\n\n\n\n

### 1\. 归一化函数 (`normalization`)

\n\n\n\n

\n
  * **原始值** ：`"RMSNorm"`
\n\n\n\n
  * **可修改为** ：`"LayerNorm"`, `"FusedLayerNorm"`
\n\n\n\n
  * **修改方法** ：
\n
\n\n\n\n
    
    
      // 在text_decoder和vision_encoder中同时修改\n  "normalization": "LayerNorm"

\n\n\n\n

\n
  * **注意事项** ：
\n\n\n\n
  * ✅ **安全** ：框架通常会自动处理权重转换（RMSNorm到LayerNorm的gamma参数可直接复用）
\n\n\n\n
  * ⚠️ **性能影响** ：RMSNorm比LayerNorm快约15%，但LayerNorm更稳定
\n\n\n\n
  * 💡 **测试建议** ：修改后运行简单推理测试，检查loss是否稳定
\n\n\n\n
  * 📊 **评估指标** ：推理速度、数值稳定性、生成质量
\n
\n\n\n\n

### 2\. 激活函数 (`activation_func`)

\n\n\n\n

\n
  * **原始值** ：`"silu"` (Swish)
\n\n\n\n
  * **可修改为** ：`"gelu"`, `"relu"`, `"quick_gelu"`
\n\n\n\n
  * **修改方法** ：
\n
\n\n\n\n
    
    
      // 在text_decoder和vision_encoder中修改\n  "activation_func": "gelu"

\n\n\n\n

\n
  * **注意事项** ：
\n\n\n\n
  * ✅ **安全** ：激活函数替换不会改变张量维度
\n\n\n\n
  * ⚠️ **性能差异** ：\n\n
    * SiLU → GELU：质量可能下降0.5-1.0 PPL
\n\n\n\n
    * SiLU → ReLU：可能引起训练不稳定
\n\n
\n\n\n\n
  * 💡 **测试建议** ：使用相同输入测试不同激活函数的输出分布
\n\n\n\n
  * 📊 **评估指标** ：输出分布熵值、推理速度
\n
\n\n\n\n

### 3\. 注意力机制配置

\n\n\n\n

\n
  * **可修改项** ：
\n
\n\n\n\n
    
    
      "group_query_attention": true,\n  "num_query_groups": 4

\n\n\n\n

\n
  * **修改方案** ：
\n\n\n\n
  * 方案1：关闭GQA → `"group_query_attention": false`
\n\n\n\n
  * 方案2：调整组数 → `"num_query_groups": 7` (必须是28的约数)
\n\n\n\n
  * **注意事项** ：
\n\n\n\n
  * ✅ **安全** ：权重可直接复用（多余的头会被忽略）
\n\n\n\n
  * ⚠️ **性能影响** ：\n\n
    * 关闭GQA：显存增加30%，速度下降15%
\n\n\n\n
    * 增加组数：质量可能轻微下降
\n\n
\n\n\n\n
  * 💡 **测试建议** ：使用长文本测试注意力分布变化
\n\n\n\n
  * 📊 **评估指标** ：注意力热力图、显存占用
\n
\n\n\n\n

### 4\. RoPE参数调整

\n\n\n\n

\n
  * **可修改项** ：
\n
\n\n\n\n
    
    
      "rope_theta": 1000000.0,\n  "mrope_section": [16, 24, 24]

\n\n\n\n

\n
  * **修改方案** ：
\n\n\n\n
  * 方案1：调整theta值 → `"rope_theta": 500000.0`
\n\n\n\n
  * 方案2：简化mrope → `"mrope_section": [32, 32]`
\n\n\n\n
  * **注意事项** ：
\n\n\n\n
  * ✅ **安全** ：仅影响位置编码计算
\n\n\n\n
  * ⚠️ **限制** ：`mrope_section`总和必须=80（原始总和=16+24+24=64? 需确认）
\n\n\n\n
  * 💡 **测试建议** ：测试不同长度序列的位置编码输出
\n\n\n\n
  * 📊 **评估指标** ：位置编码矩阵可视化、长文本推理质量
\n
\n\n\n\n

## ⚠️ 有条件可修改的参数（需谨慎操作）

\n\n\n\n

### 1\. 层数 (`num_layers`)

\n\n\n\n

\n
  * **原始值** ：
\n\n\n\n
  * 文本解码器：28层
\n\n\n\n
  * 视觉编码器：32层
\n\n\n\n
  * **安全修改策略** ：
\n
\n\n\n\n
    
    
      // 仅减少层数（不能增加）\n  "num_layers": 24,\n  "pipeline_num_layers": [10, 14]  // 保持总和=24

\n\n\n\n

\n
  * **关键限制** ：
\n\n\n\n
  * ❌ **禁止增加层数** （新层无预训练权重）
\n\n\n\n
  * ✅ **允许减少层数** （从顶部移除，保留底层特征提取能力）
\n\n\n\n
  * 🔗 **必须同步修改** `pipeline_num_layers`（总和需等于新num_layers）
\n\n\n\n
  * **权重加载策略** ：
\n
\n\n\n\n
    
    
      # 伪代码：安全加载部分层的权重\n  for layer_idx in range(new_num_layers):\n      model.decoder.layers[layer_idx].load_state_dict(\n          pretrained_state[f"decoder.layers.{layer_idx}"]\n      )

\n\n\n\n

\n
  * **测试建议** ：
\n\n\n\n
  * 逐步减少层数（28→24→20→16）
\n\n\n\n
  * 测试不同任务的性能衰减曲线
\n\n\n\n
  * 重点关注底层vs顶层层的重要性
\n
\n\n\n\n

### 2\. 隐藏层大小 (`hidden_size`)

\n\n\n\n

\n
  * **原始值** ：
\n\n\n\n
  * 文本解码器：3584
\n\n\n\n
  * 视觉编码器：1280
\n\n\n\n
  * LLM隐藏层：3584（`llm_hidden_size`）
\n\n\n\n
  * **安全修改策略** ：
\n
\n\n\n\n
    
    
      // 必须保持比例关系\n  "hidden_size": 3072,  // 128的倍数\n  "llm_hidden_size": 3072,\n  "vision_projector": {\n    "input_size": 1280,\n    "hidden_size": 3072,  // 与text_decoder.hidden_size一致\n    "ffn_hidden_size": 4608  // 通常为hidden_size的1.5倍\n  }

\n\n\n\n

\n
  * **关键限制** ：
\n\n\n\n
  * 🔗 **必须保持维度匹配** ：\n\n
    * 视觉投影器输出 = 文本解码器输入
\n\n\n\n
    * `ffn_hidden_size` ≈ `hidden_size` × 1.5
\n\n
\n\n\n\n
  * 🔄 **需要权重转换** ：  
`python # 伪代码：线性投影转换权重 new_embedding = nn.Linear(3584, 3072) new_embedding.weight.data = pretrained_embed.weight.data[:, :3072]`
\n\n\n\n
  * **测试建议** ：
\n\n\n\n
  * 按128的倍数调整（3584→3456→3328…）
\n\n\n\n
  * 测试模型容量与性能的权衡曲线
\n\n\n\n
  * 监控显存占用与推理速度变化
\n
\n\n\n\n

## 🚫 绝对禁止修改的参数（会导致推理失败）

\n\n\n\n

### 1\. 词汇表相关参数

\n\n\n\n
    
    
    "vocab_size": 152064,\n"img_context_token_id": 151655,\n"vision_start_token_id": 151652

\n\n\n\n

\n
  * **原因** ：这些ID在数据处理流水线和模型架构中**硬编码**
\n\n\n\n
  * **后果** ：修改后会导致：
\n\n\n\n
  * 视觉特征无法正确插入文本流
\n\n\n\n
  * 特殊token被错误解释为普通token
\n\n\n\n
  * 模型完全无法理解多模态输入
\n
\n\n\n\n

### 2\. 多维RoPE核心配置

\n\n\n\n
    
    
    "position_embedding_type": "mrope",\n"mrope_section": [16, 24, 24]

\n\n\n\n

\n
  * **原因** ：这是Qwen2.5-VL处理**视觉-文本时空对齐** 的核心机制
\n\n\n\n
  * **后果** ：修改后会导致：
\n\n\n\n
  * 视觉和文本位置信息错位
\n\n\n\n
  * 长视频理解能力完全失效
\n\n\n\n
  * 模型无法区分空间/时间维度
\n
\n\n\n\n

### 3\. 冻结组件标记

\n\n\n\n
    
    
    "freeze": true  // 在vision_encoder和vision_projector中

\n\n\n\n

\n
  * **原因** ：这些标记**不改变模型结构** ，仅控制训练行为
\n\n\n\n
  * **正确修改方式** ：通过训练参数控制，而非修改model.json
\n
\n\n\n\n
    
    
      # 正确做法：通过训练参数解冻\n  --unfreeze-vision-encoder --vision-encoder-lr 5e-6\n\n  # 错误做法：修改model.json中的"freeze": true

\n