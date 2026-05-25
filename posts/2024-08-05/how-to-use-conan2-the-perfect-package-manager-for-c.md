---
title: How to use Conan2——the perfect package manager for c++
date: 2024-08-05
tags: [C++]
---

\n

## Installation:

\n\n\n\n

安装的方式很简单，无非两种：去官网找下载器（msi&exe）或者使用pip命令行安装（官网推荐的办法，方便持续更新版本）

\n\n\n\n

不过如果实在闲的没事干或者操作系统实在不太兼容预编译的版本那就自己“build from source code”

\n\n\n\n
    
    
    # clone folder name matters, to avoid imports issues\n$ git clone https://github.com/conan-io/conan.git conan_src\n$ cd conan_src\n$ git fetch --all\n$ git checkout -b develop2 origin/develop2\n$ python -m pip install -e .

\n\n\n\n

## Tutorial：

\n\n\n\n

We’ll use CMake as build system in this case but keep in mind that Conan **works with any build system** and is not limited to using CMake. You can check more examples with other build systems in the [Read More section](<https://docs.conan.io/2/tutorial/consuming_packages/build_simple_cmake_project.html#consuming-packages-read-more>).

\n\n\n\n

We start from a very simple C language project with this structure:

\n\n\n\n
    
    
    .\n├── CMakeLists.txt\n└── src\n    └── main.c

\n\n\n\n

我们的CMakeList如下：

\n\n\n\n
    
    
    cmake_minimum_required(VERSION 3.15)\nproject(compressor C)\n\nfind_package(ZLIB REQUIRED)\n\nadd_executable(${PROJECT_NAME} src/main.c)\ntarget_link_libraries(${PROJECT_NAME} ZLIB::ZLIB)

\n\n\n\n

这里的ZLIB库是来自外部的，所以我们需要使用conan来安装并且管理这个包：

\n\n\n\n

conanfile.txt

\n\n\n\n
    
    
    [requires]\nzlib/1.2.11\n\n[generators]\nCMakeDeps\nCMakeToolchain

\n\n\n\n

这个时候使用这样的一行指令检测并且使用默认的配置：

\n\n\n\n
    
    
    conan profile detect --force

\n\n\n\n

**Using a compiler other than the auto-detected one  
使用自动检测的编译器以外的编译器**

\n\n\n\n

If you want to change a Conan profile to use a compiler different from the default one, you need to change the `compiler` setting and also tell Conan explicitly where to find it using the [tools.build:compiler_executables configuration](<https://docs.conan.io/2/reference/tools/cmake/cmaketoolchain.html#conan-cmake-toolchain-conf>).  
如果要更改 Conan 配置文件以使用与默认编译器不同的编译器，则需要更改`编译器`设置，并使用 [tools.build：compiler_executables 配置](<https://docs.conan.io/2/reference/tools/cmake/cmaketoolchain.html#conan-cmake-toolchain-conf>)明确告诉 Conan 在哪里可以找到它。

\n\n\n\n

\n
  1. **使用自定义 profile 文件** ：在运行 Conan 命令时，使用 `--profile` 参数指定自定义 profile 文件。例如：`conan install . --profile=myprofile `
\n\n\n\n
  2. `conan create . mypackage/version@ --profile=myprofile`
\n
\n\n\n\n

我们将使用 Conan 安装 **Zlib** 并生成 CMake 找到此库并构建我们的项目所需的文件。我们将在文件夹 _构建_ 中生成这些文件。为此，请运行：

\n\n\n\n
    
    
    conan install . --output-folder=build --build=missing

\n\n\n\n

使用conanfile.txt时候，请注意不能使用conan build的相关命令（虽然很奇怪但是build只能py用）

\n\n\n\n

You will get something similar to this as the output of that command:

\n\n\n\n
    
    
    $ conan install . --output-folder=build --build=missing\n...\n-------- Computing dependency graph ----------\nzlib/1.2.11: Not found in local cache, looking in remotes...\nzlib/1.2.11: Checking remote: conancenter\nzlib/1.2.11: Trying with 'conancenter'...\nDownloading conanmanifest.txt\nDownloading conanfile.py\nDownloading conan_export.tgz\nDecompressing conan_export.tgz\nzlib/1.2.11: Downloaded recipe revision f1fadf0d3b196dc0332750354ad8ab7b\nGraph root\n    conanfile.txt: /home/conan/examples2/tutorial/consuming_packages/simple_cmake_project/conanfile.txt\nRequirements\n    zlib/1.2.11#f1fadf0d3b196dc0332750354ad8ab7b - Downloaded (conancenter)\n\n-------- Computing necessary packages ----------\nRequirements\n    zlib/1.2.11#f1fadf0d3b196dc0332750354ad8ab7b:cdc9a35e010a17fc90bb845108cf86cfcbce64bf#dd7bf2a1ab4eb5d1943598c09b616121 - Download (conancenter)\n\n-------- Installing packages ----------\n\nInstalling (downloading, building) binaries...\nzlib/1.2.11: Retrieving package cdc9a35e010a17fc90bb845108cf86cfcbce64bf from remote 'conancenter'\nDownloading conanmanifest.txt\nDownloading conaninfo.txt\nDownloading conan_package.tgz\nDecompressing conan_package.tgz\nzlib/1.2.11: Package installed cdc9a35e010a17fc90bb845108cf86cfcbce64bf\nzlib/1.2.11: Downloaded package revision dd7bf2a1ab4eb5d1943598c09b616121\n\n-------- Finalizing install (deploy, generators) ----------\nconanfile.txt: Generator 'CMakeToolchain' calling 'generate()'\nconanfile.txt: Generator 'CMakeDeps' calling 'generate()'\nconanfile.txt: Generating aggregated env files

\n\n\n\n

然后就可以执行我们项目的构建与执行了：

\n\n\n\n
    
    
    $ cd build\n# assuming Visual Studio 15 2017 is your VS version and that it matches your default profile\n$ cmake .. -G "Visual Studio 15 2017" -DCMAKE_TOOLCHAIN_FILE="conan_toolchain.cmake"\n$ cmake --build . --config Release\n...\n[100%] Built target compressor\n$ Release\\compressor.exe\nUncompressed size is: 233\nCompressed size is: 147\nZLIB VERSION: 1.2.11

\n\n\n\n

以上就是一次使用cmake+conan来构建项目的实例。不过在平常使用中只有这些指令还是远远不够的，我们还会遇到“不清楚使用的包在conan远端存不存在，需要删除或者调整包”的情况，所以罗列一些我们常用的的conan指令

\n\n\n\n

## 搜索指定包

\n\n\n\n

在远程仓库中搜索指定的包

\n\n\n\n
    
    
    conan search osqp --remote=conancenter

\n\n\n\n

也可以在[Conan官网](<https://conan.io/center>)直接搜索

\n\n\n\n

因为之后conanfile.txt的书写一定要带上版本号，所以每次使用都务必注意这一点

\n\n\n\n

\n