# Blog Bot 接入说明

这次扩展保留 GitHub Pages 的静态站点形态：`chatbot.html` 是纯静态页面，真正调用 DeepSeek 的逻辑放在 Cloudflare Worker 里。密钥通过 GitHub Actions 从 GitHub Secrets 写入 Worker，不会暴露给浏览器。

## 新增文件

- `chatbot.html`：博客里的聊天页面。
- `assets/chatbot.css`：聊天页面样式。
- `assets/chatbot.js`：前端交互、会话上下文和请求逻辑。
- `assets/chatbot-widget.js`：可嵌入到任意页面右下角的悬浮小 bot。
- `worker/deepseek-chat-worker.js`：DeepSeek API 代理、CORS、每日限额。
- `worker/package.json`：标记 Worker 目录使用 ESM 模块格式。
- `worker/wrangler.toml.example`：Cloudflare Worker 配置模板。
- `.github/workflows/deploy-chat-worker.yml`：用 GitHub Secrets 部署 Worker 的工作流。

## 需要配置的 Secrets

在 GitHub 仓库的 `Settings -> Secrets and variables -> Actions` 里新增：

- `DEEPSEEK_API_KEY`：DeepSeek API Key。
- `CLOUDFLARE_API_TOKEN`：有 Worker 和 KV 权限的 Cloudflare API Token。
- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare Account ID。

## 每日限额

Worker 默认按访问者 IP 每天限制 30 次。可以在 `worker/wrangler.toml.example` 里改：

```toml
USER_DAILY_LIMIT = "30"
```

限额计数存储在 Cloudflare KV，绑定名是 `CHATBOT_RATE_LIMIT`。创建 KV 后，把 `id` 填入 `worker/wrangler.toml.example`。

## 接入步骤

1. 在 Cloudflare 创建 Worker KV namespace。
2. 把 namespace id 写入 `worker/wrangler.toml.example`。
3. 在 GitHub Actions Secrets 配置 `DEEPSEEK_API_KEY`、`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`。
4. 手动运行 `Deploy Chat Worker` workflow。
5. 部署完成后，把 `chatbot.html` 里的 `endpoint` 改成你的 Worker 地址，例如：

```html
endpoint: "https://blog-deepseek-bot.your-name.workers.dev/chat"
```

如果想在每个博客页面右下角显示悬浮 bot，可以在全站模板或 HTML 末尾加入：

```html
<script>
  window.BLOG_BOT_CONFIG = {
    endpoint: "https://blog-deepseek-bot.your-name.workers.dev/chat",
    title: "Blog Bot",
    launcherText: "Bot"
  };
</script>
<script src="/assets/chatbot-widget.js" defer></script>
```

如果博客部署在 GitHub Pages 的项目子路径下，例如 `https://user.github.io/repo/`，把脚本路径改成：

```html
<script src="/repo/assets/chatbot-widget.js" defer></script>
```

## 模型

默认模型是 `deepseek-v4-flash`。如果后续需要切换模型，只改 `worker/wrangler.toml.example`：

```toml
DEEPSEEK_MODEL = "deepseek-v4-flash"
```

DeepSeek 官方 API 文档目前列出的 OpenAI 格式 base URL 是 `https://api.deepseek.com`，可用模型包含 `deepseek-v4-flash` 和 `deepseek-v4-pro`。旧模型名 `deepseek-chat`、`deepseek-reasoner` 官方标注为未来会弃用，并分别兼容到 `deepseek-v4-flash` 的非思考模式和思考模式。
