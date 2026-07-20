# Freeze the Flame 博客

个人博客站点，基于 Markdown 构建静态页面，托管于 GitHub Pages。

**站点地址：[blog.freezetheflame.cc](https://blog.freezetheflame.cc)**

## 技术栈

- **构建**：Markdown → HTML（Node.js 脚本）
- **渲染**：[marked](https://marked.js.org/) + [KaTeX](https://katex.org/) 数学公式 + [highlight.js](https://highlightjs.org/) 代码高亮
- **部署**：GitHub Actions → GitHub Pages
- **交互**：Cloudflare Worker 驱动的博客 AI 聊天机器人（`worker/`）

## 目录结构

```
├── posts/                    # 博客文章（按日期分目录）
│   └── YYYY-MM-DD-slug/
│       ├── slug.md           # 源文件（Markdown）
│       └── index.html        # 构建产物
├── llm-wiki/                 # LLM 知识库（独立的 Wiki 页面）
├── assets/                   # 静态资源（CSS、图片等）
├── tools/                    # 辅助工具脚本
│   └── sync-llm-wiki.ps1
├── worker/                   # Cloudflare Worker（博客聊天机器人）
├── .github/
│   ├── scripts/
│   │   ├── convert-markdown.js    # Markdown → HTML 转换
│   │   ├── create-post.js         # 新建博文模板
│   │   ├── fix-escaped-newlines.py
│   │   └── update-posts-index.js  # 更新 posts/index.html
│   └── workflows/
│       ├── markdown-to-html.yml   # 自动构建 & 部署
│       └── deploy-chat-worker.yml # 部署聊天机器人
├── index.html                 # 首页
├── chatbot.html               # 聊天机器人页面
├── sitemap.html               # 站点地图
├── CNAME                      # 自定义域名
└── package.json
```

## 本地开发

```bash
# 安装依赖
npm install

# 将一篇 Markdown 转换为 HTML 后预览
npm run convert

# 新建一篇博文
npm run create-post

# 本地预览
npm start
```

## 写一篇新博客

```bash
# 方式一：使用脚本
npm run create-post

# 方式二：手动创建
mkdir -p posts/YYYY-MM-DD-slug
# 在目录下新建 slug.md 写入 Markdown 内容
# 运行 npm run convert 生成 HTML
```

### 文章 Frontmatter

```yaml
---
title: 文章标题
date: 2024-01-01
tags: [标签1, 标签2]
---
```

支持的 Frontmatter 字段：
- `title` — 标题（必填）
- `date` — 日期（必填）
- `tags` — 标签数组（可选，用于首页筛选）
- `description` — 摘要（可选）

## 自动部署

每次推送到 `main` 分支，GitHub Actions 会自动：
1. 运行 `npm run convert` 转换所有 Markdown
2. 更新 `posts/index.html`（全部文章索引）
3. 构建 `data.json`（首页用的文章数据）
4. 部署到 GitHub Pages

> 根目录的 `.nojekyll` 文件确保 GitHub Pages 不会用 Jekyll 处理这个仓库。

## License

MIT
