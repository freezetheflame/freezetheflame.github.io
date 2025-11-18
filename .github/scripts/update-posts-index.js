const fs = require('fs');
const path = require('path');

// Store for posts data
let allPosts = [];

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

// Function to extract date from filename or frontmatter
function extractDate(filePath, frontmatter) {
  // Try to get date from frontmatter first
  if (frontmatter.date) {
    return frontmatter.date;
  }
  
  // Try to extract date from path (posts/YYYY-MM-DD/)
  const dateMatch = filePath.match(/posts\/(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    return dateMatch[1];
  }
  
  // Fallback to file modification time
  try {
    const stats = fs.statSync(filePath);
    const date = new Date(stats.mtime);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  } catch (err) {
    return 'Unknown';
  }
}

// Function to find all Markdown files in a directory
function findMarkdownFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      findMarkdownFiles(filePath, fileList);
    } else if (path.extname(file) === '.md') {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

// Function to collect post data
function collectPostData(markdownFiles) {
  const posts = [];
  
  markdownFiles.forEach(filePath => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const { frontmatter } = parseFrontmatter(content);
      
      // Extract title from frontmatter or filename
      let title = frontmatter.title || path.basename(filePath, '.md');
      
      // Extract date
      const date = extractDate(filePath, frontmatter);
      
      // Extract tags
      const tags = frontmatter.tags || [];
      
      // Generate HTML path
      const htmlPath = filePath.replace('.md', '.html');
      
      // Get relative path from root
      const relativePath = path.relative('.', htmlPath).replace(/\\/g, '/');
      
      posts.push({
        title,
        date,
        tags,
        path: relativePath,
        filePath
      });
    } catch (err) {
      console.error(`Error processing ${filePath}:`, err);
    }
  });
  
  return posts;
}

// Function to sort posts by date (newest first)
function sortPostsByDate(posts) {
  return posts.sort((a, b) => {
    // Convert dates to comparable format
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    
    // Sort descending (newest first)
    return dateB - dateA;
  });
}

// Function to group posts by tags
function groupPostsByTags(posts) {
  const tagGroups = {};
  
  posts.forEach(post => {
    post.tags.forEach(tag => {
      if (!tagGroups[tag]) {
        tagGroups[tag] = [];
      }
      tagGroups[tag].push(post);
    });
  });
  
  return tagGroups;
}

// Function to generate main index content
function generateMainIndexContent(posts, tagGroups) {
  // Generate posts list
  let postsList = '';
  posts.slice(0, 20).forEach(post => { // Show only latest 20 posts
    postsList += `- [${post.title}](${post.path}) (${post.date})\n`;
  });
  
  // Generate tags list
  let tagsList = '';
  Object.keys(tagGroups).sort().forEach(tag => {
    tagsList += `- [${tag}](tags/${tag}.html) (${tagGroups[tag].length} 篇文章)\n`;
  });
  
  return `# 我的博客

欢迎来到我的博客！这里记录了我的学习笔记和技术分享。

## 最新文章

${postsList}

## 标签分类

${tagsList}

## 搜索

你可以使用浏览器的页面搜索功能（Ctrl+F 或 Cmd+F）来查找特定内容。

*更多文章将在您添加 Markdown 文件后自动显示在此处。*
`;
}

// Function to generate tag index content
function generateTagIndexContent(tag, posts) {
  let postsList = '';
  posts.forEach(post => {
    postsList += `- [${post.title}](${path.relative('posts/tags', post.path).replace(/\\/g, '/')}) (${post.date})\n`;
  });
  
  return `# 标签: ${tag}

这个标签下的所有文章。

## 文章列表

${postsList}

[返回主页](../index.html)
`;
}

// Function to generate tag index page
function generateTagPageIndexContent(tagGroups) {
  let tagsList = '';
  Object.keys(tagGroups).sort().forEach(tag => {
    tagsList += `- [${tag}](tags/${tag}.html) (${tagGroups[tag].length} 篇文章)\n`;
  });
  
  return `# 所有标签

这里是所有文章标签的完整列表。

## 标签列表

${tagsList}

[返回主页](../index.html)
`;
}

// Function to create tag pages
function createTagPages(tagGroups) {
  // Create tags directory if it doesn't exist
  const tagsDir = 'posts/tags';
  if (!fs.existsSync(tagsDir)) {
    fs.mkdirSync(tagsDir, { recursive: true });
  }
  
  // Create individual tag pages
  Object.entries(tagGroups).forEach(([tag, posts]) => {
    const tagContent = generateTagIndexContent(tag, posts);
    const tagFileName = `${tag}.html`.replace(/[^a-zA-Z0-9\u4e00-\u9fa5\-_.]/g, '-'); // Sanitize filename
    const tagFilePath = path.join(tagsDir, tagFileName);
    
    // Simple HTML template for tag page
    const tagHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>标签: ${tag} - 我的博客</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    a { color: #3498db; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  ${marked.parse(tagContent)}
</body>
</html>`;
    
    fs.writeFileSync(tagFilePath, tagHtml);
  });
  
  // Create tag index page
  const tagIndexContent = generateTagPageIndexContent(tagGroups);
  const tagIndexHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>所有标签 - 我的博客</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    a { color: #3498db; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  ${marked.parse(tagIndexContent)}
</body>
</html>`;
  
  fs.writeFileSync(path.join(tagsDir, 'index.html'), tagIndexHtml);
}

// Import marked for HTML generation
const marked = require('marked');

// Main function
function updatePostsIndex() {
  const directories = ['posts', 'blog_space', 'live_note', 'inside_blog', 'ascend_npu'];
  let allMarkdownFiles = [];
  
  directories.forEach(dir => {
    if (fs.existsSync(dir)) {
      const markdownFiles = findMarkdownFiles(dir);
      allMarkdownFiles = allMarkdownFiles.concat(markdownFiles);
    }
  });
  
  // Collect all posts data
  allPosts = collectPostData(allMarkdownFiles);
  
  // Sort posts by date
  const sortedPosts = sortPostsByDate(allPosts);
  
  // Group posts by tags
  const tagGroups = groupPostsByTags(sortedPosts);
  
  // Create posts directory if it doesn't exist
  if (!fs.existsSync('posts')) {
    fs.mkdirSync('posts', { recursive: true });
  }
  
  // Generate main index
  const mainIndexContent = generateMainIndexContent(sortedPosts, tagGroups);
  fs.writeFileSync('posts/index.md', mainIndexContent);
  
  // Create tag pages
  createTagPages(tagGroups);
  
  console.log('Updated posts index with', sortedPosts.length, 'posts');
  console.log('Generated', Object.keys(tagGroups).length, 'tag pages');
}

// Run the function
updatePostsIndex();