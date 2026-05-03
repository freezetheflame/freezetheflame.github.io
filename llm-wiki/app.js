import { markdownToHtml, searchPages } from "./wiki-core.js";
import { wikiManifest } from "./wiki-data.js";

const state = {
  pages: wikiManifest.pages,
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
  renderPageList(state.pages);
  searchInput.addEventListener("input", handleSearch);
  window.addEventListener("hashchange", route);
  await route();
}

async function route() {
  const path = decodeURIComponent(location.hash.replace(/^#\//, "")) || "wiki/index.md";
  state.currentPath = path;
  await renderPage(path);
  renderPageList(searchPages(state.pages, searchInput.value));
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
  content.innerHTML = markdownToHtml(markdown);
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

function handleSearch() {
  renderPageList(searchPages(state.pages, searchInput.value));
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
  const tags = [...new Set(state.pages.flatMap((page) => page.tags))].sort();
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
