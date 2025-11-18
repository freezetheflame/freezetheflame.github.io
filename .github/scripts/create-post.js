const fs = require('fs');
const path = require('path');

// Get today's date in YYYY-MM-DD format
function getTodayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Slugify a string (support Chinese characters)
function slugify(text) {
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\u4e00-\u9fa5\-]+/g, '')  // Remove all non-word chars except Chinese
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '');            // Trim - from end of text
}

// Create a new post
function createPost() {
  // Get title from command line arguments or use default
  const title = process.argv[2] || 'New Post';
  
  // Get today's date
  const date = getTodayDate();
  
  // Create directory structure: posts/YYYY-MM-DD/
  const postDir = path.join('posts', date);
  
  // Ensure directory exists
  if (!fs.existsSync(postDir)) {
    fs.mkdirSync(postDir, { recursive: true });
  }
  
  // Create filename (slugified title)
  let slug = slugify(title);
  
  // Ensure we have a valid slug
  if (!slug) {
    slug = `post-${Date.now()}`;
  }
  
  const fileName = `${slug}.md`;
  const filePath = path.join(postDir, fileName);
  
  // Check if file already exists
  if (fs.existsSync(filePath)) {
    console.log(`Post "${title}" for ${date} already exists.`);
    return;
  }
  
  // Create markdown content with frontmatter
  const content = `---
title: ${title}
date: ${date}
tags: []
---

# ${title}

欢迎来到你的新博客文章！在这里写下你的想法和分享。

## 章节示例

这是文章的第一个章节。你可以在这里写任何你想写的内容。

### 子章节

你还可以创建更深层次的内容结构。

## 代码示例

你可以插入代码块：

\`\`\`javascript
console.log("Hello, world!");
\`\`\`

## 列表示例

- 这是一个列表项
- 这是另一个列表项
- 你可以添加更多项

## 结论

这是一篇示例文章，展示了基本的 Markdown 格式。你可以根据需要修改和扩展它。

<!-- 文章结束 -->
`;
  
  // Write file
  fs.writeFileSync(filePath, content);
  
  console.log(`Created new post: ${filePath}`);
  console.log(`To add tags, edit the frontmatter section at the top of the file:`);
  console.log(`tags: [JavaScript, Blog, Tutorial]`);
}

// Run the function
createPost();