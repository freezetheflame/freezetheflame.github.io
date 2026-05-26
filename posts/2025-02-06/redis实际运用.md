---
title: Redis实际运用
date: 2025-02-06
tags: [服务器后端内容, Java]
---


Redis（Remote Dictionary Server）是一个开源的内存数据库，遵守 BSD 协议，它提供了一个高性能的键值（key-value）存储系统，常用于缓存、消息队列、会话存储等应用场景。

与一般的kv缓存数据库相比，redis具有极高的性能，并且支持丰富的数据类型存储，包括字符串、列表、集合、哈希表、有序集合等。这些数据类型为开发者提供了灵活的数据操作能力，使得Redis可以适应各种不同的应用场景。

与此同时，redis的操作都是原子的，因此可以保证数据的一致性和完整性，适用于高并发环境下的事务处理

Redis 支持数据的持久化，可以将内存中的数据保存到磁盘中，以便在系统重启后恢复数据。这为 Redis 提供了数据安全性，确保数据不会因为系统故障而丢失。

注：强烈建议不要在公网访问 redis,因为 redis 的处理速度非常快，所以如果你的密码比较简单，很容易就会通过暴力破解破解出密码

## Redis 数据类型介绍

  * **string（字符串）:  **基本的数据存储单元，可以存储字符串、整数或者浮点数。

  * **hash（哈希）:** 一个键值对集合，可以存储多个字段。

  * **list（列表）:** 一个简单的列表，可以存储一系列的字符串元素。

  * **set（集合）:** 一个无序集合，可以存储不重复的字符串元素。

  * **zset(sorted set：有序集合):  **类似于集合，但是每个元素都有一个分数（score）与之关联。

  * **位图（Bitmaps）：** 基于字符串类型，可以对每个位进行操作。

  * **超日志（HyperLogLogs）：** 用于基数统计，可以估算集合中的唯一元素数量。

  * **地理空间（Geospatial）：** 用于存储地理位置信息。

  * **发布/订阅（Pub/Sub）：** 一种消息通信模式，允许客户端订阅消息通道，并接收发布到该通道的消息。

  * **流（Streams）：** 用于消息队列和日志存储，支持消息的持久化和时间排序。

  * **模块（Modules）：** Redis 支持动态加载模块，可以扩展 Redis 的功能

### string类型

string 是 redis 最基本的类型，你可以理解成与 Memcached 一模一样的类型，一个 key 对应一个 value。

string 类型是二进制安全的。意思是 redis 的 string 可以包含任何数据，比如jpg图片或者序列化的对象。最大能存储512MB的对象

### Hash哈希

Redis hash 是一个键值(key=>value)对集合，类似于一个小型的 NoSQL 数据库。

Redis hash 是一个 string 类型的 field 和 value 的映射表，hash 特别适合用于存储对象。每个哈希最多可以存储 2^32 - 1 个键值对。

因此相对于一般的string存储，hash存储多出了field这样一种限制和约束

### List列表

Redis 列表是简单的字符串列表，按照插入顺序排序。你可以添加一个元素到列表的头部（左边）或者尾部（右边）。

列表最多可以存储 2^32 - 1 个元素。

### Set集合

Redis 的 Set 是 string 类型的无序集合。

集合是通过哈希表实现的，所以添加，删除，查找的复杂度都是 O(1)。


    
    redis 127.0.0.1:6379> DEL runoob
redis 127.0.0.1:6379> sadd runoob redis
(integer) 1
redis 127.0.0.1:6379> sadd runoob mongodb
(integer) 1
redis 127.0.0.1:6379> sadd runoob rabbitmq
(integer) 1
redis 127.0.0.1:6379> sadd runoob rabbitmq
(integer) 0
redis 127.0.0.1:6379> smembers runoob
1) "redis"
2) "rabbitmq"
3) "mongodb"

**注意：** 以上实例中 rabbitmq 添加了两次，但根据集合内元素的唯一性，第二次插入的元素将被忽略。

### zset有序集合

Redis zset 和 set 一样也是string类型元素的集合,且不允许重复的成员。

不同的是每个元素都会关联一个double类型的分数。redis正是通过分数来为集合中的成员进行从小到大的排序。（排序依据是score）

zset的成员是唯一的,但分数(score)却可以重复

其实在redis sorted sets里面当items内容大于64的时候同时使用了hash和skiplist两种设计实现。这也会为了排序和查找性能做的优化。所以如上可知： 

添加和删除都需要修改skiplist，所以复杂度为O(log(n))。 

但是如果仅仅是查找元素的话可以直接使用hash，其复杂度为O(1) 

其他的range操作复杂度一般为O(log(n))

### 关于skiplist的介绍：

跳表插入、删除、查找元素的时间复杂度跟红黑树都是一样量级的，时间复杂度都是O(logn)，而且跳表有一个特性是红黑树无法匹敌的（具体什么特性后面会提到）。所以在工业中，跳表也会经常被用到。废话不多说了，开始今天的跳表学习。<https://blog.csdn.net/sihai12345/article/details/138419109>

所以简单来讲跳表是**可以实现二分查找的有序链表** 。能够实现比较高的查找以及插入效率。

<https://oi-wiki.org/ds/skiplist/>  
具体请参考以上文章对于跳表进行详细的学习了解。

**其他高级数据类似**

### HyperLogLog

  * 用于基数估计算法的数据结构。

  * 常用于统计唯一值的近似值。

### Bitmaps

  * 位数组，可以对字符串进行位操作。

  * 常用于实现布隆过滤器等位操作。

### Geospatial Indexes

  * 处理地理空间数据，支持地理空间索引和半径查询。

    * 日志数据类型，支持时间序列数据。

    * 用于消息队列和实时数据处理。

## 关于redis服务

如果需要在远程 redis 服务上执行命令，同样我们使用的也是 **redis-cli**  命令。


    
    $ redis-cli -h host -p port -a password

关于redis的键的管理获取命令详见：<https://www.runoob.com/redis/redis-keys.html> 不再赘述

## redis发布订阅

Redis 发布订阅 (pub/sub) 是一种消息通信模式：发送者 (pub) 发送消息，订阅者 (sub) 接收消息。

Redis 客户端可以订阅任意数量的频道。

下图展示了频道 channel1 ， 以及订阅这个频道的三个客户端 —— client2 、 client5 和 client1 之间的关系：

![](https://www.runoob.com/wp-content/uploads/2014/11/pubsub1.png)

当channel1接收到publish的信息后回发送给订阅的三个客户端

![](https://www.runoob.com/wp-content/uploads/2014/11/pubsub2.png)

## redis事务

Redis 事务可以一次执行多个命令， 并且带有以下三个重要的保证：

  * 批量操作在发送EXEC命令前被放入队列缓存

  * 收到EXEC命令后进入事务执行，事务中任意命令执行失败，其余的命令依然被执行

  * 在事务执行过程中，其他客户端提交的命令请求不会插入到事务执行命令序列中

一个事务从开始到执行会经历以下三个阶段：

  * 开始事务。

  * 命令入队。

  * 执行事务。

example:

以下是一个事务的例子， 它先以 **MULTI** 开始一个事务， 然后将多个命令入队到事务中， 最后由 **EXEC** 命令触发事务， 一并执行事务中的所有命令：


    
    redis 127.0.0.1:6379> MULTI
OK
redis 127.0.0.1:6379> SET book-name "Mastering C++ in 21 days"
QUEUED
redis 127.0.0.1:6379> GET book-name
QUEUED
redis 127.0.0.1:6379> SADD tag "C++" "Programming" "Mastering Series"
QUEUED
redis 127.0.0.1:6379> SMEMBERS tag
QUEUED
redis 127.0.0.1:6379> EXEC
1) OK
2) "Mastering C++ in 21 days"
3) (integer) 3
4) 1) "Mastering Series"
   2) "C++"
   3) "Programming"

单个 Redis 命令的执行是原子性的，但 Redis 没有在事务上增加任何维持原子性的机制，所以 Redis 事务的执行并不是原子性的。

事务可以理解为一个打包的批量执行脚本，但批量指令并非原子化的操作，中间某条指令的失败不会导致前面已做指令的回滚，也不会造成后续的指令不做。

## Redis 脚本

Redis 脚本使用 Lua 解释器来执行脚本。 Redis 2.6 版本通过内嵌支持 Lua 环境。执行脚本的常用命令为 **EVAL** 。

### 语法

Eval 命令的基本语法如下：


    
    redis 127.0.0.1:6379> EVAL script numkeys key [key ...] arg [arg ...]

### 实例

以下实例演示了 redis 脚本工作过程：


    
    redis 127.0.0.1:6379> EVAL "return {KEYS[1],KEYS[2],ARGV[1],ARGV[2]}" 2 key1 key2 first second
1) "key1"
2) "key2"
3) "first"
4) "second"

* * *

## Redis 脚本命令

下表列出了 redis 脚本常用命令：

序号| 命令及描述  
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
