---
layout: post
title: "Serena: 给你的 AI Coding Agent 装上 IDE 大脑"
date: 2026-07-22 10:00:00 +0800
categories: [AI工具, 软件工程]
tags: [Serena, MCP, AI-coding, agent, LLM, 开源工具, Claude, Codex]
description: "Serena 是一个开源的 MCP Server，让 AI 编程助手获得语义级别的代码理解、检索和重构能力。安装试试，看它怎么把 Agent 的代码操作从‘文本瞎猜’变成‘符号级精准’。"
---

最近 [oraios/serena](https://github.com/oraios/serena) 在 GitHub 上火了——22k+ star，MIT 协议，才一年多就冲到了 AI 编码工具的前排。它的 slogan 很直接：**"the IDE for your agent"**。

我装了一个试了试，这篇写写它解决了什么问题、怎么工作的，以及实际体验如何。

## 问题：Agent 看代码，像盲人摸象

当前 AI Coding Agent（Claude Code、Codex CLI、Copilot 等）操作代码的方式基本是**文本层面的**——读文件内容、正则搜索替换、按行号编辑。这就像让你只有记事本、没有 IDE 来写代码：你只能全文 grep 找函数，数行号来定位，小心翼翼地拼字符来修改。

具体痛点：

- **找函数靠猜**：Agent 搜一个 symbol，可能从 grep 结果里拿到几十个匹配，但不知道哪个是定义、哪些是引用
- **跨文件重构靠运气**：重命名一个函数，Agent 得逐文件搜索-替换，容易漏掉或误伤同名文本
- **编辑不经语法树校验**：替换文本后可能语法错误，但 Agent 要到下一轮编译/运行才知道

**Serena 的核心思路**：通过 **Language Server Protocol (LSP)** 给 Agent 提供 IDE 级别的代码理解——符号查找、定义跳转、引用追踪、安全重命名。Agent 不再需要跟文本搏斗，而是直接在符号抽象层操作。

## 架构：MCP Server + LSP 后端

Serena 是作为 **MCP (Model Context Protocol) Server** 运行的，你可以把这个协议理解成"AI 界的 USB-C"——统一了 Agent 和外部工具的接口。任何支持 MCP 的客户端都可以接上 Serena。

```
┌─────────────────┐      MCP      ┌─────────────────────┐
│  Claude Code     │ ◄─────────► │                     │
│  Codex CLI       │              │   Serena MCP Server  │
│  Copilot CLI     │              │         │            │
│  Cursor/VSCode   │              │    ┌────┴────┐       │
│  OpenWebUI       │              │    │ LSP 后端 │       │
└─────────────────┘              │    └─────────┘       │
                                  └─────────────────────┘
```

两个后端可选：

1. **LSP 语言服务器（默认，免费）**：基于开源 Language Server，支持 40+ 语言。安装即用。
2. **Serena JetBrains Plugin（付费，有试用）**：利用 JetBrains IDE 的深度分析引擎，重构能力更强（移动符号/文件/目录、内联、传播删除等）。

### 支持的语言（LSP 后端）

Python、TypeScript、Java、Go、Rust、C/C++、C#、Ruby、Kotlin、Swift、Scala、PHP、Lua、Zig、Haskell、Julia……基本上你常用的都有。冷门语言比如 Ada、Lean 4、Solidity、HLSL 也在列表里。

## 核心能力

Serena 公开了 20+ 个 MCP 工具，我分三类来介绍。

### 1. 语义检索

| 工具 | 功能 |
|------|------|
| `find_symbol` | 全局搜索符号，区分定义/引用/声明 |
| `get_symbols_overview` | 获取文件的顶层符号概览（类似 IDE 的文件结构） |
| `find_referencing_symbols` | 查找所有引用某个符号的位置 |
| `find_implementations` | 查找接口/抽象类的实现 |
| `find_declaration` | 定位符号的定义/声明位置 |
| `get_diagnostics_for_file` | 获取文件的 LSP 诊断信息（错误/警告） |

### 2. 精准编辑

| 工具 | 功能 |
|------|------|
| `rename_symbol` | 安全重命名 symbol（LSP 重构，跨文件） |
| `replace_symbol_body` | 替换符号的完整定义体 |
| `insert_before/after_symbol` | 在符号定义前后插入内容 |
| `safe_delete_symbol` | 安全删除符号 |
| `replace_in_files` | 跨文件模式替换（支持预览和逐个选择） |
| `replace_content` | 文件内内容替换（支持正则） |

### 3. 工程辅助

| 工具 | 功能 |
|------|------|
| `onboarding` | 自动识别项目结构、构建命令、测试命令 |
| `write_memory` / `read_memory` | 持久化记忆，跨会话共享项目知识 |
| `find_file` / `list_dir` | 文件导航 |
| `execute_shell_command` | 执行 shell 命令 |
| `create_text_file` | 创建文件 |

## 实战体验

我拿 Serena 试了试这个博客仓库（JavaScript + HTML），跑了个简单的流程。

### 安装

```bash
pip install serena-agent
serena init
```

两分钟搞定。`serena init` 会在 `~/.serena/` 下生成配置。

### 创建一个项目

```bash
cd /root/my-project
serena project create --name my-project --language typescript .
```

这会创建一个 `.serena/project.yml`，Serena 就知道项目的根和语言了。

### 用 MCP 工具试一下

Serena 最自然的用法是作为 MCP Server 接入你的 AI 客户端。对于 Claude Code，配置 MCP 后，Agent 可以直接调用 `find_symbol` 来找代码：

```python
# Agent 的视角：从
result = grep("authentication_handler", recursive=True)
# 变成
symbol = find_symbol("authentication_handler")
```

前者返回的是文本行列表，后者返回的是精确的符号定义位置、引用列表、类型信息。

### 效果

我让 Claude Code 通过 Serena 对一个 React 组件做重命名，整个流程：

1. `find_symbol` 定位组件定义和所有引用
2. `rename_symbol` 一次调用完成全局重命名（包括 import/export、prop types、测试文件中的引用）
3. `get_diagnostics_for_file` 验证修改后没有语法错误

全程 3 个工具调用，零出错。如果是传统 grep+sed，可能需要 10+ 步而且容易漏。

## 评价与思考

### 优点

- **开源免费**：MIT 协议，安装简单
- **兼容性好**：MCP 是标准协议，能接几乎所有主流 AI 客户端
- **语言覆盖广**：40+ 语言，换项目不用换工具
- **符号级操作**：比文本操作更精准，token 消耗更少
- **Agent 视角独特**：项目主页上放的是 Agent 自己写的测评——让 Agent 给自己打分，挺有说服力

### 可以改进的地方

- **非代码文件的处理有限**：对于配置文件、文档等非结构化文本，符号级分析意义不大，还是需要传统工具
- **与已有的依赖管理冲突**：`pip install serena-agent` 可能会跟项目的依赖版本打架（我装的时候就有 pathspec、psutil 等版本冲突，不过不影响使用）
- **初次索引慢**：大项目首次建索引需要几分钟

### 和同类对比

- **BitFun（之前聊过的 Rust+Tauri Agent）**：是做完整 Agent 运行时的，Serena 专注做 MCP 工具层，定位互补
- **Sourcegraph Cody**：偏代码搜索和分析平台，Serena 是本地 LSP 方案，安装成本更低
- **Aider / Continue.dev**：这些都是 Agent 框架本身，Serena 可以作为它们的 MCP 工具增强
- **Hermes 自带的 codebase-understanding skill**：侧重阅读理解流程，Serena 更偏实时交互式的代码操作能力

## 总结

Serena 是我最近看到的 AI 编码工具里思路最清晰的一个——它没有试图重新发明 Agent，而是找准了一个很具体的痛点（Agent 对代码缺乏符号级理解），用成熟的 LSP 技术解决了它。对于经常用 Claude Code、Codex CLI 或 Copilot 的人来说，装上 Serena 等于给 Agent 补上了"IDE 感"，值得一试。

> 项目地址：https://github.com/oraios/serena
> 文档：https://oraios.github.io/serena

<!-- 文章结束 -->
