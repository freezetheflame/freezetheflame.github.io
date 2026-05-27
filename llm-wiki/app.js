import { buildTOC, columnPages, markdownToHtml, readerPages, searchPages } from "./wiki-core.js";
import { wikiManifest } from "./wiki-data.js";

const state = {
  pages: wikiManifest.pages,
  readerPages: readerPages(wikiManifest.pages),
  loaded: new Map(),
  currentPath: "wiki/index.md",
};

const pageList = document.querySelector("[data-page-list]");
const tagList = document.querySelector("[data-tag-list]");
const searchInput = document.querySelector("[data-search]");
const content = document.querySelector("[data-content]");
const title = document.querySelector("[data-title]");
const meta = document.querySelector("[data-meta]");

const NAV_SECTIONS = [
  { label: "Home", prefix: null, match: (p) => p.path === "wiki/index.md" || p.path === "wiki/overview.md" || p.path === "wiki/log.md" },
  { label: "Concepts", prefix: "wiki/concepts/" },
  { label: "AI SE Testing", prefix: "wiki/columns/ai-se-testing/" },
  { label: "Agent Work Patterns", prefix: "wiki/columns/agent-work-patterns/" },
  { label: "Sources", prefix: "wiki/sources/" },
  { label: "Workflows", prefix: "wiki/workflows/" },
];

function getSectionForPage(page) {
  for (const sec of NAV_SECTIONS) {
    if (sec.match) { if (sec.match(page)) return sec.label; }
    else if (sec.prefix && page.path.startsWith(sec.prefix)) return sec.label;
  }
  return null;
}

async function init() {
  document.querySelector("[data-updated]").textContent = wikiManifest.updated;
  renderTags();
  renderPageList(state.readerPages);
  searchInput.addEventListener("input", handleSearch);
  window.addEventListener("hashchange", route);
  await route();
}

async function route() {
  const path = decodeURIComponent(location.hash.replace(/^#\//, "")) || "wiki/index.md";
  state.currentPath = path;
  await renderPage(path);
  renderPageList(searchPages(state.readerPages, searchInput.value));
}

async function renderPage(path) {
  const page = state.pages.find((item) => item.path === path);
  if (!page) {
    title.textContent = "Page not indexed";
    meta.textContent = path;
    content.innerHTML = `<p>The file exists only if you add it to <code>app/wiki-data.js</code>.</p>`;
    return;
  }
  title.textContent = page.title;
  meta.textContent = `${page.path} · ${page.tags.join(", ")}`;
  const markdown = await loadMarkdown(page.path);

  if (path === "wiki/index.md") {
    content.innerHTML = renderHome(markdown);
  } else {
    const useTOC = !path.endsWith("/index.md") && !path.startsWith("agent/");
    const breadcrumb = buildBreadcrumb(page);
    content.innerHTML = breadcrumb + markdownToHtml(markdown, { toc: useTOC });
  }

  content.querySelectorAll("a[data-path]").forEach((link) => {
    link.addEventListener("click", () => { state.currentPath = link.dataset.path; });
  });
}

async function loadMarkdown(path) {
  if (state.loaded.has(path)) return state.loaded.get(path);
  const response = await fetch(`/llm-wiki/${path}`);
  if (!response.ok) throw new Error(`Unable to load ${path}`);
  const text = await response.text();
  state.loaded.set(path, text);
  const page = state.pages.find((item) => item.path === path);
  if (page) page.text = text;
  return text;
}

function renderHome(markdown) {
  const aiTestingPages = columnPages(state.pages, "wiki/columns/ai-se-testing/")
    .filter((page) => page.path !== "wiki/columns/ai-se-testing/index.md");
  const agentPatternPages = columnPages(state.pages, "wiki/columns/agent-work-patterns/")
    .filter((page) => page.path !== "wiki/columns/agent-work-patterns/index.md");
  const sourcePages = state.readerPages.filter((page) => page.tags.includes("source"));
  const roadmap = [
    ["Research Radar", "Track primary sources, benchmarks, project reports, and trend shifts."],
    ["Testing Agent Design", "Shape the agent loop for reading repos, running tests, and preserving project memory."],
    ["Prototype Experiments", "Measure generated tests by execution, coverage, mutation signal, and regression value."],
    ["Long-Running CI Loop", "Move from one-shot fixes toward CI-aware maintenance and failure memory."],
  ];
  const tracks = [
    "Verified test generation", "Agentic regression loop", "Benchmark lifecycle",
    "GUI/E2E testing agents", "Fuzzing and security testing", "Project memory for testing",
  ];

  return `
    <section class="home-dashboard" aria-label="Wiki dashboard">
      <div class="focus-panel">
        <p class="eyebrow">Current focus</p>
        <h2>AI-assisted automated software engineering testing</h2>
        <p>Build a research radar first, then turn it into a practical testing agent that can generate, run, evaluate, and preserve useful tests across real repositories.</p>
        <div class="dashboard-actions">
          ${homeLink("wiki/columns/ai-se-testing/index.md", "Open Column")}
          ${homeLink("wiki/columns/ai-se-testing/reading-list.md", "Reading List")}
          ${agentPatternPages.length > 0 ? homeLink("wiki/columns/agent-work-patterns/index.md", "Agent Patterns") : ""}
        </div>
      </div>
      <div class="roadmap-panel">
        <p class="eyebrow">Roadmap</p>
        <div class="roadmap-steps">
          ${roadmap.map(([name, summary], i) => `
            <article class="roadmap-step">
              <span>${i + 1}</span>
              <div><h3>${name}</h3><p>${summary}</p></div>
            </article>`).join("")}
        </div>
      </div>
      <div class="dashboard-section">
        <div class="section-heading"><p class="eyebrow">Column</p><h2>AI SE Testing</h2></div>
        <div class="link-grid">${aiTestingPages.map(pageCard).join("")}</div>
      </div>
      ${agentPatternPages.length > 0 ? `
      <div class="dashboard-section">
        <div class="section-heading"><p class="eyebrow">Column</p><h2>Agent Work Patterns</h2></div>
        <div class="link-grid">${agentPatternPages.map(pageCard).join("")}</div>
      </div>` : ""}
      <div class="dashboard-section">
        <div class="section-heading"><p class="eyebrow">Open tracks</p><h2>Research lanes</h2></div>
        <div class="track-list">${tracks.map((t) => `<span>${t}</span>`).join("")}</div>
      </div>
      <div class="dashboard-section">
        <div class="section-heading"><p class="eyebrow">Sources</p><h2>Reference pages</h2></div>
        <div class="source-list">${sourcePages.map(pageCard).join("")}</div>
      </div>
    </section>
    ${markdownToHtml(markdown)}
  `;
}

function homeLink(path, label) {
  return `<a class="button-link" href="#/${encodeURIComponent(path)}" data-path="${path}">${label}</a>`;
}

function pageCard(page) {
  return `<a class="dashboard-card" href="#/${encodeURIComponent(page.path)}" data-path="${page.path}"><strong>${page.title}</strong><span>${page.summary}</span></a>`;
}

function handleSearch() { renderPageList(searchPages(state.readerPages, searchInput.value)); }

function renderPageList(pages) {
  pageList.innerHTML = "";
  const hasQuery = searchInput.value.trim().length > 0;
  if (hasQuery) { pages.forEach((page) => pageList.append(buildPageLink(page))); return; }

  const grouped = new Map();
  const ungrouped = [];
  for (const page of pages) {
    const section = getSectionForPage(page);
    if (section) { if (!grouped.has(section)) grouped.set(section, []); grouped.get(section).push(page); }
    else { ungrouped.push(page); }
  }
  for (const [label, groupPages] of grouped) {
    const header = document.createElement("div");
    header.className = "nav-section"; header.textContent = label;
    pageList.append(header);
    for (const page of groupPages) pageList.append(buildPageLink(page));
  }
  for (const page of ungrouped) pageList.append(buildPageLink(page));
}

function buildPageLink(page) {
  const link = document.createElement("a");
  link.href = `#/${encodeURIComponent(page.path)}`;
  link.className = page.path === state.currentPath ? "page-link active" : "page-link";
  link.innerHTML = `<span>${page.title}</span><small>${page.summary}</small>`;
  return link;
}

function renderTags() {
  const tags = [...new Set(state.readerPages.flatMap((p) => p.tags))].sort();
  tagList.innerHTML = "";
  tags.forEach((tag) => {
    const button = document.createElement("button");
    button.type = "button"; button.textContent = tag;
    button.addEventListener("click", () => { searchInput.value = tag; handleSearch(); });
    tagList.append(button);
  });
}

function buildBreadcrumb(page) {
  const parts = [];
  // Always start with Wiki Index
  parts.push(`<a href="#/${encodeURIComponent("wiki/index.md")}" data-path="wiki/index.md">Wiki Index</a>`);

  const pathParts = page.path.replace("wiki/", "").split("/");
  // Remove filename
  const fileName = pathParts.pop();

  // Build intermediate paths
  let accumulated = "wiki";
  for (const part of pathParts) {
    accumulated += "/" + part;
    const indexPage = state.pages.find((p) => p.path === accumulated + "/index.md");
    if (indexPage) {
      parts.push(`<a href="#/${encodeURIComponent(indexPage.path)}" data-path="${indexPage.path}">${indexPage.title}</a>`);
    } else {
      // Capitalize the segment as fallback
      const label = part.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      parts.push(`<span>${label}</span>`);
    }
  }

  // Current page (not a link)
  parts.push(`<span class="current">${page.title}</span>`);

  return `<nav class="breadcrumb" aria-label="Breadcrumb">${parts.join(' <span class="sep">/</span> ')}</nav>`;
}

init().catch((error) => { content.innerHTML = `<p class="error">${error.message}</p>`; });
