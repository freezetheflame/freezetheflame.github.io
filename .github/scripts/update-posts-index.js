const fs = require('fs');
const path = require('path');

// ── helpers ──────────────────────────────────────────────

function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!match) return {};
  const fm = {};
  match[1].split('\n').forEach((line) => {
    const idx = line.indexOf(':');
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key === 'tags') {
      fm[key] = value
        .replace(/[\[\]]/g, '')
        .split(',')
        .map((t) => t.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    } else {
      fm[key] = value.replace(/^['"]|['"]$/g, '');
    }
  });
  return fm;
}

function shouldIndex(filePath) {
  const base = path.basename(filePath);
  return filePath.split(path.sep)[0] === 'posts'
    && base !== 'index.md'
    && base !== '.md'
    && !/^post-\d+\.md$/.test(base);
}

function findMd(dir, list = []) {
  if (!fs.existsSync(dir)) return list;
  fs.readdirSync(dir).forEach((f) => {
    const fp = path.join(dir, f);
    if (fs.statSync(fp).isDirectory()) findMd(fp, list);
    else if (path.extname(f) === '.md' && shouldIndex(fp)) list.push(fp);
  });
  return list;
}

function collectPost(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fm = parseFrontmatter(content);
  const title = fm.title || path.basename(filePath, '.md');
  const date = fm.date || path.dirname(filePath).match(/\d{4}-\d{2}-\d{2}/)?.[0] || '';
  const tags = fm.tags || [];
  const htmlPath = filePath.replace(/\.md$/, '.html').replace(/\\/g, '/');
  return { title, date, tags, path: htmlPath };
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── data.json ────────────────────────────────────────────

function writeDataJson(posts) {
  const data = posts.map((p) => ({
    title: p.title,
    date: p.date,
    tags: p.tags,
    path: p.path.replace(/^posts\//, ''),
  }));
  fs.writeFileSync('posts/data.json', JSON.stringify(data));
  console.log(`Generated posts/data.json with ${data.length} posts.`);
}

// ── shared: tag cloud ────────────────────────────────────

function tagCount(posts) {
  const cnt = {};
  posts.forEach((p) => {
    p.tags.forEach((t) => { cnt[t] = (cnt[t] || 0) + 1; });
  });
  return cnt;
}

function buildTagCloud(posts) {
  const cnt = tagCount(posts);
  const maxCount = Math.max(...Object.values(cnt), 1);
  const sorted = Object.entries(cnt)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 30);
  return sorted.map(([tag, count]) => {
    const size = Math.round(13 + (count / maxCount) * 11);
    return `<span class="tag-link" data-tag="${esc(tag)}" style="font-size:${size}px">${esc(tag)} (${count})</span>`;
  }).join('\n              ');
}

// ── posts/index.html ─────────────────────────────────────

function renderPostsPage(posts) {
  const tagCloudHtml = buildTagCloud(posts);
  const cards = posts.map((p) => {
    const tags = p.tags.map((t) => `<span class="tag" data-tag="${esc(t)}">${esc(t)}</span>`).join('\n                ');
    const href = p.path.replace(/^posts\//, '');
    return `            <li class="post-card" data-tags="${esc(p.tags.join(','))}">
              <h3><a href="${href}">${esc(p.title)}</a></h3>
              <div class="post-meta">
                ${p.date ? `<span>${esc(p.date)}</span>` : ''}
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
        <p class="page-copy">浏览、搜索、按标签筛选所有文章。</p>
      </section>

      <section class="content-layout" aria-label="文章列表">
        <div class="panel content-main">
          <p class="section-kicker">AVAILABLE POSTS</p>
          <h2 class="section-title">可阅读文章</h2>
          <p class="section-intro">当前共 <strong id="postCount">${posts.length}</strong> 篇文章。</p>

          <div class="search-box">
            <label class="sr-only" for="searchInput">搜索文章</label>
            <input type="text" id="searchInput" placeholder="搜索文章标题或标签...">
          </div>

          <div class="active-filters" id="activeFilters" style="display:none"></div>

          <ul class="post-grid" id="postGrid">
${cards}
          </ul>
          <div class="button-row">
            <a href="../index.html" class="button secondary">返回首页</a>
            <a href="../chatbot.html" class="button primary">询问 Blog Bot</a>
          </div>
        </div>
        <aside class="panel side-panel" aria-label="文章侧栏">
          <section class="side-block">
            <h2>标签云</h2>
            <div class="tag-cloud" id="tagCloud">
              ${tagCloudHtml}
            </div>
          </section>
          <section class="side-block">
            <h2>目录状态</h2>
            <p>文章中心只展示稳定可访问的内容。共 ${posts.length} 篇文章，${Object.keys(tagCount(posts)).length} 个标签。</p>
          </section>
        </aside>
      </section>
    </main>
  </div>

  <script src="data.json?t=1"></script>
  <script>
    // search + tag filter
    (function() {
      var searchInput = document.getElementById('searchInput');
      var postGrid = document.getElementById('postGrid');
      var postCount = document.getElementById('postCount');
      var activeFilters = document.getElementById('activeFilters');
      var activeTag = null;
      var cards = Array.from(postGrid.querySelectorAll('.post-card'));

      function filter() {
        var term = searchInput.value.toLowerCase();
        var visible = 0;
        cards.forEach(function(card) {
          var tags = (card.dataset.tags || '').toLowerCase();
          var text = card.textContent.toLowerCase();
          var matchSearch = !term || text.includes(term);
          var matchTag = !activeTag || tags.split(',').includes(activeTag.toLowerCase());
          if (matchSearch && matchTag) {
            card.style.display = '';
            visible++;
          } else {
            card.style.display = 'none';
          }
        });
        postCount.textContent = visible;
        if (activeTag) {
          activeFilters.innerHTML = '筛选: <span class="tag active-filter-tag">' + activeTag + ' <button onclick="clearFilter()" style="cursor:pointer;background:none;border:none;margin-left:4px;">✕</button></span>';
          activeFilters.style.display = '';
        } else {
          activeFilters.style.display = 'none';
        }
      }

      window.clearFilter = function() {
        activeTag = null;
        filter();
      };

      searchInput.addEventListener('input', filter);

      // click tag (list or cloud) to filter
      document.addEventListener('click', function(e) {
        var tagEl = e.target.closest('.tag, .tag-link');
        if (!tagEl) return;
        e.preventDefault();
        activeTag = tagEl.dataset.tag;
        filter();
      });

      // read ?tag= from URL on page load
      (function() {
        var params = new URLSearchParams(window.location.search);
        var tagParam = params.get('tag');
        if (tagParam) {
          activeTag = tagParam;
          filter();
        }
      })();
    })();
  </script>
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

// ── index.html ───────────────────────────────────────────

function buildTagPills(posts) {
  const cnt = tagCount(posts);
  const sorted = Object.entries(cnt)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return sorted.map(([tag, count]) =>
    `<button class="tag-pill" data-tag="${esc(tag)}">${esc(tag)}<span class="tag-count">${count}</span></button>`
  ).join('\n          ');
}

function renderHomepage(posts) {
  // latest 15 posts
  const latest = posts.slice(0, 15);
  const postItems = latest.map((p) => {
    const tags = p.tags.map((t) => `<span class="post-tag">${esc(t)}</span>`).join('');
    const href = 'posts/' + p.path.replace(/^posts\//, '');
    return `          <li class="post-card" data-tags="${esc(p.tags.join(','))}">
            <h3 class="post-card-title"><a href="${href}">${esc(p.title)}</a></h3>
            <div class="post-card-meta">
              ${p.date ? `<span class="post-date">${esc(p.date)}</span>` : ''}
              <span class="post-card-tags">${tags}</span>
            </div>
          </li>`;
  }).join('\n');

  const tagPillsHtml = buildTagPills(posts);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Freeze the Flame | 我的博客</title>
  <style>
    /* ══════ Design Tokens ══════ */
    :root {
      --bg: #f7f5f0;
      --bg-panel: #fcfaf6;
      --bg-hover: #f0ede5;
      --bg-active: #e8e4da;
      --fg: #1c1917;
      --fg-muted: #78716c;
      --fg-dim: #a8a29e;
      --border: #e7e0d5;
      --border-strong: #d6cec0;
      --green: #2b725f;
      --green-dark: #185948;
      --blue: #315f9d;
      --clay: #b76545;
      --font-sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --font-mono: "JetBrains Mono", "Fira Code", ui-monospace, monospace;
      --sidebar-width: 270px;
      --radius-sm: 6px;
      --radius: 8px;
      --transition: 150ms ease;
    }

    * { box-sizing: border-box; margin: 0; }
    html { scroll-behavior: smooth; }

    body {
      display: grid;
      grid-template-columns: var(--sidebar-width) 1fr;
      min-height: 100vh;
      color: var(--fg);
      background: var(--bg);
      font-family: var(--font-sans);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }

    /* ══════ SIDEBAR ══════ */
    .sidebar {
      position: sticky;
      top: 0;
      height: 100vh;
      display: flex;
      flex-direction: column;
      background: var(--bg-panel);
      border-right: 1px solid var(--border);
      overflow: hidden;
      z-index: 10;
    }

    .sidebar-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 16px 16px 14px;
      text-decoration: none;
      color: var(--fg);
      font-weight: 700;
      font-size: 15px;
      letter-spacing: -0.01em;
    }

    .sidebar-brand-mark {
      width: 30px; height: 30px;
      display: grid; place-items: center;
      border-radius: 7px;
      background: var(--fg);
      color: #fff;
      font-size: 16px;
      line-height: 1;
    }

    .sidebar-nav {
      display: flex;
      flex-direction: column;
      padding: 0 8px 8px;
      border-bottom: 1px solid var(--border);
    }

    .sidebar-nav a {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 10px;
      border-radius: var(--radius-sm);
      color: var(--fg-muted);
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      transition: all var(--transition);
    }

    .sidebar-nav a:hover { background: var(--bg-hover); color: var(--fg); }
    .sidebar-nav a.active { background: var(--bg-active); color: var(--fg); font-weight: 600; }

    .sidebar-nav .nav-bot {
      margin-top: 4px;
      color: #fff;
      background: var(--green);
      border-radius: var(--radius-sm);
    }
    .sidebar-nav .nav-bot:hover { background: var(--green-dark); color: #fff; }

    .sidebar-search {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
    }

    .sidebar-search label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--fg-dim);
      margin-bottom: 6px;
    }

    .sidebar-search input {
      width: 100%;
      padding: 7px 10px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg);
      color: var(--fg);
      font-size: 13px;
      font-family: inherit;
      outline: none;
      transition: border-color var(--transition);
    }

    .sidebar-search input:focus { border-color: var(--border-strong); }

    .sidebar-tags {
      flex: 1;
      overflow-y: auto;
      padding: 12px 16px;
    }

    .sidebar-tags h4 {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--fg-dim);
      margin-bottom: 8px;
    }

    .tag-list {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }

    .tag-pill {
      padding: 3px 9px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: transparent;
      color: var(--fg-muted);
      font-size: 12px;
      font-family: inherit;
      cursor: pointer;
      transition: all var(--transition);
      white-space: nowrap;
    }

    .tag-pill:hover { background: var(--bg-hover); color: var(--fg); border-color: var(--border-strong); }
    .tag-pill.active { background: var(--green); color: #fff; border-color: var(--green); }

    .tag-count { margin-left: 4px; opacity: 0.6; font-size: 11px; }
    .tag-pill.active .tag-count { opacity: 0.9; }

    .sidebar-footer {
      padding: 10px 16px;
      border-top: 1px solid var(--border);
      font-size: 11px;
      color: var(--fg-dim);
    }

    /* ══════ MAIN ══════ */
    .main {
      padding: 32px 40px 56px;
      max-width: 820px;
      width: 100%;
    }

    .hero {
      margin-bottom: 36px;
    }

    .eyebrow {
      display: inline-block;
      margin-bottom: 10px;
      padding: 4px 10px;
      border: 1px solid rgba(43, 114, 95, 0.2);
      border-radius: 999px;
      color: var(--green-dark);
      font-size: 12px;
      font-weight: 800;
    }

    .hero h1 {
      font-size: clamp(34px, 5vw, 56px);
      font-weight: 750;
      line-height: 1.06;
      letter-spacing: -0.02em;
      color: var(--fg);
    }

    .hero h1 span { display: block; }

    .hero-copy {
      margin-top: 14px;
      color: var(--fg-muted);
      font-size: 17px;
      max-width: 600px;
    }

    .hero-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 22px;
    }

    .btn {
      min-height: 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-sm);
      padding: 0 16px;
      border: 1px solid transparent;
      text-decoration: none;
      font-size: 14px;
      font-weight: 650;
      transition: transform 120ms ease, box-shadow 120ms ease;
    }

    .btn:hover { transform: translateY(-1px); }
    .btn-primary { background: var(--green); color: #fff; box-shadow: 0 8px 20px rgba(43, 114, 95, 0.18); }
    .btn-primary:hover { background: var(--green-dark); }
    .btn-secondary { background: var(--bg-panel); border-color: var(--border); color: var(--fg); }

    /* ══════ Posts ══════ */
    .section-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 6px;
    }

    .section-header h2 {
      font-size: 20px;
      font-weight: 700;
      color: var(--fg);
    }

    .section-count {
      font-size: 13px;
      color: var(--fg-dim);
    }

    .active-filters {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 10px 0 16px;
      padding: 8px 14px;
      border-radius: var(--radius-sm);
      background: rgba(43, 114, 95, 0.06);
      font-size: 13px;
      color: var(--fg-muted);
    }

    .active-filter-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 10px;
      border-radius: 999px;
      background: rgba(43, 114, 95, 0.14);
      color: var(--green-dark);
      font-weight: 700;
    }

    .active-filter-clear {
      background: none; border: none;
      color: var(--clay); font-size: 15px; cursor: pointer;
    }

    .post-list {
      display: grid;
      gap: 0;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .post-card {
      padding: 15px 0;
      border-bottom: 1px solid var(--border);
      transition: padding var(--transition);
    }

    .post-card:last-child { border-bottom: none; }

    .post-card-title {
      margin: 0 0 5px;
      font-size: 17px;
      font-weight: 600;
      line-height: 1.3;
    }

    .post-card-title a {
      color: var(--fg);
      text-decoration: none;
      transition: color var(--transition);
    }

    .post-card-title a:hover { color: var(--green); }

    .post-card-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }

    .post-date { color: var(--fg-dim); font-size: 13px; }

    .post-card-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .post-tag {
      padding: 1px 7px;
      border-radius: 999px;
      background: rgba(49, 95, 157, 0.08);
      color: var(--blue);
      font-size: 11px;
      font-weight: 600;
    }

    .view-all {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 20px;
      color: var(--green);
      text-decoration: none;
      font-weight: 650;
      font-size: 14px;
      transition: gap var(--transition);
    }

    .view-all:hover { gap: 10px; }

    .sr-only {
      position: absolute; width: 1px; height: 1px;
      padding: 0; margin: -1px; overflow: hidden;
      clip: rect(0,0,0,0); white-space: nowrap; border: 0;
    }

    /* ══════ Responsive ══════ */
    @media (max-width: 800px) {
      body {
        grid-template-columns: 1fr;
      }
      .sidebar {
        position: relative;
        height: auto;
        border-right: none;
        border-bottom: 1px solid var(--border);
      }
      .sidebar-tags { max-height: 160px; }
      .main { padding: 24px 20px 40px; }
    }

    @media (max-width: 480px) {
      .main { padding: 18px 14px 32px; }
      .hero h1 { font-size: 28px; }
      .hero-actions { flex-direction: column; }
      .btn { width: 100%; }
    }
  </style>
</head>
<body>
  <!-- ── Sidebar ── -->
  <aside class="sidebar">
    <a class="sidebar-brand" href="index.html">
      <span class="sidebar-brand-mark">F</span>
      Freeze the Flame
    </a>

    <nav class="sidebar-nav">
      <a href="index.html" class="active">首页</a>
      <a href="posts/index.html">文章</a>
      <a href="llm-wiki/index.html">LLM Wiki</a>
      <a href="chatbot.html" class="nav-bot">Blog Bot</a>
    </nav>

    <div class="sidebar-search">
      <label for="sidebarSearch">搜索</label>
      <input type="text" id="sidebarSearch" placeholder="文章、主题、关键词...">
    </div>

    <div class="sidebar-tags">
      <h4>标签</h4>
      <div class="tag-list" id="tagList">
        ${tagPillsHtml}
      </div>
    </div>

    <div class="sidebar-footer">
      共 ${posts.length} 篇文章
    </div>
  </aside>

  <!-- ── Main Content ── -->
  <main class="main">
    <section class="hero">
      <p class="eyebrow">LEARNING NOTES / ENGINEERING LOG</p>
      <h1>
        <span>把学习、实验</span>
        <span>和灵感沉淀成</span>
        <span>可回看的轨迹。</span>
      </h1>
      <p class="hero-copy">记录编程、系统、AI 与日常折腾；让思考留下温度、结构和下一次继续出发的位置。</p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="posts/index.html">阅读文章</a>
        <a class="btn btn-secondary" href="llm-wiki/index.html">LLM Wiki</a>
        <a class="btn btn-secondary" href="chatbot.html">Blog Bot</a>
      </div>
    </section>

    <section>
      <div class="section-header">
        <h2>最新文章</h2>
        <span class="section-count" id="visibleCount">${latest.length} / ${posts.length}</span>
      </div>

      <div class="active-filters" id="activeFilters" style="display:none"></div>

      <ul class="post-list" id="postList">
${postItems}
      </ul>

      <a href="posts/index.html" class="view-all">查看全部 ${posts.length} 篇文章 →</a>
    </section>
  </main>

  <script>
    (function() {
      var sidebarSearch = document.getElementById('sidebarSearch');
      var postList = document.getElementById('postList');
      var activeFilters = document.getElementById('activeFilters');
      var visibleCount = document.getElementById('visibleCount');
      var activeTag = null;
      var cards = Array.from(postList.querySelectorAll('.post-card'));

      function filter() {
        var term = sidebarSearch.value.toLowerCase();
        var visible = 0;
        cards.forEach(function(card) {
          var tags = (card.dataset.tags || '').toLowerCase();
          var text = card.textContent.toLowerCase();
          var matchSearch = !term || text.includes(term);
          var matchTag = !activeTag || tags.split(',').includes(activeTag.toLowerCase());
          card.style.display = (matchSearch && matchTag) ? '' : 'none';
          if (matchSearch && matchTag) visible++;
        });
        visibleCount.textContent = visible + ' / ' + cards.length;
        if (activeTag) {
          activeFilters.innerHTML = '筛选: <span class="active-filter-tag">' + activeTag + ' <button class="active-filter-clear" onclick="clearFilter()">✕</button></span>';
          activeFilters.style.display = 'flex';
        } else {
          activeFilters.style.display = 'none';
        }
        // highlight active tag pill
        document.querySelectorAll('.tag-pill').forEach(function(pill) {
          pill.classList.toggle('active', pill.dataset.tag === activeTag);
        });
      }

      window.clearFilter = function() {
        activeTag = null;
        sidebarSearch.value = '';
        filter();
      };

      sidebarSearch.addEventListener('input', filter);

      // tag pill clicks
      document.getElementById('tagList').addEventListener('click', function(e) {
        var pill = e.target.closest('.tag-pill');
        if (!pill) return;
        if (activeTag === pill.dataset.tag) {
          activeTag = null;
        } else {
          activeTag = pill.dataset.tag;
        }
        filter();
      });
    })();
  </script>

  <script>
    window.BLOG_BOT_CONFIG = {
      endpoint: "https://blog-deepseek-bot.jwshen2344.workers.dev/chat",
      title: "Blog Bot",
      launcherText: "Bot"
    };
  </script>
  <script src="assets/chatbot-widget.js" defer></script>
</body>
</html>`;}

// ── main ─────────────────────────────────────────────────

const posts = findMd('posts')
  .map(collectPost)
  .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

writeDataJson(posts);
fs.writeFileSync('posts/index.html', renderPostsPage(posts));
fs.writeFileSync('index.html', renderHomepage(posts));
console.log(`Generated posts/index.html and index.html with ${posts.length} posts.`);
