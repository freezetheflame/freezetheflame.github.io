---
title: Java进阶模块
date: 2023-08-05
tags: [Java]
---

\n

I/O进阶（加速）（来自OIwiki [Java 进阶 - OI Wiki (oi-wiki.org)](<https://oi-wiki.org//lang/java-pro/>)）

\n\n\n\n

## 更高速的输入输出[](<https://oi-wiki.org//lang/java-pro/#%E6%9B%B4%E9%AB%98%E9%80%9F%E7%9A%84%E8%BE%93%E5%85%A5%E8%BE%93%E5%87%BA>)

\n\n\n\n

`Scanner` 和 `System.out.print` 在最开始会工作得很好，但是在处理更大的输入的时候会降低效率，因此我们会需要使用一些方法来提高 IO 速度。

\n\n\n\n

使用 Kattio + StringTokenizer 作为输入输出

\n\n\n\n

最常用的方法之一是使用来自 Kattis 的 [Kattio.java](<https://github.com/Kattis/kattio/blob/master/Kattio.java>) 来提高 IO 效率。[1](<https://oi-wiki.org//lang/java-pro/#fn:ref1>)这个方法会将 `StringTokenizer` 与 `PrintWriter` 包装在一个类中方便使用。而在具体进行解题的时候（假如赛会/组织方允许）可以直接使用这个模板。

\n\n\n\n

以下是代码实现：

\n\n\n\n
    
    
    class Kattio extends PrintWriter {