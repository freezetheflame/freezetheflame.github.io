---
title: How to write makefile and CMakeLists.txt
date: 2023-08-27
tags: [tools]
---

\n

充分借鉴网络资源

\n\n\n\n

[概述 — 跟我一起写Makefile 1.0 文档 (seisman.github.io)](<https://seisman.github.io/how-to-write-makefile/overview.html>)

\n\n\n\n

## First Part: **makefile**

\n\n\n\n

mainly from 陈皓《跟我一起写makefile》（这应该是国内互联网介绍makefile最好的一篇博客）

\n\n\n\n

**概述  
——**

\n\n\n\n

什么是makefile？或许很多Winodws的程序员都不知道这个东西，因为那些Windows的IDE都为你做了这个工作，但我觉得要作一个好的和professional的程序员，makefile还是要懂。这就好像现在有这么多的HTML的编辑器，但如果你想成为一个专业人士，你还是要了解HTML的标识的含义。特别在Unix下的软件编译，你就不能不自己写makefile了，会不会写makefile，从一个侧面说明了一个人是否具备完成大型工程的能力。

\n\n\n\n

因为，makefile关系到了整个工程的编译规则。一个工程中的源文件不计数，其按类型、功能、模块分别放在若干个目录中，makefile定义了一系列的规则来指定，哪些文件需要先编译，哪些文件需要后编译，哪些文件需要重新编译，甚至于进行更复杂的功能操作，因为makefile就像一个Shell脚本一样，其中也可以执行操作系统的命令。

\n\n\n\n

makefile带来的好处就是——“自动化编译”，一旦写好，只需要一个make命令，整个工程完全自动编译，极大的提高了软件开发的效率。make是一个命令工具，是一个解释makefile中指令的命令工具，一般来说，大多数的IDE都有这个命令，比如：Delphi的make，Visual C++的nmake，Linux下GNU的make。可见，makefile都成为了一种在工程方面的编译方法。

\n\n\n\n

现在讲述如何写makefile的文章比较少，这是我想写这篇文章的原因。当然，不同产商的make各不相同，也有不同的语法，但其本质都是在“文件依赖性”上做文章，这里，我仅对GNU的make进行讲述，我的环境是RedHat Linux 8.0，make的版本是3.80。必竟，这个make是应用最为广泛的，也是用得最多的。而且其还是最遵循于IEEE 1003.2-1992 标准的（POSIX.2）。

\n\n\n\n

在这篇文档中，将以C/C++的源码作为我们基础，所以必然涉及一些关于C/C++的编译的知识，相关于这方面的内容，还请各位查看相关的编译器的文档。这里所默认的编译器是UNIX下的GCC和CC。

\n\n\n\n

### 安排make的规则：

\n\n\n\n

\n
  1. 如果这个工程没有编译过，那么我们的所有c文件**都要编译并被链接** 。
\n\n\n\n
  2. 如果这个工程的某几个c文件被修改，那么我们只编译被修改的c文件，并链接目标程序。
\n\n\n\n
  3. 如果这个工程的头文件被改变了，那么我们需要编译引用了这几个头文件的c文件，并链接目标程序。
\n
\n\n\n\n

### makefile的基本规则（就下面这样一个格式，除此之外，你可以在makefile里面定义一些宏（公式）和常量，辅助这样的一个格式的执行与选择分支执行（if））

\n\n\n\n
    
    
    target ... : prerequisites ... \n    recipe \n     ... \n     ... 

\n\n\n\n

target（目标）可以是一个object file（目标文件），也可以是一个可执行文件，还可以是一个标签（label）。对于标签这种特性，在后续的“伪目标”章节中会有叙述。  
**prerequisites**  
生成该target所依赖的文件和/或target。（比如说我这个gcc main.c utils.c -o target 这样一条指令需要的文件包含main.c 和 utils.c，这就是**prerequisites** ）  
**recipe**  
该target要执行的命令（任意的shell命令）。  
这是一个文件的依赖关系，也就是说，target这一个或多个的目标文件依赖于prerequisites中的文件，其生成规则定义在command中。说白一点就是说:prerequisites中如果有一个以上的文件比target文件要新的话，recipe所定义的命令就会被执行。

\n\n\n\n

这就是makefile的规则，也就是makefile中最核心的内容。

\n\n\n\n

说到底，makefile的东西就是这样一点，好像我的这篇文档也该结束了。呵呵。还不尽然，这是makefile 的主线和核心，但要写好一个makefile还不够，我会在后面一点一点地结合我的工作经验给你慢慢道来。内容还多着呢。:)

\n\n\n\n

tips:

\n\n\n\n

输入test.exe和./test.exe运行效果不同,主要原因是:

\n\n\n\n

\n
  * Windows环境下,系统不会自动搜索当前目录来运行程序。运行test.exe时系统不知道从当前目录执行。
\n\n\n\n
  * Unix/Linux环境下,使用./程序文件名会告诉系统程序位于当前目录,需要从当前目录执行。
\n
\n\n\n\n

具体来说:

\n\n\n\n

\n
  * Windows下以test.exe运行,系统会在PATH环境变量配置的路径搜索test.exe文件。如果当前目录不在PATH变量,就找不到文件。
\n\n\n\n
  * 而./test.exe明确告诉系统,程序位于当前运行命令的目录。等价于当前目录。系统可以直接从当前目录执行文件。
\n\n\n\n
  * Unix/Linux下,默认就会搜索当前目录,所以直接test.exe即可。但在Windows需要加上路径说明。
\n
\n\n\n\n

所以:

\n\n\n\n

\n
  * Windows下需要加上当前目录前缀./ ,告诉系统从当前目录执行文件。
\n\n\n\n
  * 或者可以将编译生成的可执行文件拷贝到已配置在PATH中的目录中,然后直接以程序名运行。
\n
\n\n\n\n

采用./形式运行可避免路径找不到的情况,在Windows下也能体现Unix命令的执行语义。而test.exe可能会找不到文件的情况。

\n\n\n\n

### Make的工作方式

\n\n\n\n

\n
  1. make会在当前目录下找名字叫“Makefile”或“makefile”的文件。
\n\n\n\n
  2. 如果找到，它会找文件中的第一个目标文件（target），在上面的例子中，他会找到“edit”这个文件，并把这个文件作为最终的目标文件。
\n\n\n\n
  3. 如果edit文件不存在，或是edit所依赖的后面的 `.o` 文件的文件修改时间要比 `edit` 这个文件新，那么，他就会执行后面所定义的命令来生成 `edit` 这个文件。
\n\n\n\n
  4. 如果 `edit` 所依赖的 `.o` 文件也不存在，那么make会在当前文件中找目标为 `.o` 文件的依赖性，如果找到则再根据那一个规则生成 `.o` 文件。（这有点像一个堆栈的过程）
\n\n\n\n
  5. 当然，你的C文件和头文件是存在的啦，于是make会生成 `.o` 文件，然后再用 `.o` 文件生成make的终极任务，也就是可执行文件 `edit` 了。
\n
\n\n\n\n

### 在makefile中使用变量（如何简洁地书写）

\n\n\n\n

比如，我们声明一个变量，叫 `objects` ， `OBJECTS` ， `objs` ， `OBJS` ， `obj` 或是 `OBJ` ，反正不管什么啦，只要能够表示obj文件就行了。我们在makefile一开始就这样定义：

\n\n\n\n

objects = main.o kbd.o command.o display.o **\\\**   
insert.o search.o files.o utils.o

\n\n\n\n

于是，我们就可以很方便地在我们的makefile中以 `$(objects)` 的方式来使用这个变量了

\n\n\n\n

### 让make自动推导

\n\n\n\n

GNU的make很强大，它可以自动推导文件以及文件依赖关系后面的命令，于是我们就没必要去在每一个 `.o` 文件后都写上类似的命令，因为，我们的make会自动识别，并自己推导命令。

\n\n\n\n

只要make看到一个 `.o` 文件，它就会**自动的** 把 `.c` 文件加在依赖关系中，如果make找到一个 `whatever.o` ，那么 `whatever.c` 就会是 `whatever.o` 的依赖文件。并且 `cc -c whatever.c` 也会被推导出来

\n\n\n\n

### 清空目录的规则（有的时候就是所谓的make clean命令）

\n\n\n\n

每个Makefile中都应该写一个清空目标文件（ `.o` ）和可执行文件的规则，这不仅便于重编译，也很利于保持文件的清洁。这是一个“修养”（呵呵，还记得我的《编程修养》吗）。一般的风格都是：

\n\n\n\n
    
    
    clean:\n     rm edit $(objects)

\n\n\n\n

更为稳健的做法是：

\n\n\n\n
    
    
    .PHONY : clean\n\nclean : \n\n     -rm edit $(objects)

\n\n\n\n

前面说过， `.PHONY` 表示 `clean` 是一个“伪目标”。而在 `rm` 命令前面加了一个小减号的意思就是，**也许某些文件出现问题** ，但不要管，继续做后面的事。当然， `clean` 的规则不要放在文件的开头，不然，这就会变成make的默认目标，相信谁也不愿意这样。不成文的规矩是——“clean从来都是放在文件的最后”。

\n\n\n\n

总的来讲，

\n\n\n\n

Makefile里主要包含了**五个东西** ：显式规则、隐式规则、变量定义、指令和注释。

\n\n\n\n

\n
  1. 显式规则。显式规则说明了如何生成一个或多个目标文件。这是由Makefile的书写者明显指出要生成的文件、文件的依赖文件和生成的命令。
\n\n\n\n
  2. 隐式规则。由于我们的make有自动推导的功能，所以隐式规则可以让我们比较简略地书写Makefile，这是由make所支持的。
\n\n\n\n
  3. 变量的定义。在Makefile中我们要定义一系列的变量，变量一般都是字符串，这个有点像你C语言中的宏，当Makefile被执行时，其中的变量都会被扩展到相应的引用位置上。
\n\n\n\n
  4. 指令。其包括了三个部分，一个是在一个Makefile中引用另一个Makefile，就像C语言中的include一样；另一个是指根据某些情况指定Makefile中的有效部分，就像C语言中的预编译#if一样；还有就是定义一个多行的命令。有关这一部分的内容，我会在后续的部分中讲述。
\n\n\n\n
  5. 注释。Makefile中只有行注释，和UNIX的Shell脚本一样，其注释是用 `#` 字符，这个就像C/C++中的 `//` 一样。如果你要在你的Makefile中使用 `#` 字符，可以用反斜杠进行转义，如： `\\#` 。
\n
\n\n\n\n

最后，还值得一提的是，在Makefile中的命令，必须要以 `Tab` 键开始。（否则会出现tab和space不能互转的报错）

\n\n\n\n

GNU的make工作时的执行步骤如下：（想来其它的make也是类似）

\n\n\n\n

\n
  1. 读入所有的Makefile。
\n\n\n\n
  2. 读入被include的其它Makefile。（这个规则自行问GPT或者等到你需要的时候自己学就行了）
\n\n\n\n
  3. 初始化文件中的变量。
\n\n\n\n
  4. 推导隐式规则，并分析所有规则。
\n\n\n\n
  5. 为所有的目标文件创建依赖关系链。
\n\n\n\n
  6. 根据依赖关系，决定哪些目标要重新生成。
\n\n\n\n
  7. 执行生成命令。
\n
\n\n\n\n

### 书写规则

\n\n\n\n

#### 1.在规则中使用通配符

\n\n\n\n

如果我们想定义一系列比较类似的文件，我们很自然地就想起使用通配符。make支持三个通配符： `*` ， `?` 和 `~` 。这是和Unix的B-Shell是相同的。

\n\n\n\n

波浪号（ `~` ）字符在文件名中也有比较特殊的用途。如果是 `~/test` ，这就表示当前用户的 `$HOME` 目录下的test目录。而 `~hchen/test` 则表示用户hchen的宿主目录下的test 目录。（这些都是Unix下的小知识了，make也支持）而在Windows或是 MS-DOS下，用户没有宿主目录，那么波浪号所指的目录则根据环境变量“HOME”而定。

\n\n\n\n

通配符代替了你一系列的文件，如 `*.c` 表示所有后缀为c的文件。一个需要我们注意的是，如果我们的文件名中有通配符，如： `*` ，那么可以用转义字符 `\\` ，如 `\\*` 来表示真实的 `*` 字符，而不是任意长度的字符串。

\n\n\n\n

\nhttps://www.freezetheflame.cc/2025/01/20/%e9%80%9a%e9%85%8d%e7%ac%a6%e4%b8%8e%e6%ad%a3%e5%88%99%e5%8c%b9%e9%85%8d/\n

\n\n\n\n

好吧，还是先来看几个例子吧：

\n\n\n\n

clean:   
rm -f *.o

\n\n\n\n

其实在这个clean:后面可以加上你想做的一些事情，如果你想看到在编译完后看看main.c的源代码，你可以在加上cat这个命令，例子如下：

\n\n\n\n

clean:   
cat main.c   
rm -f *.o

\n\n\n\n

其结果你试一下就知道的。 上面这个例子我不不多说了，这是操作系统Shell所支持的通配符。这是在命令中的通配符。

\n\n\n\n

print: *.c   
lpr -p $?  
touch print

\n\n\n\n

上面这个例子说明了通配符也可以在我们的规则中，目标print依赖于所有的 `.c` 文件。其中的 `$?` 是一个自动化变量，我会在后面给你讲述。objects = *.o

\n\n\n\n

上面这个例子，表示了通配符同样可以用在变量中。并不是说 `*.o` 会展开，不！objects的值就是 `*.o` 。Makefile中的变量其实就是C/C++中的宏。如果你要让通配符在变量中展开，也就是让objects的值是所有 `.o` 的文件名的集合，那么，你可以这样：objects := **$(** wildcard *.o**)**

\n\n\n\n

另给一个变量使用通配符的例子：

\n\n\n\n

\n
  1. 列出一确定文件夹中的所有 `.c` 文件。objects := **$(** wildcard *.c**)**
\n\n\n\n
  2. 列出(1)中所有文件对应的 `.o` 文件，在（3）中我们可以看到它是由make自动编译出的:$(patsubst %.c,%.o,$(wildcard *.c))
\n\n\n\n
  3. 由(1)(2)两步，可写出编译并链接所有 `.c` 和 `.o` 文件objects := **$(** patsubst %.c,%.o,**$(** wildcard *.c**))** foo : **$(** objects**)** cc -o foo **$(** objects**)**
\n
\n\n\n\n

这种用法由关键字“wildcard”，“patsubst”指出，关于Makefile的关键字，我们将在后面讨论。

\n\n\n\n

#### 2.文件搜寻

\n\n\n\n

在一些大的工程中，有大量的源文件，我们通常的做法是把这许多的源文件分类，并存放在不同的目录中。所以，当make需要去找寻文件的依赖关系时，你可以在文件前加上路径，但最好的方法是把一个路径告诉make，让make在自动去找。

\n\n\n\n

Makefile文件中的特殊变量 `VPATH` 就是完成这个功能的，如果没有指明这个变量，make只会在当前的目录中去找寻依赖文件和目标文件。如果定义了这个变量，那么，make就会在当前目录找不到的情况下，到所指定的目录中去找寻文件了。

\n\n\n\n
    
    
    VPATH = src:../headers

\n\n\n\n

上面的定义指定两个目录，“src”和“../headers”，make会按照这个顺序进行搜索。目录由“冒号”分隔。（当然，当前目录永远是最高优先搜索的地方）

\n\n\n\n

另一个设置文件搜索路径的方法是使用make的“vpath”关键字（注意，它是全小写的），这不是变量，这是一个make的关键字，这和上面提到的那个VPATH变量很类似，但是它更为灵活。它可以指定不同的文件在不同的搜索目录中。这是一个很灵活的功能。它的使用方法有三种：`vpath <pattern> <directories>`

\n\n\n\n

为符合模式<pattern>的文件指定搜索目录<directories>。`vpath <pattern>`

\n\n\n\n

清除符合模式<pattern>的文件的搜索目录。`vpath`

\n\n\n\n

清除所有已被设置好了的文件搜索目录。

\n\n\n\n

vpath使用方法中的<pattern>需要包含 `%` 字符。 `%` 的意思是匹配零或若干字符，（需引用 `%` ，使用 `\\` ）例如， `%.h` 表示所有以 `.h` 结尾的文件。<pattern>指定了要搜索的文件集，而<directories>则指定了< pattern>的文件集的搜索的目录。例如：

\n\n\n\n
    
    
    vpath %.h ../headers

\n\n\n\n

（TODO: DEEPER CONTENT ABOUT MAKEFILE）

\n\n\n\n

## CMakeLists

\n\n\n\n

如果喜欢读洋文，<https://cmake.org/cmake/help/latest/guide/tutorial/A%20Basic%20Starting%20Point.html#>照着这个教程完成所有API的理解阅读基本上就能

\n\n\n\n

不想写了，这是GPT生成的，我觉得挺好的先这么放这了，这是寒假，让我多玩会（bushi）

\n\n\n\n

### CMake 简介

\n\n\n\n

**CMake** 是一个跨平台的构建工具，用于自动化编译、链接和测试软件项目。它不直接构建项目，而是生成标准的构建文件（如 Makefile 或 Visual Studio 项目文件），再由底层构建工具（如 `make` 或 `msbuild`）执行实际构建。

\n\n\n\n

#### 主要特点：

\n\n\n\n

\n
  1. **跨平台** ：支持 Windows、Linux、macOS 等操作系统。
\n\n\n\n
  2. **多生成器支持** ：可以生成 Makefile、Ninja、Visual Studio 项目文件等。
\n\n\n\n
  3. **模块化** ：通过模块和脚本支持复杂的项目配置。
\n\n\n\n
  4. **依赖管理** ：支持查找和管理第三方库依赖。
\n
\n\n\n\n

* * *

\n\n\n\n

### CMakeLists.txt 简介

\n\n\n\n

`CMakeLists.txt` 是 CMake 的配置文件，用于定义项目的构建规则。每个项目目录通常包含一个 `CMakeLists.txt` 文件，CMake 通过读取该文件来生成构建系统。

\n\n\n\n

#### 文件结构：

\n\n\n\n

\n
  1. **项目配置** ：定义项目名称、版本、语言等。
\n\n\n\n
  2. **源文件管理** ：指定需要编译的源文件。
\n\n\n\n
  3. **目标定义** ：定义可执行文件、静态库或动态库。
\n\n\n\n
  4. **依赖管理** ：指定项目依赖的库或头文件路径。
\n\n\n\n
  5. **安装规则** ：定义如何安装构建结果（如可执行文件、库文件等）。
\n
\n\n\n\n

* * *

\n\n\n\n

### CMakeLists.txt 示例

\n\n\n\n

以下是一个简单的 `CMakeLists.txt` 示例，用于构建一个包含单个源文件的可执行文件：

\n\n\n\n
    
    
    # 1. 设置 CMake 最低版本要求\ncmake_minimum_required(VERSION 3.10)\n\n# 2. 定义项目名称和语言\nproject(MyProject CXX)\n\n# 3. 添加可执行文件目标\nadd_executable(MyExecutable main.cpp)\n\n# 4. 设置 C++ 标准\nset(CMAKE_CXX_STANDARD 11)\nset(CMAKE_CXX_STANDARD_REQUIRED True)\n\n# 5. 查找并链接第三方库（例如 OpenSSL）\nfind_package(OpenSSL REQUIRED)\ntarget_link_libraries(MyExecutable PRIVATE OpenSSL::SSL)\n\n# 6. 安装规则（可选）（这个确实没用）\ninstall(TARGETS MyExecutable DESTINATION bin)

\n\n\n\n

* * *

\n\n\n\n

### 关键命令详解

\n\n\n\n

\n
  1. **`cmake_minimum_required`** ：
\n
\n\n\n\n\n
  * 指定 CMake 的最低版本。
\n\n\n\n
  * 示例：`cmake_minimum_required(VERSION 3.10)`
\n
\n\n\n\n\n
  1. **`project`** ：
\n
\n\n\n\n\n
  * 定义项目名称和支持的语言（如 C、CXX）。
\n\n\n\n
  * 示例：`project(MyProject CXX)`
\n
\n\n\n\n\n
  1. **`add_executable`** ：
\n
\n\n\n\n\n
  * 定义可执行文件目标，并指定源文件。
\n\n\n\n
  * 示例：`add_executable(MyExecutable main.cpp)`
\n
\n\n\n\n\n
  1. **`add_library`** ：
\n
\n\n\n\n\n
  * 定义库目标（静态库或动态库）。
\n\n\n\n
  * 示例：`add_library(MyLibrary STATIC lib.cpp)`
\n
\n\n\n\n\n
  1. **`target_link_libraries`** ：
\n
\n\n\n\n\n
  * 为目标链接库文件。
\n\n\n\n
  * 示例：`target_link_libraries(MyExecutable PRIVATE MyLibrary)`
\n
\n\n\n\n\n
  1. **`find_package`** ：
\n
\n\n\n\n\n
  * 查找并加载第三方库。
\n\n\n\n
  * 示例：`find_package(OpenSSL REQUIRED)`
\n
\n\n\n\n\n
  1. **`set`** ：
\n
\n\n\n\n\n
  * 设置变量或属性。
\n\n\n\n
  * 示例：`set(CMAKE_CXX_STANDARD 11)`
\n
\n\n\n\n\n
  1. **`install`** ：
\n
\n\n\n\n\n
  * 定义安装规则。
\n\n\n\n
  * 示例：`install(TARGETS MyExecutable DESTINATION bin)`
\n
\n\n\n\n

* * *

\n\n\n\n

### CMake 工作流程

\n\n\n\n

\n
  1. **创建构建目录** ：
\n
\n\n\n\n
    
    
       mkdir build\n   cd build

\n\n\n\n

\n
  2. **运行 CMake** ：
\n
\n\n\n\n
    
    
       cmake ..

\n\n\n\n

\n
  3. **构建项目** ：
\n
\n\n\n\n\n
  * 使用 Makefile：  
`make`
\n\n\n\n
  * 使用 Ninja：  
`ninja`
\n
\n\n\n\n\n
  3. **运行可执行文件** ：
\n
\n\n\n\n
    
    
       ./MyExecutable

\n\n\n\n

* * *

\n\n\n\n

### 高级功能

\n\n\n\n

\n
  1. **条件编译** ：
\n
\n\n\n\n\n
  * 使用 `if` 语句根据条件配置项目。
\n\n\n\n
  * 示例：  
`cmake if(WIN32) add_definitions(-DWINDOWS) endif()`
\n
\n\n\n\n\n
  1. **子目录管理** ：
\n
\n\n\n\n\n
  * 使用 `add_subdirectory` 包含子项目的 `CMakeLists.txt`。
\n\n\n\n
  * 示例：  
`cmake add_subdirectory(src)`
\n
\n\n\n\n\n
  1. **自定义命令** ：
\n
\n\n\n\n\n
  * 使用 `add_custom_command` 和 `add_custom_target` 定义自定义构建步骤。
\n\n\n\n
  * 示例：  
`cmake add_custom_command( OUTPUT generated_file.cpp COMMAND generator_tool input_file.txt generated_file.cpp )`
\n
\n\n\n\n

* * *

\n\n\n\n

### 总结

\n\n\n\n

\n
  * **CMake** 是一个跨平台的构建工具，用于管理复杂的项目构建过程。
\n\n\n\n
  * **CMakeLists.txt** 是 CMake 的配置文件，定义了项目的构建规则。
\n\n\n\n
  * 通过 CMake，可以轻松管理多平台、多配置的项目，并支持复杂的依赖管理和自定义构建步骤。
\n
\n\n\n\n

掌握 CMake 和 `CMakeLists.txt` 的编写，可以显著提高项目的可维护性和跨平台兼容性。

\n\n\n\n

所以总的来说，因为makefile实在太繁琐了（对于一个比较大的项目，写的会很复杂）所以我们使用cmake来生成对应的makefile，然后就能执行对应的make指令了。我的理解也没有很深，cmake和make都是很复杂的工程，他们也不仅仅只能执行c和c++的项目，不过主要这两个比较“高效化”的代码都需要更加底层、无需其他工具的执行方式，所以更多使用这种“makelize”的办法，cmake本身也仍然有缺陷，所以还有类似xmake之类的替代品。这些都是后话

\n