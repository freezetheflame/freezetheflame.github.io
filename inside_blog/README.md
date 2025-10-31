# 个人知识分享网站

这是一个用于分享学习笔记、技术心得和个人项目的现代化静态网站。

## 🌟 网站特色

- **响应式设计** - 适配各种设备屏幕
- **现代化UI** - 渐变色彩、阴影效果和动画过渡
- **交互体验** - 平滑滚动、悬停效果和动态交互
- **模块化结构** - 清晰的代码组织和可复用组件
- **主题切换** - 支持亮色和暗色主题切换
- **SEO优化** - 包含网站地图和元标签优化
- **实用工具类** - 提供丰富的CSS实用工具类

## 📁 网站结构

```
├── index.html              # 主页
├── shared.css              # 共享样式文件
├── main_page.css           # 主页特定样式
├── components.css          # 可复用组件样式
├── utilities.css           # 实用工具类样式
├── script.js               # 全局JavaScript功能
├── package.json            # Node.js 依赖配置
├── DOCS.md                 # Markdown 转换功能说明
├── blog_space/             # 博客页面
│   ├── blog.html           # 博客主页
│   ├── index.html          # 动画展示页
│   ├── style.css
│   └── script.js
├── live_note/              # 学习笔记
│   ├── note&skills.html
│   └── notesdecoration.css
├── photo_showing_place/    # 相册页面
│   ├── photo.html
│   ├── Yoimiya1.jpg
│   ├── Yoimiya2.jpg
│   ├── Yoimiya3.png
│   └── Yoimiya4.jpg
├── inside_blog/            # 内部博客资源
│   ├── index.html
│   └── index.css
├── .github/
│   ├── workflows/          # GitHub Actions 工作流
│   │   └── markdown-to-html.yml
│   └── scripts/            # 转换脚本
│       └── convert-markdown.js
└── sitemap.html            # 网站地图
```

## 🛠 技术栈

- **HTML5** - 语义化标签和现代结构
- **CSS3** - 渐变、阴影、动画和Flexbox/Grid布局
- **JavaScript** - DOM操作和交互功能
- **jQuery** - 简化DOM操作
- **Slick Carousel** - 响应式图片轮播（用于相册页面）
- **Node.js** - Markdown 转换工具（marked, highlight.js）
- **GitHub Actions** - 自动化部署和转换

## 🎨 设计亮点

1. **统一设计语言** - 所有页面使用一致的色彩方案和组件样式
2. **微交互动画** - 悬停效果、波纹动画和页面过渡
3. **渐进式增强** - 基础功能兼容性好，现代浏览器体验更佳
4. **性能优化** - 合理的资源加载和代码组织
5. **可访问性** - 良好的语义化结构和键盘导航支持
6. **主题支持** - 支持亮色和暗色主题切换

## 🚀 使用说明

1. 克隆或下载仓库
2. 使用浏览器直接打开 `index.html` 文件
3. 根据需要修改内容和样式
4. 切换主题使用右下角的主题切换按钮
5. 返回顶部使用右下角的返回顶部按钮
6. 在 `live_note`、`blog_space` 或 `inside_blog` 目录下创建 `.md` 文件，系统会自动转换为 HTML 页面

## 📞 联系方式

如有任何问题或建议，请通过以下方式联系：

- GitHub Issues: [提交问题](https://github.com/yourusername/yourrepo/issues)

## © 版权信息

版权所有 © 2025 @sjw

保留所有权利。