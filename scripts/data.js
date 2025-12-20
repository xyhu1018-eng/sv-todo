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

// 标签定义：方便未来扩展
const ITEM_TAG_DEFS = {
  x: { label: '不卖', hint: '资源类：都留着，不必卖' },
  y: { label: '不留', hint: '多来源：用时再做/再拿，不必特意留' },
  // z: { label:'...', hint:'...' }
};

// 定义 CSV 文件路径
const ITEMS_CSV_PATH = 'data/items.csv';

//献祭选项不包括金星作物
//需要任意奶、蛋的以小牛奶，小鸡蛋白色算
//1蒜种子，1甜瓜种子, 1小麦种子；四个花种制作
//制品有出货需求的会还原到材料上，比如需要啤酒，那么小麦的出货需求会留2，以防忘了留，勾掉啤酒的时候并不会自动让小麦需求-1
//category的购买意味着能在一周内稳定买到/或者得到
//category钓鱼包括鱼塘产物
//忽略危险矿井来源
//火山晶石的制造包括买配方
//制造只标记了特殊物品，并不是完全list，但按这个勾基本不会漏难找的东西

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
        id: 'cr_spring_foraging',
        name: '春季采集收集包',
        mode: DONATION_MODE_BASE,
        items: [
          { name: '野山葵', count: 1 },
          { name: '黄水仙', count: 1 },
          { name: '韭葱', count: 1 },
          { name: '蒲公英', count: 1 },
        ]
      },
      {
        id: 'cr_summer_foraging',
        name: '夏季采集收集包',
        mode: DONATION_MODE_BASE,
        items: [
          { name: '葡萄', count: 1 },
          { name: '香味浆果', count: 1 },
          { name: '甜豌豆', count: 1 },
        ]
      },
      {
        id: 'cr_fall_foraging',
        name: '秋季采集收集包',
        mode: DONATION_MODE_BASE,
        items: [
          { name: '普通蘑菇', count: 1 },
          { name: '野梅', count: 1 },
          { name: '榛子', count: 1 },
          { name: '黑莓', count: 1 },
        ]
      },
      {
        id: 'cr_winter_foraging',
        name: '冬季采集收集包',
        mode: DONATION_MODE_BASE,
        items: [
          { name: '冬根', count: 1 },
          { name: '水晶果', count: 1 },
          { name: '雪山药', count: 1 },
          { name: '番红花', count: 1 },
        ]
      },
      {
        id: 'cr_construction',
        name: '建筑收集包',
        mode: DONATION_MODE_BASE,
        items: [
          { name: '木材', count: 99 },
          { name: '木材', count: 99 },
          { name: '石头', count: 99 },
          { name: '硬木', count: 10 },
        ]
      },
      {
        id: 'cr_exotic_foraging',
        name: '异国情调采集收集包',
        mode: DONATION_MODE_BASE,
        items: [
          { name: '椰子', count: 1 },
          { name: '仙人掌果子', count: 1 },
          { name: '山洞萝卜', count: 1 },
          { name: '红蘑菇', count: 1 },
          { name: '紫蘑菇', count: 1 },
          { name: '枫糖浆', count: 1 },
          { name: '橡树树脂', count: 1 },
          { name: '松焦油', count: 1 },
          { name: '羊肚菌', count: 1 },
        ]
      },
    ]
  },
  {
    id: 'pantry',
    name: '茶水间',
    bundles: [
      {
        id: 'p_spring_crops',
        name: '春季作物收集包',
        mode: DONATION_MODE_BASE,
        items: [
          { name: '防风草', count: 1 },
          { name: '青豆', count: 1 },
          { name: '花椰菜', count: 1 },
          { name: '土豆', count: 1 },
        ]
      },
      {
        id: 'p_summer_crops',
        name: '夏季作物收集包',
        mode: DONATION_MODE_BASE,
        items: [
          { name: '西红柿', count: 1 },
          { name: '辣椒', count: 1 },
          { name: '蓝莓', count: 1 },
          { name: '甜瓜', count: 1 },
        ]
      },
      {
        id: 'p_fall_crops',
        name: '秋季作物收集包',
        mode: DONATION_MODE_BASE,
        items: [
          { name: '玉米', count: 1 },
          { name: '茄子', count: 1 },
          { name: '南瓜', count: 1 },
          { name: '山药', count: 1 },
        ]
      },

      // 高品质作物收集包：暂时搁置（待你设计品质逻辑）

      {
        id: 'p_animal',
        name: '动物收集包',
        mode: DONATION_MODE_BASE,
        items: [
          { name: '大壶牛奶', count: 1 },
          { name: '棕色大鸡蛋', count: 1 },
          { name: '白色大鸡蛋', count: 1 },
          { name: '大瓶羊奶', count: 1 },
          { name: '动物毛', count: 1 },
          { name: '鸭蛋', count: 1 },
        ]
      },
      {
        id: 'p_artisan',
        name: '工匠收集包',
        mode: DONATION_MODE_BASE,
        items: [
          { name: '松焦油', count: 1 },
          { name: '布料', count: 1 },
          { name: '山羊奶酪', count: 1 },
          { name: '羊奶', count: 1 },
          { name: '奶酪', count: 1 },
          { name: '牛奶', count: 1 },
          { name: '蜂蜜', count: 1 },
          { name: '果酱', count: 1 },
          { name: '苹果', count: 1 },
          { name: '杏子', count: 1 },
          { name: '橙子', count: 1 },
          { name: '桃子', count: 1 },
          { name: '石榴', count: 1 },
          { name: '樱桃', count: 1 },
        ],
        notes: [
          { item: '牛奶', text: '用于制作奶酪' },
          { item: '羊奶', text: '用于制作山羊奶酪' },
        ]
      },
    ]
  },
  {
    id: 'fish_tank',
    name: '鱼缸',
    bundles: [
      {
        id: 'ft_river',
        name: '河鱼收集包',
        mode: DONATION_MODE_BASE,
        items: [
          { name: '太阳鱼', count: 1 },
          { name: '鲶鱼', count: 1 },
          { name: '西鲱', count: 1 },
          { name: '虎纹鳟鱼', count: 1 },
        ]
      },
      {
        id: 'ft_lake',
        name: '湖鱼收集包',
        mode: DONATION_MODE_BASE,
        items: [
          { name: '大嘴鲈鱼', count: 1 },
          { name: '鲤鱼', count: 1 },
          { name: '大头鱼', count: 1 },
          { name: '鲟鱼', count: 1 },
        ]
      },
      {
        id: 'ft_ocean',
        name: '海鱼收集包',
        mode: DONATION_MODE_BASE,
        items: [
          { name: '沙丁鱼', count: 1 },
          { name: '金枪鱼', count: 1 },
          { name: '红鲷鱼', count: 1 },
          { name: '罗非鱼', count: 1 },
        ]
      },
      {
        id: 'ft_night',
        name: '夜间垂钓收集包',
        mode: DONATION_MODE_BASE,
        items: [
          { name: '大眼鱼', count: 1 },
          { name: '鲷鱼', count: 1 },
          { name: '鳗鱼', count: 1 },
        ]
      },
      {
        id: 'ft_crab_pot',
        name: '蟹笼收集包',
        mode: DONATION_MODE_BASE,
        items: [
          { name: '龙虾', count: 1 },
          { name: '小龙虾', count: 1 },
          { name: '螃蟹', count: 1 },
          { name: '鸟蛤', count: 1 },
          { name: '蛤', count: 1 },
          { name: '虾', count: 1 },
          { name: '蜗牛', count: 1 },
          { name: '玉黍螺', count: 1 },
          { name: '牡蛎', count: 1 },
          { name: '蚌', count: 1 },
        ]
      },
      {
        id: 'ft_specialty',
        name: '特色鱼类收集包',
        mode: DONATION_MODE_BASE,
        items: [
          { name: '河豚', count: 1 },
          { name: '鬼鱼', count: 1 },
          { name: '沙鱼', count: 1 },
          { name: '木跃鱼', count: 1 },
        ]
      },
    ]
  },
  {
    id: 'boiler_room',
    name: '锅炉房',
    bundles: [
      {
        id: 'br_blacksmith',
        name: '铁匠的收集包',
        mode: DONATION_MODE_BASE,
        items: [
          { name: '铜锭', count: 1 },
          { name: '铁锭', count: 1 },
          { name: '金锭', count: 1 },
        ]
      },
      {
        id: 'br_geologist',
        name: '地理学家的收集包',
        mode: DONATION_MODE_BASE,
        items: [
          { name: '石英', count: 1 },
          { name: '地晶', count: 1 },
          { name: '泪晶', count: 1 },
          { name: '火水晶', count: 1 },
        ]
      },
      {
        id: 'br_adventurer',
        name: '冒险家的收集包',
        mode: DONATION_MODE_BASE,
        items: [
          { name: '史莱姆泥', count: 99 },
          { name: '蝙蝠翅膀', count: 10 },
          { name: '太阳精华', count: 1 },
          { name: '虚空精华', count: 1 },
        ]
      },
    ]
  },
  {
    id: 'bulletin_board',
    name: '布告栏',
    bundles: [
      {
        id: 'bb_chef',
        name: '厨师收集包',
        mode: DONATION_MODE_BASE,
        items: [
          { name: '枫糖浆', count: 1 },
          { name: '蕨菜', count: 1 },
          { name: '松露', count: 1 },
          { name: '虞美人花', count: 1 },
          { name: '生鱼寿司', count: 1 },
          { name: '海草', count: 1 },
          { name: '大米', count: 1 },
          { name: '任意鱼', count: 1 },
          { name: '煎鸡蛋', count: 1 },
          { name: '蛋（白色）', count: 1 },
        ],
        notes: [
          { item: '海草', text: '用于制作生鱼寿司' },
          { item: '大米', text: '用于制作生鱼寿司' },
          { item: '任意鱼', text: '用于制作生鱼寿司' },
          { item: '蛋（白色）', text: '煎鸡蛋' },
        ]
      },
      {
        id: 'bb_dye',
        name: '染料收集包',
        mode: DONATION_MODE_BASE,
        items: [
          { name: '红蘑菇', count: 1 },
          { name: '海胆', count: 1 },
          { name: '向日葵', count: 1 },
          { name: '鸭毛', count: 1 },
          { name: '海蓝宝石', count: 1 },
          { name: '红叶卷心菜', count: 1 },
        ]
      },
      {
        id: 'bb_field_research',
        name: '土地研究收集包',
        mode: DONATION_MODE_BASE,
        items: [
          { name: '紫蘑菇', count: 1 },
          { name: '鹦鹉螺', count: 1 },
          { name: '鲢鱼', count: 1 },
          { name: '冰封晶球', count: 1 },
        ]
      },
      {
        id: 'bb_fodder',
        name: '饲料收集包',
        mode: DONATION_MODE_BASE,
        items: [
          { name: '小麦', count: 10 },
          { name: '干草', count: 10 },
          { name: '苹果', count: 3 },
        ]
      },
      {
        id: 'bb_enchanter',
        name: '魔法师收集包',
        mode: DONATION_MODE_BASE,
        items: [
          { name: '橡树树脂', count: 1 },
          { name: '果酒', count: 1 },
          { name: '兔子的脚', count: 1 },
          { name: '石榴', count: 1 },
        ]
      },
    ]
  },
  {
  name: '废弃 Joja 超市',
    bundles: [
      {
        id: 'missing_bundle',
        name: '失踪的收集包',
        mode: DONATION_MODE_BASE, // 基础献祭也包含
        items: [
          { name: '果酒', quality: 'silver', qCount: 1 },
          { name: '恐龙蛋黄酱', count: 1 },
          { name: '恐龙蛋', count: 1 },
          { name: '五彩碎片', count: 1 },
          { name: '上古水果', quality: 'gold', qCount: 5 },
          { name: '虚空鲑鱼', quality: 'gold', qCount: 1 },
          { name: '鱼籽酱', count: 1 },
          { name: '鲟鱼鱼籽', count: 1 },
        ],
        notes: [
          {
            item: '果酒',
            text: '地下室:1个经14d做1果酒'
          },
          {
            item: '恐龙蛋',
            text: '用于制作恐龙蛋黄酱'
          },
          {
            item: '鲟鱼鱼籽',
            text: '用于制作鱼籽酱'
          }
        ]
      }
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

