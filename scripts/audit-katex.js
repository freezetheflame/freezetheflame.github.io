#!/usr/bin/env node
/**
 * KaTeX 健康审计：找出所有会被 renderMath 处理、且渲染失败或含中文的跨度。
 * 两类信号：
 *   (1) unicodeTextInMathMode 告警 —— 公式里混了中文
 *   (2) 输出含 katex-error —— KaTeX 解析失败（静默！构建不报错）
 * 用法: node scripts/audit-katex.js posts
 */
const fs = require('fs');
const path = require('path');
const katex = require('katex');

const root = process.argv[2] || 'posts';

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

function capture(fn) {
  const msgs = [];
  const ow = console.warn, oe = console.error;
  console.warn = (...a) => msgs.push(a.join(' '));
  console.error = (...a) => msgs.push(a.join(' '));
  let html = '';
  try { html = fn(); } finally { console.warn = ow; console.error = oe; }
  return {
    html,
    unicode: msgs.filter(w => /unicodeTextInMathMode/.test(w)).length,
    isError: /katex-error/.test(html),
  };
}

function analyze(file) {
  let content = fs.readFileSync(file, 'utf8');
  const found = [];

  // 与 convert-markdown.js 的 renderMath 保持一致：先把代码段扣出来
  const parked = [];
  const park = (m) => `\x00KATEX${parked.push(m) - 1}\x00`;
  content = content.replace(/```[\s\S]*?```/g, park);
  content = content.replace(/~~~[\s\S]*?~~~/g, park);
  content = content.replace(/`[^`\n]+`/g, park);

  content = content.replace(/\$\$([\s\S]+?)\$\$/g, (m, formula) => {
    const r = capture(() => katex.renderToString(formula.trim(),
      { displayMode: true, throwOnError: false, output: 'html' }));
    if (r.unicode || r.isError)
      found.push({ kind: 'display', formula: formula.trim(), ...r });
    return '\x00D\x00';
  });

  content.replace(/\$(.+?)\$/g, (m, formula) => {
    if (formula.trim().length === 0) return m;
    const r = capture(() => katex.renderToString(formula.trim(),
      { displayMode: false, throwOnError: false, output: 'html' }));
    if (r.unicode || r.isError)
      found.push({ kind: 'inline', formula: formula.trim(), ...r });
    return m;
  });

  return found;
}

const report = [];
let totalU = 0, totalE = 0;
for (const f of walk(root).sort()) {
  const hits = analyze(f);
  if (!hits.length) continue;
  const u = hits.reduce((s, h) => s + h.unicode, 0);
  const e = hits.filter(h => h.isError).length;
  totalU += u; totalE += e;
  report.push({ f, hits, u, e });
}

report.sort((a, b) => (b.u + b.e) - (a.u + a.e));
for (const { f, hits, u, e } of report) {
  console.log(`\n### ${f}   [中文告警 ${u} 条, 解析错误 ${e} 处]`);
  const seen = new Set();
  for (const h of hits.slice(0, 6)) {
    const key = h.kind + h.formula.slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    const tag = h.isError ? '❌解析失败' : `⚠️中文x${h.unicode}`;
    console.log(`   [${h.kind}] ${tag}  ${h.formula.replace(/\n/g, ' ⏎ ').slice(0, 72)}`);
  }
}
console.log(`\n${'='.repeat(60)}`);
console.log(`合计: 中文告警 ${totalU} 条 | 解析错误 ${totalE} 处 | 涉及 ${report.length} 篇`);
