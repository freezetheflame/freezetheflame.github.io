const escapeMap = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => escapeMap[char]);
}

export function extractWikiLinks(markdown) {
  const links = [];
  const pattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let match;
  while ((match = pattern.exec(markdown)) !== null) {
    links.push({
      href: match[1].trim(),
      label: (match[2] || match[1]).trim(),
    });
  }
  return links;
}

export function searchPages(pages, query) {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);

  if (terms.length === 0) {
    return pages;
  }

  return pages
    .map((page) => {
      const haystack = [
        page.title,
        page.path,
        ...(page.tags || []),
        page.summary || "",
        page.text || "",
      ]
        .join(" ")
        .toLowerCase();
      const score = terms.reduce((total, term) => total + countTerm(haystack, term), 0);
      return { ...page, score };
    })
    .filter((page) => page.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

export function readerPages(pages) {
  return pages.filter((page) => page.audience !== "maintenance");
}

export function columnPages(pages, prefix) {
  return readerPages(pages).filter((page) => page.path.startsWith(prefix));
}

export function markdownToHtml(markdown, { toc = false } = {}) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let inList = false;
  let inCode = false;
  let inTable = false;
  let inTbody = false;
  let inBlockquote = false;
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const closeList = () => {
    if (!inList) return;
    html.push("</ul>");
    inList = false;
  };

  const closeBlockquote = () => {
    if (!inBlockquote) return;
    html.push("</blockquote>");
    inBlockquote = false;
  };

  const closeTable = () => {
    if (!inTable) return;
    if (inTbody) html.push("</tbody>");
    html.push("</table>");
    inTable = false;
    inTbody = false;
  };

  const isTableRow = (line) => /^\|.+\|$/.test(line.trim());
  const isTableSep = (line) => /^\|[\s\-:]+\|[\s\-:|]+$/.test(line.trim());

  const parseTableCells = (line) =>
    line.trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((cell) => cell.trim());

  // Pre-build TOC if requested
  const tocHtml = toc ? buildTOC(markdown) : "";

  for (const line of lines) {
    if (line.startsWith("```")) {
      flushParagraph();
      closeList();
      closeBlockquote();
      closeTable();
      if (inCode) {
        html.push("</code></pre>");
        inCode = false;
      } else {
        html.push("<pre><code>");
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      html.push(`${escapeHtml(line)}\n`);
      continue;
    }

    // Blockquote
    const blockquoteMatch = /^>\s?(.*)$/.exec(line);
    if (blockquoteMatch) {
      flushParagraph();
      closeList();
      closeTable();
      if (!inBlockquote) {
        html.push("<blockquote>");
        inBlockquote = true;
      }
      html.push(`<p>${renderInline(blockquoteMatch[1] || "&nbsp;")}</p>`);
      continue;
    }

    if (inBlockquote) {
      closeBlockquote();
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,})\s*$/.test(line.trim())) {
      flushParagraph();
      closeList();
      closeBlockquote();
      closeTable();
      html.push("<hr>");
      continue;
    }

    // Table handling
    if (isTableRow(line)) {
      flushParagraph();
      closeList();
      closeBlockquote();

      if (!inTable) {
        html.push("<table>");
        html.push("<thead>");
        html.push("<tr>");
        for (const cell of parseTableCells(line)) {
          html.push(`<th>${renderInline(cell)}</th>`);
        }
        html.push("</tr>");
        html.push("</thead>");
        inTable = true;
        inTbody = false;
        continue;
      }

      if (isTableSep(line)) {
        if (!inTbody) {
          html.push("<tbody>");
          inTbody = true;
        }
        continue;
      }

      if (!inTbody) {
        html.push("<tbody>");
        inTbody = true;
      }
      html.push("<tr>");
      for (const cell of parseTableCells(line)) {
        html.push(`<td>${renderInline(cell)}</td>`);
      }
      html.push("</tr>");
      continue;
    }

    if (inTable) {
      closeTable();
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      closeList();
      closeBlockquote();
      const level = heading[1].length;
      const text = heading[2].trim();
      html.push(`<h${level} id="${slugify(text)}">${renderInline(text)}</h${level}>`);
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      closeBlockquote();
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${renderInline(line.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      closeList();
      closeBlockquote();
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  closeList();
  closeBlockquote();
  closeTable();
  if (inCode) html.push("</code></pre>");

  const body = html.join("\n");
  return tocHtml ? tocHtml + body : body;
}

export function buildTOC(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const items = [];
  let inCode = false;

  for (const line of lines) {
    if (line.startsWith("```")) { inCode = !inCode; continue; }
    if (inCode) continue;

    const heading = /^(#{2,3})\s+(.+)$/.exec(line);
    if (!heading) continue;

    const level = heading[1].length;
    const text = heading[2].trim();
    items.push({ level, text, id: slugify(text) });
  }

  if (items.length < 3) return "";

  const links = items.map((item) => {
    const cls = item.level === 2 ? "toc-h2" : "toc-h3";
    return `<a class="${cls}" href="#${item.id}">${escapeHtml(item.text)}</a>`;
  }).join("");

  return `<nav class="toc"><p class="toc-title">On this page</p><div class="toc-list">${links}</div></nav>`;
}

function renderInline(value) {
  return escapeHtml(value)
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, href, label) => {
      const path = href.trim();
      const text = (label || href).trim();
      return `<a href="#/${encodeURIComponent(path)}" data-path="${escapeHtml(path)}">${escapeHtml(text)}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function countTerm(haystack, term) {
  let count = 0;
  let index = haystack.indexOf(term);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(term, index + term.length);
  }
  return count;
}
