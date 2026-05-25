---
title: Solidity智能合约编写学习(含prompt构建)
date: 2024-01-20
tags: [Windows相关]
---

\n

根据例子学习solidity

\n\n\n\n

### 投票合约

\n\n\n\n

以下的合约有一些复杂，但展示了很多Solidity的语言特性。它实现了一个投票合约。 当然，电子投票的主要问题是如何将投票权分配给正确的人员以及如何防止被操纵。 我们不会在这里解决所有的问题，但至少我们会展示如何进行委托投票，同时，计票又是 **自动和完全透明的**  。

\n\n\n\n
    
    
    // SPDX-License-Identifier: GPL-3.0\npragma solidity >=0.7.0 <0.9.0;\n\n/// @title 委托投票\ncontract Ballot {\n    // 这里声明了一个新的复合类型用于稍后的变量\n    // 它用来表示一个选民\n    struct Voter {\n        uint weight; // 计票的权重\n        bool voted;  // 若为真，代表该人已投票\n        address delegate; // 被委托人\n        uint vote;   // 投票提案的索引\n    }\n\n    // 提案的类型\n    struct Proposal {\n        bytes32 name;   // 简称（最长32个字节）\n        uint voteCount; // 得票数\n    }\n\n    address public chairperson;\n\n    // 这声明了一个状态变量，为每个可能的地址存储一个 `Voter`。\n    mapping(address => Voter) public voters;\n\n    // 一个 `Proposal` 结构类型的动态数组\n    Proposal[] public proposals;\n\n    /// 为 `proposalNames` 中的每个提案，创建一个新的（投票）表决\n    constructor(bytes32[] memory proposalNames) {\n        chairperson = msg.sender;\n        voters[chairperson].weight = 1;\n        //对于提供的每个提案名称，\n        //创建一个新的 Proposal 对象并把它添加到数组的末尾。\n        for (uint i = 0; i < proposalNames.length; i++) {\n            // `Proposal({...})` 创建一个临时 Proposal 对象，\n            // `proposals.push(...)` 将其添加到 `proposals` 的末尾\n            proposals.push(Proposal({\n                name: proposalNames[i],\n                voteCount: 0\n            }));\n        }\n    }\n\n    // 授权 `voter` 对这个（投票）表决进行投票\n    // 只有 `chairperson` 可以调用该函数。\n    function giveRightToVote(address voter) external {\n        // 若 `require` 的第一个参数的计算结果为 `false`，\n        // 则终止执行，撤销所有对状态和以太币余额的改动。\n        // 在旧版的 EVM 中这曾经会消耗所有 gas，但现在不会了。\n        // 使用 require 来检查函数是否被正确地调用，是一个好习惯。\n        // 你也可以在 require 的第二个参数中提供一个对错误情况的解释。\n        require(\n            msg.sender == chairperson,\n            "Only chairperson can give right to vote."\n        );\n        require(\n            !voters[voter].voted,\n            "The voter already voted."\n        );\n        require(voters[voter].weight == 0);\n        voters[voter].weight = 1;\n    }\n\n    /// 把你的投票委托到投票者 `to`。\n    function delegate(address to) external {\n        // 传引用\n        Voter storage sender = voters[msg.sender];\n        require(sender.weight != 0, "You have no right to vote");\n        require(!sender.voted, "You already voted.");\n\n        require(to != msg.sender, "Self-delegation is disallowed.");\n\n        // 委托是可以传递的，只要被委托者 `to` 也设置了委托。\n        // 一般来说，这种循环委托是危险的。因为，如果传递的链条太长，\n        // 则可能需消耗的gas要多于区块中剩余的（大于区块设置的gasLimit），\n        // 这种情况下，委托不会被执行。\n        // 而在另一些情况下，如果形成闭环，则会让合约完全卡住。\n        while (voters[to].delegate != address(0)) {\n            to = voters[to].delegate;\n\n            // 不允许闭环委托\n            require(to != msg.sender, "Found loop in delegation.");\n        }\n\n        // `sender` 是一个引用, 相当于对 `voters[msg.sender].voted` 进行修改\n        Voter storage delegate_ = voters[to];\n\n        // Voters cannot delegate to accounts that cannot vote.\n        require(delegate_.weight >= 1);\n\n        // Since `sender` is a reference, this\n        // modifies `voters[msg.sender]`.\n        sender.voted = true;\n        sender.delegate = to;\n\n        if (delegate_.voted) {\n            // 若被委托者已经投过票了，直接增加得票数\n            proposals[delegate_.vote].voteCount += sender.weight;\n        } else {\n            // 若被委托者还没投票，增加委托者的权重\n            delegate_.weight += sender.weight;\n        }\n    }\n\n    /// 把你的票(包括委托给你的票)，\n    /// 投给提案 `proposals[proposal].name`.\n    function vote(uint proposal) external {\n        Voter storage sender = voters[msg.sender];\n        require(!sender.voted, "Already voted.");\n        sender.voted = true;\n        sender.vote = proposal;\n\n        // 如果 `proposal` 超过了数组的范围，则会自动抛出异常，并恢复所有的改动\n        proposals[proposal].voteCount += sender.weight;\n    }\n\n    /// @dev 结合之前所有的投票，计算出最终胜出的提案\n    function winningProposal() external view\n            returns (uint winningProposal_)\n    {\n        uint winningVoteCount = 0;\n        for (uint p = 0; p < proposals.length; p++) {\n            if (proposals[p].voteCount > winningVoteCount) {\n                winningVoteCount = proposals[p].voteCount;\n                winningProposal_ = p;\n            }\n        }\n    }\n\n    // 调用 winningProposal() 函数以获取提案数组中获胜者的索引，并以此返回获胜者的名称\n    function winnerName() public view\n            returns (bytes32 winnerName_)\n    {\n        winnerName_ = proposals[winningProposal()].name;\n    }\n}

\n\n\n\n

### 秘密竞价合约

\n\n\n\n
    
    
    // SPDX-License-Identifier: GPL-3.0\npragma solidity ^0.8.4;\n\ncontract SimpleAuction {\n    // 拍卖的参数。\n    address payable public beneficiary;\n    // 时间是unix的绝对时间戳（自1970-01-01以来的秒数）\n    // 或以秒为单位的时间段。\n    uint public auctionEnd;\n\n    // 拍卖的当前状态\n    address public highestBidder;\n    uint public highestBid;\n\n    //可以取回的之前的出价\n    mapping(address => uint) pendingReturns;\n\n    // 拍卖结束后设为 true，将禁止所有的变更\n    bool ended;\n\n    // 变更触发的事件\n    event HighestBidIncreased(address bidder, uint amount);\n    event AuctionEnded(address winner, uint amount);\n\n    // Errors 用来定义失败\n\n    // 以下称为 natspec 注释，可以通过三个斜杠来识别。\n    // 当用户被要求确认交易时或错误发生时将显示。\n\n    /// The auction has already ended.\n    error AuctionAlreadyEnded();\n    /// There is already a higher or equal bid.\n    error BidNotHighEnough(uint highestBid);\n    /// The auction has not ended yet.\n    error AuctionNotYetEnded();\n    /// The function auctionEnd has already been called.\n    error AuctionEndAlreadyCalled();\n\n    /// 以受益者地址 `beneficiaryAddress` 的名义，\n    /// 创建一个简单的拍卖，拍卖时间为 `biddingTime` 秒。\n    constructor(\n        uint biddingTime,\n        address payable beneficiaryAddress\n    ) {\n        beneficiary = beneficiaryAddress;\n        auctionEnd = block.timestamp + biddingTime;\n    }\n\n    /// 对拍卖进行出价，具体的出价随交易一起发送。\n    /// 如果没有在拍卖中胜出，则返还出价。\n    function bid() external payable {\n        // 参数不是必要的。因为所有的信息已经包含在了交易中。\n        // 对于能接收以太币的函数，关键字 payable 是必须的。\n\n        // 如果拍卖已结束，撤销函数的调用。\n        if (block.timestamp > auctionEndTime)\n            revert AuctionAlreadyEnded();\n\n        // 如果出价不够高，返还你的钱\n        if (msg.value <= highestBid)\n            revert BidNotHighEnough(highestBid);\n\n        if (highestBid != 0) {\n            // 返还出价时，简单地直接调用 highestBidder.send(highestBid) 函数，\n            // 是有安全风险的，因为它有可能执行一个非信任合约。\n            // 更为安全的做法是让接收方自己提取金钱。\n            pendingReturns[highestBidder] += highestBid;\n        }\n        highestBidder = msg.sender;\n        highestBid = msg.value;\n        emit HighestBidIncreased(msg.sender, msg.value);\n    }\n\n    /// 取回出价（当该出价已被超越）\n    function withdraw() external returns (bool) {\n        uint amount = pendingReturns[msg.sender];\n        if (amount > 0) {\n            // 这里很重要，首先要设零值。\n            // 因为，作为接收调用的一部分，\n            // 接收者可以在 `send` 返回之前，重新调用该函数。\n            pendingReturns[msg.sender] = 0;\n\n            // msg.sender is not of type `address payable` and must be\n            // explicitly converted using `payable(msg.sender)` in order\n            // use the member function `send()`.\n            if (!payable(msg.sender).send(amount)) {\n                // 这里不需抛出异常，只需重置未付款\n                pendingReturns[msg.sender] = amount;\n                return false;\n            }\n        }\n        return true;\n    }\n\n    /// 结束拍卖，并把最高的出价发送给受益人\n    function auctionEnd() external {\n        // 对于可与其他合约交互的函数（意味着它会调用其他函数或发送以太币），\n        // 一个好的指导方针是将其结构分为三个阶段：\n        // 1. 检查条件\n        // 2. 执行动作 (可能会改变条件)\n        // 3. 与其他合约交互\n        // 如果这些阶段相混合，其他的合约可能会回调当前合约并修改状态，\n        // 或者导致某些效果（比如支付以太币）多次生效。\n        // 如果合约内调用的函数包含了与外部合约的交互，\n        // 则它也会被认为是与外部合约有交互的。\n\n        // 1. 条件\n        if (block.timestamp < auctionEndTime)\n            revert AuctionNotYetEnded();\n        if (ended)\n            revert AuctionEndAlreadyCalled();\n\n        // 2. 生效\n        ended = true;\n        emit AuctionEnded(highestBidder, highestBid);\n\n        // 3. 交互\n        beneficiary.transfer(highestBid);\n    }\n}

\n\n\n\n

以上的两段代码都可以作为few-shot在prompt中直接应用

\n\n\n\n

接下来简单补充一些ToT的方法实现PE

\n\n\n\n

瞎写的第一个prompt：

\n\n\n\n

请按照以下格式回答我的问题并完成一段智能合约的书写： 这是我的需求：【秘密竞价的智能合约，满足所有竞价人不能得知其他人在竞价时候的出价，在竞价结束之后比对所有竞价人的实际出价和竞价是否相符，采取公开哈希比较的方式】 请你根据上面的需求完成以下任务：1.分析这一段需求，是否有不理解的地方？如果有的话请用1.2.3.的列表方式回复，与后文用回车相隔 2.指出这一段合约中所需要注意的几个关键点，以1.2.3.的列表方式列出，3-5个即可 3.完成这一段智能合约的撰写，要求采用solidity书写，严格满足语法要求 你完成这些任务之后我会给予你足够的奖励，并且如果做的好的话会有丰厚的小费

\n\n\n\n

## **Matt Nigh的CRISPE Prompt Framework**

\n\n\n\n

## How to Build Prompts -> CRISPE Example

\n\n\n\nStep| Example Prompt  
---|---  
Capacity and Role| `Act as an expert on software development on the topic of machine learning frameworks, and an expert blog writer.`  
Insight| `The audience for this blog is technical professionals who are interested in learning about the latest advancements in machine learning.`  
Statement| `Provide a comprehensive overview of the most popular machine learning frameworks, including their strengths and weaknesses. Include real-life examples and case studies to illustrate how these frameworks have been successfully used in various industries.`  
Personality| `When responding, use a mix of the writing styles of Andrej Karpathy, Francois Chollet, Jeremy Howard, and Yann LeCun.`  
Experiment| `Give me multiple different examples.`  
\n\n\n\n

**CR：Capacity and Role（能力与角色）。你希望 ChatGPT 扮演怎样的角色。**  
**I：Insight（洞察），背景信息和上下文。**  
**S：Statement（陈述），你希望 ChatGPT 做什么。**  
**P：Personality（个性），你希望 ChatGPT 以什么风格或方式回答你。**  
**E：Experiment（实验），要求 ChatGPT 为你提供多个答案。**

\n\n\n\n

\n\n\n\n

## 根据需求分析模块的收集信息进行prompt编写

\n\n\n\n

采用的technique：character

\n\n\n\n

需求分析系统中暂时填的这段话术”用户的智能合约需求如下： 

\n\n\n\n

1\. **您希望在哪个区块链平台上部署您的智能合约？** 用户答案：以太坊（Ethereum） 

\n\n\n\n

2\. **您希望用哪种编程语言实现您的智能合约？** 用户答案：Solidity

\n\n\n\n

以上1-2两个是对于gpt的系统信息提供（C&R）

\n\n\n\n

3\. **您的业务中包含哪些角色？请简单描述下他们** 用户答案：有管理员、普通用户和审批者三种角色。管理员负责系统配置，普通用户可以发起合约交易，审批者审批交易。 

\n\n\n\n

4\. **您的业务中包含哪些功能？请简单描述下它们** 用户答案：创建新合约、审批合约、查询合约状态、执行合约交易等功能。 

\n\n\n\n

5\. **您业务中的角色与各功能的使用权限的关系是什么？** 用户答案：管理员具有所有功能的权限，审批者有审批和查询权限，普通用户只能执行和查询。

\n\n\n\n

6\. **您业务中需要存储的核心数据有哪些？请简单描述下它们** 用户答案：合约的创建时间、状态、交易记录等核心数据。 

\n\n\n\n

7\. **您业务的具体流程是什么？请简单描述下** 用户答案：普通用户创建合约，审批者审批合约，用户执行合约交易，系统记录交易信息。 

\n\n\n\n

8\. **您是否要采用特定的安全措施保护数据的安全？请简单描述下该措施** 用户答案：采用加密算法保护合约数据的传输和存储安全。

\n\n\n\n

9\. **您是否要采用特定的隐私保护策略保护隐私数据？请简单描述下该策略** 用户答案：使用隐私合约和权限管理，确保敏感信息只对授权用户可见。 

\n\n\n\n

10\. **您的智能合约是否要调用其他智能合约？请简单描述下这些合约** 用户答案：是，智能合约可能会调用支付合约以处理交易中的资金转移。 '，

\n\n\n\n

请你根据用户回答的这些问题，生成用户合约需求的具体清单，现在系统是把用户答案部分用前端中在需求问题列表中提取到的文字替换，然后发送给gpt。 

\n\n\n\n

我想的是这块有两个方向做提示的优化，一个是研究这些问题的合理性（目前这些问题是简单拍脑袋想的），就是从智能合约的特性上看，有哪些需求问题是它们的共性或者说必要的，另外一个是对这个话术做优化，就比如用思维链，从一个大问题下手引到小问题，或者引入角色提示给gpt例如“假设你是一个智能合约需求分析师”

\n\n\n\n

version 1（含对比）:  
（使用的策略及对比：zero shot + 单次无链条+系统信息vs zero shot +单次无链条+without 系统信息）

\n\n\n\n
    
    
    你是一个熟练的智能合约编写者，使用solidity语言编写部署在以太坊上的智能合约，请你根据我的以下需求，编写一个完善的可以直接使用的智能合约：\n这份智能合约的主要功能包括：创建新合约、审批合约、查询合约状态、执行合约交易等功能。 \n其中包含这些角色：有管理员、普通用户和审批者三种角色。管理员负责系统配置，普通用户可以发起合约交易，审批者审批交易。 \n这些角色和对应业务的使用权限如下：管理员具有所有功能的权限，审批者有审批和查询权限，普通用户只能执行和查询。\n在这个合约中需要存储的核心数据包括：合约的创建时间、状态交易记录等核心数据。\n合约运作的主要流程是： 普通用户创建合约，审批者审批合约，用户执行合约交易，系统记录交易信息。 \n在安全性方面，需要注意采用加密算法保护合约数据的传输和存储安全。\n在隐私方面，需要考虑：使用隐私合约和权限管理，确保敏感信息只对授权用户可见。\n这个合约可能调用的智能合约如下：是，智能合约可能会调用支付合约以处理交易中的资金转移。

\n\n\n\n

## 需求清单构建与简单要求

\n\n\n\n

一些示例（从一些更大项目的需求清单中提取一份智能合约需要的清单内容）：

\n\n\n\n

给一份智能合约写需求清单时，你可以考虑以下方面来确保清晰明确地表达需求：

\n\n\n\n

\n
  1. 合约目的：说明智能合约的目标和用途，以便团队理解它的作用和范围。
\n\n\n\n
  2. 功能需求：列出智能合约需要实现的具体功能，包括输入、输出和预期行为。
\n\n\n\n
  3. 数据模型：定义智能合约中涉及的数据结构、变量和状态，以确保对数据的正确处理和存储。
\n\n\n\n
  4. 交互与权限：描述与智能合约的交互方式，包括合约的入口点和权限控制。
\n\n\n\n
  5. 业务规则：说明智能合约中的业务规则和逻辑，以确保合约的正确执行和符合预期。
\n\n\n\n
  6. 安全性要求：列出智能合约的安全性要求，包括防止恶意攻击、保护用户数据等。
\n\n\n\n
  7. 性能需求：定义智能合约的性能要求，包括交易处理速度、资源消耗等方面的要求。
\n\n\n\n
  8. 事件和通知：确定智能合约需要触发的事件和通知，以便与其他系统或用户进行交互。
\n\n\n\n
  9. 异常处理：描述智能合约的异常情况和错误处理机制，以确保对异常情况的适当处理和反馈。
\n\n\n\n
  10. 测试需求：定义智能合约的测试策略和需求，以确保对合约进行全面和有效的测试。
\n\n\n\n
  11. 部署和维护：考虑智能合约的部署和维护需求，包括合约的部署环境、升级策略等。
\n\n\n\n
  12. 监控和审计：确定智能合约的监控和审计需求，以便能够对合约的执行进行跟踪和审计。
\n
\n\n\n\n

在编写需求清单时，尽量避免模糊和歧义的表达，确保每个需求都是可测量和可验证的。另外，与团队成员和相关利益相关者进行充分的沟通和协作，以确保需求清单能够满足业务和技术的需要。

\n\n\n\n

请注意，智能合约的需求清单可能会因不同的区块链平台和合约类型而有所不同，因此在编写需求清单时，请根据具体的合约技术和平台进行相应的调整和补充。

\n\n\n\n![此图片的alt属性为空；文件名为image-12.png](../../assets/images/2024/02/image-13.png)\n\n\n\n

所以我们需要设计一个表格状态的需求清单，并且描述他们的对应特征，且为了之后的代码生成的工作，在尽可能节约prompt数量的前提下完成需求清单的传达

\n\n\n\n用户类型| 权限| | | | | | 备注  
---|---|---|---|---|---|---|---  
| | | | | | |   
| | | | | | |   
| | | | | | |   
| | | | | | |   
| | | | | | |   
| | | | | | |   
| | | | | | |   
| | | | | | |   
| | | | | | |   
| | | | | | |   
| | | | | | |   
\n\n\n\n

阶段2prompt设计

\n\n\n\n

\n