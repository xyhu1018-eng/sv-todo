// scripts/data.js

// 这里定义所有的“需求类型”列，顺序就是表格列的顺序
const DEMAND_TYPES = [
  '献祭',
  '任务',
  '菜谱',
  '制造',
  '出货',
  //混合栽培',
  //'图腾柱'
  //浣熊放动态
];

// 定义 CSV 文件路径
const ITEMS_CSV_PATH = 'data/items.csv';

//献祭选项不包括金星作物
//需要任意奶、蛋的以小牛奶，小鸡蛋白色算
//1蒜种子，1甜瓜种子, 1小麦种子
//制品有出货需求的会还原到材料上，比如需要蛋黄酱，那么白色小鸡蛋的出货需求会留2，以防忘了留，勾掉蛋黄酱的时候并不会自动让鸡蛋需求-1

// ============================
// 献祭 / 任务 生成系统：数据定义
// ============================

// 收集包模式
const DONATION_MODE_BASE = 'base';   // 基础献祭
const DONATION_MODE_MIXED = 'mixed'; // 混合献祭（随机包）

// 献祭收集包：按大类（房间）分组
// 每个 bundle.items 里的 name 必须与 items.csv 的 name 完全一致
const DONATION_BUNDLE_GROUPS = [
  {
    id: 'crafts_room',
    name: '工艺室',
    bundles: [
      {
        id: 'spring_foraging',
        name: '春季采集包',
        mode: DONATION_MODE_BASE,
        items: [
          // { name: '野山葵', count: 1 },
          // { name: '水仙花', count: 1 },
        ]
      },

      // 混合包示例
      {
        id: 'mixed_example_1',
        name: '（混合）示例包1',
        mode: DONATION_MODE_MIXED,
        items: [
          // { name: '树液', count: 1 }
        ]
      },
    ]
  },

  // 继续添加其它房间...
];

// 任务：按大类分组
const QUEST_GROUPS = [
  {
    id: 'mainline',
    name: '主线任务',
    quests: [
      {
        id: 'quest_example_1',
        name: '示例任务1',
        items: [
          // { name: '木材', count: 20 },
        ]
      }
    ]
  },
  // 继续添加其它大类...
];

// ============================
// 默认勾选策略
// ============================

// 默认：勾选所有 base 模式的收集包；mixed 默认不勾选
function getDefaultSelectedDonationBundleIds() {
  const s = new Set();
  DONATION_BUNDLE_GROUPS.forEach(g => {
    g.bundles.forEach(b => {
      if (b.mode === DONATION_MODE_BASE) s.add(b.id);
    });
  });
  return s;
}

// 默认：任务全勾选
function getDefaultSelectedQuestIds() {
  const s = new Set();
  QUEST_GROUPS.forEach(g => g.quests.forEach(q => s.add(q.id)));
  return s;
}

// ============================
// 物品备注（每个物品一条，可选）
// ============================

// 两种备注：
// 1) 参数型：{ kind:'recipe', n:5, as:'葡萄干', machine:'烘干机', days:1, extra:'…可选' }
// 2) 文本型：{ kind:'text', text:'随便写' }
const ITEM_NOTES = {
  // '葡萄': { kind:'recipe', n:5, as:'葡萄干', machine:'烘干机', days:1, extra:'记得留同品质' },
  // '金星蔬菜': { kind:'text', text:'某某季节要留给谁…' },
};