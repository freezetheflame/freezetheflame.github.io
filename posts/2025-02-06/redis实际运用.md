---
title: Redis实际运用
date: 2025-02-06
tags: [服务器后端内容, Java]
---

\n

Redis（Remote Dictionary Server）是一个开源的内存数据库，遵守 BSD 协议，它提供了一个高性能的键值（key-value）存储系统，常用于缓存、消息队列、会话存储等应用场景。

\n\n\n\n

与一般的kv缓存数据库相比，redis具有极高的性能，并且支持丰富的数据类型存储，包括字符串、列表、集合、哈希表、有序集合等。这些数据类型为开发者提供了灵活的数据操作能力，使得Redis可以适应各种不同的应用场景。

\n\n\n\n

与此同时，redis的操作都是原子的，因此可以保证数据的一致性和完整性，适用于高并发环境下的事务处理

\n\n\n\n

Redis 支持数据的持久化，可以将内存中的数据保存到磁盘中，以便在系统重启后恢复数据。这为 Redis 提供了数据安全性，确保数据不会因为系统故障而丢失。

\n\n\n\n

注：强烈建议不要在公网访问 redis,因为 redis 的处理速度非常快，所以如果你的密码比较简单，很容易就会通过暴力破解破解出密码

\n\n\n\n

## Redis 数据类型介绍

\n\n\n\n

\n
  * **string（字符串）:  **基本的数据存储单元，可以存储字符串、整数或者浮点数。
\n\n\n\n
  * **hash（哈希）:** 一个键值对集合，可以存储多个字段。
\n\n\n\n
  * **list（列表）:** 一个简单的列表，可以存储一系列的字符串元素。
\n\n\n\n
  * **set（集合）:** 一个无序集合，可以存储不重复的字符串元素。
\n\n\n\n
  * **zset(sorted set：有序集合):  **类似于集合，但是每个元素都有一个分数（score）与之关联。
\n\n\n\n
  * **位图（Bitmaps）：** 基于字符串类型，可以对每个位进行操作。
\n\n\n\n
  * **超日志（HyperLogLogs）：** 用于基数统计，可以估算集合中的唯一元素数量。
\n\n\n\n
  * **地理空间（Geospatial）：** 用于存储地理位置信息。
\n\n\n\n
  * **发布/订阅（Pub/Sub）：** 一种消息通信模式，允许客户端订阅消息通道，并接收发布到该通道的消息。
\n\n\n\n
  * **流（Streams）：** 用于消息队列和日志存储，支持消息的持久化和时间排序。
\n\n\n\n
  * **模块（Modules）：** Redis 支持动态加载模块，可以扩展 Redis 的功能
\n
\n\n\n\n

### string类型

\n\n\n\n

string 是 redis 最基本的类型，你可以理解成与 Memcached 一模一样的类型，一个 key 对应一个 value。

\n\n\n\n

string 类型是二进制安全的。意思是 redis 的 string 可以包含任何数据，比如jpg图片或者序列化的对象。最大能存储512MB的对象

\n\n\n\n

### Hash哈希

\n\n\n\n

Redis hash 是一个键值(key=>value)对集合，类似于一个小型的 NoSQL 数据库。

\n\n\n\n

Redis hash 是一个 string 类型的 field 和 value 的映射表，hash 特别适合用于存储对象。每个哈希最多可以存储 2^32 - 1 个键值对。

\n\n\n\n

因此相对于一般的string存储，hash存储多出了field这样一种限制和约束

\n\n\n\n

### List列表

\n\n\n\n

Redis 列表是简单的字符串列表，按照插入顺序排序。你可以添加一个元素到列表的头部（左边）或者尾部（右边）。

\n\n\n\n

列表最多可以存储 2^32 - 1 个元素。

\n\n\n\n

### Set集合

\n\n\n\n

Redis 的 Set 是 string 类型的无序集合。

\n\n\n\n

集合是通过哈希表实现的，所以添加，删除，查找的复杂度都是 O(1)。

\n\n\n\n
    
    
    redis 127.0.0.1:6379> DEL runoob\nredis 127.0.0.1:6379> sadd runoob redis\n(integer) 1\nredis 127.0.0.1:6379> sadd runoob mongodb\n(integer) 1\nredis 127.0.0.1:6379> sadd runoob rabbitmq\n(integer) 1\nredis 127.0.0.1:6379> sadd runoob rabbitmq\n(integer) 0\nredis 127.0.0.1:6379> smembers runoob\n\n1) "redis"\n2) "rabbitmq"\n3) "mongodb"\n

\n\n\n\n

**注意：** 以上实例中 rabbitmq 添加了两次，但根据集合内元素的唯一性，第二次插入的元素将被忽略。

\n\n\n\n

### zset有序集合

\n\n\n\n

Redis zset 和 set 一样也是string类型元素的集合,且不允许重复的成员。

\n\n\n\n

不同的是每个元素都会关联一个double类型的分数。redis正是通过分数来为集合中的成员进行从小到大的排序。（排序依据是score）

\n\n\n\n

zset的成员是唯一的,但分数(score)却可以重复

\n\n\n\n

其实在redis sorted sets里面当items内容大于64的时候同时使用了hash和skiplist两种设计实现。这也会为了排序和查找性能做的优化。所以如上可知： 

\n\n\n\n

添加和删除都需要修改skiplist，所以复杂度为O(log(n))。 

\n\n\n\n

但是如果仅仅是查找元素的话可以直接使用hash，其复杂度为O(1) 

\n\n\n\n

其他的range操作复杂度一般为O(log(n))

\n\n\n\n

### 关于skiplist的介绍：

\n\n\n\n

跳表插入、删除、查找元素的时间复杂度跟红黑树都是一样量级的，时间复杂度都是O(logn)，而且跳表有一个特性是红黑树无法匹敌的（具体什么特性后面会提到）。所以在工业中，跳表也会经常被用到。废话不多说了，开始今天的跳表学习。<https://blog.csdn.net/sihai12345/article/details/138419109>

\n\n\n\n

所以简单来讲跳表是**可以实现二分查找的有序链表** 。能够实现比较高的查找以及插入效率。

\n\n\n\n

<https://oi-wiki.org/ds/skiplist/>  
具体请参考以上文章对于跳表进行详细的学习了解。

\n\n\n\n

\n\n\n\n

**其他高级数据类似**

\n\n\n\n

### HyperLogLog

\n\n\n\n

\n
  * 用于基数估计算法的数据结构。
\n\n\n\n
  * 常用于统计唯一值的近似值。
\n
\n\n\n\n

### Bitmaps

\n\n\n\n

\n
  * 位数组，可以对字符串进行位操作。
\n\n\n\n
  * 常用于实现布隆过滤器等位操作。
\n
\n\n\n\n

### Geospatial Indexes

\n\n\n\n

\n
  * 处理地理空间数据，支持地理空间索引和半径查询。\n\n
    * 日志数据类型，支持时间序列数据。
\n\n\n\n
    * 用于消息队列和实时数据处理。
\n\n
\n
\n\n\n\n

## 关于redis服务

\n\n\n\n

如果需要在远程 redis 服务上执行命令，同样我们使用的也是 **redis-cli**  命令。

\n\n\n\n
    
    
    $ redis-cli -h host -p port -a password

\n\n\n\n

关于redis的键的管理获取命令详见：<https://www.runoob.com/redis/redis-keys.html> 不再赘述

\n\n\n\n

## redis发布订阅

\n\n\n\n

Redis 发布订阅 (pub/sub) 是一种消息通信模式：发送者 (pub) 发送消息，订阅者 (sub) 接收消息。

\n\n\n\n

Redis 客户端可以订阅任意数量的频道。

\n\n\n\n

下图展示了频道 channel1 ， 以及订阅这个频道的三个客户端 —— client2 、 client5 和 client1 之间的关系：

\n\n\n\n![](https://www.runoob.com/wp-content/uploads/2014/11/pubsub1.png)\n\n\n\n

当channel1接收到publish的信息后回发送给订阅的三个客户端

\n\n\n\n![](https://www.runoob.com/wp-content/uploads/2014/11/pubsub2.png)\n\n\n\n

## redis事务

\n\n\n\n

Redis 事务可以一次执行多个命令， 并且带有以下三个重要的保证：

\n\n\n\n

\n
  * 批量操作在发送EXEC命令前被放入队列缓存
\n\n\n\n
  * 收到EXEC命令后进入事务执行，事务中任意命令执行失败，其余的命令依然被执行
\n\n\n\n
  * 在事务执行过程中，其他客户端提交的命令请求不会插入到事务执行命令序列中
\n
\n\n\n\n

一个事务从开始到执行会经历以下三个阶段：

\n\n\n\n

\n
  * 开始事务。
\n\n\n\n
  * 命令入队。
\n\n\n\n
  * 执行事务。
\n
\n\n\n\n

example:

\n\n\n\n

以下是一个事务的例子， 它先以 **MULTI** 开始一个事务， 然后将多个命令入队到事务中， 最后由 **EXEC** 命令触发事务， 一并执行事务中的所有命令：

\n\n\n\n
    
    
    redis 127.0.0.1:6379> MULTI\nOK\n\nredis 127.0.0.1:6379> SET book-name "Mastering C++ in 21 days"\nQUEUED\n\nredis 127.0.0.1:6379> GET book-name\nQUEUED\n\nredis 127.0.0.1:6379> SADD tag "C++" "Programming" "Mastering Series"\nQUEUED\n\nredis 127.0.0.1:6379> SMEMBERS tag\nQUEUED\n\nredis 127.0.0.1:6379> EXEC\n1) OK\n2) "Mastering C++ in 21 days"\n3) (integer) 3\n4) 1) "Mastering Series"\n   2) "C++"\n   3) "Programming"

\n\n\n\n

单个 Redis 命令的执行是原子性的，但 Redis 没有在事务上增加任何维持原子性的机制，所以 Redis 事务的执行并不是原子性的。

\n\n\n\n

事务可以理解为一个打包的批量执行脚本，但批量指令并非原子化的操作，中间某条指令的失败不会导致前面已做指令的回滚，也不会造成后续的指令不做。

\n\n\n\n

## Redis 脚本

\n\n\n\n

Redis 脚本使用 Lua 解释器来执行脚本。 Redis 2.6 版本通过内嵌支持 Lua 环境。执行脚本的常用命令为 **EVAL** 。

\n\n\n\n

### 语法

\n\n\n\n

Eval 命令的基本语法如下：

\n\n\n\n
    
    
    redis 127.0.0.1:6379> EVAL script numkeys key [key ...] arg [arg ...]

\n\n\n\n

### 实例

\n\n\n\n

以下实例演示了 redis 脚本工作过程：

\n\n\n\n
    
    
    redis 127.0.0.1:6379> EVAL "return {KEYS[1],KEYS[2],ARGV[1],ARGV[2]}" 2 key1 key2 first second\n\n1) "key1"\n2) "key2"\n3) "first"\n4) "second"

\n\n\n\n

* * *

\n\n\n\n

## Redis 脚本命令

\n\n\n\n

下表列出了 redis 脚本常用命令：

\n\n\n\n序号| 命令及描述  
---|---  
1| [EVAL script numkeys key [key ...] arg [arg ...]](<https://www.runoob.com/redis/scripting-eval.html>)  
执行 Lua 脚本。  
2| [EVALSHA sha1 numkeys key [key ...] arg [arg ...]](<https://www.runoob.com/redis/scripting-evalsha.html>)  
执行 Lua 脚本。  
3| [SCRIPT EXISTS script [script ...]](<https://www.runoob.com/redis/scripting-script-exists.html>)  
查看指定的脚本是否已经被保存在缓存当中。  
4| [SCRIPT FLUSH](<https://www.runoob.com/redis/scripting-script-flush.html>)  
从脚本缓存中移除所有脚本。  
5| [SCRIPT KILL](<https://www.runoob.com/redis/scripting-script-kill.html>)  
杀死当前正在运行的 Lua 脚本。  
6| [SCRIPT LOAD script](<https://www.runoob.com/redis/scripting-script-load.html>)  
将脚本 script 添加到脚本缓存中，但并不立即执行这个脚本。  
\n