# 自动 Markdown 转 HTML 功能说明

> **注意**: 这个功能需要 Node.js 环境。如果你没有安装 Node.js，可以使用 GitHub Actions 自动完成转换。

## 功能概述

本项目集成了 GitHub Actions，可以自动将 Markdown 文件转换为带有样式的 HTML 页面。只需在指定目录下编写 Markdown 文件，系统会自动将其转换为美观的 HTML 页面。

## 支持的目录

以下目录中的 Markdown 文件会被自动转换：

1. `live_note/` - 学习笔记目录
2. `blog_space/` - 博客文章目录
3. `inside_blog/` - 内部博客目录

## 使用方法

### 1. 创建 Markdown 文件

在上述支持的目录中创建 `.md` 文件，例如：

```markdown
# 我的第一篇博客

这是我的博客内容。

## 小标题

- 列表项1
- 列表项2

```javascript
console.log('Hello World');
```

[链接文本](https://example.com)
```

### 2. 提交并推送

将 Markdown 文件提交并推送到 GitHub：

```bash
git add .
git commit -m "Add new blog post"
git push origin main
```

### 3. 自动转换

GitHub Actions 会自动运行，将 Markdown 文件转换为 HTML 文件，并应用统一的样式。

你也可以在本地使用以下命令手动转换：

```bash
npm run convert
```

这将自动更新文章索引页面。

## 样式说明

转换后的 HTML 文件将包含以下样式：

- 响应式设计
- 代码高亮显示
- 统一的导航栏
- 美观的排版和间距
- 与网站其他页面一致的设计风格

## 自定义样式

如果需要为特定页面添加自定义样式，可以在 Markdown 文件的同目录下创建同名的 `.css` 文件，系统会自动引入。

例如：
- Markdown 文件：`my-post.md`
- 自定义样式：`my-post.css`

## 注意事项

1. Markdown 文件的第一行如果是 `# 标题` 格式，将被用作 HTML 页面的标题
2. 转换后的 HTML 文件与 Markdown 文件同名，但扩展名为 `.html`
3. 不要手动修改自动生成的 HTML 文件，因为它们会在下次转换时被覆盖
4. 如需修改模板样式，请修改 `.github/scripts/convert-markdown.js` 中的模板代码