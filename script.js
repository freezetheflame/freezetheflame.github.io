// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
  // 添加滚动效果到导航栏
  const navbar = document.querySelector('.navbar');
  window.addEventListener('scroll', function() {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });

  // 添加卡片悬停效果
  const cards = document.querySelectorAll('.card');
  cards.forEach(card => {
    // 添加进入视图动画
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.animation = 'fadeIn 0.8s ease-out forwards';
          entry.target.style.opacity = '0';
          entry.target.style.transform = 'translateY(20px)';
        }
      });
    }, { threshold: 0.1 });
    
    observer.observe(card);
  });

  // 添加搜索框焦点效果
  const searchInput = document.querySelector('.search-input');
  if (searchInput) {
    searchInput.addEventListener('focus', function() {
      this.parentElement.style.boxShadow = '0 0 0 3px rgba(52, 152, 219, 0.2)';
      this.style.borderColor = '#3498db';
    });
    
    searchInput.addEventListener('blur', function() {
      this.parentElement.style.boxShadow = 'none';
      this.style.borderColor = '#ddd';
    });
  }

  // 添加平滑滚动效果
  const links = document.querySelectorAll('a[href^="#"]');
  links.forEach(link => {
    link.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId !== '#' && targetId.startsWith('#')) {
        e.preventDefault();
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
          window.scrollTo({
            top: targetElement.offsetTop - 80,
            behavior: 'smooth'
          });
        }
      }
    });
  });

  // 添加按钮点击波纹效果
  const buttons = document.querySelectorAll('.btn');
  buttons.forEach(button => {
    button.addEventListener('click', function(e) {
      // 创建波纹元素
      const ripple = document.createElement('span');
      ripple.classList.add('ripple');
      
      // 获取按钮位置和尺寸
      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size/2;
      const y = e.clientY - rect.top - size/2;
      
      // 设置波纹样式
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = x + 'px';
      ripple.style.top = y + 'px';
      
      // 添加到按钮并播放动画
      this.appendChild(ripple);
      
      setTimeout(() => {
        ripple.remove();
      }, 600);
    });
  });
  
  // 添加返回顶部按钮
  const backToTopButton = document.createElement('button');
  backToTopButton.innerHTML = '↑';
  backToTopButton.classList.add('back-to-top');
  document.body.appendChild(backToTopButton);
  
  // 添加主题切换功能
  const themeToggle = document.createElement('button');
  themeToggle.innerHTML = '🌓';
  themeToggle.classList.add('theme-toggle');
  document.body.appendChild(themeToggle);
  
  // 滚动时显示按钮
  window.addEventListener('scroll', function() {
    if (window.scrollY > 300) {
      backToTopButton.classList.add('show');
      themeToggle.classList.add('show');
    } else {
      backToTopButton.classList.remove('show');
      themeToggle.classList.remove('show');
    }
  });
  
  window.addEventListener('scroll', function() {
    if (window.scrollY > 300) {
      backToTopButton.classList.add('show');
    } else {
      backToTopButton.classList.remove('show');
    }
  });
  
  backToTopButton.addEventListener('click', function() {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  });
  
  // 主题切换功能
  themeToggle.addEventListener('click', function() {
    document.body.classList.toggle('dark-mode');
    
    // 保存用户主题偏好
    if (document.body.classList.contains('dark-mode')) {
      localStorage.setItem('theme', 'dark');
    } else {
      localStorage.setItem('theme', 'light');
    }
  });
  
  // 检查用户主题偏好
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
  }
});

// 原有的搜索表单功能
var s = $('input'),
    f  = $('form'),
    a = $('.after'),
    m = $('h4');

s.focus(function(){
  if( f.hasClass('open') ) return;
  f.addClass('in');
  setTimeout(function(){
    f.addClass('open');
    f.removeClass('in');
  }, 1300);
});

a.on('click', function(e){
  e.preventDefault();
  if( !f.hasClass('open') ) return;
   s.val('');
  f.addClass('close');
  f.removeClass('open');
  setTimeout(function(){
    f.removeClass('close');
  }, 1300);
});

f.submit(function(e){
  e.preventDefault();
  m.html('Thanks, high five!').addClass('show');
  f.addClass('explode');
  setTimeout(function(){
    s.val('');
    f.removeClass('explode');
    m.removeClass('show');
  }, 3000);
});

// 添加CSS样式到页面
const style = document.createElement('style');
style.innerHTML = `
  @keyframes ripple {
    to {
      transform: scale(4);
      opacity: 0;
    }
  }
  
  .ripple {
    position: absolute;
    border-radius: 50%;
    background-color: rgba(255, 255, 255, 0.7);
    transform: scale(0);
    animation: ripple 0.6s linear;
    pointer-events: none;
  }
  
  .back-to-top {
    position: fixed;
    bottom: 30px;
    right: 30px;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: linear-gradient(135deg, #3498db, #2c3e50);
    color: white;
    border: none;
    font-size: 24px;
    cursor: pointer;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    transition: all 0.3s ease;
    opacity: 0;
    visibility: hidden;
    z-index: 1000;
  }
  
  .back-to-top.show {
    opacity: 1;
    visibility: visible;
  }
  
  .back-to-top:hover {
    transform: translateY(-5px) scale(1.1);
    box-shadow: 0 8px 20px rgba(0,0,0,0.3);
  }
  
  /* 主题切换按钮 */
  .theme-toggle {
    position: fixed;
    bottom: 30px;
    right: 100px;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: linear-gradient(135deg, #3498db, #2c3e50);
    color: white;
    border: none;
    font-size: 24px;
    cursor: pointer;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    transition: all 0.3s ease;
    opacity: 0;
    visibility: hidden;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .theme-toggle.show {
    opacity: 1;
    visibility: visible;
  }
  
  .theme-toggle:hover {
    transform: translateY(-5px) scale(1.1);
    box-shadow: 0 8px 20px rgba(0,0,0,0.3);
  }
};

document.head.appendChild(style);

// 添加深色模式样式
const darkModeStyle = document.createElement('style');
darkModeStyle.innerHTML = '.dark-mode body { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%) !important; color: #eeeeee; } ' +
  '.dark-mode .navbar { background: linear-gradient(90deg, #0f3460 0%, #1a1a2e 100%) !important; } ' +
  '.dark-mode .card, .dark-mode .search-section, .dark-mode .notes-menu, .dark-mode .menu-category, .dark-mode .resource-card, .dark-mode .slider-container, .dark-mode .post-card { background: linear-gradient(135deg, #16213e 0%, #1a1a2e 100%) !important; border: 1px solid #0f3460; box-shadow: 0 8px 20px rgba(0,0,0,0.3); } ' +
  '.dark-mode .card h3, .dark-mode .content-section h1, .dark-mode .menu-category h3, .dark-mode .resource-card h3, .dark-mode .post-content h3 { color: #4cc9f0 !important; } ' +
  '.dark-mode .card p, .dark-mode .menu-category p, .dark-mode .resource-card p, .dark-mode .post-content p { color: #adb5bd !important; } ' +
  '.dark-mode .footer { background: linear-gradient(90deg, #0f3460 0%, #1a1a2e 100%) !important; } ' +
  '.dark-mode .card-link, .dark-mode .category-link, .dark-mode .resource-link { color: #4cc9f0 !important; } ' +
  '.dark-mode .card-link:hover, .dark-mode .category-link:hover, .dark-mode .resource-link:hover { color: #4895ef !important; }';
document.head.appendChild(darkModeStyle);`;
document.head.appendChild(style);