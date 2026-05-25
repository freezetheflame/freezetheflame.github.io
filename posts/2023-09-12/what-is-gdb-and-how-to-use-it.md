---
title: What is GDB and how to use it
date: 2023-09-12
tags: [Windows相关]
---

\n

（翻译来自[How to Debug C Program using gdb in 6 Simple Steps (osu.edu)](<https://u.osu.edu/cstutorials/2018/09/28/how-to-debug-c-program-using-gdb-in-6-simple-steps/>)）

\n\n\n\n

我们接下来讨论一下如何在六步，使用gdb来调试一个C语言程序

\n\n\n\n

以下操作均在**Linux系统** 执行

\n\n\n\n

首先为调试目的编写一个带有错误的示例 C 程序

\n\n\n\n

为了学习C语言调试，让我们创建下面的 C 程序来计算和打印一个数的阶乘。然而这个C程序为了给我们调试带有一些错误[su_accordion][su_spoiler title="Code" open="no" style="default" icon="plus" anchor="" anchor_in_url="no" class=""]

\n\n\n\n
    
    
    # include <stdio.h>\n\nint main()\n{\n\tint i, num, j;\n\tprintf ("Enter the number: ");\n\tscanf ("%d", &num );\n\n\tfor (i=1; i<num; i++)\n\t\tj=j*i;    \n\n\tprintf("The factorial of %d is %d\\n",num,j);\n}

\n\n\n\n

[/su_spoiler] [/su_accordion]

\n\n\n\n

第一步：使用调试参数-g编译程序

\n\n\n\n
    
    
    cc -g factorial.c

\n\n\n\n

第二步：启动gdb

\n\n\n\n
    
    
    gdb a.out

\n\n\n\n

第三步：在C语言程序内部设置断点

\n\n\n\n
    
    
    Syntax:\n\nbreak line_number\n\nOther formats:\n\nbreak [file_name]:line_number\nbreak [file_name]:func_name

\n\n\n\n

在你怀疑C程序有问题的地方放置断点，当运行程序的时候，调试器会在断点自动停止，并且给你提示调试。

\n\n\n\n

所以在启动程序前，让我们把下列断点放在程序里

\n\n\n\n
    
    
    break 10\nBreakpoint 1 at 0x804846f: file factorial.c, line 10.

\n\n\n\n

第四步：在gdb调试器中运行C程序

\n\n\n\n
    
    
    run [args]

\n\n\n\n

你可以使用 gdb 调试器中的 run 命令开始运行该程序，还可以通过 run args 向程序提供命令行参数。

\n\n\n\n

我们在这里使用的示例程序不需要任何命令行参数，因此让我们给出 run，并开始程序执行。

\n\n\n\n
    
    
    run\nStarting program: /home/sathiyamoorthy/Debugging/c/a.out

\n\n\n\n

一旦您执行了 C 程序，它将一直执行到第一个断点，并提示您进行调试。

\n\n\n\n
    
    
    Breakpoint 1, main () at factorial.c:10\n10\t\t\tj=j*i;

\n\n\n\n

您可以使用各种 gdb 命令来调试 C 程序，如下面各节所述

\n\n\n\n

第五步：在gdb调试器内打印各个变量的值

\n\n\n\n
    
    
    Syntax: print {variable}\n\nExamples:\nprint i\nprint j\nprint num\n\n(gdb) p i\n$1 = 1\n(gdb) p j\n$2 = 3042592\n(gdb) p num\n$3 = 3\n(gdb)

\n\n\n\n

如上所述，在 factorial.c 中，我们没有初始化变量 j. 因此，它得到的垃圾值导致一个很大的 factorial 。

\n\n\n\n

通过初始化j为1，我们解决了这个bug，编译c程序再执行一次。

\n\n\n\n

即使在这个修复之后，似乎在 factorial.c 程序中仍然存在一些问题，因为它仍然给出了错误的阶乘值。

\n\n\n\n

因此，将断点放在第10行，并按照下一节中的解释继续。

\n\n\n\n

第六步：继续、步进——gdb命令

\n\n\n\n

当程序在断点停止时，可以选择三种 gdb 操作。它们一直持续到下一个断点，进入或跨越下一个程序行。

\n\n\n\n
    
    
    c or continue: Debugger will continue executing until the next break point.\nn or next: Debugger will execute the next line as single instruction.\ns or step: Same as next, but does not treats function as a single instruction, instead goes into the function and executes it line by line.

\n\n\n\n

通过继续或单步执行，您可能会发现问题是因为我们没有在‘ for 循环’条件检查中使用 < = 。因此，将它从 < = 更改为 < = 将解决这个问题。

\n\n\n\n

其他一些内容：

\n\n\n\n
    
    
    gdb command shortcuts\nUse following shortcuts for most of the frequent gdb operations.\n\nl – list\np – print\nc – continue\ns – step\nENTER: pressing enter key would execute the previously executed command again.

\n\n\n\n
    
    
    Miscellaneous gdb commands\nl command: Use gdb command l or list to print the source code in the debug mode. Use l line-number to view a specific line number (or) l function to view a specific function.\nbt: backtrack – Print backtrace of all stack frames, or innermost COUNT frames.\nhelp – View help for a particular gdb topic — help TOPICNAME.\nquit – Exit from the gdb debugger.

\n