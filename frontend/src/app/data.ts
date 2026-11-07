// Mock domain data for 织星 AI (EduWeave AI) — 数据结构与算法 初始课程包
// Replace these with live API responses from the LangGraph / Spark backend.

export type NodeStatus = "locked" | "unlocked" | "weakness" | "mastered";

export interface StarNode {
  id: string;
  title: string;
  subtitle: string;
  chapter: string;
  status: NodeStatus;
  mastery: number; // 0-100
  // position on the infinite canvas (relative %)
  x: number;
  y: number;
  deps: string[];
  type?: 'course' | 'module' | 'node';
}

export const constellation: StarNode[] = [
  { id: "n1", title: "数据结构导论", subtitle: "Intro to DSA", chapter: "第1章 · 导论", status: "mastered", mastery: 95, x: 10, y: 50, deps: [] },
  { id: "n2", title: "线性表与数组", subtitle: "Arrays", chapter: "第2章 · 线性结构", status: "mastered", mastery: 88, x: 25, y: 30, deps: ["n1"] },
  { id: "n3", title: "单链表基础", subtitle: "Singly Linked List", chapter: "第2章 · 链式结构", status: "weakness", mastery: 40, x: 25, y: 70, deps: ["n1"] },
  { id: "n4", title: "双向链表", subtitle: "Doubly Linked List", chapter: "第2章 · 链式结构", status: "unlocked", mastery: 60, x: 40, y: 60, deps: ["n3"] },
  { id: "n5", title: "循环链表", subtitle: "Circular Linked List", chapter: "第2章 · 链式结构", status: "unlocked", mastery: 50, x: 40, y: 80, deps: ["n3"] },
  { id: "n6", title: "栈与队列", subtitle: "Stack & Queue", chapter: "第3章 · 栈和队列", status: "locked", mastery: 0, x: 55, y: 50, deps: ["n2", "n3"] },
  { id: "n7", title: "哈希表与散列", subtitle: "Hash Table", chapter: "第4章 · 散列", status: "locked", mastery: 0, x: 70, y: 30, deps: ["n2"] },
  { id: "n8", title: "二叉树基础", subtitle: "Binary Tree", chapter: "第5章 · 树形结构", status: "locked", mastery: 0, x: 70, y: 70, deps: ["n6"] },
  { id: "n9", title: "图论基础", subtitle: "Graph Theory", chapter: "第6章 · 图论", status: "locked", mastery: 0, x: 85, y: 50, deps: ["n8"] },
];

export const profileRadar = [
  { dim: "知识基础", value: 78 },
  { dim: "认知风格", value: 64 },
  { dim: "抽象思维", value: 52 },
  { dim: "代码实操", value: 71 },
  { dim: "易错纠偏", value: 45 },
  { dim: "学习节奏", value: 83 },
];

export type ResourceType = "doc" | "map" | "quiz" | "video" | "code";

export interface Resource {
  type: ResourceType;
  title: string;
  meta: string;
  body: string;
}

export const nodeResources: Record<string, Resource[]> = {
  n1: [
    { type: "doc", title: "数组与寻址 · 结构化讲义", meta: "Writer Agent · Markdown", body: "数组是**连续内存**的线性结构，通过「基地址 + 偏移量」公式 `addr = base + i × size` 实现 O(1) 随机访问。理解寻址是掌握所有数据结构的根基——链表、树、图本质上都是对「如何找到下一个元素」这一问题的不同回答。" },
    { type: "map", title: "知识点思维导图", meta: "Writer Agent · Mermaid", body: "数组 → 内存连续分配 / 索引寻址 O(1) / 插入删除 O(n) / 静态数组 vs 动态数组 / 多维数组行优先存储 / 缓存局部性优势" },
    { type: "quiz", title: "基础测验 · 4题", meta: "Examiner Agent · 基础巩固", body: "Q1. 二维数组 a[3][4] 中，a[2][1] 的地址偏移量（以元素大小为单位）是多少？\nQ2. 为什么数组的随机访问是 O(1) 而链表是 O(n)？" },
    { type: "code", title: "可运行案例 · 动态数组扩容", meta: "Coder Agent · Python", body: "class DynamicArray:\n    def __init__(self):\n        self._data = [None] * 1\n        self._size = 0\n        self._cap = 1\n\n    def append(self, val):\n        if self._size == self._cap:\n            self._resize(self._cap * 2)\n        self._data[self._size] = val\n        self._size += 1\n\n    def _resize(self, new_cap):\n        new_data = [None] * new_cap\n        for i in range(self._size):\n            new_data[i] = self._data[i]\n        self._data = new_data\n        self._cap = new_cap" },
    { type: "video", title: "动画讲解 · 内存寻址可视化", meta: "Media Agent · 01:48", body: "通过格子动画展示内存地址计算：基地址 1000，每格 4 字节，a[3] = 1000 + 3×4 = 1012，直观感受随机访问的本质。" },
  ],
  n2: [
    { type: "doc", title: "指针与引用 · 结构化讲义", meta: "Writer Agent · Markdown", body: "指针存储**另一个变量的内存地址**。Python 中一切皆引用，变量名是对象的「标签」而非「容器」；理解引用语义是避免 `list` 浅拷贝陷阱的关键。核心操作：取地址、解引用、赋值传递地址。" },
    { type: "map", title: "知识点思维导图", meta: "Writer Agent · Mermaid", body: "指针 → 地址 vs 值 / 解引用 / 空指针陷阱 / 野指针 / 引用计数 / Python id() / 浅拷贝 vs 深拷贝 / 链式结构的基础" },
    { type: "quiz", title: "易错点测验 · 4题", meta: "Examiner Agent · 易错点定制", body: "Q1. `a = [1,2,3]; b = a; b.append(4)` 之后 a 是什么？为什么？\nQ2. 什么情况下需要深拷贝？\nQ3. NULL 指针解引用会发生什么？" },
    { type: "code", title: "可运行案例 · 浅拷贝 vs 深拷贝", meta: "Coder Agent · Python", body: "import copy\n\norig = [[1, 2], [3, 4]]\nshallow = orig.copy()       # 浅拷贝\ndeep = copy.deepcopy(orig)  # 深拷贝\n\norig[0].append(99)\nprint(shallow[0])  # [1, 2, 99]  ← 受影响\nprint(deep[0])     # [1, 2]      ← 不受影响" },
    { type: "video", title: "动画讲解 · 指针漫游入门", meta: "Media Agent · 02:05", body: "箭头动画演示：变量盒子 → 存地址 → 顺着箭头找到目标对象，帮助建立指针的空间直觉。" },
  ],
  n3: [
    { type: "doc", title: "单链表 · 结构化讲义", meta: "Writer Agent · Markdown", body: "单链表由一系列**节点 (Node)** 串联而成，每个节点保存数据域 `data` 与指向后继的指针 `next`。与数组不同，链表在内存中**非连续存储**，插入/删除为 O(1)，随机访问为 O(n)。" },
    { type: "map", title: "知识点思维导图", meta: "Writer Agent · Mermaid", body: "单链表 → 节点结构 / 头指针 / 插入(头插·尾插) / 删除 / 反转 / 环检测(快慢指针)" },
    { type: "quiz", title: "针对薄弱点 · 5题", meta: "Examiner Agent · 易错点定制", body: "Q1. 删除链表倒数第 k 个节点的最优做法是？\nQ2. 判断链表是否有环的空间复杂度？" },
    { type: "code", title: "可运行案例 · 链表反转", meta: "Coder Agent · Python", body: "def reverse(head):\n    prev = None\n    while head:\n        head.next, prev, head = prev, head, head.next\n    return prev" },
    { type: "video", title: "动画讲解 · 指针漫游", meta: "Media Agent · 02:14", body: "用粒子动画演示 prev / cur / next 三指针逐步推进的反转过程。" },
  ],
  n4: [
    { type: "doc", title: "栈与队列 · 结构化讲义", meta: "Writer Agent · Markdown", body: "**栈 (Stack)** 遵循 LIFO（后进先出）原则，核心操作 `push` / `pop` / `peek` 均为 O(1)。**队列 (Queue)** 遵循 FIFO（先进先出）原则，用链表实现时入队出队均为 O(1)。用链表头插实现栈，尾插+头删实现队列，是链式结构的经典应用。" },
    { type: "map", title: "知识点思维导图", meta: "Writer Agent · Mermaid", body: "栈 → LIFO / push·pop·peek O(1) / 链式实现 / 用途：递归调用栈·括号匹配·DFS\n队列 → FIFO / enqueue·dequeue O(1) / 链式实现 / 循环队列 / 用途：BFS·任务调度·打印机队列" },
    { type: "quiz", title: "应用测验 · 5题", meta: "Examiner Agent · 应用层定制", body: "Q1. 如何用两个栈实现一个队列？\nQ2. 括号匹配算法的时空复杂度？\nQ3. 单调栈解决「下一个更大元素」问题的思路？" },
    { type: "code", title: "可运行案例 · 用链表实现栈", meta: "Coder Agent · Python", body: "class Node:\n    def __init__(self, val):\n        self.val = val\n        self.next = None\n\nclass LinkedStack:\n    def __init__(self):\n        self._top = None\n\n    def push(self, val):\n        node = Node(val)\n        node.next = self._top\n        self._top = node\n\n    def pop(self):\n        if not self._top:\n            raise IndexError('empty stack')\n        val = self._top.val\n        self._top = self._top.next\n        return val\n\n    def peek(self):\n        return self._top.val if self._top else None" },
    { type: "video", title: "动画讲解 · 栈帧与递归", meta: "Media Agent · 02:38", body: "递归调用时系统栈帧的压栈/弹栈动画：函数调用 → 压帧 → 返回 → 弹帧，直观理解递归深度与栈溢出风险。" },
  ],
  n5: [
    { type: "doc", title: "二叉树 · 结构化讲义", meta: "Writer Agent · Markdown", body: "二叉树每个节点最多有**两个子节点**（left / right）。四种遍历方式：前序（根→左→右）、中序（左→根→右）、后序（左→右→根）、层序（BFS）。**BST** 满足左 < 根 < 右，中序遍历结果严格递增，是实现有序集合的基础。" },
    { type: "map", title: "知识点思维导图", meta: "Writer Agent · Mermaid", body: "二叉树 → 节点结构 / 完全二叉树 / 满二叉树 / BST\n遍历 → 前序·中序·后序(递归/迭代) / 层序(队列BFS)\nBST → 查找O(logn)~O(n) / 插入 / 删除 / 自平衡(AVL·红黑树概念)" },
    { type: "quiz", title: "遍历专项 · 6题", meta: "Examiner Agent · 高频考点", body: "Q1. 给定前序 [1,2,4,5,3] 和中序 [4,2,5,1,3]，还原二叉树。\nQ2. 如何用迭代（栈）实现中序遍历？\nQ3. 二叉树的最大深度如何用递归一行实现？" },
    { type: "code", title: "可运行案例 · 四种遍历", meta: "Coder Agent · Python", body: "from collections import deque\n\nclass TreeNode:\n    def __init__(self, val=0, left=None, right=None):\n        self.val = val; self.left = left; self.right = right\n\ndef inorder(root):  # 中序递归\n    return inorder(root.left) + [root.val] + inorder(root.right) if root else []\n\ndef level_order(root):  # 层序 BFS\n    if not root: return []\n    q, res = deque([root]), []\n    while q:\n        node = q.popleft()\n        res.append(node.val)\n        if node.left:  q.append(node.left)\n        if node.right: q.append(node.right)\n    return res" },
    { type: "video", title: "动画讲解 · 遍历路径可视化", meta: "Media Agent · 03:02", body: "高亮节点访问顺序动画：对同一棵树同时演示前/中/后序三条路径，帮助记忆「根在哪里」的口诀。" },
  ],
  n6: [
    { type: "doc", title: "哈希表 · 结构化讲义", meta: "Writer Agent · Markdown", body: "哈希表通过**哈希函数**将键映射到数组下标，实现平均 O(1) 的查找/插入/删除。核心挑战是**哈希冲突**：链地址法（每个桶存链表）vs 开放寻址法（探测下一个空位）。Python `dict` 采用开放寻址+随机探测，Java `HashMap` 采用链地址法并在链长 > 8 时转红黑树。" },
    { type: "map", title: "知识点思维导图", meta: "Writer Agent · Mermaid", body: "哈希表 → 哈希函数设计 / 装载因子 / 冲突解决\n链地址法 → 每桶链表·O(1)平均 / Java HashMap\n开放寻址 → 线性探测·二次探测·双哈希 / Python dict\n应用 → 两数之和 / 字符频次统计 / 缓存LRU" },
    { type: "quiz", title: "冲突处理专项 · 5题", meta: "Examiner Agent · 高频考点", body: "Q1. 装载因子超过 0.75 时为什么要扩容？\nQ2. 哈希函数设计需满足哪些条件？\nQ3. 用哈希表实现 O(n) 的两数之和。" },
    { type: "code", title: "可运行案例 · 链地址法哈希表", meta: "Coder Agent · Python", body: "class HashMap:\n    def __init__(self, cap=16):\n        self._buckets = [[] for _ in range(cap)]\n        self._cap = cap\n\n    def _idx(self, key):\n        return hash(key) % self._cap\n\n    def put(self, key, val):\n        bucket = self._buckets[self._idx(key)]\n        for i, (k, _) in enumerate(bucket):\n            if k == key:\n                bucket[i] = (key, val)\n                return\n        bucket.append((key, val))\n\n    def get(self, key):\n        for k, v in self._buckets[self._idx(key)]:\n            if k == key:\n                return v\n        return None" },
    { type: "video", title: "动画讲解 · 链地址法碰撞演示", meta: "Media Agent · 02:22", body: "动画展示多个键哈希到同一桶时链表如何增长，以及查找时在桶内逐一比较的过程，直观理解最坏情况 O(n)。" },
  ],
  n7: [
    { type: "doc", title: "图的遍历 · 结构化讲义", meta: "Writer Agent · Markdown", body: "图 G = (V, E) 由顶点集和边集构成。两种核心遍历：**DFS**（深度优先，递归/显式栈，O(V+E)）用于拓扑排序、连通性检测；**BFS**（宽度优先，队列，O(V+E)）用于最短路径（无权图）。邻接表适合稀疏图，邻接矩阵适合稠密图。" },
    { type: "map", title: "知识点思维导图", meta: "Writer Agent · Mermaid", body: "图 → 有向/无向 / 带权/无权 / 邻接表 vs 邻接矩阵\nDFS → 递归·显式栈 / 访问标记 / 拓扑排序 / 强连通分量\nBFS → 队列 / 最短路径(无权) / 二部图检测\n扩展 → Dijkstra(带权最短路) / 并查集" },
    { type: "quiz", title: "遍历应用 · 6题", meta: "Examiner Agent · 高频考点", body: "Q1. 用 BFS 求无权图两点间最短路径，写出核心代码框架。\nQ2. 判断有向图是否有环的 DFS 方法？\nQ3. 拓扑排序的 Kahn 算法与 DFS 方法的区别？" },
    { type: "code", title: "可运行案例 · BFS 最短路径", meta: "Coder Agent · Python", body: "from collections import deque\n\ndef bfs_shortest(graph, start, end):\n    visited = {start}\n    queue = deque([(start, [start])])\n    while queue:\n        node, path = queue.popleft()\n        if node == end:\n            return path\n        for nb in graph.get(node, []):\n            if nb not in visited:\n                visited.add(nb)\n                queue.append((nb, path + [nb]))\n    return None\n\ng = {'A': ['B','C'], 'B': ['D'], 'C': ['D'], 'D': []}\nprint(bfs_shortest(g, 'A', 'D'))  # ['A', 'B', 'D']" },
    { type: "video", title: "动画讲解 · DFS vs BFS 对比", meta: "Media Agent · 03:15", body: "在同一张图上同时演示 DFS（深扎到底再回溯）和 BFS（一圈圈扩展），对比两种策略在寻路上的差异，帮助直觉记忆。" },
  ],
  n8: [
    { type: "doc", title: "动态规划 · 结构化讲义", meta: "Writer Agent · Markdown", body: "动态规划 (DP) 解决**最优子结构 + 重叠子问题**类问题。三步模板：① 定义状态 `dp[i]` 的含义；② 写状态转移方程；③ 确定边界条件与遍历顺序。自顶向下（递忆 Memoization）= 递归+缓存；自底向上（制表 Tabulation）= 循环填表，空间更可控。" },
    { type: "map", title: "知识点思维导图", meta: "Writer Agent · Mermaid", body: "动态规划 → 最优子结构 / 重叠子问题 / 无后效性\n自顶向下 → 递归+备忘录 / @cache\n自底向上 → 填表 / 滚动数组优化\n经典题型 → 背包 / 最长公共子序列LCS / 最长递增子序列LIS / 编辑距离 / 矩阵路径" },
    { type: "quiz", title: "DP 经典题 · 5题", meta: "Examiner Agent · 高频考点", body: "Q1. 爬楼梯（每次 1 或 2 步，n 阶共有几种走法）写出状态转移方程。\nQ2. 0/1 背包如何用滚动数组将空间从 O(n·W) 优化到 O(W)？\nQ3. 最长公共子序列 LCS 的时间复杂度是多少？" },
    { type: "code", title: "可运行案例 · 最长递增子序列", meta: "Coder Agent · Python", body: "import bisect\n\ndef lis(nums):\n    \"\"\"O(n log n) 最长递增子序列 (LIS)\"\"\"\n    tails = []\n    for n in nums:\n        pos = bisect.bisect_left(tails, n)\n        if pos == len(tails):\n            tails.append(n)\n        else:\n            tails[pos] = n\n    return len(tails)\n\nprint(lis([10, 9, 2, 5, 3, 7, 101, 18]))  # 4 → [2,3,7,101]" },
    { type: "video", title: "动画讲解 · 背包问题填表过程", meta: "Media Agent · 03:28", body: "逐格填写 dp 表格的动画：高亮当前格依赖的「上方格」和「左移 w 格」，让状态转移方程从抽象变具象。" },
  ],
};

export interface AgentInfo {
  name: string;
  role: string;
  color: string;
  status: "idle" | "thinking" | "streaming";
}

export const agents: AgentInfo[] = [
  { name: "教研总控", role: "Director", color: "var(--star-glow)", status: "thinking" },
  { name: "画像分析", role: "Profiler", color: "var(--star-cyan)", status: "streaming" },
  { name: "文档导图", role: "Writer", color: "#7ce0b0", status: "streaming" },
  { name: "题库出题", role: "Examiner", color: "var(--star-pink)", status: "idle" },
  { name: "代码实操", role: "Coder", color: "#f2c879", status: "idle" },
  { name: "多模态生成", role: "Media", color: "#c98bff", status: "thinking" },
];

export const thoughtStream = [
  { agent: "Director", text: "解析学生请求：对「需求、供给与均衡价格」及弹性判据掌握不牢，触发薄弱点路径规划。", t: "12:04:02" },
  { agent: "Profiler", text: "更新 student_profile.weak_nodes += ['需求价格弹性与总收益']，mastery = 0.45", t: "12:04:03" },
  { agent: "Director", text: "路由：依次调用 recommend_plan 与 search_knowledge_base，分发任务 → Writer / Examiner。", t: "12:04:03" },
  { agent: "Writer", text: "RAG 检索 Dify《微观经济学》第2章切片 [资料1][资料2]，生成结构化讲义与导图…", t: "12:04:05" },
  { agent: "Examiner", text: "基于教材切片命制 4 道弹性与均衡价格分层巩固题，已写入指纹缓存。", t: "12:04:08" },
];

export const tokenUsage = [
  { agent: "Director", tokens: 4200 },
  { agent: "Profiler", tokens: 6100 },
  { agent: "Writer", tokens: 12800 },
  { agent: "Examiner", tokens: 5400 },
  { agent: "Coder", tokens: 7300 },
  { agent: "Media", tokens: 9600 },
];

export interface PathStep {
  id: string;
  step: string;
  title: string;
  detail: string;
  state: "done" | "active" | "todo";
  resources: ResourceType[];
}

export const pathSteps: PathStep[] = [
  { id: "s1", step: "步骤一", title: "理解指针与引用", detail: "巩固内存寻址直觉，为链式结构打底。", state: "done", resources: ["doc", "video"] },
  { id: "s2", step: "步骤二", title: "单链表反转实操", detail: "三指针法 + 递归法，针对薄弱点强化。", state: "active", resources: ["doc", "map", "quiz", "code"] },
  { id: "s3", step: "步骤三", title: "栈与队列建模", detail: "用链表实现栈，理解 LIFO/FIFO。", state: "todo", resources: ["doc", "code"] },
  { id: "s4", step: "步骤四", title: "二叉树遍历", detail: "前中后序与层序，递归转迭代。", state: "todo", resources: ["doc", "map", "video"] },
];

export interface GenTask {
  id: string;
  agent: string;
  label: string;
  progress: number;
}

export const genTasks: GenTask[] = [
  { id: "g1", agent: "Writer", label: "讲义流式生成", progress: 100 },
  { id: "g2", agent: "Examiner", label: "薄弱点定制题库", progress: 100 },
  { id: "g3", agent: "Media", label: "指针漫游动画渲染", progress: 70 },
  { id: "g4", agent: "Coder", label: "可运行链表项目构建", progress: 45 },
];

export interface Note {
  id: string;
  title: string;
  excerpt: string;
  date: string;
  chapter: string;
  tags: string[];
}

export const notes: Note[] = [
  {
    id: "no1",
    title: "需求价格弹性与总收益关系（薄利多销判据）",
    excerpt:
      "需求价格弹性 $E_d = -\\frac{dQ}{dP}\\cdot\\frac{P}{Q}$ 决定了调价对总收益 $TR = P \\times Q$ 的影响：\n1. **富有弹性（$E_d > 1$）**：如家电、餐饮，降价使销量增幅大于单价降幅，总收益增加，适用**薄利多销**；\n2. **缺乏弹性（$0 < E_d < 1$）**：如粮食、胰岛素等必需品，降价导致总收益减少（**谷贱伤农**），不宜降价促销。",
    date: "2026-11-07",
    chapter: "供求与弹性",
    tags: ["AI整理", "高频考点", "微观经济学"],
  },
  {
    id: "no2",
    title: "基数效用与序数效用下的消费者均衡条件对比",
    excerpt:
      "在预算约束 $P_X X + P_Y Y = I$ 下，两种效用理论导出的消费者均衡本质一致：\n- **基数效用论（等边际法则）**：$\\frac{MU_X}{P_X} = \\frac{MU_Y}{P_Y} = \\lambda$（每元支出带来的边际效用相等）；\n- **序数效用论（相切条件）**：$MRS_{XY} = \\frac{MU_X}{MU_Y} = \\frac{P_X}{P_Y}$（无差异曲线斜率等于预算线斜率）。",
    date: "2026-11-06",
    chapter: "消费者与生产者理论",
    tags: ["公式推导", "易错点", "微观经济学"],
  },
  {
    id: "no3",
    title: "完全竞争厂商短期停止营业点与三级价格歧视",
    excerpt:
      "1. **短期停止营业点**：当市场价格 $P = AVC_{\\min}$ 时为停止营业点；若 $AVC_{\\min} < P < SAC$，厂商虽亏损但仍继续生产以分摊固定成本 $TFC$。\n2. **三级价格歧视定价公式**：$P_1(1 - \\frac{1}{E_{d1}}) = P_2(1 - \\frac{1}{E_{d2}}) = MC$，在弹性小的市场定高价，弹性大的市场定低价。",
    date: "2026-11-05",
    chapter: "市场结构与博弈论",
    tags: ["AI整理", "计算必考", "微观经济学"],
  },
  {
    id: "no4",
    title: "矛盾的普遍性与特殊性辩证关系（马原核心考点）",
    excerpt:
      "矛盾的普遍性（共性、绝对）与特殊性（个性、相对）是**关于事物矛盾问题的精髓**：\n- 共性寓于个性之中，没有离开个性的共性，也没有离开共性的个性；\n- 方法论上坚持**具体问题具体分析（马克思主义活的灵魂）**，这也是推进马克思主义中国化时代化的哲学根基。",
    date: "2026-11-04",
    chapter: "唯物论与辩证法",
    tags: ["核心原理", "论述题模板", "马原"],
  },
];

export interface RecommendedResource {
  id: string;
  title: string;
  url: string;
  source: string;
  reason: string;
}

// Search-Informer Agent 联网检索的优质学习资源(画中画内嵌浏览)
export const recommendedResources: RecommendedResource[] = [
  { id: "r1", title: "MDN · 数据结构与算法概览", url: "https://developer.mozilla.org/zh-CN/", source: "MDN Web Docs", reason: "权威、系统,贴合你的「代码实操」认知风格。" },
  { id: "r2", title: "VisuAlgo · 链表动画演示", url: "https://visualgo.net/zh", source: "visualgo.net", reason: "可视化动画,针对你的薄弱点「单链表」直观拆解。" },
  { id: "r3", title: "OI Wiki · 算法竞赛知识整合", url: "https://oi-wiki.org/", source: "OI Wiki", reason: "开源高质量讲义,覆盖进阶动态规划。" },
  { id: "r4", title: "Wikipedia · Dynamic Programming", url: "https://en.wikipedia.org/wiki/Dynamic_programming", source: "Wikipedia", reason: "前沿延伸阅读,补全理论背景。" },
];

export interface CommunityPost {
  id: string;
  author: string;
  avatar: string;
  tags: string[];        // 由正文 #标题 解析得到,可检索
  time: string;
  markdown: string;
  images: string[];
  likes: number;
  comments: number;
}

// 从正文中解析 #标题 (无空格的 # 视为标签,与 Markdown 标题 "# " 区分)
export function parseTags(markdown: string): string[] {
  const matches = markdown.match(/(?:^|\s)#([^\s#]+)/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.trim().replace(/^#/, ""))));
}

export const communityPosts: CommunityPost[] = [
  {
    id: "p1",
    author: "我",
    avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&h=80&fit=crop&auto=format",
    tags: ["梯度下降", "学习心得"],
    time: "2 小时前",
    markdown:
      "#梯度下降 #学习心得\n\n今天终于搞懂了**梯度下降**的更新公式,分享给大家:\n\n$$\\theta_{t+1} = \\theta_t - \\eta \\nabla J(\\theta_t)$$\n\n其中 $\\eta$ 是学习率。学习率太大会震荡,太小收敛太慢,调参真是门艺术 🌱",
    images: [],
    likes: 42,
    comments: 8,
  },
  {
    id: "p2",
    author: "我",
    avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&h=80&fit=crop&auto=format",
    tags: ["数据结构", "复杂度速查", "学习资料"],
    time: "5 小时前",
    markdown:
      "#数据结构 #复杂度速查 #学习资料\n\n整理了一份《数据结构》核心复杂度速查表,自取~\n\n| 操作 | 数组 | 链表 |\n| --- | --- | --- |\n| 随机访问 | $O(1)$ | $O(n)$ |\n| 头部插入 | $O(n)$ | $O(1)$ |\n\n配合刷题食用更佳。",
    images: ["https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=600&h=360&fit=crop&auto=format"],
    likes: 96,
    comments: 21,
  },
  {
    id: "p3",
    author: "我",
    avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&h=80&fit=crop&auto=format",
    tags: ["日常", "图书馆"],
    time: "昨天",
    markdown: "#日常 #图书馆\n\n图书馆靠窗的位置,午后的阳光刚刚好。今日份的自习仪式感拉满 ☕️",
    images: ["https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=600&h=400&fit=crop&auto=format"],
    likes: 158,
    comments: 33,
  },
  {
    id: "p4",
    author: "我",
    avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&h=80&fit=crop&auto=format",
    tags: ["二叉树", "学习笔记"],
    time: "2 天前",
    markdown:
      "#二叉树 #学习笔记\n\n## 二叉树遍历笔记\n\n- 前序: 根 → 左 → 右\n- 中序: 左 → 根 → 右\n- 后序: 左 → 右 → 根\n\n记忆口诀: **看根在第几位**。中序遍历 BST 会得到有序序列,这点超有用!",
    images: [],
    likes: 74,
    comments: 12,
  },
];

export const copilotSeed = [
  { role: "agent" as const, agent: "AI 伴学", text: "你好！我已同步 Dify 云端《微观经济学》与《马克思主义基本原理》教材知识库。你可以随时点击下方快捷胶囊规划学习路径、检索教材原文或针对薄弱点出题练习。" },
];
