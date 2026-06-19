---
title: "B端企业入驻订单聚合系统：从设计到优化的完整复盘"
date: 2026-06-19
tags: [fullstack, 系统设计, FastAPI, PostgreSQL, React, 性能优化]
---

## 项目背景

这是一个 B 端企业入驻管理的 Demo 项目——核心场景是：**企业方提交入驻申请表单（商户信息/房源/商品/报表），运营方根据地理位置批量聚合处理，并统计提交成功率**。

项目的诉求很清晰：不追求华丽的 UI/UX，而是**保障数据准确性 + 处理效率**，这是 B 端系统和 C 端产品最本质的差异。

<!--more-->

## 一、设计出发点：先理解矛盾

拿到需求后，我花时间思考的不是「怎么做」，而是 **「这个系统的本质矛盾是什么」**。

10w+ 表单数据的核心矛盾是：

> **数据量（10w+）和数据质量（准确性）之间的矛盾，必须用效率来填补。**

如果只有 100 条表单，逐条查看也能应付。但 10w+ 意味着：
- 运营人员不可能逐条浏览 → 必须批量聚合
- 人工找地理位置分布不现实 → 必须自动聚类
- 出错了难排查 → 必须埋点 + 统计

所以所有的设计决策都围绕一个主线：**「一个运营人员在 10w+ 数据面前最需要什么」**。

## 二、关键设计决策

### 1. 为什么选地理聚合作为核心能力？

企业入驻天然带地理属性——商户地址、房源位置、服务覆盖范围。**地理是 B 端数据最有业务价值的聚合维度**，远优于按时间或按分类聚合：

- 同一商圈的商户可以统一处理、统一派单
- 附近的房源可以批量审批
- 甚至按区域分配给不同的审核团队

因此我做了 **两阶段聚合**（Geohash 粗分桶 → 距离细聚类），这不是在炫技：

```
阶段1: Geohash 将平面空间切分为 32×32 的网格 → O(n) 分桶
阶段2: 每个桶内做距离计算（<500m 视为同一簇） → O(n/m) 细聚类
```

Geohash 把 O(n²) 的全表聚类问题先降维到 O(n) 的子问题，这是 10w+ 数据量下的必要优化，不只是锦上添花。

### 2. 四类表单为什么不各自独立路由？

题目给了「商户信息/房源/商品/报表」四类表单。如果做四个独立 CRUD 路由，代码会大量重复（每个都写一遍分页、排序、过滤），而且扩展性差——加一个新表单类型就要加整套路由。

所以我用了 **单路由多模型** 的设计：

```python
# 同一个 /api/v1/forms/{form_type} 路径
MODEL_MAP = {
    "merchant": MerchantForm,
    "listing": ListingForm,
    "product": ProductForm,
    "report": ReportForm,
}

async def query_forms(form_type: str, filters: FormFilter, db):
    model = MODEL_MAP.get(form_type)
    query = select(model)
    if filters.status:
        query = query.where(model.status == filters.status)
    # ... 统一的分页、排序、过滤逻辑
```

这个设计在初期非常高效——四类表单共享一套查询逻辑。但这是有 trade-off 的：如果未来某个表单类型的查询逻辑差异极大（比如报表需要按 JSON 字段过滤），这个统一层就会崩，那时就该拆分了。

### 3. FastAPI 而非 Flask 的选择

不是因为 FastAPI 更「潮」，而是有实际的理由：

- **WebSocket 原生支持**：批处理需要实时推送进度，FastAPI（基于 Starlette）内置 WebSocket，Flask 需要额外搭 Flask-SocketIO
- **Async ORM**：SQLAlchemy 2.0 async session 可以在同一个事件循环里处理 DB 查询和 WebSocket 推送，不需要开额外的线程池
- **Pydantic 集成**：FastAPI + Pydantic v2 的验证层对表单数据的强校验场景特别契合——B 端每个字段都不能错

### 4. 成功率统计：为什么单独建一张表？

这个问题看起来很简单，但值得多想一步：**为什么不用表单自身的 status 字段来算成功率？**

因为表单的 `status` 是「当前状态」（draft/submitted/approved/rejected），不代表「提交这个动作是否成功」。提交动作可能成功但后续审核驳回——这被算作「成功提交」但「审核未通过」，是完全不同的两个维度。

所以我单独建了 `submission_logs` 表，记录的是 **事件** 而非 **状态**：

```sql
submission_logs:
  - form_type    # 哪类表单
  - status       # start / success / fail / timeout
  - duration_ms  # 耗时
  - error_code   # 错误码（用于聚合）
  - error_msg    # 错误信息（用于 debug）
  - batch_id     # 关联批处理批次
```

这样就能回答一个关键的运营问题：**「高峰期提交成功率有没有下降？」** 如果某个小时成功率骤降，那就是后端需要扩容的信号。

### 5. 前端缓存策略：为什么手写 LRU 而不是用 React Query？

React Query 确实装了，但我在表单列表页选择了手写一个 `Map<string, CacheEntry>` 做 LRU 缓存，原因：

- **四维缓存 key**：分页缓存需要 `{form_type} : {page} : {keyword} : {status}` 组合，React Query 的 queryKey 管理起来非常别扭
- **缓存上限透明**：最多 50 个分页，超了就删最早的——运营人员翻页通常只有固定几个模式，50 个 cache entry 足够覆盖
- **HTTP Cache-Control 兜底**：加上了 `max-age=30` 的 header，浏览器本身也会缓存响应

```typescript
const formCache = new Map<string, { data: FormRow[]; total: number }>();

// set
formCache.set(cacheKey, { data, total });
if (formCache.size > 50) {
  const firstKey = formCache.keys().next().value;
  if (firstKey) formCache.delete(firstKey);  // LRU eviction
}
```

这不意味着 React Query 不好——统计页面（analytics）只用拉一次数据，确实更适合用 React Query。

## 三、遇到的真实 Bug（按严重程度排序）

### Bug 1: SQLAlchemy 笛卡尔积（最严重）

这是调试时间最长的 bug。我最初写了一个看似合理的聚合查询：

```python
base = select(SubmissionLog).where(
    SubmissionLog.created_at.between(start, end),
)
count_q = select(
    func.count(),
    func.sum(case((SubmissionLog.status == "success", 1), else_=0)),
).select_from(base.subquery())

row = (await db.execute(count_q)).one()
```

SQLAlchemy 生成的 SQL 是：

```sql
SELECT count(*), sum(CASE WHEN ...)
FROM (
    SELECT ... FROM submission_logs WHERE created_at BETWEEN ...
) AS anon_1,
submission_logs     -- ← 注意这里！
```

注意最后的 `, submission_logs`——**这是笛卡尔积**。原因是 `count_q` 里的 `case((SubmissionLog.status == "success", 1))` 引用了外层 `SubmissionLog` 表，SQLAlchemy 自动把它 join 了进来，但没加任何 join 条件。50k × 50k = 2.5B 中间行。

**教训**：不要在 `subquery()` 内外同时引用同一个 ORM 模型。解决方案是直接用 raw SQL 或改为不套子查询的写法。

### Bug 2: TypeScript 没拦住的 useState bug

```tsx
const [rows] = useState<FormRow[]>([]);
//     ^ 缺少 setRows
```

解构赋值只取了 state，没取 setter，所以 `fetchForms` 函数里写的是：

```typescript
// Update rows/total with data  ← 注释是真的，代码根本没写
```

这种 bug TypeScript 的类型系统也拦不住——`useState` 返回的 tuple 两个元素都是合法的，类型检查不会报错。最后的修复是加上：

```typescript
const [rows, setRows] = useState<FormRow[]>([]);
```

### Bug 3: PostgreSQL raw SQL 参数类型推断

```sql
AND (:ft IS NULL OR form_type = :ft)
```

当 `form_type` 传 `None` 时，PostgreSQL 无法推断 `$3` 的类型——是 text 还是 varchar？加 `::VARCHAR` 显式转换解决：

```sql
AND (:ft::VARCHAR IS NULL OR form_type = :ft)
```

### Bug 4: `--reload` 残留进程管理

`uvicorn --reload` 在代码变更时自动重启，但如果 kill 了父 shell，子进程（pid 不同）可能还占着端口。用 `ss -tlnp | grep 8000` 找到实际的 pid 再 kill 才是可靠的清理方式。

## 四、性能优化总结

| 优化项 | Before | After | 手法 |
|:-------|:-------|:------|:-----|
| 表单列表查询 | — | < 50ms | 分页 + 状态过滤 |
| 地理聚合 | 限 1000 条 | 10w+ 全量 | 解除 limit + Geohash 粗分桶 |
| 成功率统计 | 请求挂起（笛卡尔积） | < 100ms | 重写为 raw SQL |
| 前端渲染 | 无数据（bug） | 60fps 虚拟滚动 | react-window |
| 前端缓存 | 每次重新请求 | LRU 50 entry | Map 缓存 + Cache-Control |

## 五、如果有更多时间会做的优化

1. **Celery 异步批处理** — 当前 `/batch` 是同步的，10w+ 会超时，应该切到 Celery worker
2. **真正 DBSCAN 聚类** — 当前只是按 geohash 前缀分组，不是基于欧几里得距离的真正聚类
3. **认证鉴权** — 哪怕只是简单的 JWT，也能体现「权限和数据准确性」的核心价值
4. **Pydantic 校验层** — 把表单字段校验从 ORM 层提到 API schema 层
5. **Elasticsearch 全文检索** — 替代目前的 `LIKE '%keyword%'`，10w+ 文档时性能差距很大

## 六、项目地址

全部代码开源在 GitHub：**[github.com/freezetheflame/B-demo](https://github.com/freezetheflame/B-demo)**

技术栈：
- **Frontend**: Next.js 16 (React 19) + TypeScript + TailwindCSS + Zustand
- **Backend**: FastAPI + SQLAlchemy 2.0 + PostgreSQL/PostGIS + Redis
- **Infra**: Docker Compose
- **GIS**: Geohash + PostGIS GIST Index

欢迎讨论任何细节。
