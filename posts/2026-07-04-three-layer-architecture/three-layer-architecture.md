---
title: "无处不在的三层架构：从 Kubernetes Controller 到 OpenTelemetry Pipeline"
date: 2026-07-04
tags: [架构设计, Kubernetes, OpenTelemetry, 设计模式, 系统设计]
---

## 缘起

写每日日报的架构设计栏目时，发现一个有趣的现象——很多看似不相关的系统，核心架构都长一个样：**采集层 → 处理层 → 输出层**。Kubernetes 的 controller-runtime 如此，OpenTelemetry Collector 的 Pipeline 如此，连 vLLM 的调度器也跑不出这个框架。这篇就把它们放在一起比比看。

<!--more-->

---

## 案例一：Kubernetes Controller-Runtime

Kubebuilder 和 Operator SDK 的底层框架是 `controller-runtime`。它把一个 Operator 的核心逻辑拆成三层：

### 第一层：Informer（事件源）

```go
informer, _ := NewInformer(
    lw,                    // ListWatcher 接口
    &corev1.Pod{},         // 目标对象类型
    resyncPeriod,          // 周期性全量重同步
    ResourceEventHandler{  // 回调注册
        AddFunc:    func(obj interface{}) { /* enqueue */ },
        UpdateFunc: func(old, new interface{}) { /* enqueue */ },
        DeleteFunc: func(obj interface{}) { /* enqueue */ },
    },
)
```

Informer 通过 **List + Watch** 机制工作：只对 etcd 做一次全量 List，之后全部通过 Watch 增量推送。内部用 Delta FIFO 去重排序，防止事件风暴打崩 API Server。

**这层的职责 = 从外部数据源获取原始事件。**

### 第二层：WorkQueue（排队与去重）

```go
queue := workqueue.NewRateLimitingQueue(
    workqueue.DefaultControllerRateLimiter(),
)
// 同一个 key 多次入队只保留一个
queue.Add("default/mypod-xyz")
```

关键设计：**去重 + 限速**。同一对象的事件合并成一个 key（`namespace/name`），避免一个 Deployment 更新 30 个 Pod 时触发 30 次 reconciliation。令牌桶 + 指数退避的双重限速防止异常循环。

**这层的职责 = 对原始事件做缓冲、过滤、排序、流量控制。**

### 第三层：Reconciler（调和循环）

```go
func (r *MyReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    // 1. 从 cache 读取当前状态
    obj := &myv1.MyResource{}
    if err := r.Get(ctx, req.NamespacedName, obj); err != nil {
        return ctrl.Result{}, client.IgnoreNotFound(err)
    }
    // 2. 比较当前状态与期望状态
    // 3. 执行操作使其收敛
    // 4. 更新状态
    return ctrl.Result{RequeueAfter: 30 * time.Second}, nil
}
```

Reconciler 只做一件事：**拿到一个 key，保证系统实际状态向期望状态收敛**。它不关心事件怎么来的、有没有重复——那些是前两层的事。

**这层的职责 = 消费处理好的事件，产生外部效果。**

### 数据流

```
etcd ──▶  Informer  ──▶  WorkQueue  ──▶  Reconciler  ──▶ API Server
          (采集)          (缓冲/去重)         (业务逻辑)
```

---

## 案例二：OpenTelemetry Collector Pipeline

可观测性领域的事实标准 OpenTelemetry Collector，它的 Pipeline 设计也一样：

### 第一层：Receivers（采集入口）

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
  prometheus:
    config:
      scrape_configs:
        - job_name: 'my-app'
          static_configs:
            - targets: ['localhost:9464']
```

每个 Receiver 是一个独立的数据源适配器。外部协议千奇百怪（OTLP、Prometheus、Jaeger、K8s Events），Receiver 统一转化为内部的 **pdata**（pipeline data）模型。

**类比 Controller：** Informer 从 etcd 采集对象变更事件 → Receiver 从各种协议采集可观测性数据。

### 第二层：Processors（处理管道）

```yaml
processors:
  batch:           # 攒批优化
    timeout: 1s
    send_batch_size: 8192
  memory_limiter:  # 反压保护
    check_interval: 1s
    limit_mib: 512
  filter:          # 降采样控费
    metrics:
      include:
        match_type: regexp
        metric_names: ["http.*", "grpc.*"]
```

Processors 构成**有向无环图（DAG）**。每个 Processor 只做一件事：`batch` 攒批、`memory_limiter` 反压、`filter` 过滤。可以任意组合、替换顺序。

**类比 Controller：** WorkQueue 对事件做去重限速 → Processors 对观测数据做缓冲、过滤、采样。

### 第三层：Exporters（输出适配）

```yaml
exporters:
  prometheusremotewrite:
    endpoint: http://thanos-receive:19291
  otlp:
    endpoint: http://jaeger-collector:4317
```

Exporter 把统一内部数据模型重新序列化为目标后端格式。

**类比 Controller：** Reconciler 写入 API Server → Exporter 写入 Prometheus/Jaeger/其他后端。

### Pipeline 装配

```yaml
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp, logging]
    metrics:
      receivers: [otlp, prometheus]
      processors: [memory_limiter, filter, batch]
      exporters: [prometheusremotewrite]
```

灵活性体现在：同一份数据可以走不同的 pipeline 路径，不同数据类型（traces vs metrics）可以配不同的处理策略。

### 数据流

```
应用埋点 ──▶  Receiver  ──▶  Processor DAG  ──▶  Exporter  ──▶ 存储后端
            (采集/适配)      (缓冲/过滤/采样)       (输出)
```

---

## 这个三层结构为什么无处不在？

把两个案例放在一起看：

| 系统 | 采集层 | 处理层 | 输出层 |
|------|--------|--------|--------|
| K8s Controller | Informer（List+Watch） | WorkQueue（去重+限速） | Reconciler（调和） |
| OTel Collector | Receiver（协议适配） | Processors（DAG管道） | Exporter（后端适配） |
| vLLM Scheduler | BlockManager（内存感知） | Scheduler Policy（抢占决策） | CUDA Kernel（执行） |
| 流处理框架（Kafka Streams） | Source Connector | Stream Processor | Sink Connector |
| Web 后端（典型） | Controller（路由+参数解析） | Service（业务逻辑） | Repository（数据持久化） |

它们共享一个模式：

> **从外部获取原始数据 → 在管道内做变换/过滤/缓冲 → 产生外部效果**

每一层只关心一件事：
- **采集层**：对接外部、统一内部表示
- **处理层**：变换、过滤、缓冲、流量控制
- **输出层**：消费处理好的数据，产生副作用

### 为什么这层划分这么自然？

1. **关注点分离**：每层可以独立演进。K8s 里你想换事件源（从 etcd 换到某种 event-driven 架构），只改 Informer 那层就行，Reconciler 完全不用动。OTel 里你想加个新后端，写个 Exporter 就行。

2. **可测试性**：每一层都可以独立 mock 输入验证输出。写 Reconciler 单元测试不需要真的启动 Informer，直接塞 key 进去测。

3. **可观测性**：层与层之间的数据通道（K8s 的 WorkQueue、OTel 的 pipeline channel）是天然的 metrics 埋点位置——入队速率、队列深度、处理延迟，这些都是 SRE 最关心的信号。

4. **反压自然**：处理层是天然的流量调解器。当输出层变慢（比如 Reconciler 调用 API Server 被限流、Exporter 写入数据库超时），处理层可以通过背压让采集层降速。

### 这个模式的陷阱

当然不是所有系统都适合套三层架构。它有两个代价：

**1. 延迟增加**
数据每经过一层就有一次序列化/反序列化或上下文切换的开销。K8s Informer → WorkQueue 之间有一个 channel 的拷贝，OTel 的 pdata 在不同 Processor 之间传递也有内存拷贝。对延迟敏感的场景（比如实时广告 bidding），每层增加几十微秒是不可接受的。

**2. 调试复杂度**
三层架构的问题定位往往需要跨层追踪。K8s 里一个 Pod 创建事件走丢了——是 Informer 没收到？WorkQueue 丢掉了？还是 Reconciler 处理出错了？每个可能都排查一遍，心态容易崩。OTel 里 trace 丢了也有类似的"到底是在 Receiver 没收到、Processor 过滤掉了还是 Exporter 写失败了"的灵魂拷问。这也就是为什么 OTel 社区一直在推 **z-pages**（暴露每层的健康状态和指标）和 **E2E 的 trace 透传**。

---

## 更多例子

一旦你认出了这个模式，就会发现它到处都是：

**Linux 的网络栈**：NIC 硬件中断（采集）→ softirq + 协议栈处理（处理）→ socket 交付给应用（输出）

**LLM 推理引擎**：Tokenizer（采集）→ 模型推理（处理）→ Detokenizer（输出）

**数据库查询引擎**：Parser（采集 SQL）→ Optimizer（处理生成执行计划）→ Executor（输出结果）

这个模式如此普遍，以至于当你遇到一个不知道如何设计的系统时，先从三层拆分开始大概率不会错——**采集/事件源 → 变换/缓冲 → 输出/效果**，先搭好骨架再往里填肉。
