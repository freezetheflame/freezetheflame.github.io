---
title: MySQL basics operations
date: 2025-02-09
tags: [服务器后端内容, Java, MySQL, 数据库, SQL, 基础语法]
---

\n

## 基础SQL操作

\n\n\n\n

### SELECT

\n\n\n\n
    
    
    SELECT * FROM Customers;

\n\n\n\n

最基础的选择操作，从Customers表中选择所有列，没有其他条件

\n\n\n\n
    
    
    SELECT column1, column2, ...\nFROM table_name;

\n\n\n\n

这则是最全面的SELECT的参考指令

\n\n\n\n
    
    
    SELECT DISTINCT column1, column2, ...\nFROM table_name;

\n\n\n\n

DISTINCT可以选出无重复的内容

\n\n\n\n

## WHERE

\n\n\n\n
    
    
    SELECT column1, column2, ...\nFROM table_name\nWHERE condition;

\n\n\n\n

作为SQL的conditions语句，可以附在很多句子的末尾。

\n\n\n\n

注意这里需要区分numeric和text两种主要field，注意引号的使用恰当。

\n\n\n\n

## AND OR & NOT

\n\n\n\n
    
    
    SELECT column1, column2, ...\nFROM table_name\nWHERE condition1 [AND] condition2 [AND] condition3 ...;

\n\n\n\n

使用方式很直白，用于连接where判断中的各个条件，注意NOT是单目即可

\n\n\n\n

## ORDER BY

\n\n\n\n
    
    
    SELECT column1, column2, ...\nFROM table_name\nORDER BY column1, column2, ... ASC|DESC;

\n\n\n\n

ASC和DESC分别是升序降序的含义，是ASCENDING和DESCENDING的意思

\n\n\n\n

example

\n\n\n\n
    
    
    SELECT * FROM Customers\nORDER BY Country ASC, CustomerName DESC;

\n\n\n\n

## INSERT

\n\n\n\n
    
    
    INSERT INTO table_name (column1, column2, column3, ...)\nVALUES (value1, value2, value3, ...);

\n\n\n\n

如果要为表的所有列添加值，则不需要在 SQL 查询中指定列名

\n\n\n\n

\n