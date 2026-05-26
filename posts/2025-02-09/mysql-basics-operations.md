---
title: MySQL basics operations
date: 2025-02-09
tags: [服务器后端内容, Java, MySQL, 数据库, SQL, 基础语法]
---


## 基础SQL操作

### SELECT


    
    SELECT * FROM Customers;

最基础的选择操作，从Customers表中选择所有列，没有其他条件


    
    SELECT column1, column2, ...
FROM table_name;

这则是最全面的SELECT的参考指令


    
    SELECT DISTINCT column1, column2, ...
FROM table_name;

DISTINCT可以选出无重复的内容

## WHERE


    
    SELECT column1, column2, ...
FROM table_name
WHERE condition;

作为SQL的conditions语句，可以附在很多句子的末尾。

注意这里需要区分numeric和text两种主要field，注意引号的使用恰当。

## AND OR & NOT


    
    SELECT column1, column2, ...
FROM table_name
WHERE condition1 [AND] condition2 [AND] condition3 ...;

使用方式很直白，用于连接where判断中的各个条件，注意NOT是单目即可

## ORDER BY


    
    SELECT column1, column2, ...
FROM table_name
ORDER BY column1, column2, ... ASC|DESC;

ASC和DESC分别是升序降序的含义，是ASCENDING和DESCENDING的意思

example


    
    SELECT * FROM Customers
ORDER BY Country ASC, CustomerName DESC;

## INSERT


    
    INSERT INTO table_name (column1, column2, column3, ...)
VALUES (value1, value2, value3, ...);

如果要为表的所有列添加值，则不需要在 SQL 查询中指定列名
