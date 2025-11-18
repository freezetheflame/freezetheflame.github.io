const fs = require('fs');
const path = require('path');
const marked = require('marked');
const hljs = require('highlight.js');

// Include the posts index updater
try {
  require('./update-posts-index.js');
} catch (error) {
  console.log('Posts index updater not available');
}

// Configure marked with highlight.js
marked.setOptions({
  highlight: function(code, lang) {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    return hljs.highlight(code, { language }).value;
  },
  langPrefix: 'hljs language-',
});

// Function to parse frontmatter from markdown
function parseFrontmatter(content) {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  const match = content.match(frontmatterRegex);
  
  if (match) {
    const frontmatter = {};
    const lines = match[1].split('\n');
    
    lines.forEach(line => {
      const [key, value] = line.split(':').map(str => str.trim());
      if (key && value) {
        if (key === 'tags') {
          // Parse tags array
          frontmatter[key] = value.replace(/[\[\]]/g, '').split(',').map(tag => tag.trim().replace(/^['"]|['"]$/g, ''));
        } else {
          frontmatter[key] = value.replace(/^['"]|['"]$/g, '');
        }
      }
    });
    
    return {
      frontmatter,
      content: content.replace(frontmatterRegex, '')
    };
  }
  
  return {
    frontmatter: {},
    content
  };
}

// Function to create HTML template
function createHtmlTemplate(title, content, tags = [], date = '') {
  // Create tags HTML
  const tagsHtml = tags.length > 0 
    ? `<div class="post-tags">
        <span>标签:</span>
        ${tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
      </div>`
    : '';
  
  // Create date HTML
  const dateHtml = date ? `<div class="post-date">发布于: ${date}</div>` : '';
  
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="../shared.css">
  <link rel="stylesheet" href="../main_page.css">
  <link rel="stylesheet" href="../components.css">
  <link rel="stylesheet" href="../utilities.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/styles/default.min.css">
  <style>
    .markdown-content {
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      background: white;
      border-radius: 10px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    
    .markdown-content h1, .markdown-content h2, .markdown-content h3 {
      color: #2c3e50;
      margin-top: 1.5em;
      margin-bottom: 0.5em;
    }
    
    .markdown-content p {
      line-height: 1.6;
      color: #333;
      margin-bottom: 1em;
    }
    
    .markdown-content a {
      color: #3498db;
      text-decoration: none;
    }
    
    .markdown-content a:hover {
      text-decoration: underline;
    }
    
    .markdown-content pre {
      background: #f8f9fa;
      border-radius: 5px;
      padding: 1rem;
      overflow-x: auto;
      margin: 1.5rem 0;
    }
    
    .markdown-content code {
      background: #f8f9fa;
      padding: 0.2rem 0.4rem;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
    }
    
    .markdown-content pre code {
      background: none;
      padding: 0;
    }
    
    .markdown-content blockquote {
      border-left: 4px solid #3498db;
      padding: 0.5rem 1rem;
      margin: 1.5rem 0;
      background: #f8f9fa;
      border-radius: 0 5px 5px 0;
    }
    
    .markdown-content ul, .markdown-content ol {
      padding-left: 2rem;
      margin-bottom: 1rem;
    }
    
    .markdown-content li {
      margin-bottom: 0.5rem;
    }
    
    .markdown-content img {
      max-width: 100%;
      height: auto;
      border-radius: 5px;
      margin: 1rem 0;
    }
    
    .markdown-content table {
      width: 100%;
      border-collapse: collapse;
      margin: 1.5rem 0;
    }
    
    .markdown-content th, .markdown-content td {
      border: 1px solid #ddd;
      padding: 0.75rem;
      text-align: left;
    }
    
    .markdown-content th {
      background: #f8f9fa;
      font-weight: bold;
    }
    
    .post-meta {
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #eee;
    }
    
    .post-date {
      color: #7f8c8d;
      font-size: 0.9rem;
      margin-bottom: 0.5rem;
    }
    
    .post-tags {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .tag {
      background: #3498db;
      color: white;
      padding: 0.2rem 0.5rem;
      border-radius: 3px;
      font-size: 0.8rem;
    }
  </style>
</head>
<body>
  <!-- 顶部导航栏 -->
  <header class="navbar">
    <div class="nav-container">
      <div class="logo">
        <h2>我的博客</h2>
      </div>
      <nav class="nav-menu">
        <ul>
          <li><a href="../index.html">首页</a></li>
          <li><a href="../posts/index.html">文章</a></li>
          <li><a href="#contact">联系</a></li>
        </ul>
      </nav>
    </div>
  </header>

  <!-- 主要内容区域 -->
  <main class="main-content">
    <div class="markdown-content">
      <h1>${title}</h1>
      <div class="post-meta">
        ${dateHtml}
        ${tagsHtml}
      </div>
      ${content}
    </div>
  </main>

  <footer class="footer">
    <p>&copy; 2025 我的博客. 保留所有权利.</p>
  </footer>
</body>
</html>`;
}

// Function to process markdown files
function processMarkdownFiles(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      processMarkdownFiles(filePath);
    } else if (path.extname(file) === '.md') {
      const markdownContent = fs.readFileSync(filePath, 'utf8');
      
      // Parse frontmatter
      const { frontmatter, content } = parseFrontmatter(markdownContent);
      
      // Extract title from frontmatter or first line
      let title = frontmatter.title || 'Markdown Content';
      if (!frontmatter.title && content.startsWith('# ')) {
        title = content.split('\n')[0].substring(2);
      }
      
      // Extract tags and date
      const tags = frontmatter.tags || [];
      const date = frontmatter.date || '';
      
      // Convert markdown to HTML
      const htmlContent = marked.parse(content);
      
      // Create HTML template
      const fullHtml = createHtmlTemplate(title, htmlContent, tags, date);
      
      // Write HTML file
      const htmlFilePath = filePath.replace('.md', '.html');
      fs.writeFileSync(htmlFilePath, fullHtml);
      
      console.log(`Converted ${filePath} to ${htmlFilePath}`);
    }
  });
}

// Process markdown files in specific directories
const directoriesToProcess = [
  'posts',
  'blog_space',
  'live_note',
  'inside_blog',
  'ascend_npu'
];

directoriesToProcess.forEach(dir => {
  if (fs.existsSync(dir)) {
    console.log(`Processing directory: ${dir}`);
    processMarkdownFiles(dir);
  }
});

console.log('Markdown to HTML conversion completed!');