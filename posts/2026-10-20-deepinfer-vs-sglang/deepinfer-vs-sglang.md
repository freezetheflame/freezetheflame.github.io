---
title: "DeepInfer vs SGLang：源码级的系统边界比较"
date: "2026-10-20"
tags: ["AI Infra", "推理系统", "sglang", "deepseek", "源码分析"]
---

## 这份对比想解决什么问题

把 DeepInfer 和 SGLang 放在一起，最常见的两类结论都不太有用：一类是"DeepInfer 是 DeepSeek 官方的高性能框架，肯定更强"；另一类是"SGLang 生态大、功能全，肯定更成熟"。这两种说法都没回答一个更具体的问题——**两个仓库各自把系统边界划在哪里**。

我读到的一份技术报告（基于 2026-10-20 的两个 pinned revision：`deepinfer@774ce244`、`sglang@eae134d6`）给出的答案是：**两者都有模型加载、批调度、GPU KV 块管理和分布式执行；真正的差别是从"引擎"往外走之后，谁还提供完整服务。**

它的三条判断是：

1. DeepInfer 比"离线推理器"这个标签强得多——有 prompt/decode 专用引擎模式、内存感知调度、抢占，以及通过显式 sequence forking 复用已算前缀；
2. 但这不等于一个带自动前缀缓存和远程 KV 生命周期的在线服务；
3. SGLang 暴露的并行/分离面更宽（TP/PP/DP/CP/EP + PD + EPD），DeepInfer 聚焦 attention DP/CP 与 MoE EP/EPLB。

我按报告给的 commit 把关键源码拉下来对了一遍，结论基本成立，但也发现两处报告没提、以及一处措辞容易让人滑坡的地方。下面先给框架，再逐层看证据。

## 一、先立框架：三层边界

报告最有价值的地方是它拒绝用"功能有/无"做二元比较，而是分三层：

| 层 | 含义 | 典型能力 | 误读 |
|---|---|---|---|
| 引擎层 | 加载模型、调度 token、分配本地 KV | 批调度、chunked prefill、抢占、本地块管理 | 把"本地块分配器"当成"分布式 KV 存储" |
| 服务层 | 接请求、路由、编排 prefill/decode | HTTP 入口、路由、PD 传输、副本均衡 | 把"prefill-only 模式"当成"PD 分离已交付" |
| 集群层 | 并行组、跨实例搬运状态 | TP/PP/DP/CP/EP、KV 传输、故障处理 | 把"有通信组"当成"能线性扩展" |

报告的措辞也值得抄：`Included`（有实现 + 有公开接口）、`Engine-level`（引擎内有，但不构成完整服务）、`Not shipped / not established`（发布范围排除，或没找到受支持的通用实现）。**"not established" 与"不可能"是两件事**，这句话它反复强调了三次。

## 二、引擎层：DeepInfer 到底强在哪

DeepInfer 的 C++ 子系统不是"矩阵运算库"，而是**真正持有请求调度与块记账**。`csrc/engine/scheduler.hpp` 有 1329 行，几个细节很说明问题。

### 2.1 三种引擎模式，且模式之间有硬约束

```cpp
enum class EngineType : int {
    NORMAL = 0,     // process prompts & completions
    PROMPT = 1,     // only process prompts
    COMPLETION = 2, // only process completions
};
```

配套还有一条运行时检查：

```cpp
TORCH_CHECK(engine_type != EngineType::COMPLETION || stop_preempted_request,
    "COMPLETION engine cannot recompute preempted requests (no prefill channel); "
    "it must be deployed with stop_preempted_request=true");
```

这条约束比模式本身更有信息量：**COMPLETION 引擎没有 prefill 通道，所以被抢占的请求只能终止，不能重算**。也就是说，"prefill-only / decode-only"不是三个启动参数，而是一套会改变调度语义（抢占策略）的部署形态。报告说这是 "internal engine modes" 而非 "deployed serving roles"，从这条检查看是准确的。

### 2.2 调度器显式告诉 worker 要克隆什么

```cpp
SchedulerOutputs(..., const std::vector<int> &clone_states,
                 const std::vector<int> &clone_blocks,
                 const std::vector<int> &zero_states)
```

`clone_states` / `clone_blocks` 是成对的 (旧 id, 新 id)，`zero_states` 是另一类需要清零的 state。**"块记账"在这里是字面意义上的**：调度器算出这一轮要复制哪些块、清零哪些 state，worker 照着执行。这比"有个 KV allocator"具体得多。

### 2.3 sequence forking 是分支原语，不是共享前缀缓存

`fork_seq` 的签名：

```cpp
SequencePtr fork_seq(const SequencePtr &seq, py::object blocks,
                     std::string &&target_branch_id, py::object sampling_params,
                     py::object so_matcher, int sp_token,
                     int replace_last_token_id, int64_t seq_id, double arrival_time)
```

从实现能读出四个约束：

1. `TORCH_CHECK(seq->cache.num_tokens > 0, "Cannot fork a sequence without a computed prefix")` —— 只能从**已经算过**的前缀分叉；
2. 不支持 `prompt_logprobs`（缓存前缀不保留每个 prompt token 的 logprob）；
3. `blocks` 为 `none` 时继承父序列的 block_table，否则显式传入要复用的块；
4. 有 `target_branch_id`，结构化输出 matcher 用 `copy_without_status()` 复制，长度超限直接标 `FINISHED_LENGTH_CAPPED`。

**我的判断**：这套接口更像"树搜索 / 投机验证"的分支原语（带 branch id、可替换最后一个 token、可指定块），而不是"用户之间自动共享前缀"的缓存服务。报告里那句"explicit forking is not the same as a generalized, automatic radix-tree cache"是对的，而且可以再往前推一步：**fork 的语义是"同一个请求树内分支"，不是"跨用户复用"。**

### 2.4 其他在 README 里、报告没展开的

- **DSpark + confidence-scheduled verification**：`DEEPINFER_ENABLE_MTP_VARLEN=1`，`DEEPINFER_USE_NEXTN_DECODE` 控制最大 draft 长度（默认 5）；
- **SWA bounded replay**：只回放有界后缀来减少 decoder prefill 开销，`DEEPINFER_YOCO_PREFILL_TRUNCATION_MODE=compact`、`KEEP_TOKENS=140`；
- **batch-invariant + deterministic sampling**：`DEEPINFER_BATCH_INVARIANT=1`（仅 NVIDIA），确定性采样还要固定 `seq_seed` 并关掉变长 MTP；
- **内核栈**：FlashMLA、DeepGEMM、DeepEP、TileKernels、DeepSelect、TileLang kernels。

最后一条是理解"高性能"来源的关键，但报告刻意不谈算子级优化（它开头就声明排除算子优化与吞吐排名），这个边界划得挺干净。

## 三、KV 的三层责任：报告最好用的一张表

| 责任 | 问题 | DeepInfer | SGLang |
|---|---|---|---|
| 物理存储 | 这块 GPU 内存里放什么 | 块表 + GPU KV/state 布局，归调度器记账 | KV 池 + 分配/回收，归调度器 |
| 前缀复用 | 谁决定复用、复用给谁 | **显式 fork**（调用方指定块与分支） | **自动 radix 匹配**，与调度耦合 |
| 服务级放置 | 跨实例怎么放、怎么搬 | README 明确不含 KV cache system | HiCache（GPU→host→存储）+ PD 传输 |

这个三分法的价值在于：它能解释为什么"两个系统都有 prefix cache 代码"却完全不可比——**一个回答"同一请求树内能不能少算"，另一个回答"不同用户/不同实例之间能不能共享"。**

DeepInfer 的 README 写得很直白：

> Required for a complete inference service (not included in this release): A KV cache system / VE-Prefill-Decode disaggregation / Load balancing across data-parallel replicas.

注意括号里的补充："most required engine functionality is already implemented"。这句话是理解整个对比的钥匙：**它缺的是服务外壳，不是执行内核。**

## 四、并行维度：报告列了五个，源码里有六个

报告列的是 DP / CP / EP / TP / PP。源码 `deepinfer/config.py` 里实际暴露的是：

```python
data_parallel_size, context_parallel_size, expert_parallel_size, engram_parallel_size
...
self.model_parallel_size = self.context_parallel_size
self.world_size = max(self.model_parallel_size * self.data_parallel_size,
                      self.engram_parallel_size)
```

两件事被这份配置确认了：

1. **没有独立的 tensor-parallel 轴**——`model_parallel_size` 直接等于 `context_parallel_size`，报告那句"model-parallel group size is derived from CP"是字面成立的；
2. **多了一个 `engram_parallel_size`**，报告完全没提（`fork_seq` 里还有 `map_engram()` 和压缩 token 的概念）。我不清楚 Engram 在这个版本里具体承担什么，这点留作待查——但它至少说明"并行维度只有五个"这个说法是按报告范围裁剪过的。

这里也是整份报告最容易被滑坡的地方：**"没有独立 TP 配置"是配置层/文档层的结论，不等于实现里没有张量切分。** 既然 CP 承担了 model-parallel 的角色，那它内部大概率就是按张量维切 attention 的。写"DeepInfer 不支持张量并行"就错了。

## 五、服务层：SGLang 多出来的不是"几个 API"

| 能力 | 为什么它不是小事 |
|---|---|
| HTTP / OpenAI 兼容 / gRPC | 有入口才有"多租户、鉴权、流式、错误码"这一整层 |
| gateway / router | 副本选择、负载均衡、失败重试的落点 |
| radix 前缀缓存 | 自动匹配意味着"谁来复用"由系统决定，不靠调用方传 blocks |
| HiCache | 把 KV 从 GPU 扩展到 host / 外部存储，需要淘汰、预取、一致性 |
| PD 分离（Mooncake/NIXL） | 目标侧 KV 预留、传输、同步、失败处理、请求身份一致性 |
| EPD（多模态） | encoder 独立扩缩容，和纯文本 PD 不是一回事 |

报告对 PD 的定义我很认同：**PD 不是"两个进程"，而是"KV 在 prefill 结束后归谁、怎么被 decode 用上、坏了怎么办"。** 用这个标准看，DeepInfer 有 prefill-only/decode-only 两种引擎模式，但没有传输、没有目标侧预留、没有副本均衡——所以是 `Engine-level`，不是 `Included`。

## 六、这份报告的两个薄弱处（以及一个我觉得被低估的点）

**薄弱处 1：模型数 ≠ 端到端可用性。** 报告自己提醒了，但"SGLang 支持很多模型"仍然容易被读成"你的模型一定跑得通"。真正的判据是 model × 精度 × 并行度 × 后端 的组合，而不是注册表里有多少个类。

**薄弱处 2："更完整" ≠ "更快"。** 全文没有 benchmark，这是有意的（不同模型/硬件不可比）。但读者最容易在这里滑坡：服务层更完整只说明"能部署成服务"，不说明单请求延迟或吞吐更好。反过来说，DeepInfer 的很多能力（batch-invariant、确定性采样、SWA 有界回放）在 SGLang 里未必有等价实现——**这些差异是"能力集合不同"，不是"性能高低"。**

**被低估的点：确定性。** `DEEPINFER_BATCH_INVARIANT=1` 让模型结果与 batch 组成无关，配合固定 `seq_seed` 才得到可复现输出（且仅 NVIDIA）。这在推理系统里是个稀有能力——大多数框架的数值结果会随 batch 组成漂移。做评测、做对齐、做"同一 prompt 两次结果不同"的排查时，这一条比多一个 API 端点有用得多。

## 七、对我的两条实际意义

1. **Ascend 方向**：DeepInfer 官方支持 Huawei Ascend 950（以及 NVIDIA SM100）。这意味着它不只是一个"DeepSeek 模型实现"，而是一条**国产 NPU 上的参考执行路径**——attention DP/CP 和 MoE EP/EPLB 在 Ascend 上怎么落地，比在 NVIDIA 上有更多信息增量。
2. **单机统一内存（DGX Spark / RTX Spark 这类）**：报告 9.2 节说得对——在这种机器上，模型加载、KV 驻留、后端行为比多节点路由重要得多。层级缓存和 PD 传输在单机上"架构上有、收益有限"。不过要记住报告自己划的线：SGLang 文档里的 DGX Spark 支持是 **Linux**，不等于 Windows ARM64。

## 八、结论

- **两个仓库都有调度器和本地 KV 管理**，这不是区分点；
- 区分点在**服务边界**：DeepInfer 把"完整服务"（KV 系统、PD 分离、副本均衡）明确排除在公开版本之外，把力气花在单模型执行、调度语义、attention DP/CP 与 MoE EP 上；SGLang 把入口、缓存层级、PD/EPD 和路由一起交付；
- 做**端到端服务研究**，SGLang 是更完整的开源参照；做**DeepSeek 特有执行/调度/专家并行**，DeepInfer 更直接；
- 任何"谁更快"的结论都需要匹配模型、硬件、并行度、精度和工作负载的实验，源码结构给不出来。

最后留一句我认为最值得记住的话：**比较两个推理系统时，先问"这个能力归谁所有、在什么边界内有效"，再问"它有没有"。** 前者能解释设计取舍，后者只能产出功能清单。
