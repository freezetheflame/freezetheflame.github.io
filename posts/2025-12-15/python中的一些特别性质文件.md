---
title: python中的一些特别性质文件
date: 2025-12-15
tags: [AI, python]
---


## __init__.py

在Python工程里，当python检测到一个目录下存在__init__.py文件时，python就会把它当成一个[模块](<https://zhida.zhihu.com/search?content_id=113764169&content_type=Article&match_order=1&q=%E6%A8%A1%E5%9D%97&zhida_source=entity>)(module)。Module跟C＋＋的[命名空间](<https://zhida.zhihu.com/search?content_id=113764169&content_type=Article&match_order=1&q=%E5%91%BD%E5%90%8D%E7%A9%BA%E9%97%B4&zhida_source=entity>)和Java的Package的概念很像，都是为了科学地组织化工程，管理命名空间。

### 主要作用：

  1. **标识目录为Python包**  
即使为空文件，目录中包含`__init__.py`也会被Python视为包（适用于Python 3.3之前的版本；3.3+支持"命名空间包"，无需此文件）。

  2. **初始化包级代码**  
当包被导入时，`__init__.py`中的代码会**自动执行** （例如：初始化变量、连接数据库）。

  3. **控制模块导入** 

     * **批量导入** ：简化用户导入路径（例：`from mypackage import func` 而非 `from mypackage.module import func`）。

     * **定义`__all__`**：指定`from package import *`时导入哪些模块。

     * **隐藏内部实现** ：可在`__init__.py`中导入公共接口，隐藏内部模块。

  4. **共享包级变量/函数**  
在`__init__.py`中定义变量、函数或类，可在包的多个模块间共享。

### 执行顺序示例


    
    mypackage/
├── __init__.py         # (1)
├── module1.py          
└── subpackage/
    ├── __init__.py     # (2)
    └── module2.py      # (4)

当执行 `import mypackage.subpackage.module2` 时：

  1. **先执行外层包初始化** ：`mypackage/__init__.py` (1)

  2. **再执行子包初始化** ：`mypackage/subpackage/__init__.py` (2)

  3. **最后导入目标模块** ：`module2.py` (4)
