const fs = require('fs');
const path = require('path');
const marked = require('marked');
const hljs = require('highlight.js');

marked.setOptions({
  highlight(code, lang) {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    return hljs.highlight(code, { language }).value;
  },
  langPrefix: 'hljs language-',
});

function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!match) {
    return { frontmatter: {}, content };
  }

  const frontmatter = {};
  match[1].split('\n').forEach((line) => {
    const index = line.indexOf(':');
    if (index === -1) {
      return;
    }
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (key === 'tags') {
      frontmatter[key] = value
        .replace(/[\[\]]/g, '')
        .split(',')
        .map((tag) => tag.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    } else {
      frontmatter[key] = value.replace(/^['"]|['"]$/g, '');
    }
  });

  return {
    frontmatter,
    content: content.replace(match[0], ''),
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function relativePrefix(filePath) {
  const depth = path.relative('.', path.dirname(filePath)).split(path.sep).filter(Boolean).length;
  return depth === 0 ? '.' : Array(depth).fill('..').join('/');
}

function shouldProcessMarkdown(filePath) {
  const base = path.basename(filePath);
  if (base === 'index.md' || base === '.md' || /^post-\d+\.md$/.test(base)) {
    return false;
  }
  return filePath.split(path.sep)[0] === 'posts';
}

function findMarkdownFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) {
    return fileList;
  }

  fs.readdirSync(dir).forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      findMarkdownFiles(filePath, fileList);
    } else if (path.extname(file) === '.md' && shouldProcessMarkdown(filePath)) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

function createHtmlTemplate(filePath, title, content, tags = [], date = '') {
  const prefix = relativePrefix(filePath);
  const tagsHtml = tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
  const meta = [date ? `<span>${escapeHtml(date)}</span>` : '', tagsHtml].filter(Boolean).join('\n          ');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} | Freeze the Flame</title>
  <link rel="stylesheet" href="${prefix}/assets/site.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/styles/default.min.css">
</head>
<body>
  <div class="page">
    <header class="site-header">
      <a class="brand" href="${prefix}/index.html" aria-label="Freeze the Flame 首页">
        <span class="brand-mark">F</span>
        <span>Freeze the Flame</span>
      </a>
      <nav class="site-nav" aria-label="主导航">
        <a href="${prefix}/index.html">首页</a>
        <a href="${prefix}/posts/index.html">文章</a>
        <a href="${prefix}/llm-wiki/index.html">LLM Wiki</a>
        <a href="${prefix}/chatbot.html" class="bot-link">Blog Bot</a>
      </nav>
    </header>

    <main>
      <article class="panel article">
        <p class="eyebrow">${date ? escapeHtml(date) : 'POST'}</p>
        <h1>${escapeHtml(title)}</h1>
        <div class="post-meta">
          ${meta}
        </div>
        ${content}
        <div class="button-row">
          <a href="${prefix}/posts/index.html" class="button secondary">返回文章中心</a>
          <a href="${prefix}/chatbot.html" class="button primary">询问 Blog Bot</a>
        </div>
      </article>
    </main>
  </div>

  <script>
    window.BLOG_BOT_CONFIG = {
      endpoint: "https://blog-deepseek-bot.jwshen2344.workers.dev/chat",
      title: "Blog Bot",
      launcherText: "Bot"
    };
  </script>
  <script src="${prefix}/assets/chatbot-widget.js" defer></script>
</body>
</html>`;
}

function processMarkdownFile(filePath) {
  const markdownContent = fs.readFileSync(filePath, 'utf8');
  const { frontmatter, content } = parseFrontmatter(markdownContent);
  let title = frontmatter.title || path.basename(filePath, '.md');
  if (!frontmatter.title && content.startsWith('# ')) {
    title = content.split('\n')[0].slice(2).trim();
  }
  const htmlContent = marked.parse(content)
    // Wrap tables in scrollable containers for overflow handling
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, '</table></div>');
  const fullHtml = createHtmlTemplate(filePath, title, htmlContent, frontmatter.tags || [], frontmatter.date || '');
  fs.writeFileSync(filePath.replace(/\.md$/, '.html'), fullHtml);
  console.log(`Converted ${filePath}`);
}

findMarkdownFiles('posts').forEach(processMarkdownFile);
require('./update-posts-index.js');
console.log('Markdown to HTML conversion completed.');
