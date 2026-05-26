---
title: How to use Conan2——the perfect package manager for c++
date: 2024-08-05
tags: [C++]
---


## Installation:

安装的方式很简单，无非两种：去官网找下载器（msi&exe）或者使用pip命令行安装（官网推荐的办法，方便持续更新版本）

不过如果实在闲的没事干或者操作系统实在不太兼容预编译的版本那就自己“build from source code”


    
    # clone folder name matters, to avoid imports issues
$ git clone https://github.com/conan-io/conan.git conan_src
$ cd conan_src
$ git fetch --all
$ git checkout -b develop2 origin/develop2
$ python -m pip install -e .

## Tutorial：

We’ll use CMake as build system in this case but keep in mind that Conan **works with any build system** and is not limited to using CMake. You can check more examples with other build systems in the [Read More section](<https://docs.conan.io/2/tutorial/consuming_packages/build_simple_cmake_project.html#consuming-packages-read-more>).

We start from a very simple C language project with this structure:


    
    .
├── CMakeLists.txt
└── src
    └── main.c

我们的CMakeList如下：


    
    cmake_minimum_required(VERSION 3.15)
project(compressor C)
find_package(ZLIB REQUIRED)
add_executable(${PROJECT_NAME} src/main.c)
target_link_libraries(${PROJECT_NAME} ZLIB::ZLIB)

这里的ZLIB库是来自外部的，所以我们需要使用conan来安装并且管理这个包：

conanfile.txt


    
    [requires]
zlib/1.2.11
[generators]
CMakeDeps
CMakeToolchain

这个时候使用这样的一行指令检测并且使用默认的配置：


    
    conan profile detect --force

**Using a compiler other than the auto-detected one  
使用自动检测的编译器以外的编译器**

If you want to change a Conan profile to use a compiler different from the default one, you need to change the `compiler` setting and also tell Conan explicitly where to find it using the [tools.build:compiler_executables configuration](<https://docs.conan.io/2/reference/tools/cmake/cmaketoolchain.html#conan-cmake-toolchain-conf>).  
如果要更改 Conan 配置文件以使用与默认编译器不同的编译器，则需要更改`编译器`设置，并使用 [tools.build：compiler_executables 配置](<https://docs.conan.io/2/reference/tools/cmake/cmaketoolchain.html#conan-cmake-toolchain-conf>)明确告诉 Conan 在哪里可以找到它。

  1. **使用自定义 profile 文件** ：在运行 Conan 命令时，使用 `--profile` 参数指定自定义 profile 文件。例如：`conan install . --profile=myprofile `

  2. `conan create . mypackage/version@ --profile=myprofile`

我们将使用 Conan 安装 **Zlib** 并生成 CMake 找到此库并构建我们的项目所需的文件。我们将在文件夹 _构建_ 中生成这些文件。为此，请运行：


    
    conan install . --output-folder=build --build=missing

使用conanfile.txt时候，请注意不能使用conan build的相关命令（虽然很奇怪但是build只能py用）

You will get something similar to this as the output of that command:


    
    $ conan install . --output-folder=build --build=missing
...
-------- Computing dependency graph ----------
zlib/1.2.11: Not found in local cache, looking in remotes...
zlib/1.2.11: Checking remote: conancenter
zlib/1.2.11: Trying with 'conancenter'...
Downloading conanmanifest.txt
Downloading conanfile.py
Downloading conan_export.tgz
Decompressing conan_export.tgz
zlib/1.2.11: Downloaded recipe revision f1fadf0d3b196dc0332750354ad8ab7b
Graph root
    conanfile.txt: /home/conan/examples2/tutorial/consuming_packages/simple_cmake_project/conanfile.txt
Requirements
    zlib/1.2.11#f1fadf0d3b196dc0332750354ad8ab7b - Downloaded (conancenter)
-------- Computing necessary packages ----------
Requirements
    zlib/1.2.11#f1fadf0d3b196dc0332750354ad8ab7b:cdc9a35e010a17fc90bb845108cf86cfcbce64bf#dd7bf2a1ab4eb5d1943598c09b616121 - Download (conancenter)
-------- Installing packages ----------
Installing (downloading, building) binaries...
zlib/1.2.11: Retrieving package cdc9a35e010a17fc90bb845108cf86cfcbce64bf from remote 'conancenter'
Downloading conanmanifest.txt
Downloading conaninfo.txt
Downloading conan_package.tgz
Decompressing conan_package.tgz
zlib/1.2.11: Package installed cdc9a35e010a17fc90bb845108cf86cfcbce64bf
zlib/1.2.11: Downloaded package revision dd7bf2a1ab4eb5d1943598c09b616121
-------- Finalizing install (deploy, generators) ----------
conanfile.txt: Generator 'CMakeToolchain' calling 'generate()'
conanfile.txt: Generator 'CMakeDeps' calling 'generate()'
conanfile.txt: Generating aggregated env files

然后就可以执行我们项目的构建与执行了：


    
    $ cd build
# assuming Visual Studio 15 2017 is your VS version and that it matches your default profile
$ cmake .. -G "Visual Studio 15 2017" -DCMAKE_TOOLCHAIN_FILE="conan_toolchain.cmake"
$ cmake --build . --config Release
...
[100%] Built target compressor
$ Release\\compressor.exe
Uncompressed size is: 233
Compressed size is: 147
ZLIB VERSION: 1.2.11

以上就是一次使用cmake+conan来构建项目的实例。不过在平常使用中只有这些指令还是远远不够的，我们还会遇到“不清楚使用的包在conan远端存不存在，需要删除或者调整包”的情况，所以罗列一些我们常用的的conan指令

## 搜索指定包

在远程仓库中搜索指定的包


    
    conan search osqp --remote=conancenter

也可以在[Conan官网](<https://conan.io/center>)直接搜索

因为之后conanfile.txt的书写一定要带上版本号，所以每次使用都务必注意这一点
