---
title: Data Structure &amp; Algorithm Template
date: 2025-04-14
tags: [Windows相关, 算法与数据结构]
---

\n

## TrieTree[(前缀树)](<https://leetcode.cn/problems/implement-trie-prefix-tree/>)

\n\n\n\n

**[Trie](<https://baike.baidu.com/item/%E5%AD%97%E5%85%B8%E6%A0%91/9825209?fr=aladdin>)** （发音类似 "try"）或者说 **前缀树**  是一种树形数据结构，用于高效地存储和检索字符串数据集中的键。这一数据结构有相当多的应用情景，例如自动补全和拼写检查。

\n\n\n\n
    
    
    package DSA;\n\nclass TrieNode{\n    private char c;\n    private boolean isEnd;\n    private TrieNode[] children;\n    private static final int ALPHABET_SIZE = 26;\n    public TrieNode(){\n        this.children = new TrieNode[ALPHABET_SIZE];\n        this.isEnd = false;\n    }\n    public TrieNode(char c){\n        this();\n        this.c = c;\n    }\n    public boolean isStartWith(char c){\n        return this.c == c;\n    }\n\n    public boolean isEnd(){\n        return this.isEnd;\n    }\n\n    public TrieNode[] getChildren(){\n        return this.children;\n    }\n    public void setEnd(boolean isEnd){\n        this.isEnd = isEnd;\n    }\n}\n\npublic class TrieTree {\n    TrieNode root;\n    public TrieTree(){\n        this.root = new TrieNode();\n    }\n    public void insert(String word){\n        TrieNode cur = root;\n        for(char c:word.toCharArray()){\n            int index = c - 'a';\n            if(cur.getChildren()[index] == null){\n                cur.getChildren()[index] = new TrieNode(c);\n            }\n            cur = cur.getChildren()[index];\n        }\n        cur.setEnd(true);\n\n    }\n    public boolean search(String word){\n        TrieNode cur = root;\n        for(char c:word.toCharArray()){\n            int index = c - 'a';\n            if(cur.getChildren()[index] == null){\n                System.out.println("Not Found");\n                return false;\n            }\n            cur = cur.getChildren()[index];\n        }\n        return cur.isEnd();\n    }\n\n    public boolean startsWith(String prefix){\n        TrieNode cur = root;\n        for(char c:prefix.toCharArray()){\n            int index = c - 'a';\n            if(cur.getChildren()[index] == null){\n                System.out.println("Not Found");\n                return false;\n            }\n            cur = cur.getChildren()[index];\n        }\n        return true;\n    }\n\n    public static void main(String[] args){\n        TrieTree trie = new TrieTree();\n        trie.insert("apple");\n        System.out.println(trie.search("apple"));   // returns true\n        System.out.println(trie.search("app"));     // returns false\n        System.out.println(trie.startsWith("app")); // returns true\n        trie.insert("app");\n        System.out.println(trie.search("app"));     // returns true\n    }\n}\n

\n\n\n\n

## LRU cache

\n\n\n\n

LRU是Least Recently Used的缩写，即最近最少使用，是一种常用的[页面置换算法](<https://baike.baidu.com/item/%E9%A1%B5%E9%9D%A2%E7%BD%AE%E6%8D%A2%E7%AE%97%E6%B3%95/7626091?fromModule=lemma_inlink>)，选择最近最久未使用的页面予以淘汰。该算法赋予每个[页面](<https://baike.baidu.com/item/%E9%A1%B5%E9%9D%A2/5544813?fromModule=lemma_inlink>)一个访问字段，用来记录一个页面自上次被访问以来所经历的时间 t，当须淘汰一个页面时，选择现有页面中其 t 值最大的，即最近最少使用的页面予以淘汰。对应的，这里的cache就是采用lru策略的一个缓存系统。

\n\n\n\n
    
    
    package DSA;\n\nimport java.util.HashMap;\nimport java.util.Map;\n\nclass ListNode<T>{\n    public T val;\n    public int key;\n    ListNode<T> next;\n    ListNode<T> before;\n    public ListNode(int key, T val){\n        this.key = key;\n        this.val = val;\n    }\n    public ListNode(int key, T val, ListNode<T> next){\n        this.key = key;\n        this.val = val;\n        this.next = next;\n    }\n    public ListNode(int key, T val, ListNode<T> next, ListNode<T> before){\n        this.key = key;\n        this.val = val;\n        this.next = next;\n        this.before = before;\n    }\n}\npublic class LRUcache<T> {\n    private Map<Integer,ListNode<T>> map = new HashMap<>();\n    ListNode<T> head;\n    ListNode<T> tail;\n    int capacity;\n\n    public LRUcache(){\n        this.head = new ListNode<T>(0, null);\n        this.tail = new ListNode<T>(0, null);\n        this.head.next = tail;\n        this.tail.before = head;\n        this.capacity = 0;\n    }\n    public LRUcache(int capacity){\n        this.head = new ListNode<T>(0, null);\n        this.tail = new ListNode<T>(0, null);\n        this.head.next = tail;\n        this.tail.before = head;\n        this.capacity = capacity;\n    }\n\n    public void put(int key,T val){\n        if(map.containsKey(key)){\n            ListNode<T> node = map.get(key);\n            node.val = val;\n            removeNode(node);\n            moveToHead(node);\n            return;\n        }\n        map.put(key, new ListNode<T>(key, val));\n        if(map.size() > capacity){\n            ListNode<T> node = tail.before;\n            map.remove(node.key);\n            tail.before = node.before;\n            node.before.next = tail;\n        }\n        moveToHead(map.get(key));\n    }\n\n    public T get(int key){\n        if(map.containsKey(key)){\n            ListNode<T> node = map.get(key);\n            removeNode(node);\n            moveToHead(node);\n            return node.val;\n        }else{\n            return null;\n        }\n    }\n\n\n    void moveToHead(ListNode<T> node){\n        if(head.next == node){\n            return;\n        }\n        node.before = head;\n        node.next = head.next;\n        head.next.before = node;\n        head.next = node;\n    }\n\n    void removeNode(ListNode<T> node){\n        node.before.next = node.next;\n        node.next.before = node.before;\n    }\n\n    public int size(){\n        return map.size();\n    }\n\n    public void print(){\n        ListNode<T> cur = head.next;\n        while(cur != tail){\n            System.out.print(cur.key + " ");\n            cur = cur.next;\n        }\n        System.out.println();\n    }\n\n    public static void main(String[] args) {\n        LRUcache<String> cache = new LRUcache<>(3);\n        cache.put(1, "haha1");\n        cache.put(2, "haha2");\n        cache.put(3, "haha3");\n        cache.print(); // 1 2 3\n        System.out.println(cache.get(3)); // haha3\n        cache.put(4, "haha4");\n        cache.print(); // 2 3 4\n        System.out.println(cache.get(1)); // null\n    }\n}\n

\n\n\n\n

## 最短路径Algorithm

\n\n\n\n

### Floyd算法

\n\n\n\n

是用来求任意两个结点之间的最短路的。

\n\n\n\n

复杂度比较高，但是常数小，容易实现（只有三个 `for`）。

\n\n\n\n

适用于任何图，不管有向无向，边权正负，但是最短路必须存在。（不能有个负环）

\n\n\n\n

我们定义一个数组 `f[k][x][y]`，表示只允许经过结点 ![](blob:https://www.freezetheflame.cc/0dc5eefb-cf53-4065-9f16-514d2854dbbb) 到 ![](blob:https://www.freezetheflame.cc/532b9816-64e4-4f00-8bb3-2028bd8915ce)（也就是说，在子图 ![](blob:https://www.freezetheflame.cc/827246ef-59cd-4287-be78-408ccc4c8178) 中的路径，注意，![](blob:https://www.freezetheflame.cc/8708d02e-f3f5-4e21-aca8-17125b26aeb8) 与 ![](blob:https://www.freezetheflame.cc/f7a30170-a5e5-471a-a88d-b6c7893a660e) 不一定在这个子图中），结点 ![](blob:https://www.freezetheflame.cc/e4de7142-4cb9-463f-8207-ee4159a83fd2) 到结点 ![](blob:https://www.freezetheflame.cc/89ec1508-7703-4bf8-8040-5de618a66aee) 的最短路长度。

\n\n\n\n

很显然，`f[n][x][y]` 就是结点 ![](blob:https://www.freezetheflame.cc/e32f835d-39fa-4d5c-9518-8c9870555658) 到结点 ![](blob:https://www.freezetheflame.cc/a85dc6c7-f667-4251-a04e-c350dedc287a) 的最短路长度（因为 ![](blob:https://www.freezetheflame.cc/7f198450-a1e5-48b8-a619-c0f9de4f6cb6) 即为 ![](blob:https://www.freezetheflame.cc/6a15290f-3eef-4fb5-aba4-950792d782d2) 本身，其表示的最短路径就是所求路径）。

\n\n\n\n
    
    
    for (k = 1; k <= n; k++) {\n  for (x = 1; x <= n; x++) {\n    for (y = 1; y <= n; y++) {\n      f[x][y] = min(f[x][y], f[x][k] + f[k][y]);\n    }\n  }\n}

\n\n\n\n

by the way……

\n\n\n\n

### 最小环（using floyd）

\n\n\n\n![](../../assets/images/2025/04/image-46.png)\n\n\n\n
    
    
    int val[MAXN + 1][MAXN + 1];  // 原图的邻接矩阵\n\nint floyd(const int &n) {\n  static int dis[MAXN + 1][MAXN + 1];  // 最短路矩阵\n  for (int i = 1; i <= n; ++i)\n    for (int j = 1; j <= n; ++j) dis[i][j] = val[i][j];  // 初始化最短路矩阵\n  int ans = inf;\n  for (int k = 1; k <= n; ++k) {\n    for (int i = 1; i < k; ++i)\n      for (int j = 1; j < i; ++j)\n        ans = std::min(ans, dis[i][j] + val[i][k] + val[k][j]);  // 更新答案\n    for (int i = 1; i <= n; ++i)\n      for (int j = 1; j <= n; ++j)\n        dis[i][j] = std::min(\n            dis[i][j], dis[i][k] + dis[k][j]);  // 正常的 floyd 更新最短路矩阵\n  }\n  return ans;\n}

\n\n\n\n

### Bellman–Ford 算法[](<https://oi-wiki.org//graph/shortest-path/#bellmanford-%E7%AE%97%E6%B3%95>)

\n\n\n\n

Bellman–Ford 算法是一种基于松弛（relax）操作的最短路算法，可以求出有负权的图的最短路，并可以对最短路不存在的情况进行判断。

\n\n\n\n

在国内 OI 界，你可能听说过的「SPFA」，就是 Bellman–Ford 算法的一种实现。

\n\n\n\n![](../../assets/images/2025/04/image-47.png)\n\n\n\n
    
    
    class Edge:\n    def __init__(self, u=0, v=0, w=0):\n        self.u = u\n        self.v = v\n        self.w = w\n\n\nINF = 0x3F3F3F3F\nedge = []\n\n\ndef bellmanford(n, s):\n    dis = [INF] * (n + 1)\n    dis[s] = 0\n    for i in range(1, n + 1):\n        flag = False\n        for e in edge:\n            u, v, w = e.u, e.v, e.w\n            if dis[u] == INF:\n                continue\n            # 无穷大与常数加减仍然为无穷大\n            # 因此最短路长度为 INF 的点引出的边不可能发生松弛操作\n            if dis[v] > dis[u] + w:\n                dis[v] = dis[u] + w\n                flag = True\n        # 没有可以松弛的边时就停止算法\n        if not flag:\n            break\n    # 第 n 轮循环仍然可以松弛时说明 s 点可以抵达一个负环\n    return flag

\n\n\n\n

**队列优化：SPFA**[](<https://oi-wiki.org//graph/shortest-path/#%E9%98%9F%E5%88%97%E4%BC%98%E5%8C%96spfa>)

\n\n\n\n

很多时候我们并不需要那么多无用的松弛操作。

\n\n\n\n

很显然，只有上一次被松弛的结点，所连接的边，才有可能引起下一次的松弛操作。

\n\n\n\n

那么我们用队列来维护「哪些结点可能会引起松弛操作」，就能只访问必要的边了。

\n\n\n\n
    
    
    struct edge {\n  int v, w;\n};\n\nvector<edge> e[MAXN];\nint dis[MAXN], cnt[MAXN], vis[MAXN];\nqueue<int> q;\n\nbool spfa(int n, int s) {\n  memset(dis, 0x3f, (n + 1) * sizeof(int));\n  dis[s] = 0, vis[s] = 1;\n  q.push(s);\n  while (!q.empty()) {\n    int u = q.front();\n    q.pop(), vis[u] = 0;\n    for (auto ed : e[u]) {\n      int v = ed.v, w = ed.w;\n      if (dis[v] > dis[u] + w) {\n        dis[v] = dis[u] + w;\n        cnt[v] = cnt[u] + 1;  // 记录最短路经过的边数\n        if (cnt[v] >= n) return false;\n        // 在不经过负环的情况下，最短路至多经过 n - 1 条边\n        // 因此如果经过了多于 n 条边，一定说明经过了负环\n        if (!vis[v]) q.push(v), vis[v] = 1;\n      }\n    }\n  }\n  return true;\n}

\n\n\n\n

### Dijkstra 算法[](<https://oi-wiki.org//graph/shortest-path/#dijkstra-%E7%AE%97%E6%B3%95>)

\n\n\n\n![](../../assets/images/2025/04/image-48.png)\n\n\n\n

两种实现：

\n\n\n\n
    
    
    struct edge {\n  int v, w;\n};\n\nvector<edge> e[MAXN];\nint dis[MAXN], vis[MAXN];\n\nvoid dijkstra(int n, int s) {\n  memset(dis, 0x3f, (n + 1) * sizeof(int));\n  dis[s] = 0;\n  for (int i = 1; i <= n; i++) {\n    int u = 0, mind = 0x3f3f3f3f;\n    for (int j = 1; j <= n; j++)\n      if (!vis[j] && dis[j] < mind) u = j, mind = dis[j];\n    vis[u] = true;\n    for (auto ed : e[u]) {\n      int v = ed.v, w = ed.w;\n      if (dis[v] > dis[u] + w) dis[v] = dis[u] + w;\n    }\n  }\n}

\n\n\n\n
    
    
    struct edge {\n  int v, w;\n};\n\nstruct node {\n  int dis, u;\n\n  bool operator>(const node& a) const { return dis > a.dis; }\n};\n\nvector<edge> e[MAXN];\nint dis[MAXN], vis[MAXN];\npriority_queue<node, vector<node>, greater<node>> q;\n\nvoid dijkstra(int n, int s) {\n  memset(dis, 0x3f, (n + 1) * sizeof(int));\n  memset(vis, 0, (n + 1) * sizeof(int));\n  dis[s] = 0;\n  q.push({0, s});\n  while (!q.empty()) {\n    int u = q.top().u;\n    q.pop();\n    if (vis[u]) continue;\n    vis[u] = 1;\n    for (auto ed : e[u]) {\n      int v = ed.v, w = ed.w;\n      if (dis[v] > dis[u] + w) {\n        dis[v] = dis[u] + w;\n        q.push({dis[v], v});\n      }\n    }\n  }\n}

\n\n\n\n

java版本：

\n\n\n\n
    
    
    import java.util.Scanner;\nimport java.util.*;\n\n// 注意类名必须为 Main, 不要有任何 package xxx 信息\npublic class Main {\n    // 定义一个静态内部类，用于表示图中的边\n    static class Edge {\n        int to;     // 边的目标节点\n        int weight; // 边的权重\n\n        public Edge(int to, int weight) {\n            this.to = to;\n            this.weight = weight;\n        }\n    }\n\n    // Dijkstra 算法主函数\n    public static int[] dijkstra(List<List<Edge>> graph, int start) {\n        int n = graph.size(); // 节点数量\n        int[] dist = new int[n]; // 存储从起点到每个节点的最短距离\n        Arrays.fill(dist, Integer.MAX_VALUE); // 初始化为无穷大\n        dist[start] = 0; // 起点到自身的距离为 0\n\n        // 使用优先队列（最小堆），按照距离从小到大排序\n        PriorityQueue<int[]> pq = new PriorityQueue<>(Comparator.comparingInt(\n                    a -> a[1]));\n        pq.offer(new int[] {start, 0}); // 将起点加入队列：[节点编号, 当前距离]\n\n        // 主循环\n        while (!pq.isEmpty()) {\n            int[] current = pq.poll();\n            int u = current[0]; // 当前节点\n            int currentDist = current[1]; // 当前节点的距离\n\n            // 如果当前距离大于已知的最短距离，则跳过\n            if (currentDist > dist[u]) {\n                continue;\n            }\n\n            // 遍历当前节点的所有邻接边\n            for (Edge edge : graph.get(u)) {\n                int v = edge.to; // 邻接节点\n                int weight = edge.weight; // 边的权重\n                int newDist = dist[u] + weight; // 计算新的距离\n\n                // 如果找到更短的路径，更新距离并加入队列\n                if (newDist < dist[v]) {\n                    dist[v] = newDist;\n                    pq.offer(new int[] {v, newDist});\n                }\n            }\n        }\n\n        return dist; // 返回从起点到所有节点的最短距离\n    }\n\n\n\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        int n = in.nextInt(), m = in.nextInt(), q = in.nextInt();\n        List<List<Edge>> graph = new ArrayList<>();\n        int u, v, w;\n        for (int i = 0; i <= n; i++){\n            graph.add(new ArrayList<>());\n        }\n        for (int i = 0; i < m; i++) {\n            u = in.nextInt();\n            v = in.nextInt();\n            w = in.nextInt();\n            graph.get(u).add(new Edge(v,w));\n        }\n        int[] dist =dijkstra(graph,1);\n        int[] ans = new int[q];\n        int ret=0;\n        for(int i=0;i<q;i++){\n            ret+=2*dist[in.nextInt()];\n        }\n        System.out.println(ret);\n    }\n}

\n