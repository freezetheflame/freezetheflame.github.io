const fs = require('fs');
const path = require('path');

// Function to find all HTML files in a directory (excluding index files)
function findHtmlFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      findHtmlFiles(filePath, fileList);
    } else if (path.extname(file) === '.html' && !file.includes('index')) {
      // Get relative path from blog_space directory
      const relativePath = path.relative('blog_space', filePath);
      fileList.push(relativePath);
    }
  });
  
  return fileList;
}

// Function to generate markdown index content
function generateIndexContent(htmlFiles) {
  let content = `# 博客文章列表

这里列出了所有通过 Markdown 自动转换的博客文章。

## 文章列表

`;
  
  htmlFiles.forEach(file => {
    // Convert file path to title (remove extension and replace -/_ with spaces)
    const fileName = path.basename(file, '.html');
    const title = fileName.replace(/[-_]/g, ' ');
    
    content += `- [${title}](${file})\n`;
  });
  
  content += `\n*更多文章将在您添加 Markdown 文件后自动显示在此处。*`;
  
  return content;
}

// Main function
function updatePostsIndex() {
  const directories = ['blog_space', 'live_note', 'inside_blog', 'ascend_npu'];
  let allHtmlFiles = [];
  
  directories.forEach(dir => {
    if (fs.existsSync(dir)) {
      const htmlFiles = findHtmlFiles(dir);
      allHtmlFiles = allHtmlFiles.concat(htmlFiles);
    }
  });
  
  // Filter out non-post files
  const postFiles = allHtmlFiles.filter(file => 
    !file.includes('index.html') && 
    !file.includes('blog.html') &&
    !file.includes('posts-index.html') &&
    !file.includes('note&skills.html') &&
    !file.includes('photo.html')
  );
  
  if (postFiles.length > 0) {
    const indexContent = generateIndexContent(postFiles);
    fs.writeFileSync('blog_space/posts-index.md', indexContent);
    console.log('Updated posts index with', postFiles.length, 'posts');
  }
}

// Run the function
updatePostsIndex();