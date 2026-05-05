import { columnPages, markdownToHtml, readerPages, searchPages } from "./wiki-core.js";
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
  content.innerHTML = path === "wiki/index.md" ? renderHome(markdown) : markdownToHtml(markdown);
  content.querySelectorAll("a[data-path]").forEach((link) => {
    link.addEventListener("click", () => {
      state.currentPath = link.dataset.path;
    });
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
  const sourcePages = state.readerPages.filter((page) => page.tags.includes("source"));
  const roadmap = [
    ["Research Radar", "Track primary sources, benchmarks, project reports, and trend shifts."],
    ["Testing Agent Design", "Shape the agent loop for reading repos, running tests, and preserving project memory."],
    ["Prototype Experiments", "Measure generated tests by execution, coverage, mutation signal, and regression value."],
    ["Long-Running CI Loop", "Move from one-shot fixes toward CI-aware maintenance and failure memory."],
  ];
  const tracks = [
    "Verified test generation",
    "Agentic regression loop",
    "Benchmark lifecycle",
    "GUI/E2E testing agents",
    "Fuzzing and security testing",
    "Project memory for testing",
  ];

  return `
    <section class="home-dashboard" aria-label="Wiki roadmap dashboard">
      <div class="focus-panel">
        <p class="eyebrow">Current focus</p>
        <h2>AI-assisted automated software engineering testing</h2>
        <p>Build a research radar first, then turn it into a practical testing agent that can generate, run, evaluate, and preserve useful tests across real repositories.</p>
        <div class="dashboard-actions">
          ${homeLink("wiki/columns/ai-se-testing/index.md", "Open Column")}
          ${homeLink("wiki/columns/ai-se-testing/reading-list.md", "Reading List")}
        </div>
      </div>
      <div class="roadmap-panel">
        <p class="eyebrow">Roadmap</p>
        <div class="roadmap-steps">
          ${roadmap
            .map(
              ([name, summary], index) => `
                <article class="roadmap-step">
                  <span>${index + 1}</span>
                  <div>
                    <h3>${name}</h3>
                    <p>${summary}</p>
                  </div>
                </article>
              `,
            )
            .join("")}
        </div>
      </div>
      <div class="dashboard-section">
        <div class="section-heading">
          <p class="eyebrow">Column pages</p>
          <h2>AI SE Testing</h2>
        </div>
        <div class="link-grid">
          ${aiTestingPages.map((page) => pageCard(page)).join("")}
        </div>
      </div>
      <div class="dashboard-section">
        <div class="section-heading">
          <p class="eyebrow">Open tracks</p>
          <h2>Research lanes</h2>
        </div>
        <div class="track-list">
          ${tracks.map((track) => `<span>${track}</span>`).join("")}
        </div>
      </div>
      <div class="dashboard-section">
        <div class="section-heading">
          <p class="eyebrow">Sources</p>
          <h2>Recent source pages</h2>
        </div>
        <div class="source-list">
          ${sourcePages.map((page) => pageCard(page)).join("")}
        </div>
      </div>
    </section>
    ${markdownToHtml(markdown)}
  `;
}

function homeLink(path, label) {
  return `<a class="button-link" href="#/${encodeURIComponent(path)}" data-path="${path}">${label}</a>`;
}

function pageCard(page) {
  return `
    <a class="dashboard-card" href="#/${encodeURIComponent(page.path)}" data-path="${page.path}">
      <strong>${page.title}</strong>
      <span>${page.summary}</span>
    </a>
  `;
}

function handleSearch() {
  renderPageList(searchPages(state.readerPages, searchInput.value));
}

function renderPageList(pages) {
  pageList.innerHTML = "";
  pages.forEach((page) => {
    const link = document.createElement("a");
    link.href = `#/${encodeURIComponent(page.path)}`;
    link.className = page.path === state.currentPath ? "page-link active" : "page-link";
    link.innerHTML = `<span>${page.title}</span><small>${page.summary}</small>`;
    pageList.append(link);
  });
}

function renderTags() {
  const tags = [...new Set(state.readerPages.flatMap((page) => page.tags))].sort();
  tagList.innerHTML = "";
  tags.forEach((tag) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = tag;
    button.addEventListener("click", () => {
      searchInput.value = tag;
      handleSearch();
    });
    tagList.append(button);
  });
}

init().catch((error) => {
  content.innerHTML = `<p class="error">${error.message}</p>`;
});
