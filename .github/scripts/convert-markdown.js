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

// Function to create HTML template
function createHtmlTemplate(title, content) {
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
  </style>
</head>
<body>
  <!-- 顶部导航栏 -->
  <header class="navbar">
    <div class="nav-container">
      <div class="logo">
        <h2>我的知识库</h2>
      </div>
      <nav class="nav-menu">
        <ul>
          <li><a href="../index.html">首页</a></li>
          <li><a href="../blog_space/blog.html">博客</a></li>
          <li><a href="../live_note/note&skills.html">笔记</a></li>
          <li><a href="../photo_showing_place/photo.html">相册</a></li>
          <li><a href="../sitemap.html">网站地图</a></li>
          <li><a href="#contact">联系</a></li>
        </ul>
      </nav>
    </div>
  </header>

  <!-- 主要内容区域 -->
  <main class="main-content">
    <div class="markdown-content">
      <h1>${title}</h1>
      ${content}
    </div>
  </main>

  <footer class="footer">
    <p>&copy; 2025 个人知识分享网站. 保留所有权利.</p>
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
      
      // Extract title from first line (assuming it's a heading)
      const lines = markdownContent.split('\n');
      let title = 'Markdown Content';
      if (lines[0].startsWith('# ')) {
        title = lines[0].substring(2);
      }
      
      // Convert markdown to HTML
      const htmlContent = marked.parse(markdownContent);
      
      // Create HTML template
      const fullHtml = createHtmlTemplate(title, htmlContent);
      
      // Write HTML file
      const htmlFilePath = filePath.replace('.md', '.html');
      fs.writeFileSync(htmlFilePath, fullHtml);
      
      console.log(`Converted ${filePath} to ${htmlFilePath}`);
    }
  });
}

// Process markdown files in specific directories
const directoriesToProcess = [
  'live_note',
  'blog_space',
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