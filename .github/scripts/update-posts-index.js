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

// ── posts/index.html ─────────────────────────────────────

function renderPostsPage(posts) {
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
            <h2>目录状态</h2>
            <p>文章中心只展示稳定可访问的内容。</p>
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

      // click tag to filter
      postGrid.addEventListener('click', function(e) {
        var tagEl = e.target.closest('.tag');
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

function renderHomepage(posts) {
  // latest 8 posts
  const latest = posts.slice(0, 8);
  const postItems = latest.map((p) => {
    const tags = p.tags.map((t) => `<span class="tag-link">${esc(t)}</span>`).join('');
    const href = 'posts/' + p.path.replace(/^posts\//, '');
    return `            <li class="post-item" data-tags="${esc(p.tags.join(','))}">
              <h3 class="post-title"><a href="${href}">${esc(p.title)}</a></h3>
              <div class="post-meta">
                ${p.date ? `<span>${esc(p.date)}</span>` : ''}
                ${tags}
              </div>
            </li>`;
  }).join('\n');

  // tag cloud — count frequency, cap at 30 tags
  const tagCount = {};
  posts.forEach((p) => {
    p.tags.forEach((t) => { tagCount[t] = (tagCount[t] || 0) + 1; });
  });
  const maxCount = Math.max(...Object.values(tagCount), 1);
  const sortedTags = Object.entries(tagCount)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 30);
  const tagCloud = sortedTags.map(([tag, count]) => {
    // font size: 13px (1 post) → 24px (max posts)
    const size = Math.round(13 + (count / maxCount) * 11);
    return `<span class="tag-link" data-tag="${esc(tag)}" style="font-size:${size}px">${esc(tag)} (${count})</span>`;
  }).join('\n              ');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Freeze the Flame | 我的博客</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f0e8;
      --surface: rgba(255, 252, 246, 0.86);
      --surface-strong: #fffdf8;
      --ink: #20251f;
      --muted: #69706a;
      --line: #e3dbce;
      --green: #2b725f;
      --green-dark: #185948;
      --blue: #315f9d;
      --clay: #b76545;
      --gold: #d79b3f;
      --shadow: 0 24px 70px rgba(36, 42, 35, 0.14);
    }

    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }

    body {
      margin: 0;
      color: var(--ink);
      background: linear-gradient(120deg, #f8f5ee 0%, #eef4ef 48%, #f4f0e8 100%);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.6;
    }

    body::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      opacity: 0.5;
      background-image:
        linear-gradient(115deg, transparent 0 18%, rgba(215, 155, 63, 0.08) 18% 28%, transparent 28% 100%),
        linear-gradient(155deg, transparent 0 64%, rgba(43, 114, 95, 0.08) 64% 76%, transparent 76% 100%);
      background-size: 680px 680px, 760px 760px;
      mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.82), transparent 72%);
    }

    a { color: inherit; }

    .page { width: min(1160px, calc(100vw - 36px)); margin: 0 auto; padding: 24px 0 56px; }

    .site-header {
      position: sticky; top: 14px; z-index: 10;
      display: flex; align-items: center; justify-content: space-between; gap: 20px;
      padding: 12px 14px 12px 18px;
      border: 1px solid rgba(227, 219, 206, 0.9); border-radius: 8px;
      background: rgba(255, 252, 246, 0.82);
      box-shadow: 0 12px 36px rgba(36, 42, 35, 0.08);
      backdrop-filter: blur(18px);
    }

    .brand { display: flex; align-items: center; gap: 10px; min-width: 0; text-decoration: none; font-weight: 900; }
    .brand-mark { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 8px; background: var(--ink); color: #fffdf8; font-size: 18px; line-height: 1; }

    .site-nav { display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }
    .site-nav a { min-height: 38px; display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; padding: 0 12px; color: var(--muted); text-decoration: none; font-weight: 750; transition: background 160ms ease, color 160ms ease, transform 160ms ease; }
    .site-nav a:hover { color: var(--ink); background: rgba(43, 114, 95, 0.09); transform: translateY(-1px); }
    .site-nav .bot-link { color: #fff; background: var(--green); box-shadow: 0 10px 22px rgba(43, 114, 95, 0.22); }
    .site-nav .bot-link:hover { color: #fff; background: var(--green-dark); }

    .hero { min-height: 520px; display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(340px, 0.82fr); align-items: center; gap: 46px; padding: 64px 0 38px; }
    .hero > * { min-width: 0; }

    .eyebrow { width: fit-content; margin: 0 0 18px; padding: 6px 10px; border: 1px solid rgba(43, 114, 95, 0.2); border-radius: 999px; background: rgba(255, 252, 246, 0.76); color: var(--green-dark); font-size: 13px; font-weight: 850; }

    h1 { margin: 0; max-width: 820px; font-size: clamp(42px, 7vw, 86px); line-height: 0.96; letter-spacing: 0; overflow-wrap: anywhere; word-break: break-word; }
    h1 span { display: block; }

    .hero-copy { width: 100%; max-width: min(640px, 100%); margin: 22px 0 0; color: #4e574f; font-size: clamp(17px, 2vw, 21px); overflow-wrap: anywhere; }
    .hero-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 32px; }

    .button { min-height: 46px; display: inline-flex; align-items: center; justify-content: center; border-radius: 7px; padding: 0 18px; border: 1px solid transparent; text-decoration: none; font-weight: 850; transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease; }
    .button:hover { transform: translateY(-2px); }
    .button.primary { background: var(--green); color: #fff; box-shadow: 0 16px 32px rgba(43, 114, 95, 0.24); }
    .button.primary:hover { background: var(--green-dark); }
    .button.secondary { background: rgba(255, 252, 246, 0.78); border-color: var(--line); color: var(--ink); }

    .hero-visual { position: relative; min-height: 430px; border: 1px solid rgba(227, 219, 206, 0.95); border-radius: 8px; overflow: hidden; background: linear-gradient(135deg, rgba(49, 95, 157, 0.14), transparent 38%), linear-gradient(160deg, rgba(43, 114, 95, 0.9), rgba(25, 39, 38, 0.96)); box-shadow: var(--shadow); }
    .hero-visual::before { content: ""; position: absolute; inset: 22px; border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 7px; background: linear-gradient(145deg, rgba(255, 255, 255, 0.16), transparent 38%), linear-gradient(25deg, transparent 0 54%, rgba(215, 155, 63, 0.18) 54% 68%, transparent 68% 100%); }
    .note-card { position: absolute; left: 34px; right: 34px; bottom: 34px; padding: 20px; border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 8px; background: rgba(255, 252, 246, 0.93); box-shadow: 0 24px 42px rgba(0, 0, 0, 0.22); }
    .note-card p { margin: 0; color: #4e574f; }
    .note-title { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 12px; color: var(--ink); font-size: 18px; font-weight: 900; }
    .note-title span { color: var(--clay); font-size: 13px; font-weight: 850; }
    .signal { position: absolute; top: 52px; left: 42px; display: grid; gap: 8px; color: rgba(255, 255, 255, 0.86); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; }
    .signal code { width: fit-content; padding: 8px 10px; border-radius: 6px; background: rgba(0, 0, 0, 0.2); }

    .sections { display: grid; grid-template-columns: minmax(0, 1fr) 320px; align-items: start; gap: 26px; margin-top: 10px; }
    .content-band, .side-panel { border: 1px solid rgba(227, 219, 206, 0.95); border-radius: 8px; background: var(--surface); box-shadow: 0 18px 50px rgba(36, 42, 35, 0.08); backdrop-filter: blur(16px); }
    .content-band { padding: 30px; }
    .section-kicker { margin: 0 0 6px; color: var(--green); font-size: 13px; font-weight: 900; }
    .section-title { margin: 0; font-size: clamp(26px, 3vw, 38px); line-height: 1.12; letter-spacing: 0; }
    .section-intro { margin: 12px 0 24px; color: var(--muted); }

    .search-box { position: relative; margin-bottom: 22px; }
    .search-box input { width: 100%; min-height: 52px; border: 1px solid var(--line); border-radius: 7px; padding: 0 16px 0 44px; background: var(--surface-strong); color: var(--ink); font: inherit; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6); }
    .search-box::before { content: "⌕"; position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: var(--green); font-size: 24px; line-height: 1; }

    .active-filters { margin-bottom: 16px; padding: 10px 16px; border-radius: 8px; background: rgba(43, 114, 95, 0.06); font-size: 14px; color: var(--muted); }
    .active-filters .active-filter-tag { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; background: rgba(43, 114, 95, 0.14); color: var(--green-dark); font-weight: 700; }
    .active-filters button { color: var(--clay); font-size: 16px; line-height: 1; }

    .post-list { display: grid; gap: 14px; margin: 0; padding: 0; list-style: none; }
    .post-item { padding: 18px; border: 1px solid var(--line); border-radius: 8px; background: rgba(255, 253, 248, 0.76); transition: border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease; }
    .post-item:hover { border-color: rgba(43, 114, 95, 0.38); transform: translateY(-2px); box-shadow: 0 14px 28px rgba(36, 42, 35, 0.08); }
    .post-title { margin: 0 0 7px; font-size: 20px; line-height: 1.25; letter-spacing: 0; }
    .post-title a { color: var(--ink); text-decoration: none; }
    .post-title a:hover { color: var(--green); }
    .post-meta { color: var(--muted); font-size: 14px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .content-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 24px; }

    .side-panel { position: sticky; top: 92px; display: grid; gap: 22px; padding: 22px; }
    .side-block + .side-block { padding-top: 22px; border-top: 1px solid var(--line); }
    .side-block h3 { margin: 0 0 12px; font-size: 16px; letter-spacing: 0; }

    .tag-cloud { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .tag-link { display: inline-flex; align-items: center; min-height: 32px; border-radius: 999px; padding: 0 11px; background: rgba(49, 95, 157, 0.1); color: var(--blue); font-size: 13px; font-weight: 800; text-decoration: none; cursor: pointer; transition: background 160ms ease, transform 120ms ease; user-select: none; }
    .tag-link:hover { background: rgba(49, 95, 157, 0.2); transform: scale(1.05); }

    .command { display: block; margin: 10px 0 0; padding: 12px; border-radius: 7px; background: #222820; color: #f7f0df; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; white-space: pre-wrap; overflow-wrap: anywhere; }
    .side-block p { margin: 0; color: var(--muted); font-size: 14px; }

    .bot-callout { padding: 18px; border-radius: 8px; background: linear-gradient(145deg, var(--green), #203d39); color: #fff; }
    .bot-callout h3 { color: #fff; }
    .bot-callout p { color: rgba(255, 255, 255, 0.82); }
    .bot-callout a { min-height: 40px; display: inline-flex; align-items: center; justify-content: center; margin-top: 14px; padding: 0 13px; border-radius: 6px; background: #fff; color: var(--green-dark); text-decoration: none; font-weight: 900; }

    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

    @media (max-width: 860px) {
      .site-header { position: static; align-items: flex-start; flex-direction: column; }
      .site-nav { justify-content: flex-start; }
      .hero, .sections { grid-template-columns: 1fr; }
      .hero { padding-top: 44px; }
      .hero-visual { min-height: 340px; }
      .side-panel { position: static; }
    }

    @media (max-width: 560px) {
      .page { width: min(100% - 24px, 1160px); padding-top: 12px; }
      .site-header, .content-band, .side-panel { padding: 16px; }
      .site-nav a { flex: 1 1 auto; }
      .hero { min-height: auto; gap: 28px; }
      h1 { font-size: 34px; line-height: 1.04; width: calc(100vw - 48px); max-width: calc(100vw - 48px); word-break: break-all; }
      .hero-copy { width: min(320px, calc(100vw - 72px)); max-width: min(320px, calc(100vw - 72px)); font-size: 16px; word-break: break-all; }
      .hero-visual { min-height: 300px; }
      .signal { top: 40px; left: 36px; font-size: 12px; }
      .hero-actions, .content-actions { flex-direction: column; }
      .button { width: 100%; }
      .note-card { left: 18px; right: 18px; bottom: 18px; padding: 16px; }
      .note-card p { max-width: min(300px, calc(100vw - 92px)); word-break: break-all; }
      .note-title { align-items: flex-start; flex-direction: column; gap: 4px; }
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="site-header">
      <a class="brand" href="index.html" aria-label="Freeze the Flame 首页">
        <span class="brand-mark">F</span>
        <span>Freeze the Flame</span>
      </a>
      <nav class="site-nav" aria-label="主导航">
        <a href="index.html">首页</a>
        <a href="posts/index.html">文章</a>
        <a href="llm-wiki/index.html">LLM Wiki</a>
        <a href="chatbot.html" class="bot-link">Blog Bot</a>
      </nav>
    </header>

    <main>
      <section class="hero" aria-labelledby="hero-title">
        <div>
          <p class="eyebrow">LEARNING NOTES / ENGINEERING LOG</p>
          <h1 id="hero-title">
            <span>把学习、实验</span>
            <span>和灵感沉淀成</span>
            <span>可回看的轨迹。</span>
          </h1>
          <p class="hero-copy">记录编程、系统、AI 与日常折腾；让思考留下温度、结构和下一次继续出发的位置。</p>
          <div class="hero-actions">
            <a class="button primary" href="posts/index.html">阅读文章</a>
            <a class="button secondary" href="llm-wiki/index.html">进入 LLM Wiki</a>
            <a class="button secondary" href="chatbot.html">询问 Blog Bot</a>
          </div>
        </div>
        <div class="hero-visual" aria-label="博客笔记视觉卡片">
          <div class="signal" aria-hidden="true">
            <code>notes.sync()</code>
            <code>ideas.push("next")</code>
            <code>bot.ready = true</code>
          </div>
          <div class="note-card">
            <div class="note-title">
              <strong>今日索引</strong>
              <span>LIVE</span>
            </div>
            <p>把阅读、代码片段和问题整理成可以搜索、可以追问、也能继续生长的个人知识空间。</p>
          </div>
        </div>
      </section>

      <section class="sections" aria-label="博客内容">
        <div class="content-band">
          <p class="section-kicker">LATEST WRITING</p>
          <h2 class="section-title">最新文章</h2>
          <p class="section-intro">共 <strong>${posts.length}</strong> 篇文章。搜索标题或点击标签筛选。</p>

          <div class="search-box">
            <label class="sr-only" for="searchInput">搜索文章</label>
            <input type="text" id="searchInput" placeholder="搜索文章、主题或关键词...">
          </div>

          <div class="active-filters" id="activeFilters" style="display:none"></div>

          <ul class="post-list" id="postList">
${postItems}
          </ul>

          <div class="content-actions">
            <a href="posts/index.html" class="button primary">查看所有文章</a>
            <a href="chatbot.html" class="button secondary">打开 Blog Bot</a>
          </div>
        </div>

        <aside class="side-panel" aria-label="侧边栏">
          <section class="side-block">
            <h3>标签云</h3>
            <div class="tag-cloud" id="tagCloud">
              ${tagCloud}
            </div>
          </section>

          <section class="bot-callout">
            <h3>LLM Wiki</h3>
            <p>把 LLM 资料、概念和工作流收进一个可搜索、可维护的知识库。</p>
            <a href="llm-wiki/index.html">打开 Wiki</a>
          </section>

          <section class="side-block">
            <h3>快速操作</h3>
            <p>使用命令创建新文章：</p>
            <code class="command">npm run create-post "文章标题"</code>
          </section>

          <section class="side-block">
            <h3>关于</h3>
            <p>一个基于 Markdown 的个人博客系统，支持文章索引、标签分类、搜索和 GPT 小助手扩展。</p>
          </section>
        </aside>
      </section>
    </main>
  </div>

  <script>
    // search + tag filter
    (function() {
      var searchInput = document.getElementById('searchInput');
      var postList = document.getElementById('postList');
      var activeFilters = document.getElementById('activeFilters');
      var activeTag = null;
      var items = Array.from(postList.querySelectorAll('.post-item'));

      function filter() {
        var term = searchInput.value.toLowerCase();
        var visible = 0;
        items.forEach(function(item) {
          var tags = (item.dataset.tags || '').toLowerCase();
          var text = item.textContent.toLowerCase();
          var matchSearch = !term || text.includes(term);
          var matchTag = !activeTag || tags.split(',').includes(activeTag.toLowerCase());
          if (matchSearch && matchTag) {
            item.style.display = '';
            visible++;
          } else {
            item.style.display = 'none';
          }
        });
        if (activeTag) {
          activeFilters.innerHTML = '筛选标签: <span class="active-filter-tag">' + activeTag + ' <button onclick="clearFilter()" style="cursor:pointer;background:none;border:none;margin-left:4px;color:inherit;font-size:16px;">✕</button></span>';
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

      // click tag in cloud → navigate to posts page with filter
      document.addEventListener('click', function(e) {
        var tagEl = e.target.closest('.tag-link');
        if (!tagEl) return;
        e.preventDefault();
        window.location.href = 'posts/index.html?tag=' + encodeURIComponent(tagEl.dataset.tag);
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
</html>`;
}

// ── main ─────────────────────────────────────────────────

const posts = findMd('posts')
  .map(collectPost)
  .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

writeDataJson(posts);
fs.writeFileSync('posts/index.html', renderPostsPage(posts));
fs.writeFileSync('index.html', renderHomepage(posts));
console.log(`Generated posts/index.html and index.html with ${posts.length} posts.`);
