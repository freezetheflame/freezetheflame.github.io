---
title: pip包管理机制
date: 2025-11-30
tags: [python]
---

\n

学到python之后，所有初学者接触到的第一件事（除开语法之外），实际上就是python的包管理方式，其中，如果要下载一个新的python依赖库，初学者大多数会采取pip install 的方式完成对python依赖包的安装，当然在对于python相关项目不断的深入接触后，仅仅使用pip install xxx的语句，早已无法满足复杂项目的需求，于是我们逐渐接触到了虚拟环境下的pip install，pip install xxx==A.B.C, pip install -i xxxxx/simple等语句选项，分别用于控制包管理作用域、选定包版本进行安装、使用非官方源进行安装等等。当然，这在python包管理中也只是冰山一角，至于conda包管理以及更加新颖、安全、高速的uv。poetry等包管理方式，以及各种本地安装、编译安装方式，才是更复杂，同时也更困难的package installation。

\n\n\n\n

那这么复杂的包管理，本文会全部都“事无巨细”地全讲解一遍吗？显然我不是这个目的，也没这个心力。关于pip install本身，它很简单也很直白，不必花费过多笔墨介绍，我需要介绍的，是隐藏在这条指令后的安装方式，比如：site-packages如何管理包？如何安全、有效的删除一个包，避免依赖上的问题？在使用set_up.py，pip install -e .等本地安装时，需要注意些什么？我将就这些话题进行一个讨论。其中不免有部分文本和检索来自GPT的协助，我将尽可能保证内容上的正确性与来源可靠，请读者也带着批判的观点进行阅读。

\n\n\n\n

## pip install的过程中，发生了什么

\n\n\n\n

参考文献（文章/articles）：[《"pip install" 是如何工作的 - DEV Community》 --- How "pip install" Works - DEV Community](<https://dev.to/alexbecker/how-pip-install-works-323j>)   
[Exploring Python Package Manager ·](<https://main--dasarpai.netlify.app/dsblog/exploring-python-package-manager/>)  
[Python 在哪里查找包？:: OxRSE Python 打包工作坊 --- Where does python look for packages? :: OxRSE Python Packaging Workshop](<https://blog.oxrse.uk/python-packaging-course/part2_reusing_a_package/where-does-python-look-for-packages/>)

\n\n\n\n

当你输入pip install <some package>时，首先pip会确认，你要安装的distribution。每个 Python 包的版本（或发布）通常有多个 `distributions` 。有 7 种不同的分发类型，但目前最常见的是源分发和二进制轮。源分发就是它所标示的那样——包开发者编写的原始 Python 代码和潜在的 C 扩展代码。二进制轮是一种更复杂的归档格式，可以包含编译的 C 扩展代码。这对用户来说很方便，因为从源代码编译，比如 numpy，需要很长时间（在我的桌面上大约需要 4 分钟），而且包作者很难确保他们的源代码会在其他人的机器上编译。坏处就是，编译的代码特定于架构，并且通常特定于它被编译的操作系统，所以不一定有你的小众机器架构、操作系统的分发包，

\n\n\n\n

要查找可用的分发版本， `pip` 请求 `https://pypi.org/simple/<somepackage>` （请根据对应的pypi源进行替换，有的镜像源不够全），这是一个包含大量链接的简单 HTML 页面，链接文本是分发的文件名。文件名编码了版本、分发类型，对于二进制轮，还编码了它们兼容的架构和操作系统。这种格式复杂到足以由两个不同的 PEPs 覆盖：

\n\n\n\n

\n
  * The version scheme is covered by [PEP 440](<https://www.python.org/dev/peps/pep-0440/#version-scheme>).  
版本方案由 PEP 440 覆盖。
\n\n\n\n
  * Binary wheel filename compatibility tags are the subject of [PEP 425](<https://www.python.org/dev/peps/pep-0425/>).  
二进制轮文件名兼容性标签是 PEP 425 的主题。
\n
\n\n\n\n

这里的PEP，指的是二进制轮兼容性标签，以下以PEP425为例

\n\n\n\n

平台兼容性（如`manylinux_2_17_x86_64`表示兼容x86_64架构的Linux系统）

\n\n\n\n

**作用** ：定义了wheel二进制分发包的文件名格式和兼容性标记

\n\n\n\n

**解决的问题** ：确保预编译的二进制包能在正确的Python版本、操作系统和架构上运行

\n\n\n\n

**核心内容** ：

\n\n\n\n

wheel文件名格式：`{distribution}-{version}(-{build tag})?-{python tag}-{abi tag}-{platform tag}.whl`

\n\n\n\n

\n
  * 例如：`numpy-1.21.2-cp39-cp39-manylinux_2_17_x86_64.whl`
\n\n\n\n
  * 兼容性标签包含：\n\n
    * Python实现和版本（如`cp39`表示CPython 3.9）
\n\n\n\n
    * ABI兼容性（如`cp39`表示CPython 3.9 ABI）
\n\n
\n
\n\n\n\n

### 关于分发版本的选择

\n\n\n\n

要选择一个分发版本， `pip` 首先确定哪些分发版本与您的系统和 Python 实现 兼容。对于二进制轮，它根据 PEP 425 解析文件名，提取 Python 实现、应用程序二进制接口和平台。It can be relatively obvious, like `win32` for 32-bit Windows, but I am usually installing `manylinux1` wheels. （注： manylinux到底能指代哪些linux发行版仍然存在质疑）

\n\n\n\n

一旦 `pip` 获得了一组兼容的分发包列表，它会按版本排序，**选择最新版本** ，然后为该版本选择"最佳"分发包。如果有二进制wheel包，它会优先选择，如果有多个则选择**最符合安装环境的那个** 。这只是 `pip` 的默认偏好设置——它们可以通过 `--no-binary` 或 `--prefer-binary` 等选项进行配置。"最佳"分发包要么从本地缓存下载，要么直接安装，在 Linux 系统中，本地缓存通常位于 `~/.cache/pip` 。

\n\n\n\n

### 关于依赖

\n\n\n\n

对于二进制轮，依赖项列在名为 `METADATA` 的文件中。但对于源分发，依赖项实际上就是当你用 `install` 命令执行它们的 `setup.py` 脚本时安装的内容。除非你尝试一下，否则无法知道，而 `pip` 正是做这件事的！具体来说，它利用 `setuptools` 来运行 `install` 直到知道要安装哪些依赖项。然而，运行 `install` 本身可能也需要依赖项，这会使情况更加复杂。在 Python 包中指定这种依赖项的标准方法是将 `setup_requires` 参数传递给 `setuptools.setup` 。通过 `setuptools` ， `pip` 会运行 `setup.py` 足够长的时间来发现 `setup_requires` ，安装这些依赖项，然后再次执行 `setup.py` 。当然，这很荒谬， `setup_requires` 绝对不应该使用。

\n\n\n\n

### Steps Followed by PIP During pip install(By detail)(来自引文2)

\n\n\n\n

**Command Execution** : The user enters the command `pip install package_name` in the terminal.

\n\n\n\n

\n
  1. **Package Metadata Retrieval** :\n\n
     * PIP **retrieves metadata about the specified package** from the Python Package Index (PyPI) or the specified repository. This includes information about the package version, dependencies, and available releases.
\n\n
\n\n\n\n
  2. **Dependency Resolution** :\n\n
     * PIP checks for dependencies required by the specified package. It **examines the metadata to identify any packages that need to be installed alongside the main package.**
\n\n\n\n
     * PIP resolves these dependencies, ensuring that compatible versions are selected based on the requirements specified in the package’s metadata.
\n\n
\n\n\n\n
  3. **Version Selection** :\n\n
     * If multiple versions of the package or its dependencies are available, PIP selects the version that satisfies the version constraints specified by the user or the package itself.
\n\n\n\n
     * If no version is specified, PIP defaults to the latest version available.
\n\n
\n\n\n\n
  4. **Downloading Packages** :\n\n
     * PIP downloads the selected package and its dependencies from PyPI or the specified repository. The downloaded files can be source distributions (tar.gz) or wheel distributions (.whl).
\n\n
\n\n\n\n
  5. **Installation Process** :\n\n
     * After downloading, PIP installs the packages into the active Python environment:\n\n
       * If the package is a wheel file, PIP uses the wheel format for faster installation.
\n\n\n\n
       * If the package is a source distribution, PIP may**compile the package** during installation.
\n\n
\n\n\n\n
     * During this step, PIP may also execute any setup scripts included with the package.
\n\n
\n\n\n\n
  6. **Dependency Installation** :\n\n
     * PIP installs all resolved dependencies in the order they were determined, ensuring that each dependency is satisfied before installing the next.
\n\n
\n\n\n\n
  7. **Scripts and Executables**[optional]:\n\n
     * If the package provides any command-line scripts or executables, PIP installs them into the appropriate directory (e.g., `bin` for UNIX-like systems or `Scripts` for Windows).
\n\n
\n\n\n\n
  8. **Post-Installation Actions** :\n\n
     * PIP may perform any post-installation tasks specified by the package, such as running additional scripts or generating configuration files.
\n\n
\n\n\n\n
  9. **Metadata Updates** :\n\n
     * PIP**updates the`site-packages` directory with the package information**, which includes creating an entry in the `easy-install.pth` file and/or updating the `pkg_resources` database.
\n\n
\n\n\n\n
  10. **Completion Message** :\n\n
     * Once the installation is complete, PIP displays a success message, indicating that the package has been successfully installed.
\n\n
\n\n\n\n
  11. **Error Handling** :\n\n
     * If any errors occur during any of the above steps (e.g., version conflicts, missing dependencies, or network issues), PIP will display an appropriate error message to help the user diagnose the problem.
\n\n
\n
\n\n\n\n

你同样可以从github的一个仓库执行安装，belike

\n\n\n\n
    
    
    pip install git+https://github.com/username/repository.git@branch_name

\n\n\n\n

### 关于site-packages的简单介绍

\n\n\n\n

一个 Python 安装包在模块目录内有一个 site-packages 目录。这个目录是用户安装的包被放置的地方。在这个目录中维护着一个.pth 文件，其中包含额外安装的包的目录路径。

\n\n\n\n

在reddit上有一个有趣的讨论：["site-packages"命名的理由是什么？：r/learnpython --- What's the reason behind naming of the "site-packages"? : r/learnpython](<https://www.reddit.com/r/learnpython/comments/eukhja/whats_the_reason_behind_naming_of_the_sitepackages/>)

\n\n\n\n

asker:   
所以"site-packages 是手动构建的 Python 包的目标目录"，但它被称为 site-packages 有什么特殊/历史原因吗？

\n\n\n\n

reply:

\n\n\n\n

It’s talking about an installation site — as in location, not as in website — and there’s a whole mechanism provided by the [site](<https://pymotw.com/3/site/>) module for customizing the potentially  _multiple_ **site-packages** locations Python will search for globally-installed modules.  
它在谈论一个安装站点——**指的是位置** ，而不是网站——并且 site 模块提供了一个机制，用于自定义 Python 将全局安装的模块搜索的多个 site-packages 位置。  
In usual, single-user, single-machine practice the name is somewhat meaningless, but for mult-user and multi-machine configurations it becomes meaningful. The mechanism allows you to have a user-level install location shared by all Python processes run by that user, but not by other users. It also allows you to have a machine-wide install location that all local users will share... but it also allows you to add one or more LAN-wide, or even WAN-wide network shared locations that your whole organization can share.  
在通常的单用户、单机使用情况下，这个名字有点无意义，但对于多用户和多机配置来说，它变得有意义。这个机制允许你**有一个用户级别的安装位置** ，所有该用户运行的 Python 进程都可以共享，但其他用户不能。它还允许你有一个全局安装位置，所有本地用户都可以共享……但它也允许你添加一个或多个局域网范围，甚至广域网范围的共享网络位置，供整个组织共享。

\n\n\n\n

可以使用两种方式获得site-packages的路径：

\n\n\n\n
    
    
    py -m site

\n\n\n\n
    
    
    py -c "import site; print(site.getsitepackages())"

\n\n\n\n

python在寻找packages时，会访问系统级的sys.path，

\n\n\n\n
    
    
    python\n>>> import sys\n>>> sys.path\n['', '/usr/lib/python38.zip', '/usr/lib/python3.8', '/usr/lib/python3.8/lin-dynload', '/home/thibault/python-workshop-venv/lib/python3.8/site-packages/']\n

\n\n\n\n

The above contain the modules and packages **in the _standard library_** ,  _i.e_ the packages and modules that come “pre-installed” with Python. Finally, the python interpreter looks inside the directory `/home/thibault/python-workshop-venv/lib/python3.8/site-packages/`

\n\n\n\n

为了让 Python 找到包 `tstools` ，它必须位于 `sys.path` 列表中的某个目录。如果是这种情况，该包就被认为是安装好的。

\n\n\n\n

PYTHONPATH **影响** `sys.path`的构成：

\n\n\n\n

\n
  * 当Python解释器启动时，会将`PYTHONPATH`环境变量中定义的路径**添加到**`sys.path`列表的前面
\n\n\n\n
  * `sys.path`的完整构成 = `PYTHONPATH`中的路径 + Python默认路径（标准库、site-packages等）
\n
\n\n\n\n

以上是使用pip install package的基本原理以及安装后的实际进行的流程（即安装到某个位置后更新site-packages信息）

\n\n\n\n

基于以上结论，我们进一步看看pip install -e .和python setup.py install 发生了什么

\n\n\n\n

## pip install -e .

\n\n\n\n

### What is Editable Installation?

\n\n\n\n

The concept of editable installations allows you to install a Python package in a way that **lets you modify the source code and immediately see those changes reflected when you run your code.** It means if you have python_pkg installed as “editatable installation” and you are using that in your jupyter notebook. Now if some one modify the source code of python_pkg you your jupyter notebook (where you are using this package) will reflect this change. When you install a Python package using pip install -e ., you create an editable installation. This means that the package is linked to the original source code directory rather than being copied to the site-packages directory.

\n\n\n\n

当你在可编辑模式（也称为开发模式）下安装一个 Python 包时，Python 会直接从源代码目录执行该包。这意味着你对源代码所做的任何更改都应该立即反映出来，而无需重新安装。

\n\n\n\n

所以本意其实很简单，只要所在目录下有对应可行的setup.py即可。

\n\n\n\n

## 关于setup.py

\n\n\n\n

#### 常规安装 ( `python setup.py install` )

\n\n\n\n

\n
  * This method installs the package in a more traditional way. The package is built and copied to your Python environment, so changes made to the source code will not be reflected unless you reinstall the package.  
这种方法以更传统的方式安装包。包会被构建并复制到您的 Python 环境中，因此对源代码所做的更改不会立即反映出来，除非您重新安装该包。
\n\n\n\n
  * If you find that you need to re-run `python setup.py install` every time you make a change, it suggests that you are not in editable mode and are doing a regular installation.  
如果你发现每次修改都需要重新运行 `python setup.py install` ，这表明你不在可编辑模式下，而是在进行常规安装。
\n
\n\n\n\n

所以setup.py是对于常规安装方式的一种支持，直接把对应的包cp到了site-packages下

\n\n\n\n

but：

\n\n\n\n

**Do not run`setup.py` directly:** It is highly discouraged to invoke `python setup.py install` or other commands directly as it can **lead to dependency and uninstallation issues**.

\n\n\n\n

使用setup.py时合理（但不保证）的uninstall

\n\n\n\n
    
    
    python setup.py install\npip uninstall mypackage  # 可能有文件残留\n\n# 更彻底的卸载方式\npython setup.py install --record files.txt\ncat files.txt | xargs rm -rf  # 手动删除记录的文件

\n\n\n\n

除此之外，关于uninstall:

\n\n\n\n

任何使用 setuptools 配置和安装的包都使用以下命令：

\n\n\n\n
    
    
    python setup.py install 

\n\n\n\n

Unfortunately, there is no python setup.py uninstall command. To uninstall a package installed with setup.py, use the pip command:  
不幸的是，没有 python setup.py uninstall 命令。要卸载使用 setup.py 安装的包，请使用 pip 命令：

\n\n\n\n
    
    
    pip uninstall <em><packagename></em>

\n\n\n\n

Be aware that there are a few exceptions that cannot be uninstalled with pip, including:  
请注意，有一些例外情况无法使用 pip 卸载，包括：

\n\n\n\n

\n
  * Distutils packages, which do not provide metadata indicating which files were installed.  
Distutils 包，这些包不提供元数据来指示已安装哪些文件。
\n\n\n\n
  * Script wrappers installed by the setup.py develop command.  
由 setup.py develop 命令安装的脚本包装器。
\n
\n\n\n\n

\n