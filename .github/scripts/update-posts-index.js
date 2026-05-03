const fs = require('fs');
const path = require('path');

function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!match) {
    return {};
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
  return frontmatter;
}

function shouldIndexMarkdown(filePath) {
  const base = path.basename(filePath);
  return filePath.split(path.sep)[0] === 'posts'
    && base !== 'index.md'
    && base !== '.md'
    && !/^post-\d+\.md$/.test(base);
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
    } else if (path.extname(file) === '.md' && shouldIndexMarkdown(filePath)) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

function collectPost(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const frontmatter = parseFrontmatter(content);
  const title = frontmatter.title || path.basename(filePath, '.md');
  const date = frontmatter.date || path.dirname(filePath).match(/\d{4}-\d{2}-\d{2}/)?.[0] || '';
  const tags = frontmatter.tags || [];
  const htmlPath = filePath.replace(/\.md$/, '.html').replace(/\\/g, '/');
  return { title, date, tags, path: htmlPath };
}

function renderPostsIndex(posts) {
  const cards = posts.map((post) => {
    const tags = post.tags.map((tag) => `<span class="tag">${tag}</span>`).join('\n                ');
    const href = post.path.replace(/^posts\//, '');
    return `            <li class="post-card">
              <h3><a href="${href}">${post.title}</a></h3>
              <div class="post-meta">
                ${post.date ? `<span>${post.date}</span>` : ''}
                ${tags}
              </div>
            </li>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>文章 | Freeze the Flame</title>
  <link rel="stylesheet" href="../assets/site.css">
</head>
<body>
  <div class="page">
    <header class="site-header">
      <a class="brand" href="../index.html" aria-label="Freeze the Flame 首页">
        <span class="brand-mark">F</span>
        <span>Freeze the Flame</span>
      </a>
      <nav class="site-nav" aria-label="主导航">
        <a href="../index.html">首页</a>
        <a href="index.html" aria-current="page">文章</a>
        <a href="../llm-wiki/index.html">LLM Wiki</a>
        <a href="../chatbot.html" class="bot-link">Blog Bot</a>
      </nav>
    </header>

    <main>
      <section class="hero-small">
        <p class="eyebrow">POSTS / WRITING INDEX</p>
        <h1 class="page-title">文章中心</h1>
        <p class="page-copy">这里保留当前可正常访问的博客入口。旧的乱码样例和重复页面不会进入阅读导航。</p>
      </section>

      <section class="content-layout" aria-label="文章列表">
        <div class="panel content-main">
          <p class="section-kicker">AVAILABLE POSTS</p>
          <h2 class="section-title">可阅读文章</h2>
          <p class="section-intro">当前共 ${posts.length} 篇文章。</p>
          <ul class="post-grid">
${cards}
          </ul>
          <div class="button-row">
            <a href="../index.html" class="button secondary">返回首页</a>
            <a href="../chatbot.html" class="button primary">询问 Blog Bot</a>
          </div>
        </div>
        <aside class="panel side-panel" aria-label="文章侧栏">
          <section class="side-block">
            <h2>目录状态</h2>
            <p>文章中心只展示稳定可访问的内容。</p>
          </section>
        </aside>
      </section>
    </main>
  </div>
  <script>
    window.BLOG_BOT_CONFIG = {
      endpoint: "https://blog-deepseek-bot.jwshen2344.workers.dev/chat",
      title: "Blog Bot",
      launcherText: "Bot"
    };
  </script>
  <script src="../assets/chatbot-widget.js" defer></script>
</body>
</html>`;
}

const posts = findMarkdownFiles('posts')
  .map(collectPost)
  .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

fs.writeFileSync('posts/index.html', renderPostsIndex(posts));
console.log(`Updated posts index with ${posts.length} posts.`);
