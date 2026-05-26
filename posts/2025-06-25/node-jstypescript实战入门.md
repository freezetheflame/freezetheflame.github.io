---
title: Node.js+TypeScript实战入门
date: 2025-06-25
tags: [服务器后端内容]
---


Node.js作为开源的跨平台的JavaScript运行时环境，便于开发任何类型的项目。不过本博文的重点主要围绕在后台领域node.js的运用。

Node.js是运行于单进程的，因此不需要为每个请求创造新线程。Node.js在标准库中有对于异步操作的基本支持，可以防止阻塞情况的出现。因此可以处理单机多线程的情况。

## tools 1: express后端框架

express是基于node.js的成熟后端框架，通过express=require('express') app = express()建立框架，之后可以通过在这个基础app上面注册中间件来进一步拓展其功能。

## tools 2：redis client & RedisStore

### Redis Client

**职责** ：

  * Redis Client 是与 Redis 数据库进行直接交互的工具。

  * 它提供了一组 API 用于连接、读取、写入和删除 Redis 中的数据。

  * Redis Client 可以执行 Redis 提供的各种命令，如 `GET`、`SET`、`DEL` 等。

**使用场景** ：

  * 当你需要自定义某些数据操作，或者在业务逻辑中需要与 Redis 交互时，会使用 Redis Client。

  * 适合进行复杂的查询和数据存储操作。

### Redis Store

**职责** ：

  * Redis Store 一般是一个更高层的抽象，它通常用于特定的功能，例如会话存储（Session Store）、缓存等。

  * Redis Store 使用 Redis Client 来实际执行命令，但提供了一个简化的接口，使得开发者更方便地使用。

  * 它通常专注于特定的使用场景，提供一些预定义的功能，比如自动过期、序列化等。

**使用场景** ：

  * Redis Store 通常用于会话管理，比如在 Express 中使用 `connect-redis` 中间件，将用户会话数据存储在 Redis 中。

  * 适合需要快速集成特定功能的情况，而无需过多考虑底层细节。

## issue1 : express-session类型合并（Module Augmentation）

<https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/express-session/index.d.ts#L23>

由于需求中需要“在session中”对于querysreing进行存储，因此要对session进行操作，并且在服务器端通过redis完成对于session的缓存，故要在session上使用新的字段存储这一string，但是对于js来说很正常的req.session.querystring的index操作上（其实是类型不安全），迁移到typescript上，则存在implicitly的问题，这个参数在原本的'Session & Partial<SessionData>'类型上并不存在，因此这个index操作是不安全的，故需要使用type merging的办法来扩展原始的express-session的类型。

首先，为了开发规范和逻辑，单独建立一个文件夹管理这个新声明，命名为types即可，然后新建一个express-session.d.ts文件夹，其中的类型扩展代码如下：


    
    import 'express-session';
declare module 'express-session' {
  interface Session {
    queryParams?: Record<string, any>;
  }
}

然后在tsconfig中确定compilerOptions中包含这里的自定义类型。


    
    {
  "compilerOptions": {
    ...
    "typeRoots": ["./node_modules/@types", "./src/types"]
  }
}

初始化一个node.js项目一般有如下步骤：

1.创建项目目录：


    
    mkdir project

2.初始化项目


    
    npm init -y

3.安装一些依赖库


    
    npm install ^
npm install --save-dev ^#only for development

4.由于我们主要用ts开发，因此还需要对应的typescript配置文件


    
    npx tsc --init

## tools 3: MongoDB（之后拆分开来再讲）

mongoDB的环境我选择了docker，因此后续的操作都是通过wsl终端完成的，使用时请注意

docker运行时一定要注意设置两个参数，一个是管理员name，一个是对应的密码，因为后续的数据库操作都要做authentication，具体如下


    
    docker run -d --name mongodb \\
  -p 27017:27017 \\
  -v /mnt/c/data/mongodb:/data/db \\
  -e MONGO_INITDB_ROOT_USERNAME=admin \\
  -e MONGO_INITDB_ROOT_PASSWORD=admin123 \\
  mongo

GUI的操作类似的，把容器启动起来后，使用docker exec来连接到mongosh


    
    docker exec -it mongodb mongosh

mongodb有个比较神奇的地方，不是说他文档数据库的存储神奇，他的authentication很神奇，连接的时候暂时还不用权限验证，得你连接上之后，用下面的方式验证权限


    
    admin> db.auth("admin","admin123")
{ ok: 1 }

这里的返回值是很典型的文档数据库的特性，ok表示验证成功，之后我们才能做一系列操作数据库的动作。
