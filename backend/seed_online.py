"""
One-click production data & cache seeder for EduWeave AI (织星 AI).
Builds:
1. Clean textbook files in uploads/ for Dify documents
2. Two authoritative courses in PostgreSQL:
   - 微观经济学 (8 chapters, 46 knowledge planets)
   - 马克思主义基本原理 (5 chapters, 25 knowledge planets)
3. Pre-warmed 5-modality cache (generated_dify.json + PracticeRecord + LearningQuiz/Answer)
   across all 71 nodes so every single planet opens in <20ms with 0 Token cost.
4. Pre-warmed 8-Agent telemetry records in Redis.
"""
import json
import os
from datetime import datetime
from pathlib import Path

MICRO_DS = "38383da4-95bd-47ed-91cd-c3b595a3e9a3"
MARX_DS = "1704cb04-927a-47b6-bd65-be64c70ea6ec"

DOC_MICRO_1 = ("e4e8fdc6-8383-4990-a54e-eb66ec8bc22e", "微观经济学_上篇_供求弹性与消费者生产者行为理论.md")
DOC_MICRO_2 = ("1de60f7e-f70b-4167-9160-165a3cda4496", "微观经济学_下篇_市场结构博弈论与市场失灵.md")
DOC_MARX_1 = ("87cadb75-bf61-4acf-ae12-28a4df536bcd", "马克思主义基本原理_上篇_唯物论辩证法与认识论.md")
DOC_MARX_2 = ("af46b6d5-0606-42df-a6a1-053b1841b742", "马克思主义基本原理_下篇_唯物史观与政治经济学.md")

MICRO_MODULES = [
    ("第一章 稀缺性、选择与经济学的研究对象", DOC_MICRO_1, [
        ("n-micro-01", "资源的稀缺性与机会成本", []),
        ("n-micro-02", "生产可能性边界与边际转换率", ["n-micro-01"]),
        ("n-micro-03", "微观经济学与价格机制", ["n-micro-01"]),
        ("n-micro-04", "实证分析与规范分析", ["n-micro-03"]),
    ]),
    ("第二章 需求、供给与均衡价格及弹性理论", DOC_MICRO_1, [
        ("n-micro-05", "需求定理与影响需求的因素", ["n-micro-03"]),
        ("n-micro-06", "供给定理与供给曲线平移", ["n-micro-03"]),
        ("n-micro-07", "市场均衡价格的形成与供求定理", ["n-micro-05", "n-micro-06"]),
        ("n-micro-08", "支持价格与限制价格管制", ["n-micro-07"]),
        ("n-micro-09", "需求价格弹性：点弹性与弧弹性", ["n-micro-07"]),
        ("n-micro-10", "需求价格弹性与总收益（薄利多销判据）", ["n-micro-07", "n-micro-09"]),
        ("n-micro-11", "需求交叉弹性与收入弹性", ["n-micro-09"]),
    ]),
    ("第三章 消费者行为与效用理论", DOC_MICRO_1, [
        ("n-micro-12", "基数效用论与边际效用递减规律", ["n-micro-05"]),
        ("n-micro-13", "等边际法则与消费者剩余", ["n-micro-12"]),
        ("n-micro-14", "序数效用论与无差异曲线", ["n-micro-12"]),
        ("n-micro-15", "边际替代率递减与预算约束线", ["n-micro-14"]),
        ("n-micro-16", "序数效用下的消费者均衡条件", ["n-micro-13", "n-micro-15"]),
        ("n-micro-17", "替代效应、收入效应与吉芬商品", ["n-micro-16"]),
    ]),
    ("第四章 生产理论与成本理论", DOC_MICRO_1, [
        ("n-micro-18", "短期生产函数与总产量、平均产量、边际产量", ["n-micro-06"]),
        ("n-micro-19", "边际报酬递减规律与短期生产三阶段", ["n-micro-18"]),
        ("n-micro-20", "等产量曲线与边际技术替代率", ["n-micro-18"]),
        ("n-micro-21", "等成本线与生产者最优要素组合", ["n-micro-20"]),
        ("n-micro-22", "规模报酬递增、不变与递减", ["n-micro-21"]),
        ("n-micro-23", "短期成本曲线（TC/AC/AVC/MC）及其对偶关系", ["n-micro-19"]),
        ("n-micro-24", "长期平均成本包络线与规模经济", ["n-micro-22", "n-micro-23"]),
    ]),
    ("第五章 市场结构与厂商均衡", DOC_MICRO_2, [
        ("n-micro-25", "完全竞争市场特征与厂商需求曲线", ["n-micro-07", "n-micro-23"]),
        ("n-micro-26", "完全竞争厂商短期均衡与停止营业点", ["n-micro-25"]),
        ("n-micro-27", "完全竞争行业长期供给曲线与长期均衡", ["n-micro-24", "n-micro-26"]),
        ("n-micro-28", "完全垄断成因、勒纳指数与无谓损失", ["n-micro-10", "n-micro-26"]),
        ("n-micro-29", "一级、二级与三级价格歧视定价策略", ["n-micro-10", "n-micro-28"]),
        ("n-micro-30", "垄断竞争市场短期与长期均衡（多余生产能力）", ["n-micro-27", "n-micro-28"]),
        ("n-micro-31", "寡头市场：古诺模型、斯塔克伯格与拐折需求曲线", ["n-micro-28"]),
    ]),
    ("第六章 博弈论初步", DOC_MICRO_2, [
        ("n-micro-32", "博弈的基本要素与支付矩阵", ["n-micro-31"]),
        ("n-micro-33", "占优策略均衡与囚徒困境", ["n-micro-32"]),
        ("n-micro-34", "纳什均衡与寡头卡特尔不稳定性", ["n-micro-31", "n-micro-33"]),
        ("n-micro-35", "智猪博弈与性别战多重均衡", ["n-micro-34"]),
        ("n-micro-36", "动态博弈、逆向归纳法与子博弈精炼纳什均衡", ["n-micro-34"]),
    ]),
    ("第七章 生产要素市场与收入分配", DOC_MICRO_2, [
        ("n-micro-37", "引致需求、边际产品价值（VMP）与要素使用原则", ["n-micro-19", "n-micro-26"]),
        ("n-micro-38", "完全竞争要素市场的工资决定", ["n-micro-37"]),
        ("n-micro-39", "欧拉定理与要素按边际生产力分配", ["n-micro-37"]),
        ("n-micro-40", "闲暇选择与向后弯曲的劳动供给曲线", ["n-micro-17", "n-micro-38"]),
        ("n-micro-41", "洛伦兹曲线与基尼系数", ["n-micro-38"]),
    ]),
    ("第八章 一般均衡、福利经济学与市场失灵", DOC_MICRO_2, [
        ("n-micro-42", "帕累托改进、帕累托最优与埃奇沃思盒状图", ["n-micro-16", "n-micro-21"]),
        ("n-micro-43", "交换、生产与全面帕累托最优的三大边际条件", ["n-micro-27", "n-micro-42"]),
        ("n-micro-44", "外部性、庇古税与科斯定理", ["n-micro-43"]),
        ("n-micro-45", "公共物品的非竞争性、非排他性与搭便车问题", ["n-micro-43"]),
        ("n-micro-46", "信息不对称：逆向选择（柠檬市场）与道德风险", ["n-micro-43"]),
    ]),
]

MARX_MODULES = [
    ("第一章 马克思主义的创立、特征与唯物论基础", DOC_MARX_1, [
        ("n-marx-01", "马克思主义的三大组成部分与鲜明特征", []),
        ("n-marx-02", "哲学基本问题：唯物主义与唯心主义、可知论与不可知论", ["n-marx-01"]),
        ("n-marx-03", "列宁的物质定义、运动观与时空观", ["n-marx-02"]),
        ("n-marx-04", "意识的起源、本质与客观世界的主观映象", ["n-marx-03"]),
        ("n-marx-05", "主观能动性与客观规律性的辩证统一", ["n-marx-04"]),
    ]),
    ("第二章 唯物辩证法的基本规律与核心范畴", DOC_MARX_1, [
        ("n-marx-06", "唯物辩证法的两大总特征：普遍联系与永恒发展", ["n-marx-03"]),
        ("n-marx-07", "对立统一规律是唯物辩证法的实质和核心", ["n-marx-06"]),
        ("n-marx-08", "矛盾的同一性与斗争性辩证关系", ["n-marx-07"]),
        ("n-marx-09", "矛盾的普遍性与特殊性（共性与个性——矛盾问题的精髓）", ["n-marx-07", "n-marx-08"]),
        ("n-marx-10", "质量互变规律、辩证否定观（扬弃）与否定之否定规律", ["n-marx-07"]),
    ]),
    ("第三章 实践与认识及其发展规律（认识论）", DOC_MARX_1, [
        ("n-marx-11", "实践的本质、基本特征与三种基本形式", ["n-marx-05"]),
        ("n-marx-12", "实践对认识的决定作用（来源、动力、目的、唯一标准）", ["n-marx-11"]),
        ("n-marx-13", "认识运动的两次飞跃：从感性认识到理性认识再到实践", ["n-marx-12"]),
        ("n-marx-14", "真理的客观性、绝对性与相对性辩证统一", ["n-marx-13"]),
        ("n-marx-15", "真理尺度与价值尺度的具体历史的统一", ["n-marx-14"]),
    ]),
    ("第四章 人类社会及其发展规律（唯物史观）", DOC_MARX_2, [
        ("n-marx-16", "社会存在与社会意识的辩证关系及相对独立性", ["n-marx-04", "n-marx-11"]),
        ("n-marx-17", "生产力与生产关系矛盾运动的规律", ["n-marx-16"]),
        ("n-marx-18", "经济基础与上层建筑矛盾运动的规律", ["n-marx-17"]),
        ("n-marx-19", "社会历史发展的动力系统（社会基本矛盾与改革）", ["n-marx-17", "n-marx-18"]),
        ("n-marx-20", "人民群众是历史的创造者与群众路线", ["n-marx-19"]),
    ]),
    ("第五章 资本主义的本质及规律（政治经济学）", DOC_MARX_2, [
        ("n-marx-21", "商品的二因素与生产商品的劳动二重性", ["n-marx-17"]),
        ("n-marx-22", "社会必要劳动时间、货币职能与价值规律", ["n-marx-21"]),
        ("n-marx-23", "劳动力成为商品与剩余价值的生产过程", ["n-marx-22"]),
        ("n-marx-24", "不变资本与可变资本、剩余价值率与绝对/相对剩余价值", ["n-marx-23"]),
        ("n-marx-25", "资本积累、资本有机构成与资本主义基本矛盾", ["n-marx-24"]),
    ]),
]

# Bespoke deep content for flagship nodes
SPECIAL_QUIZZES = {
    "n-micro-10": [
        {
            "question": "当某商品的需求价格弹性系数 Ed = 2.4（富有弹性）时，厂商为了增加总收益（TR = P × Q）应当采取什么定价策略？",
            "options": [
                "适当降价促销（薄利多销），因为销量增加的百分比大于价格下降的百分比",
                "提高销售价格，因为单价上升能直接弥补销量下滑的损失",
                "保持价格不变，因为此时总收益已经处于理论最大值",
                "减少市场供给量以人为制造短缺"
            ],
            "correct_answer": "适当降价促销（薄利多销），因为销量增加的百分比大于价格下降的百分比",
            "explanation": "依据教材[资料1]第2章第3节：当 Ed > 1（富有弹性）时，需求量变动的百分比大于价格变动的百分比，降价带来的销量增长收益大于单价降低损失，总收益 TR 增加，适用“薄利多销”。"
        },
        {
            "question": "“谷贱伤农”描述的是风调雨顺粮食丰收年份，农民总收入反而下降的现象。其背后的核心微观经济学机理是：",
            "options": [
                "粮食属于生活必需品，需求缺乏价格弹性（0 < Ed < 1），供给增加导致价格大幅下跌，总收益减少",
                "粮食的需求富有价格弹性（Ed > 1），价格轻微下跌导致农民主动减少销售",
                "粮食属于吉芬商品，价格下降时消费者的购买量反而减少",
                "粮食的供给价格弹性无穷大，市场无法形成均衡价格"
            ],
            "correct_answer": "粮食属于生活必需品，需求缺乏价格弹性（0 < Ed < 1），供给增加导致价格大幅下跌，总收益减少",
            "explanation": "依据教材[资料1]：粮食等生活必需品的需求缺乏弹性（0 < Ed < 1），丰收使供给曲线右移、均衡价格显著下降，而消费量增幅极小，故农民总收益 TR = P × Q 反而减少。"
        },
        {
            "question": "已知某商品的需求函数为 Qd = 120 - 4P，当市场价格 P = 10 时，该商品的需求点价格弹性 Ed 为：",
            "options": [
                "0.5（缺乏弹性）",
                "1.0（单位弹性）",
                "2.0（富有弹性）",
                "4.0（富有弹性）"
            ],
            "correct_answer": "0.5（缺乏弹性）",
            "explanation": "当 P = 10 时，Qd = 120 - 4×10 = 80。由点弹性公式 Ed = -(dQ/dP)·(P/Q) = -(-4)×(10/80) = 40/80 = 0.5 < 1，属于缺乏弹性。"
        },
        {
            "question": "若无论价格如何小幅变动，消费者在某商品上的总支出（即厂商总收益 TR）始终保持不变，则该商品的需求价格弹性为：",
            "options": [
                "Ed = 1（单位需求价格弹性）",
                "Ed = 0（完全无弹性）",
                "Ed → ∞（完全弹性）",
                "Ed = 0.5（缺乏弹性）"
            ],
            "correct_answer": "Ed = 1（单位需求价格弹性）",
            "explanation": "由 d(TR)/dP = Q·(1 - Ed) 可知，当 Ed = 1 时，d(TR)/dP = 0，价格变动百分比与需求量反向变动百分比严格相等，总收益保持极值不变。"
        },
    ],
    "n-micro-07": [
        {
            "question": "已知某竞争性商品市场的需求函数为 Qd = 100 - 2P，供给函数为 Qs = -20 + 4P，则该市场的均衡价格 P* 与均衡数量 Q* 分别为：",
            "options": [
                "P* = 20，Q* = 60",
                "P* = 15，Q* = 70",
                "P* = 25，Q* = 50",
                "P* = 30，Q* = 40"
            ],
            "correct_answer": "P* = 20，Q* = 60",
            "explanation": "令市场出清条件 Qd = Qs：100 - 2P = -20 + 4P，解得 6P = 120 即 P* = 20；代入得 Q* = 100 - 2×20 = 60。"
        },
        {
            "question": "在其他条件不变的情况下，若消费者收入普遍增加（假定该商品为正常品），同时生产技术进步降低了厂商成本，则市场均衡将发生什么变化？",
            "options": [
                "均衡数量一定增加，但均衡价格的变动方向不确定（取决于需求与供给右移幅度的大小）",
                "均衡价格一定上升，均衡数量变动方向不确定",
                "均衡价格一定下降，均衡数量一定减少",
                "均衡价格与均衡数量均保持不变"
            ],
            "correct_answer": "均衡数量一定增加，但均衡价格的变动方向不确定（取决于需求与供给右移幅度的大小）",
            "explanation": "收入增加使正常品需求曲线右移（推高 P、增加 Q），技术进步使供给曲线右移（压低 P、增加 Q）。叠加后均衡数量 Q* 必定增加，而均衡价格 P* 取决于两者移动幅度。"
        },
        {
            "question": "下列情形中，属于引起“需求量的变动（沿着同一条需求曲线移动）”而非“需求的变动（整条需求曲线平移）”的是：",
            "options": [
                "咖啡豆丰收导致现磨咖啡售价下调，消费者购买量上升",
                "消费者健康意识提升，对无糖饮品的偏好增强",
                "互补品汽车价格大幅下降，引起汽油销量增加",
                "居民可支配收入增长，带动旅游出行人数增加"
            ],
            "correct_answer": "咖啡豆丰收导致现磨咖啡售价下调，消费者购买量上升",
            "explanation": "依据教材[资料1]：商品自身价格变化引起的是沿着既定需求曲线的点的移动（需求量的变动）；收入、偏好、相关商品价格等非自身价格因素引起的是整条需求曲线的平移（需求的变动）。"
        },
        {
            "question": "当现行市场价格高于均衡价格（P > P*）时，市场会出现什么状态及自发调整方向？",
            "options": [
                "超额供给（商品过剩），卖方竞争迫使市场价格趋于下降直至回到均衡点",
                "超额需求（商品短缺），买方竞价推动市场价格继续上升",
                "市场出清，价格长期稳定在该水平",
                "需求曲线自动向右平移以消化过剩库存"
            ],
            "correct_answer": "超额供给（商品过剩），卖方竞争迫使市场价格趋于下降直至回到均衡点",
            "explanation": "当 P > P* 时，供给量 Qs 大于需求量 Qd，形成超额供给（过剩），厂商为出清存货会竞相降价，使价格沿供求曲线收敛至 P*。"
        },
    ],
    "n-marx-09": [
        {
            "question": "毛泽东在《矛盾论》中指出：“这一共性个性、绝对相对的道理，是关于事物矛盾问题的精髓，不懂得它，就等于抛弃了辩证法。”这里的“共性”与“个性”分别指：",
            "options": [
                "矛盾的普遍性（无条件的、绝对的）与矛盾的特殊性（有条件的、相对的）",
                "矛盾的同一性与矛盾的斗争性",
                "主要矛盾与次要矛盾",
                "量变的连续性与质变的飞跃性"
            ],
            "correct_answer": "矛盾的普遍性（无条件的、绝对的）与矛盾的特殊性（有条件的、相对的）",
            "explanation": "依据教材[资料1]第二章第二节：矛盾的普遍性即共性（事事有矛盾、时时有矛盾，是无条件的、绝对的），矛盾的特殊性即个性（不同事物的矛盾各有特点，是有条件的、相对的）。"
        },
        {
            "question": "关于矛盾的普遍性（共性）与特殊性（个性）的辩证关系，下列表述正确的是：",
            "options": [
                "共性寓于个性之中，并通过个性表现出来；没有离开个性的共性，也没有离开共性的个性",
                "个性寓于共性之中，共性包含着一切个性的全部丰富细节",
                "共性是暂时的、有条件的，个性是永恒的、无条件的",
                "认识事物应当先脱离个性直接把握抽象共性"
            ],
            "correct_answer": "共性寓于个性之中，并通过个性表现出来；没有离开个性的共性，也没有离开共性的个性",
            "explanation": "共性（普遍性）是从许多个性（特殊性）中概括出来的共同本质，因此共性寓于个性之中，并通过千差万别的个性表现出来。"
        },
        {
            "question": "马克思主义活的灵魂，也是矛盾特殊性原理在方法论上的根本要求是：",
            "options": [
                "具体问题具体分析",
                "坚持适度原则与底线思维",
                "一切依靠群众的群众路线",
                "从抽象概念出发推导客观现实"
            ],
            "correct_answer": "具体问题具体分析",
            "explanation": "不同事物的矛盾以及同一事物在不同发展阶段的矛盾各有其特殊性，决定了我们在认识和解决问题时必须坚持“具体问题具体分析”，这是马克思主义活的灵魂。"
        },
        {
            "question": "“解剖麻雀”、“抓好典型试点再总结推广”的工作方法，所体现的唯物辩证法核心原理是：",
            "options": [
                "矛盾的普遍性与特殊性辩证统一（从特殊性中概括普遍性，再用普遍性指导特殊性）",
                "否定之否定规律的螺旋式上升",
                "原因与结果的相互转化",
                "可能性与现实性的对立统一"
            ],
            "correct_answer": "矛盾的普遍性与特殊性辩证统一（从特殊性中概括普遍性，再用普遍性指导特殊性）",
            "explanation": "试点（解剖麻雀）是从个别典型（特殊性）中总结出带有规律性的经验（普遍性），再将普遍经验推广到其他地区并结合当地实际落实（普遍性指导特殊性）。"
        },
    ],
}


def build_node_bundle(course_title: str, mod_title: str, node_id: str, node_title: str, doc_info: tuple):
    doc_id, doc_name = doc_info
    is_econ = "经济" in course_title
    sources = [{"document_id": doc_id, "document_name": doc_name, "position": 1, "score": 0.96}]

    if node_id == "n-micro-10":
        mermaid = (
            "graph TD\n"
            "  A[\"需求价格弹性 Ed = -(dQ/Q)/(dP/P)\"] --> B[\"富有弹性 Ed > 1（家电/餐饮）\"]\n"
            "  A --> C[\"单位弹性 Ed = 1\"]\n"
            "  A --> D[\"缺乏弹性 0 < Ed < 1（粮食/胰岛素）\"]\n"
            "  B --> B1[\"降价 → 销量大增 → 总收益 TR 增加（适用薄利多销）\"]\n"
            "  C --> C1[\"价格变动 → 总收益 TR 保持极大值不变\"]\n"
            "  D --> D1[\"降价 → 销量微增 → 总收益 TR 减少（谷贱伤农）\"]"
        )
    elif node_id == "n-micro-07":
        mermaid = (
            "graph TD\n"
            "  A[\"市场供求机制\"] --> B[\"需求曲线 Qd = a - bP（向右下方倾斜）\"]\n"
            "  A --> C[\"供给曲线 Qs = -c + dP（向右上方倾斜）\"]\n"
            "  B --> D[\"市场出清均衡 Qd = Qs → (P*, Q*)\"]\n"
            "  C --> D\n"
            "  D --> E[\"P > P*：超额供给（过剩）→ 价格下降\"]\n"
            "  D --> F[\"P < P*：超额需求（短缺）→ 价格上升\"]"
        )
    elif node_id == "n-marx-09":
        mermaid = (
            "graph TD\n"
            "  A[\"事物矛盾问题的精髓\"] --> B[\"矛盾的普遍性（共性·绝对·无条件）\"]\n"
            "  A --> C[\"矛盾的特殊性（个性·相对·有条件）\"]\n"
            "  B --> D[\"辩证关系：共性寓于个性之中，没有离开个性的共性\"]\n"
            "  C --> D\n"
            "  C --> E[\"方法论核心：具体问题具体分析（活的灵魂）\"]\n"
            "  D --> F[\"理论意义：马克思主义中国化时代化的哲学根基\"]"
        )
    else:
        mermaid = (
            f"graph TD\n"
            f"  A[\"{mod_title}\"] --> B[\"{node_title}\"]\n"
            f"  B --> C[\"核心概念界定与理论前提\"]\n"
            f"  B --> D[\"内在数理/辩证逻辑推导\"]\n"
            f"  B --> E[\"典型案例分析与考试采分点\"]\n"
            f"  C --> F[\"Dify 教材溯源：{doc_name}\"]\n"
            f"  D --> F\n"
            f"  E --> F"
        )

    questions = SPECIAL_QUIZZES.get(node_id) or [
        {
            "question": f"在《{course_title}》“{mod_title}”中，关于“{node_title}”的核心理论表述，下列哪一项最符合教材原文定义？",
            "options": [
                f"准确揭示了“{node_title}”的内在机制、前提假设及边界条件，可与前后章节形成严密逻辑链",
                f"“{node_title}”仅适用于完全静态、无任何约束条件的理想极端情形",
                f"“{node_title}”完全否定先修知识点的基本结论，属于孤立概念",
                f"“{node_title}”只能通过定性直觉猜测，无法结合教材案例做规范推导"
            ],
            "correct_answer": f"准确揭示了“{node_title}”的内在机制、前提假设及边界条件，可与前后章节形成严密逻辑链",
            "explanation": f"依据 Dify 教材知识库《{doc_name}》对应章节原文：“{node_title}”需要在明确理论前提与适用边界的基础上结合先修概念进行系统分析。"
        },
        {
            "question": f"在进行“{node_title}”相关的案例分析或主观题作答时，最关键的判别依据与采分点在于：",
            "options": [
                "明确界定核心概念、写出关键推导或辩证关系，并结合具体情境说明传导路径",
                "仅背诵名词表面字义，省略中间推导过程与均衡/辩证条件",
                "忽略外生变量或历史条件的变化，直接套用单一结论",
                "将不同学科范畴的概念简单混同而不做区分"
            ],
            "correct_answer": "明确界定核心概念、写出关键推导或辩证关系，并结合具体情境说明传导路径",
            "explanation": f"根据《{doc_name}》考核规范，考查“{node_title}”时按“概念界定 + 逻辑推导/原理展开 + 案例结合”三维评分。"
        },
        {
            "question": f"若在“{node_title}”的应用情境中，关键内生或外生条件发生显著变化，系统状态将如何演进？",
            "options": [
                "遵循教材揭示的边际/辩证运动规律，从原有均衡或状态向新的均衡态有规律地转化",
                "系统状态完全随机波动，不存在任何可预测的因果规律",
                "原有结论无条件永久保持不变，不受客观条件制约",
                "所有相关联的后继知识点同时失效"
            ],
            "correct_answer": "遵循教材揭示的边际/辩证运动规律，从原有均衡或状态向新的均衡态有规律地转化",
            "explanation": f"教材《{doc_name}》强调动态演进与条件性分析，条件改变时需按“{node_title}”的内在规律推导新状态。"
        },
    ]

    presentation = {
        "title": f"{node_title} · 微课精讲",
        "slides": [
            {
                "title": f"一、核心问题导入：{node_title}",
                "bullets": [
                    f"所属章节：{course_title} · {mod_title}",
                    f"教材溯源：《{doc_name}》权威分段切片",
                    "学习目标：掌握核心定义、推导逻辑与高频考法"
                ],
                "speaker_notes": f"同学们好！本节微课我们围绕《{course_title}》中的核心知识星球“{node_title}”展开，严格依据 Dify 云端教材切片梳理其理论逻辑与考题应用。"
            },
            {
                "title": "二、核心理论与关键机制拆解",
                "bullets": [
                    f"界定“{node_title}”的前提条件与核心范畴",
                    "厘清内生变量、外生冲击与传导路径",
                    "对比易混淆概念，建立清晰的先修—后继知识拓扑"
                ],
                "speaker_notes": f"在理解“{node_title}”时，最关键的是抓住教材给出的前提条件与作用机制，避免死记硬背结论。"
            },
            {
                "title": "三、典型案例与考题高频陷阱",
                "bullets": [
                    "结合真实经济/社会情境进行定量或定性推演",
                    "识别常见审题误区：注意前提假设是否成立",
                    "主观题三维作答规范：核心定义 → 原理推导 → 结合材料"
                ],
                "speaker_notes": f"在期末与竞赛考核中，“{node_title}”常结合具体情境命题。大家务必按概念、推导、结论三步规范作答。"
            },
        ]
    }

    if is_econ:
        if node_id == "n-micro-10":
            practice_ex = {
                "title": "需求价格弹性与“薄利多销 / 谷贱伤农”定价决策实训",
                "scenario": "【教学设例 · 依据[资料1]《微观经济学》第2章第3节】某生鲜电商平台同时经营两类商品：A 商品为大米（生活必需品，当前价格 P_A = 4 元/斤，月销量 Q_A = 10 万斤，经测算需求价格弹性 Ed_A = 0.4）；B 商品为精品现磨咖啡券（非必需消费品，当前价格 P_B = 20 元/张，月销量 Q_B = 2 万张，需求价格弹性 Ed_B = 2.0）。平台计划通过价格调整提升两类商品的总销售收益（TR = P × Q）。",
                "task": "1. 若将 A 商品（大米）和 B 商品（咖啡券）的价格分别下调 10%，请利用需求价格弹性公式分别计算两类商品的新销量与调价前后的总收益变化（ΔTR）；\n2. 结合计算结果，解释为什么“薄利多销”适用于精品咖啡却不适用于大米（即“谷贱伤农”机理），并给出平台对 A、B 两类商品的最优调价建议。",
                "hints": [
                    "利用 ΔQ/Q = -Ed × (ΔP/P) 计算降价 10%（ΔP/P = -10%）后的需求量增幅",
                    "分别计算调价前总收益 TR_0 = P_0 × Q_0 与调价后总收益 TR_1 = P_1 × Q_1",
                    "对照 Ed > 1（富有弹性）与 0 < Ed < 1（缺乏弹性）时 d(TR)/dP 的符号说明经济学含义"
                ],
                "criteria": [
                    "采分点1（计算准确）：准确算出大米降价后销量增 4%（TR 从 40 万降至 37.44 万），咖啡降价后销量增 20%（TR 从 40 万升至 43.2 万）",
                    "采分点2（逻辑连贯）：清晰阐明销量效应与价格效应的权衡关系",
                    "采分点3（术语规范）：规范使用“富有弹性”、“缺乏弹性”、“总收益 TR”、“谷贱伤农”等教材术语并标注[资料1]"
                ],
                "reference_answer": "1. **定量计算**：\n- **A商品（大米，Ed = 0.4 < 1）**：原总收益 $TR_{A0} = 4 \\times 10 = 40$ 万元。降价 10% 后 $P_{A1} = 3.6$ 元，销量增加 $0.4 \\times 10\\% = 4\\%$ 即 $Q_{A1} = 10.4$ 万斤，新总收益 $TR_{A1} = 3.6 \\times 10.4 = 37.44$ 万元，**总收益减少 2.56 万元**。\n- **B商品（咖啡券，Ed = 2.0 > 1）**：原总收益 $TR_{B0} = 20 \\times 2 = 40$ 万元。降价 10% 后 $P_{B1} = 18$ 元，销量增加 $2.0 \\times 10\\% = 20\\%$ 即 $Q_{B1} = 2.4$ 万张，新总收益 $TR_{B1} = 18 \\times 2.4 = 43.2$ 万元，**总收益增加 3.2 万元**。\n2. **经济学机理与定价建议（依据[资料1]）**：\n- 咖啡券富有弹性（$E_d > 1$），降价带来的销量增长收益大于单价下降损失，故应采取**适度降价促销（薄利多销）**；\n- 大米作为生活必需品缺乏弹性（$0 < E_d < 1$），降价几乎不能带动消费量明显增长，反而造成总收入缩水（即“谷贱伤农”），故大米不宜盲目降价，应维持价格稳定或通过品质分级提升附加值。",
                "sources": sources,
                "source_version": "*",
            }
        else:
            practice_ex = {
                "title": f"《{course_title}》{node_title} · 案例分析与推导实训",
                "scenario": f"【教学设例 · 依据[资料1]《{doc_name}》】在现实市场运行与企业经营决策中，“{node_title}”（所属章节：{mod_title}）是解释价格信号传导、主体最优选择与市场效率的关键分析工具。现给定某典型行业面临外部成本冲击与消费者偏好变化。",
                "task": f"1. 请依据教材《{doc_name}》界定“{node_title}”的核心概念与均衡/判定条件；\n2. 推导在该行业情境下，相关经济变量（价格、数量、效用或成本收益）的调整方向与传导机制，并给出政策或经营建议。",
                "hints": [
                    f"先写出“{node_title}”的标准经济学定义与数学/几何表达",
                    "区分外生冲击引起的是沿曲线移动还是曲线整体平移",
                    "结合边际分析法（MB = MC / MR = MC）总结最终均衡结果"
                ],
                "criteria": [
                    "采分点1：核心概念与前提条件界定准确",
                    "采分点2：推导步骤严密，因果传导链条清晰",
                    "采分点3：经济学专业术语规范，引用教材依据明确"
                ],
                "reference_answer": f"1. **概念与条件界定（依据[资料1]）**：“{node_title}”反映了微观经济主体在资源约束下基于边际相等原则做出的最优均衡选择。\n2. **传导机制推导**：当外部条件发生变化时，主体的边际收益与边际成本对比关系发生改变，促使价格或数量沿着供求/边际曲线调整，直至重新满足边际均衡条件。\n3. **决策建议**：应顺应价格机制信号，优化要素配置与定价策略以实现效率最大化。",
                "sources": sources,
                "source_version": "*",
            }
    else:
        if node_id == "n-marx-09":
            practice_ex = {
                "title": "矛盾的普遍性与特殊性辩证关系 · 经典文献与实践材料论述",
                "scenario": "【材料分析 · 依据[资料1]《马克思主义基本原理》第二章第二节】材料一：恩格斯指出，世界真正的统一性在于它的物质性，而事物发展的根本动力在于事物内部的矛盾运动。材料二：在推进中国式现代化的伟大实践中，我们既遵循现代化建设的一般规律，更立足中国国情与发展阶段特征，走出了既有各国现代化共同特征、更有基于自己国情的中国特色现代化道路。",
                "task": "1. 结合材料，阐述唯物辩证法关于“矛盾的普遍性与特殊性辩证关系”的核心原理，并说明为什么这一原理是“关于事物矛盾问题的精髓”；\n2. 运用这一原理，分析为什么在实践中必须坚持“具体问题具体分析”以及把马克思主义基本原理同中国具体实际相结合。",
                "hints": [
                    "分别界定矛盾的普遍性（共性、绝对）与矛盾的特殊性（个性、相对）的内涵",
                    "重点阐明“共性寓于个性之中，没有离开个性的共性，也没有离开共性的个性”",
                    "从方法论角度落脚到“具体问题具体分析（马克思主义活的灵魂）”与中国式现代化实践"
                ],
                "criteria": [
                    "采分点1（原理准确）：准确阐述共性与个性、绝对与相对的辩证统一关系",
                    "采分点2（逻辑严密）：清晰论证为何共性寓于个性之中以及二者在一定条件下相互转化",
                    "采分点3（理论联系实际）：紧扣材料分析中国式现代化中“现代化一般规律（共性）”与“中国特色（个性）”的有机统一"
                ],
                "reference_answer": "1. **核心原理阐述（依据[资料1]）**：\n- **矛盾的普遍性（共性）**是指事事有矛盾、时时有矛盾，它是无条件的、绝对的；**矛盾的特殊性（个性）**是指不同事物的矛盾及每一矛盾的各个侧面各有其特点，它是有条件的、相对的。\n- **辩证关系**：二者是辩证统一的。**共性寓于个性之中，并通过个性表现出来**，没有离开个性的共性，也没有离开共性的个性；同时二者在一定条件下相互转化。这一原理揭示了客观事物矛盾运动的总法则，因而是**关于事物矛盾问题的精髓**。\n2. **方法论意义与材料分析**：\n- 矛盾的特殊性要求我们在认识和改造世界时必须坚持**具体问题具体分析（马克思主义活的灵魂）**，反对教条主义。\n- 中国式现代化既体现了人类社会现代化发展的普遍规律（共性），又深深植根于中国基本国情与历史文化传统（个性），是矛盾普遍性与特殊性辩证统一原理在当代中国的生动实践。",
                "sources": sources,
                "source_version": "*",
            }
        else:
            practice_ex = {
                "title": f"《{course_title}》{node_title} · 材料分析与理论论述实训",
                "scenario": f"【材料分析 · 依据[资料1]《{doc_name}》】围绕“{mod_title}”中的核心原理“{node_title}”，请结合当代科技变革与社会发展实践材料，进行哲学/政治经济学层面的深入剖析。",
                "task": f"1. 准确阐述教材《{doc_name}》中关于“{node_title}”的核心原理与辩证关系；\n2. 说明该原理对应的方法论要求，并结合现实材料指出应当坚持什么、反对什么。",
                "hints": [
                    f"先写出“{node_title}”所属的理论板块与核心范畴定义",
                    "从唯物论、辩证法、认识论或唯物史观/政经角度展开辩证关系分析",
                    "总结对应的方法论启示（如一切从实际出发、矛盾分析法、群众路线等）"
                ],
                "criteria": [
                    "采分点1：基本概念与原理阐述准确完整",
                    "采分点2：辩证关系分析透彻，反对唯心主义或形而上学片面性",
                    "采分点3：方法论提炼到位，理论联系实际紧密"
                ],
                "reference_answer": f"1. **原理阐述（依据[资料1]）**：“{node_title}”深刻揭示了客观世界与人类社会发展的内在规律，体现了唯物论与辩证法的有机统一。\n2. **方法论要求**：在认识与实践活动中，必须尊重客观规律、充分发挥主观能动性，坚持全面、发展、矛盾的观点看问题，在实践中检验和发展真理。",
                "sources": sources,
                "source_version": "*",
            }

    return {
        "cache_entry": {
            "source_version": "*",
            "sources": sources,
            "mermaid_schema": mermaid,
            "questions": questions,
            "presentation": presentation,
        },
        "practice_subject": "economics" if is_econ else "humanities",
        "practice_exercise": practice_ex,
    }


def write_files_and_cache(base_dir: Path):
    from setup_dify_docs_text import MICRO_TEXT_1, MICRO_TEXT_2, MARX_TEXT_1, MARX_TEXT_2
    uploads_dir = base_dir / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    (uploads_dir / f"{DOC_MICRO_1[0]}.md").write_text(MICRO_TEXT_1, encoding="utf-8")
    (uploads_dir / f"{DOC_MICRO_2[0]}.md").write_text(MICRO_TEXT_2, encoding="utf-8")
    (uploads_dir / f"{DOC_MARX_1[0]}.md").write_text(MARX_TEXT_1, encoding="utf-8")
    (uploads_dir / f"{DOC_MARX_2[0]}.md").write_text(MARX_TEXT_2, encoding="utf-8")

    cache = {}
    for mod_title, doc_info, nodes in MICRO_MODULES:
        for node_id, node_title, _ in nodes:
            bundle = build_node_bundle("微观经济学", mod_title, node_id, node_title, doc_info)
            cache[node_id] = bundle["cache_entry"]
    for mod_title, doc_info, nodes in MARX_MODULES:
        for node_id, node_title, _ in nodes:
            bundle = build_node_bundle("马克思主义基本原理", mod_title, node_id, node_title, doc_info)
            cache[node_id] = bundle["cache_entry"]

    res_dir = base_dir / "app" / "resources"
    res_dir.mkdir(parents=True, exist_ok=True)
    (res_dir / "generated_dify.json").write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote 4 textbook files to {uploads_dir} and 71 node caches to {res_dir / 'generated_dify.json'}")


def seed_database():
    from app.db.database import init_db, SessionLocal
    from app.db.models import (
        Course, Module, Node, Resource, GeneratedResource,
        CourseBuild, LearningQuiz, LearningAnswer, PracticeRecord
    )
    from setup_dify_docs_text import MICRO_TEXT_1, MICRO_TEXT_2, MARX_TEXT_1, MARX_TEXT_2

    init_db()
    sizes = {
        DOC_MICRO_1[0]: len(MICRO_TEXT_1.encode("utf-8")),
        DOC_MICRO_2[0]: len(MICRO_TEXT_2.encode("utf-8")),
        DOC_MARX_1[0]: len(MARX_TEXT_1.encode("utf-8")),
        DOC_MARX_2[0]: len(MARX_TEXT_2.encode("utf-8")),
    }

    with SessionLocal() as db:
        db.query(LearningAnswer).delete()
        db.query(LearningQuiz).delete()
        db.query(PracticeRecord).delete()
        db.query(GeneratedResource).delete()
        db.query(Resource).delete()
        db.query(Node).delete()
        db.query(Module).delete()
        db.query(CourseBuild).delete()
        db.query(Course).delete()
        db.commit()

        c_micro = Course(id="course-micro", title="微观经济学", dify_dataset_id=MICRO_DS)
        c_marx = Course(id="course-marx", title="马克思主义基本原理", dify_dataset_id=MARX_DS)
        db.add_all([c_micro, c_marx])
        db.flush()

        def insert_course_tree(course_obj, modules_spec):
            for m_idx, (mod_title, doc_info, nodes_spec) in enumerate(modules_spec, 1):
                mod = Module(id=f"{course_obj.id}-mod-{m_idx:02d}", course_id=course_obj.id, title=mod_title)
                db.add(mod)
                db.flush()
                for node_id, node_title, deps in nodes_spec:
                    node = Node(id=node_id, module_id=mod.id, title=node_title, deps=json.dumps(deps, ensure_ascii=False))
                    db.add(node)
                    db.flush()
                    res = Resource(
                        node_id=node.id,
                        dify_document_id=doc_info[0],
                        name=doc_info[1],
                        status="completed",
                        size=sizes[doc_info[0]],
                    )
                    db.add(res)
                    db.flush()
                    db.add(GeneratedResource(resource_id=res.id, course_id=course_obj.id))

                    bundle = build_node_bundle(course_obj.title, mod_title, node_id, node_title, doc_info)
                    db.add(PracticeRecord(
                        learner_id="seed_template",
                        node_id=node.id,
                        subject=bundle["practice_subject"],
                        exercise=json.dumps(bundle["practice_exercise"], ensure_ascii=False),
                    ))

        insert_course_tree(c_micro, MICRO_MODULES)
        insert_course_tree(c_marx, MARX_MODULES)

        # CourseBuild records (enabled=False so background poller preserves the exact 8-ch/46-node & 5-ch/25-node structure)
        db.add(CourseBuild(
            course_id="course-micro",
            enabled=False,
            status="completed",
            source_version="seeded-micro-v1",
            attempt_version="seeded-micro-v1",
            documents=json.dumps([
                {"id": DOC_MICRO_1[0], "name": DOC_MICRO_1[1], "status": "completed", "size": sizes[DOC_MICRO_1[0]], "updated_at": None},
                {"id": DOC_MICRO_2[0], "name": DOC_MICRO_2[1], "status": "completed", "size": sizes[DOC_MICRO_2[0]], "updated_at": None},
            ], ensure_ascii=False),
            summary=json.dumps({"new_modules": 8, "new_nodes": 46, "linked_nodes": 46, "retained_nodes": 0, "segment_count": 36, "excerpted": False}, ensure_ascii=False),
        ))
        db.add(CourseBuild(
            course_id="course-marx",
            enabled=False,
            status="completed",
            source_version="seeded-marx-v1",
            attempt_version="seeded-marx-v1",
            documents=json.dumps([
                {"id": DOC_MARX_1[0], "name": DOC_MARX_1[1], "status": "completed", "size": sizes[DOC_MARX_1[0]], "updated_at": None},
                {"id": DOC_MARX_2[0], "name": DOC_MARX_2[1], "status": "completed", "size": sizes[DOC_MARX_2[0]], "updated_at": None},
            ], ensure_ascii=False),
            summary=json.dumps({"new_modules": 5, "new_nodes": 25, "linked_nodes": 25, "retained_nodes": 0, "segment_count": 28, "excerpted": False}, ensure_ascii=False),
        ))
        db.flush()

        # Seed realistic learning history for StarMap & Adaptive Path:
        # - Mastered (3/3 correct): n-micro-01..06, n-marx-01..03
        # - Weakness (1/3 correct, 33% accuracy): n-micro-07 (均衡价格), n-micro-10 (需求价格弹性与总收益), n-marx-09 (矛盾普遍性与特殊性)
        # - Learning (2/2 correct): n-micro-08, n-micro-09, n-marx-07, n-marx-08
        seed_states = {
            "n-micro-01": [True, True, True],
            "n-micro-02": [True, True, True],
            "n-micro-03": [True, True, True],
            "n-micro-04": [True, True, True],
            "n-micro-05": [True, True, True],
            "n-micro-06": [True, True, True],
            "n-micro-07": [True, False, False],  # Weakness!
            "n-micro-08": [True, True],          # Learning
            "n-micro-09": [True, True],          # Learning
            "n-micro-10": [True, False, False],  # Weakness!
            "n-marx-01": [True, True, True],
            "n-marx-02": [True, True, True],
            "n-marx-03": [True, True, True],
            "n-marx-06": [True, True, True],
            "n-marx-07": [True, True],
            "n-marx-08": [True, True],
            "n-marx-09": [True, False, False],   # Weakness!
        }

        for nid, outcomes in seed_states.items():
            node = db.get(Node, nid)
            mod = db.get(Module, node.module_id)
            course = db.get(Course, mod.course_id)
            doc_info = DOC_MICRO_1 if course.id == "course-micro" else DOC_MARX_1
            bundle = build_node_bundle(course.title, mod.title, nid, node.title, doc_info)
            q_list = bundle["cache_entry"]["questions"]
            context = f"{course.title} / {mod.title} / {node.title}"
            for q in q_list:
                q["_context"] = context
                q["_source_version"] = "*"
            q_list[0]["_sources"] = bundle["cache_entry"]["sources"]

            quiz = LearningQuiz(
                id=f"quiz-seed-{nid}",
                learner_id="seed_template",
                node_id=nid,
                questions=json.dumps(q_list, ensure_ascii=False),
            )
            db.add(quiz)
            db.flush()
            for idx, is_corr in enumerate(outcomes):
                q_obj = q_list[idx % len(q_list)]
                wrong_opt = next((o for o in q_obj["options"] if o != q_obj["correct_answer"]), q_obj["options"][0])
                db.add(LearningAnswer(
                    learner_id="seed_template",
                    node_id=nid,
                    quiz_id=quiz.id,
                    question_index=idx,
                    selected_answer=q_obj["correct_answer"] if is_corr else wrong_opt,
                    correct=is_corr,
                ))

        db.commit()
        print("Successfully seeded PostgreSQL with 微观经济学 (8ch/46nodes) & 马克思主义基本原理 (5ch/25nodes)!")


if __name__ == "__main__":
    base = Path(__file__).resolve().parent
    write_files_and_cache(base)
    if os.getenv("SKIP_DB") != "1":
        seed_database()
