---
title: LLM 如何理解大型代码仓库：主流策略与技术选型指南
date: 2026-05-30
tags: [AI, 工程]
---

随着 AI coding agent 的成熟（Codex CLI 86k⭐、Claude Code、Aider 等），一个核心工程问题浮出水面：**大模型怎么"看懂"一个动辄几万行、几十万行的代码仓库？** 直接把整个 repo 塞进 context window 显然不现实。本文梳理了目前主流工具采用的六大策略，以及它们的组合方式。

---

## 总览

| 策略 | 核心思路 | 代表工具 |
|------|---------|---------|
| 向量嵌入 + 语义搜索 | 代码切片 → embedding → 向量库 → 语义检索 | Continue.dev, CocoIndex, Bloop |
| AST 符号提取 + 相关性排序 | tree-sitter 提取 def/ref，构建符号图排序 | Aider (repo map) |
| 混合搜索 | BM25 关键词 + 向量相似度 RRF 融合 | coco-search, Bloop |
| 仓库打包 | 整仓扁平化为单文件塞 prompt | Repomix, Gitingest |
| MCP 标准化接口 | 上述能力封装为 MCP server，agent 按需调用 | cocoindex-code, code-memory, rpg-encoder |
| 依赖图分析 | import/call graph 遍历定位相关文件 | 多为辅助手段 |

---

## 一、向量嵌入 + 语义搜索

这是目前最主流的方法。流程：

```
代码仓库 → 切片(chunk) → embedding 模型向量化 → 存入向量数据库
用户查询 → embedding → 向量相似度检索 → 返回相关代码片段 → 注入 prompt
```

### Chunk 策略：Naive vs AST 感知

**Naive 分块（Continue.dev 的 basicChunker）**：按 token 数机械切分，每 N 个 token 一刀。优点是简单，缺点是经常把函数拦腰截断。

**AST 感知分块（Continue.dev 的 codeChunker + CocoIndex）**：用 tree-sitter 解析 AST，在函数/类边界切分。对超大函数/类有一个精巧的折叠策略：

```
class AuthService {          ← 保留类签名
  login() { ... }            ← 小方法保留完整实现
  refreshToken() { ... }
  processBatch() { ... }     ← 超限！collapsed 为 processBatch() { ... }
  validateSession() { ... }  ← 继续删除末尾方法直到不超限
}
```

不是截断中间——而是从**最后一个方法开始折叠/删除**，保证前面的重要代码完整。

### 向量数据库选型

| 数据库 | 使用者 | 特点 |
|--------|--------|------|
| LanceDB | Continue.dev | 嵌入式列存，零配置 |
| Qdrant | Bloop | Rust 高性能 |
| pgvector | coco-search | 复用 PostgreSQL |
| SQLite + FAISS | 各种小工具 | 最轻量 |

---

## 二、AST 符号提取 + 相关性排序（Repo Map）

这是 Aider 的招牌策略，**完全不用 embedding**，纯靠代码结构推理。

流程：

```
1. tree-sitter 提取所有文件的定义(def)和引用(ref)
   例：auth.ts 定义了 login()，api.ts 引用了 login()
   
2. 构建符号关系图
   auth.ts ──定义──▶ login()
   api.ts  ──引用──▶ login()
   → auth.ts 与 api.ts 相关

3. 用户修改文件 A 时，把所有文件按与 A 的关联度排序
   
4. 在 token 预算内，输出排名最高的文件列表 + 关键符号
   → 生成 "repo map" 文本注入 prompt
```

**优点**：零 API 成本，纯 CPU，不需要 GPU。**缺点**：只能靠符号引用判断相关度，理解不了自然语言语义——你问"用户认证怎么做的"，它不知道 `authenticate()` 比 `login()` 更相关，除非符号名本身匹配。

核心实现就在 Aider 的 `repomap.py` 这一个文件中，不到 500 行。非常精巧。

---

## 三、混合搜索：关键词 + 语义

两种检索方式互补：

| | 关键词搜索（BM25/FT5） | 语义搜索（向量相似度） |
|---|---|---|
| 擅长 | 精确函数名、import 路径、字符串常量 | "用户鉴权逻辑在哪" "session 怎么管理的" |
| 盲区 | 不同命名但功能相同的代码 | import 链追踪 |

融合方式用 **RRF（Reciprocal Rank Fusion）**：两路各自打分，按倒数排名融合。coco-search 和 Bloop 都在用这个策略。

```
RRF_score(doc) = Σ 1/(k + rank_i(doc))

k=60 是常用常数，rank_i 是 doc 在第 i 路检索中的排名
```

---

## 四、仓库打包（Repo to Prompt）

简单粗暴：把整个仓库（或选定子集）生成一个带目录树的文本文件，一次性塞进 prompt。

```
Repomix 输出示例：
================
Repository: my-project
Directory structure:
  src/
    auth.ts
    api.ts
    utils.ts
================
File: src/auth.ts
```typescript
export function login() { ... }
```
================
File: src/api.ts
...
```

**代表工具**：Repomix（25k⭐）、Gitingest

**优缺点极端**：
- ✅ 零信息损失，LLM 看到完整上下文
- ❌ token 爆炸，中型仓库就扛不住
- 适合：小仓库、code review、提交前检查

---

## 五、MCP 标准化接口（最新趋势）

MCP（Model Context Protocol）本身不是策略，而是**交付模式**。2025-2026 年几乎每个新出的代码理解工具都提供 MCP server：

```
Agent 说："帮我找到用户认证相关的代码"
  → 调用 MCP tool: search_code("user authentication")
  → MCP server 返回相关代码片段（带路径、行号、相似度）
  → Agent 基于结果继续推理、编辑
```

支持 MCP 的 agent：Claude Code、Codex CLI、Cursor、OpenCode...

支持 MCP 的代码搜索工具：

| 工具 | ⭐ | 特点 |
|------|-----|------|
| cocoindex-code | 1,755 | AST 分块 + sentence-transformers 本地嵌入 + MCP/Skill 双模式 |
| autodev-codebase | 117 | 向量嵌入 + Ollama 全本地 + MCP |
| code-memory | 41 | 本地向量搜索 + Git 历史 + MCP |
| rpg-encoder | 28 | Rust + tree-sitter + 15 语言 + 28 tool + MCP |
| Argyph | 16 | 零配置全本地 MCP server |

---

## 六、补充技巧

**增量索引**：不每次全量重建，用文件 mtime 做缓存失效标记，只重索引修改过的文件。Aider 用 diskcache，CocoIndex 用后台 daemon 自动 watch 文件变化。

**语言检测**：根据文件扩展名 + 内容嗅探自动选择 tree-sitter parser，覆盖 30+ 语言。

**本地优先**：Ollama + sentence-transformers 做全本地 embedding，零 API 调用成本。CocoIndex 的 `full` 版本内置了 Snowflake arctic-embed-xs 模型。

**后台 daemon**：索引服务常驻，embedding 模型只加载一次，跨 session 保持温热。CocoIndex 和 Kestr 都用了这个模式。

---

## 选型指南

```
你的场景                            推荐策略
─────────────────────────────────────────────────
小仓库（<1万行）                    直接 Repomix 打包
中型仓库 + 自然语言提问              向量嵌入 + 语义搜索
大型仓库 + 精确代码导航              AST 符号图（Aider repo map）
混合需求                            关键词 + 语义混合（coco-search）
已有 AI agent（Claude/Codex）       任意 MCP 工具接入
全离线 / 隐私敏感                    Ollama 本地嵌入（CocoIndex full）
```

---

## 结语

这些策略不是互斥的。成熟的工具通常会组合 2-3 种——比如 Bloop 同时用了 Tantivy FTS + Qdrant 向量 + tree-sitter 符号提取。

回到这个博客一直在关注的方向——用测试方法论去修 vibe-coded 的仓库——理解这些代码库理解策略很关键。如果一个 AI agent 连仓库里有什么都看不清，那它写的测试再好也是盲人摸象。下一篇文章计划挑一个实际的 vibe repo，用 CocoIndex + Aider 的组合跑一遍诊断流程，看看效果如何。
