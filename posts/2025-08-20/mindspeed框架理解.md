---
title: MindSpeed框架理解
date: 2025-08-20
tags: [AI]
---


## first step

MindSpeed作为适配megatron的分布式大模型推理框架，具有相当好的拆解与学习价值，现在由于需要去结合MindSpeed去做一些测试工作，所以首先得慢慢理解这个框架的结构，使用、拆解其中的关键代码，方便后期的测试。首先我们从pretrain_gpt.py出发，去看哪些代码是我们可以理解使用的

import部分直接跳过不看。我们先来看第一个方法model_provider

### provide_model

参数如下：  
Args:  
pre_process (bool, optional): Set to true if you need to compute embedings. Defaults to True.  
post_process (bool, optional): Set to true if you need to want to compute output logits/loss. Defaults to True.

Returns:
 Union[GPTModel, megatron.legacy.model.GPTModel]: The returned model

总体是用来加载mcore或者leagcy形式model的一个方法，然后可以选有pre/post process，现在理解是方便连上embedding层和loss计算层的。

关于mcore和legacy类型模型解释

MCore 模型和 Legacy 模型的区别主要出现在与 Megatron 相关的技术背景下。MCore 指的是 Megatron Core，它是由 Megatron 的早期版本（即 Legacy 版本）经过进一步的抽象和封装而来的 。与 Legacy 模型相比，Megatron-Core 提供了更灵活的接口和底层功能 。最近版本的 Megatron 已经加入了 MCore 模型，用于替代之前的 Legacy 模型，例如在将 Hugging Face 的 llama-2 模型转换到 Megatron 时，现在倾向于使用 mcore 模型而非 legacy 模型 。Megatron Core (Mcore) 能够支持用户大规模训练 Transformer 模型

然后本函数根据mcore或者legacy两种类型进行模型的实例化，如下：


    
    if not args.use_legacy_models:
        if args.spec is not None:
            transformer_layer_spec = import_module(args.spec)
        else:
            if use_te:
                transformer_layer_spec = get_gpt_layer_with_transformer_engine_spec(args.num_experts, args.moe_grouped_gemm)
            else:
                transformer_layer_spec = get_gpt_layer_local_spec(args.num_experts, args.moe_grouped_gemm)
        mtp_block_spec = None
        if args.mtp_num_layers is not None:
            mtp_block_spec = get_gpt_mtp_block_spec(config, transformer_layer_spec, use_transformer_engine=use_te)
        model = GPTModel(
            config=config,
            transformer_layer_spec=transformer_layer_spec,
            vocab_size=args.padded_vocab_size,
            max_sequence_length=args.max_position_embeddings,
            pre_process=pre_process,
            post_process=post_process,
            fp16_lm_cross_entropy=args.fp16_lm_cross_entropy,
            parallel_output=True,
            share_embeddings_and_output_weights=not args.untie_embeddings_and_output_weights,
            position_embedding_type=args.position_embedding_type,
            rotary_percent=args.rotary_percent,
            seq_len_interpolation_factor=args.rotary_seq_len_interpolation_factor,
            mtp_block_spec=mtp_block_spec,
        )
    else:
        if not args.context_parallel_size == 1:
            raise ValueError("Context parallelism is only supported with Megatron Core!")
        model = megatron.legacy.model.GPTModel(
            config,
            num_tokentypes=0,
            parallel_output=True,
            pre_process=pre_process,
            post_process=post_process
        )

其中mcore有一个关于transformer层的use_te参数配置，意思是是否使用nv的transformer engine，能够有效提高训练效率。其他参数配置这边暂不涉及，都是一些配置，还有pre和post的配置直接传参即可，然后context_parallelism应该是一个和TP PP类似的并行手段，仅仅适用于mcore的模型

第二个函数是get_batch，给每个npu获取TP,PP后切分的batch的数据的一个分配办法


    
    def get_batch(data_iterator):
    """Generate a batch."""
    args = get_args()
    is_middle_stage = not (mpu.is_pipeline_first_stage() or mpu.is_pipeline_last_stage())
    pretrain_not_tnd_flags = not args.is_instruction_dataset and not args.reset_position_ids
    if pretrain_not_tnd_flags and is_middle_stage:
        return (None,) * 5
    # get batches based on the TP rank you are on
    batch, actual_seq_len = get_batch_on_this_tp_rank(data_iterator)
    if args.return_document_ids and mpu.get_context_parallel_rank() == 0 and mpu.get_tensor_model_parallel_rank() == 0 and mpu.get_pipeline_model_parallel_rank() == 0:
        print("current idx: {}, current rank: {}, data_parallel_rank: {}, document_ids: {}".format(batch['idx'], torch.distributed.get_rank(), mpu.get_data_parallel_rank(), batch['document_ids']))
        batch.pop('document_ids', None)
        batch.pop('idx', None)
    if args.reset_position_ids and not args.reset_attention_mask:
        generate_actual_seq_len(batch, actual_seq_len)
        batch = get_batch_on_this_cp_rank(batch)
    else:
        # slice batch along sequence dimension for context parallelism
        batch = get_batch_on_this_cp_rank(batch)
    return batch.values()

batch没啥好看的因为分布式模型训练的数据处理我不懂（划掉）所以这个函数就这样过一下，把它当成NPU的一个输入获取器就行

第三个函数是loss_func，具体内容我们先看再理解：


    

def loss_func(loss_mask: torch.Tensor, output_tensor: torch.Tensor):
    """Loss function.
    Args:
        loss_mask (torch.Tensor): Used to mask out some portions of the loss
        output_tensor (torch.Tensor): The tensor with the losses
    """    
    args = get_args()
    losses = output_tensor.float()
    loss_mask = loss_mask.view(-1).float()
    if args.context_parallel_size > 1:
        loss = torch.cat([torch.sum(losses.view(-1) * loss_mask).view(1), loss_mask.sum().view(1)])
        torch.distributed.all_reduce(loss, group=mpu.get_context_parallel_group())
        loss = loss[0] / loss[1]
    else:
        loss = torch.sum(losses.view(-1) * loss_mask) / loss_mask.sum()
    # Check individual rank losses are not NaN prior to DP all-reduce.
    if args.check_for_nan_in_loss_and_grad:
        global_rank = torch.distributed.get_rank()
        if loss.isnan():
            raise ValueError(f'Rank {global_rank}: found NaN in local forward loss calculation. '
                             f'Device: {torch.cuda.current_device()}, node: {os.uname()[1]}')
    if args.async_log_allreduce:
        # Reduce loss for logging, which is different from megatron pretrain_gpt.py.
        reporting_loss = loss.clone().detach()
        allreduce_handle = torch.distributed.all_reduce(
            reporting_loss, group=mpu.get_data_parallel_group(), async_op=True
        )
        return loss * args.context_parallel_size, ({"lm loss": (reporting_loss)}, allreduce_handle)
    else:
        # Reduce loss for logging.
        averaged_loss = average_losses_across_data_parallel_group([loss])
        return loss * args.context_parallel_size, {'lm loss': averaged_loss[0]}

loss_mask是因为有些地方的损失属于无效的，所以mask掉之后再进行计算

  * **`get_args()`**  
获取训练配置参数（来自全局配置对象 `args`），例如：

    * `args.context_parallel_size`：上下文并行的设备数量（用于分布式训练）。

    * `args.check_for_nan_in_loss_and_grad`：是否检查损失中的 `NaN` 值。

    * `args.async_log_allreduce`：是否异步执行 `all_reduce` 操作以优化日志记录。

计算的时候output_tensor和mask都展开成view(-1)的一维张量方便计算，长度都是batch_size*seq_length

由于是分布式的，所以计算误差也需要考虑到分布式的存在

### **loss calculate损失计算（关键逻辑）**

根据 `args.context_parallel_size` 的值分两种情况处理：

#### **情况 1：`context_parallel_size > 1`（上下文并行启用）**


    
    if args.context_parallel_size > 1:
    loss = torch.cat([torch.sum(losses.view(-1) * loss_mask).view(1), 
                      loss_mask.sum().view(1)])
    torch.distributed.all_reduce(loss, group=mpu.get_context_parallel_group())
    loss = loss[0] / loss[1]

  * **目的** ：在上下文并行（Context Parallelism）场景下，正确聚合跨设备的损失。

  * **步骤** ：

    1. **局部计算** ：

       * 每个设备计算本地损失总和 `sum(losses * loss_mask)` 和有效 token 数 `loss_mask.sum()`。

    2. **全局聚合** ：

       * 通过 `all_reduce` 操作，在上下文并行组内汇总所有设备的损失总和与有效 token 数。

       * 例如：设备 A 的损失总和为 `30`、有效 token 数 `50`；设备 B 为 `40`、`50` → 全局总和为 `70`、`100`。

    3. **全局平均** ：

       * `loss = 全局损失总和 / 全局有效 token 数`（即 `70/100 = 0.7`）。

  * **为什么需要？**  
上下文并行将输入序列分片到多个设备，每个设备仅处理部分序列。直接计算局部平均会导致结果偏差，必须通过全局聚合得到正确的平均损失。

#### **情况 2：`context_parallel_size = 1`（无上下文并行）**


    
    else:
    loss = torch.sum(losses.view(-1) * loss_mask) / loss_mask.sum()

结果即为标准的 **Masked Loss** （忽略无效位置的损失）。

**逻辑** ：直接计算本地损失的加权平均。

`sum(losses * loss_mask)`：有效位置的损失总和。  
`loss_mask.sum()`：有效位置的总数。

然后下一个就是很关键的一个函数：前向传播函数

### forward_step函数


    
    def forward_step(data_iterator, model: GPTModel):
    """Forward training step.
    Args:
        data_iterator : Input data iterator
        model (GPTModel): The GPT Model
    """
    args = get_args()
    timers = get_timers()
    # Get the batch.
    timers('batch-generator', log_level=2).start()
    tokens, labels, loss_mask, attention_mask, position_ids = get_batch(
        data_iterator)
    timers('batch-generator').stop()
    if args.use_legacy_models:
        output_tensor = model(tokens, position_ids, attention_mask,
                              labels=labels)
    else:
        output_tensor = model(tokens, position_ids, attention_mask,
                              labels=labels, loss_mask=loss_mask)
    return output_tensor, partial(loss_func, loss_mask)

  * **`get_batch` 的作用**：  
从 `data_iterator` 中提取一个训练批次的数据，各字段含义：`tokens`输入 token IDs（形状`[batch_size, seq_len]`）。`labels`目标 token IDs（通常为`tokens`右移一位，用于计算损失）。`loss_mask`二进制掩码，标记哪些位置参与损失计算（`1`=有效，`0`=填充/忽略）。`attention_mask`注意力掩码，防止模型关注填充部分（如`[1,1,1,0,0]`）。`position_ids`位置编码 IDs（通常为`[0,1,2,...,seq_len-1]`）。

  * **典型场景** ：

    * 在语言模型中，`loss_mask` 可能标记出需要预测的 token 位置（例如仅计算句子结尾的损失）。

    * `attention_mask` 处理变长序列（避免 padding 影响注意力计算）。

我们注意到，在最后一步做forward获取output时，mcore比legacy额外需要一个lossmask，原因如下，也体现了mcore的一个优势：

  * **MCore 的设计目标** ：

    * 提供更细粒度的控制（如将 `loss_mask` 直接传递给 Transformer 层，优化上下文并行中的损失计算）。

    * 与 **Transformer Engine (TE)** 深度集成（例如 `use_te=True` 时需显式传递 `loss_mask`）。

  * **Legacy 的局限性** ：

    * 损失掩码仅在 `loss_func` 中应用，无法在模型内部利用（例如无法在注意力层提前过滤无效位置）。

其他部分相对来说就次要一些了，我们发现这个pretrain_gpt其实是从megatron中提取的部分，其他内容如下：

**数据集构建 (`train_valid_test_datasets_provider`** **函数)**

  * **功能** : 构建训练、验证和测试数据集。

  * **实现细节** :

    * 根据配置参数构建GPT数据集。

    * 支持使用模拟数据 (`MockGPTDataset`) 或真实数据 (`GPTDataset`)。

    * 使用 `BlendedMegatronDatasetBuilder` 来构建混合数据集。

6. **核心GPT数据集配置 (`core_gpt_dataset_config_from_args`** **函数)**

  * **功能** : 从命令行参数中提取配置并构建GPT数据集的配置对象。

  * **实现细节** :

    * 配置包括随机种子、序列长度、数据混合比例、数据集分割、缓存路径等。

7. **主程序入口 (`if __name__ == "__main__":`)**

  * **功能** : 启动预训练流程。

  * **实现细节** :

    * 调用 `pretrain` 函数，传入数据集提供者、模型提供者、模型类型、前向传播函数等参数。

    * 设置默认的tokenizer类型为 `GPT2BPETokenizer`。

8. **其他模块**

  * **StragglerDetector** : 用于检测训练中的慢节点。

  * **mpu (Model Parallel Utilities)** : 提供模型并行相关的工具函数，如判断当前是否是管道的第一个或最后一个阶段。

  * **get_args** : 获取命令行参数。

  * **get_tokenizer** : 获取tokenizer。

  * **get_timers** : 获取计时器，用于性能分析。

## 初始化逻辑

实际上，真正的训练逻辑实现放在了training.py中，不过在此之前，先跟随知乎上的讲解过一下分布式初始化的流程：

这里主要讲一下[megatron](<https://zhida.zhihu.com/search?content_id=253076883&content_type=Article&match_order=1&q=megatron&zhida_source=entity>) 训练开始时，[分布式环境](<https://zhida.zhihu.com/search?content_id=253076883&content_type=Article&match_order=1&q=%E5%88%86%E5%B8%83%E5%BC%8F%E7%8E%AF%E5%A2%83&zhida_source=entity>)的初始化，以及各维度的集合通信进程组的实现与分配。

这块代码的实现主要在这两个文件

  * megatron/training/initialize.py

  * megatron/core/parallel_state.py

调用顺序一般是这样的（我们跑的脚本一般是从pretrain作为入口去跑的，所以一切从pretrain出发去理解）


    
    ->def pretrain 
       -> initialize_megatron [megatron/training/initialize.py]
       -> _initialize_distributed [megatron/training/initialize.py]
               -> model_parallel_is_initialized [megatron/core/parallel_state.py]
               -> RankGenerator [megatron/core/parallel_state.py]

首先从initialize_megatron 开始一步步向下解释初始化的实现

### 1\. initialize_megatron

initialize_megatron是 Megatron 框架中用于初始化分布式训练环境的核心函数。它负责设置全局变量、初始化分布式通信、配置随机种子、加载依赖等

关键函数| 功能总结  
---|---  
parse_args| 解析命令行参数，获取训练和分布式配置。  
validate_args| 验证命令行参数的合法性，确保配置正确。  
set_global_variables| 将解析后的参数存储到全局变量中，供其他模块使用。  
setup_logging| 根据命令行参数或环境变量设置日志的输出级别。  
_initialize_distributed| 初始化 torch.distributed 和[模型并行](<https://zhida.zhihu.com/search?content_id=253076883&content_type=Article&match_order=1&q=%E6%A8%A1%E5%9E%8B%E5%B9%B6%E8%A1%8C&zhida_source=entity>)通信器，设置分布式环境。  
_set_random_seed| 设置随机种子，确保实验的可重复性。  
_init_autoresume| 初始化自动恢复功能，支持从检查点恢复训练。  
_compile_dependencies| 编译 Megatron 所需的高性能内核（如融合内核），优化计算性能。  
_initialize_tp_communicators| 初始化[张量模型并行](<https://zhida.zhihu.com/search?content_id=253076883&content_type=Article&match_order=1&q=%E5%BC%A0%E9%87%8F%E6%A8%A1%E5%9E%8B%E5%B9%B6%E8%A1%8C&zhida_source=entity>)的通信器，支持通信与计算重叠优化。  

**这段代码主要是基于解析的参数，调用_initialize_distributed 进行分布式的初始化。**

**源代码如下：**


    
    #megatron 训练初始化。 主要是分布式环境。
def initialize_megatron(
    extra_args_provider=None,
    args_defaults={},
    ignore_unknown_args=False,
    allow_no_cuda=False,
    skip_mpu_initialization=False,
    get_embedding_ranks=None,
    get_position_embedding_ranks=None
):
    """Set global variables, initialize distributed, and
    set autoresume and random seeds.
    `allow_no_cuda` should not be set unless using megatron for cpu only
    data processing. In general this arg should not be set unless you know
    what you are doing.
    Returns a function to finalize distributed env initialization
    (optionally, only when args.lazy_mpu_init == True)
    """
    if not allow_no_cuda:
        # Make sure cuda is available.
        assert torch.cuda.is_available(), "Megatron requires CUDA."
    # Parse arguments 解析参数
    args = parse_args(extra_args_provider, ignore_unknown_args)
    if args.use_checkpoint_args or args_defaults.get("use_checkpoint_args", False):
        assert args.load is not None, "--use-checkpoints-args requires --load argument"
        load_args_from_checkpoint(args)
    if args.yaml_cfg is not None:
        args = validate_yaml(args, args_defaults)
    else:
        validate_args(args, args_defaults)

    # set global args, build tokenizer, and set adlr-autoresume,
    # tensorboard-writer, and timers.
    set_global_variables(args) #解析的参数全局化。 基于 global 函数。
    # set logging level
    setup_logging() #配置日志
    # torch.distributed initialization
    def finish_mpu_init():
        args = get_args()
        # Pytorch distributed.  分布式初始化
        _initialize_distributed(get_embedding_ranks, get_position_embedding_ranks)
        # Random seeds for reprod-ucibility.
        if args.rank == 0:
            print("> setting random seeds to {} ...".format(args.seed))
        _set_random_seed(args.seed, args.data_parallel_random_init)
    if skip_mpu_initialization:
        return None
    args = get_args()
    if args.lazy_mpu_init:
        # TODO is this still a necessary option?
        args.use_cpu_initialization = True
        # delayed initialization of DDP-related stuff
        # We only set basic DDP globals
        mpu.set_tensor_model_parallel_world_size(args.tensor_model_parallel_size)
        # and return function for external DDP manager
        # to call when it has DDP initialized
        mpu.set_tensor_model_parallel_rank(args.rank)
        return finish_mpu_init
    else:
        # Megatron's MPU is the master. Complete initialization right away.
        finish_mpu_init()
        # Autoresume.
        _init_autoresume()
        # Compile dependencies.
        _compile_dependencies()
        if args.tp_comm_overlap:
           _initialize_tp_communicators()
        # No continuation function
        return None

### 2\. _initialize_distributed

此函数主要实现了：

  * 分布式进程组

  * 通过调用initialize_model_parallel， 实现并行策略对应的进程子组

### 3\. 初始化进程组 mpu.initialize_model_parallel

`initialize_model_parallel`是一个关键函数，用于初始化分布式训练中的各种并行组（如模型并行、数据并行、上下文并行、专家并行等）。它的主要功能是根据用户提供的并行配置（如张量并行大小、管道并行大小、上下文并行大小等），创建并分配相应的进程组（Process Group），并将这些组与当前进程的 rank 关联起来。

#### 3.1 函数中初始化步骤：

  1. **参数校验** ：确保所有并行尺寸的合理性。

  2. **Rank 生成** ：按优先级生成不同并行维度的进程组合。

  3. **进程组创建** ：为每个并行策略（DP/TP/PP/CP/EP）创建独立的通信组。

  4. **混合组构建** ：处理跨并行维度的通信需求（如 TP+DP）。

  5. **优化配置** ：应用 SHARP、虚拟管道等高级特性。

  6. **资源分配** ：初始化全局内存缓冲区。

#### **3.2 需要关注的关键全局变量，进程组创建完成后，会保存以下全局环境变量中**

变量名| 作用  
---|---  
_DATA_PARALLEL_GROUP| 数据并行组的 NCCL 通信组  
_TENSOR_MODEL_PARALLEL_GROUP| 张量并行组的通信组  
_PIPELINE_MODEL_PARALLEL_GROUP| 管道并行组的通信组  
_EXPERT_MODEL_PARALLEL_GROUP| 专家并行组的通信组  
_MODEL_PARALLEL_GROUP| 模型并行（TP+PP）的组合组  

#### 3.3 torch.distributed.new_group

这里介绍一个关键函数，`torch.distributed.new_group`是 PyTorch 分布式通信的核心函数，用于**创建新的进程组（Process Group）** ，允许用户定义不同的进程子集进行独立的通信操作。

** _源代码中每个并行策略的进程组，都是先基于RankGenerator 实现的逻辑生成分配的rank list， 然后使用 torch.distributed.new_group 创建进程组，最后保存的全局变量中，供训练通信使用。_**

参数及使用方法如下：


    
    torch.distributed.new_group(
    ranks=None,              # 参与组的进程全局 rank 列表
    timeout=datetime.timedelta(seconds=1800),  # 组操作超时时间
    backend=None,            # 通信后端（如 "nccl", "gloo"）
    pg_options=None,         # 进程组配置选项（如 NCCL 参数）
)

注意： ranks， 指定加入新组的进程的**全局 rank ID 列表** ，必须为整数列表

**核心功能**

  * **创建独立通信组** ：将 `ranks` 列表中的进程划分为一个逻辑组，组内进程可进行独立的集体通信（如 `all_reduce`、`broadcast`）。

  * **支持异构后端** ：不同组可使用不同通信后端（如部分组用 NCCL，其他用 Gloo）。

  * **灵活配置** ：通过 `pg_options` 优化通信性能（如选择 NCCL 的通信算法）。


    
    def initialize_model_parallel(
    tensor_model_parallel_size: int = 1,         # 张量模型并行尺寸，默认1（不分割）
    pipeline_model_parallel_size: int = 1,       # 管道模型并行尺寸，默认1（不分割）
    virtual_pipeline_model_parallel_size: Optional[int] = None,  # 虚拟管道并行阶段数，用于层交错
    pipeline_model_parallel_split_rank: Optional[int] = None,    # 弃用参数，分割编码器/解码器的rank位置
    use_sharp: bool = False,                     # 是否启用SHARP通信优化
    context_parallel_size: int = 1,              # 上下文并行尺寸，分割输入序列长度
    expert_model_parallel_size: int = 1,         # 专家模型并行尺寸（MoE相关）
    nccl_communicator_config_path: Optional[str] = None,  # NCCL通信配置文件路径
    distributed_timeout_minutes: int = 30,       # 分布式操作超时时间（分钟）
    order: str = "tp-cp-ep-dp-pp",               # 并行维度初始化顺序
    encoder_pipeline_model_parallel_size: Optional[int] = None,  # 编码器专用管道并行尺寸
    get_embedding_ranks: Optional[Callable[[List[int], Optional[int]], List[int]]] = None,  # 自定义嵌入层rank分配函数
    get_position_embedding_ranks: Optional[Callable[[List[int], Optional[int]], List[int]]] = None,  # 自定义位置嵌入rank分配函数
) -> None:
    """初始化模型数据并行组，构建多种并行策略的进程组"""
    # 设置默认的嵌入层和位置嵌入层rank分配函数
    if get_embedding_ranks is None:
        get_embedding_ranks = partial(default_embedding_ranks, split_rank=pipeline_model_parallel_split_rank)

    if get_position_embedding_ranks is None:
        get_position_embedding_ranks = partial(default_position_embedding_ranks, split_rank=pipeline_model_parallel_split_rank)
    # 处理编码器专用管道并行设置
    if encoder_pipeline_model_parallel_size is not None:
        global _PIPELINE_MODEL_PARALLEL_DECODER_START
        _PIPELINE_MODEL_PARALLEL_DECODER_START = encoder_pipeline_model_parallel_size
    # 检查分布式环境是否已初始化
    assert torch.distributed.is_initialized()
    world_size: int = torch.distributed.get_world_size()
    # 验证总GPU数能被各并行尺寸整除
    if (world_size % (tensor_model_parallel_size * pipeline_model_parallel_size * context_parallel_size) != 0):
        raise RuntimeError(f"world_size必须能被各并行尺寸乘积整除")
    # 计算数据并行尺寸
    data_parallel_size: int = world_size // (
        tensor_model_parallel_size * pipeline_model_parallel_size * context_parallel_size
    )
    # 验证专家并行尺寸有效性
    if data_parallel_size % expert_model_parallel_size != 0:
        raise RuntimeError(f"data_parallel_size必须能被expert_model_parallel_size整除")
    # 处理虚拟管道并行相关设置
    if virtual_pipeline_model_parallel_size is not None:
        if not pipeline_model_parallel_size > 1:
            raise RuntimeError("使用虚拟管道并行时管道尺寸必须大于1")
        # 设置全局虚拟管道并行状态
        global _VIRTUAL_PIPELINE_MODEL_PARALLEL_RANK, _VIRTUAL_PIPELINE_MODEL_PARALLEL_WORLD_SIZE
        _VIRTUAL_PIPELINE_MODEL_PARALLEL_RANK = 0
        _VIRTUAL_PIPELINE_MODEL_PARALLEL_WORLD_SIZE = virtual_pipeline_model_parallel_size
    # 处理弃用的管道分割参数
    if pipeline_model_parallel_split_rank is not None:
        global _PIPELINE_MODEL_PARALLEL_SPLIT_RANK
        _PIPELINE_MODEL_PARALLEL_SPLIT_RANK = pipeline_model_parallel_split_rank
    # 获取当前进程rank
    rank = torch.distributed.get_rank()
    # 加载NCCL通信配置
    nccl_comm_cfgs = {}
    if nccl_communicator_config_path is not None:
        with open(nccl_communicator_config_path, "r") as stream:
            nccl_comm_cfgs = yaml.safe_load(stream)
    # 初始化rank生成器（核心逻辑）
    rank_generator = RankGenerator(
        tp=tensor_model_parallel_size,
        ep=expert_model_parallel_size,
        dp=data_parallel_size,
        pp=pipeline_model_parallel_size,
        cp=context_parallel_size,
        order=order,  # 指定并行维度组合顺序
    )
    timeout = timedelta(minutes=distributed_timeout_minutes)
    # 构建数据并行组 ======================================================
    global _DATA_PARALLEL_GROUP, _DATA_PARALLEL_GROUP_GLOO, _DATA_PARALLEL_GLOBAL_RANKS
    assert _DATA_PARALLEL_GROUP is None, '数据并行组已初始化'

    # 生成所有数据并行组的rank列表
    for ranks in rank_generator.get_ranks('dp'):
        # 创建NCCL通信组和备用Gloo组
        group = torch.distributed.new_group(ranks, timeout=timeout, pg_options=get_nccl_options('dp', nccl_comm_cfgs))
        group_gloo = torch.distributed.new_group(ranks, timeout=timeout, backend="gloo")
        if rank in ranks:
            _DATA_PARALLEL_GROUP = group
            _DATA_PARALLEL_GROUP_GLOO = group_gloo
            _DATA_PARALLEL_GLOBAL_RANKS = ranks
    # 构建包含上下文并行的数据并行组
    for ranks_with_cp in rank_generator.get_ranks('dp-cp'):
        group_with_cp = torch.distributed.new_group(
            ranks_with_cp, timeout=timeout, pg_options=get_nccl_options('dp_cp', nccl_comm_cfgs)
        )
        if rank in ranks_with_cp:
            _DATA_PARALLEL_GROUP_WITH_CP = group_with_cp
    # 应用SHARP通信优化
    if use_sharp:
        # 使用SHARP需要同步数据并行组并设置环境变量
        torch.distributed.barrier(group=get_data_parallel_group(with_context_parallel=True))
        os.environ["NCCL_COLLNET_ENABLE"] = "0"  # 限制SHARP仅用于DP组
    # 构建上下文并行组 ====================================================
    global _CONTEXT_PARALLEL_GROUP
    for ranks in rank_generator.get_ranks('cp'):
        group = torch.distributed.new_group(ranks, timeout=timeout, pg_options=get_nccl_options('cp', nccl_comm_cfgs))
        if rank in ranks:
            _CONTEXT_PARALLEL_GROUP = group
    # 构建模型并行组（张量+管道）==========================================
    global _MODEL_PARALLEL_GROUP
    for ranks in rank_generator.get_ranks('tp-pp'):
        group = torch.distributed.new_group(ranks, timeout=timeout, pg_options=get_nccl_options('mp', nccl_comm_cfgs))
        if rank in ranks:
            _MODEL_PARALLEL_GROUP = group
    # 构建专家模型并行相关组 ==============================================
    global _MODEL_AND_EXPERT_PARALLEL_GROUP
    for ranks in rank_generator.get_ranks('tp-ep-pp', independent_ep=True):
        group = torch.distributed.new_group(ranks, pg_options=get_nccl_options('mp_exp', nccl_comm_cfgs))
        if rank in ranks:
            _MODEL_AND_EXPERT_PARALLEL_GROUP = group
    # 构建张量模型并行组 ==================================================
    global _TENSOR_MODEL_PARALLEL_GROUP
    for ranks in rank_generator.get_ranks('tp'):
        group = torch.distributed.new_group(ranks, timeout=timeout, pg_options=get_nccl_options('tp', nccl_comm_cfgs))
        if rank in ranks:
            _TENSOR_MODEL_PARALLEL_GROUP = group
    # 构建管道模型并行组及嵌入组 ==========================================
    global _PIPELINE_MODEL_PARALLEL_GROUP, _EMBEDDING_GROUP
    for ranks in rank_generator.get_ranks('pp'):
        # 管道组
        group = torch.distributed.new_group(ranks, timeout=timeout, pg_options=get_nccl_options('pp', nccl_comm_cfgs))
        if rank in ranks:
            _PIPELINE_MODEL_PARALLEL_GROUP = group

        # 嵌入组（自定义或默认）
        embedding_ranks = get_embedding_ranks(ranks)
        group = torch.distributed.new_group(embedding_ranks, pg_options=get_nccl_options('embd', nccl_comm_cfgs))
        if rank in embedding_ranks:
            _EMBEDDING_GROUP = group
        # 位置嵌入组
        position_embedding_ranks = get_position_embedding_ranks(ranks)
        group = torch.distributed.new_group(position_embedding_ranks, pg_options=get_nccl_options('embd', nccl_comm_cfgs))
        if rank in position_embedding_ranks:
            _POSITION_EMBEDDING_GROUP = group
    # 构建混合并行组（张量+数据）==========================================
    global _TENSOR_AND_DATA_PARALLEL_GROUP
    for ranks in rank_generator.get_ranks('tp-dp'):
        group = torch.distributed.new_group(ranks, pg_options=get_nccl_options('tp_dp', nccl_comm_cfgs))
        if rank in ranks:
            _TENSOR_AND_DATA_PARALLEL_GROUP = group
    # 初始化全局内存缓冲区 ================================================
    _set_global_memory_buffer()

#### **示例：16 个 GPU 的进程组分配**

假设有以下配置：

  * **总 GPU 数量 (world_size)** : 16（g0 到 g15）

  * **张量并行大小 (tp_size)** : 2

  * **管道并行大小 (pp_size)** : 4

  * **数据并行大小 (dp_size)** : 2

  * **并行顺序** : `"tp-dp-pp"`（张量并行 → 数据并行 → 管道并行）

### 4\. 进程组生成核心逻辑 **RankGenerator**

`RankGenerator`类的核心功能是根据给定的并行策略（如张量并行 TP、数据并行 DP 等）和优先级顺序（`order`），生成分布式训练中不同并行维度的**进程组（rank groups）** 。以下从**初始化逻辑** 和**进程组生成逻辑** 两部分详细解释其工作原理。

#### **一、初始化逻辑 (`__init__`** **方法)**

**1\. 输入参数**


    
    def __init__(self, tp: int, ep: int, dp: int, pp: int, cp: int, order: str) -> None:
    # 参数说明：
    - tp: 张量并行 (Tensor Parallelism) 的组数
    - ep: 专家并行 (Expert Parallelism) 的组数（用于 MoE 模型）
    - dp
    : 数据并行 (Data Parallelism) 的组数
    - pp: 流水线并行 (Pipeline Parallelism) 的组数
    - cp: 上下文并行 (Context Parallelism) 的组数
    - order: 并行维度的优先级顺序（如 "tp-cp-ep-dp-pp"）

**2\. 关键步骤**

**(1) 校验 EP 与 DP 的依赖关系**


    
    if 'ep' in order:
    if 'ep-dp' not in order and 'dp-ep' not in order:
        raise RuntimeError("EP 和 DP 必须在 order 中相邻")

  * **目的** ：确保专家并行 (EP) 与数据并行 (DP) 在优先级顺序中相邻，因为它们之间存在依赖关系（EP 通常与 DP 结合使用）。

**(2) 检查未使用的并行维度**


    
    for name in self.name_to_size.keys():
    if name not in order and self.name_to_size[name] != 1:
        raise RuntimeError(f"并行维度 {name} 的 size 不为 1，但未在 order 中指定")
    elif name not in order:
        order = order + '-' + name

  * **目的** ：若某个并行维度的 `size > 1` 但未在 `order` 中出现，则报错；若 `size = 1` 但未在 `order` 中出现，则自动追加到 `order` 末尾。

**(3) 构建调整后的 Order 和 Size**


    
    self.order_w_ep = order  # 包含 EP 的原始 order
self.order_wo_ep = '-'.join([token for token in order.split('-') if token != 'ep'])  # 去除 EP 的 order
# 根据是否包含 EP 调整 DP 的 size
for token in order.split('-'):
    if token == 'dp':
        self.ordered_size_w_ep.append(self.dp // self.ep)  # DP 的 size 调整为 dp//ep
        self.ordered_size_wo_ep.append(self.dp)
    elif token == 'ep':
        self.ordered_size_w_ep.append(self.ep)
    else:
        self.ordered_size_w_ep.append(self.name_to_size[token])
        self.ordered_size_wo_ep.append(self.name_to_size[token])

  * **关键点** ：当包含 EP 时，DP 的 size 会被调整为 `dp // ep`，因为 EP 会与 DP 共享部分并行维度。

#### **二、进程组生成逻辑 (`get_ranks`** **方法)**

**1\. 输入参数**


    
    def get_ranks(self, token, independent_ep=False):
    # 参数说明：
    - token: 需要生成的进程组类型（如 "tp-dp" 表示张量+数据并行组）
    - independent_ep: 是否将 EP 视为独立维度（默认 False，EP 与 DP 共享）

**2\. 核心步骤**

**(1) 选择 Order 和 Size**


    
    if independent_ep:
    parallel_size = self.ordered_size_w_ep  # 包含 EP 的调整后 size
    order = self.order_w_ep                 # 包含 EP 的原始 order
else:
    parallel_size = self.ordered_size_wo_ep # 不包含 EP 的 size
    order = self.order_wo_ep                # 去除 EP 的 order

  * **目的** ：根据 `independent_ep` 标志选择是否独立处理 EP。若为 `True`，DP 的 size 会被调整为 `dp // ep`。

**(2) 生成掩码 (Mask)**


    
    mask = self.get_mask(order, token)

  * **掩码作用** ：标记 `order` 中哪些维度需要包含在最终的进程组中。例如，若 `token="tp-dp"` 且 `order="tp-cp-ep-dp-pp"`，则掩码为 `[True, False, False, True, False]`，表示仅保留 TP 和 DP 维度。

**(3) 调用正交生成函数**


    
    ranks = generate_masked_orthogonal_rank_groups(self.world_size, parallel_size, mask)

  * **假设函数逻辑** ：根据 `parallel_size`（各维度的 size）和 `mask`（需保留的维度），生成全局 rank 的排列组合，形成正交的进程组。

**核心设计思想**

  1. **正交性** ：不同并行维度的进程组相互正交（如 TP 组与 DP 组的 rank 无重叠）。

  2. **灵活性** ：通过 `order` 参数指定并行维度的优先级，支持复杂的混合并行策略。

  3. **依赖处理** ：显式处理 EP 与 DP 的依赖关系，确保专家并行的正确分组。

### 模型构建过程（暂无并行细节的并行分析）

`[setup_model_and_optimizer](<https://zhida.zhihu.com/search?content_id=253083078&content_type=Article&match_order=1&q=setup_model_and_optimizer&zhida_source=entity>)`函数的作用是初始化模型和优化器，并为训练过程准备好相关的配置。是pretrain 主函数中的关键一部分，函数通过系列调用，会得到实例化好的model 以及配置好的 optimizer。用于后续训练与更新。

`setup_model_and_optimizer` 函数的主要步骤包括：

  1. **构建模型** ：根据提供的函数和类型创建模型，并处理并行化和混合精度。

  2. **配置优化器** ：根据参数创建优化器，并设置权重衰减和学习率缩放条件。

  3. **配置学习率调度器** ：根据训练步数和调度策略创建学习率调度器。

  4. **加载检查点** ：如果提供了检查点，则加载模型和优化器的状态。

  5. **返回结果** ：返回初始化好的模型、优化器和学习率调度器。
