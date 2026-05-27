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

export function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let inList = false;
  let inCode = false;
  let inTable = false;
  let inTbody = false;
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

  for (const line of lines) {
    if (line.startsWith("```")) {
      flushParagraph();
      closeList();
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

    // Table handling
    if (isTableRow(line)) {
      flushParagraph();
      closeList();

      if (!inTable) {
        // Start of table: first row is header
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
        // Separator row — skip, start tbody
        if (!inTbody) {
          html.push("<tbody>");
          inTbody = true;
        }
        continue;
      }

      // Data row
      if (!inTbody) {
        // separator was missing — start tbody anyway
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
      // Non-table line after a table — close it
      closeTable();
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      const text = heading[2].trim();
      html.push(`<h${level} id="${slugify(text)}">${renderInline(text)}</h${level}>`);
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      flushParagraph();
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
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  closeList();
  closeTable();
  if (inCode) html.push("</code></pre>");
  return html.join("\n");
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
