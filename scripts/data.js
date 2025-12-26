// scripts/data.js

// 这里定义所有的“需求类型”列，顺序就是表格列的顺序
const DEMAND_TYPES = [
  '献祭',
  '任务',
  '菜谱',
  '制造',
  '出货',
  '混合栽培',
  '图腾柱'
  //浣熊放动态
];

// 标签定义：方便未来扩展
const ITEM_TAG_DEFS = {
  x: { label: '不卖', hint: '资源类：都留着，不必卖' },
  y: { label: '不留', hint: '多来源：用时再做/再拿，不必特意留' },
  z: { label: '无季节', hint: '季节不敏感：开始稳定产出后不用担心季节' },
  // z: { label:'...', hint:'...' }
};

// 定义 CSV 文件路径
const ITEMS_CSV_PATH = 'data/items.csv';

//制品有出货需求的会还原到材料上，比如需要啤酒，那么小麦的出货需求会留2，以防忘了留，勾掉啤酒的时候并不会自动让小麦需求-1
//category的购买意味着能在一周内稳定买到/或者得到
//category钓鱼包括鱼塘产物
//忽略危险矿井来源
//火山晶石的制造包括买配方
//制造只标记了特殊物品，并不是完全list，但按这个勾基本不会漏难找的东西

// ============================
// 献祭 / 任务 生成系统：数据定义
// ============================

const DONATION_BUNDLE_GROUPS = [
  {
    id: 'crafts_room',
    name: '工艺室',
    bundles: [
      {
        id: 'cr_spring_foraging',
        name: '春季采集收集包',
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
        items: [
          { name: '葡萄', count: 1 },
          { name: '香味浆果', count: 1 },
          { name: '甜豌豆', count: 1 },
        ]
      },
      {
        id: 'cr_fall_foraging',
        name: '秋季采集收集包',
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
        items: [
          { name: '玉米', count: 1 },
          { name: '茄子', count: 1 },
          { name: '南瓜', count: 1 },
          { name: '山药', count: 1 },
        ]
      },
      {
        id: 'p_quality_crops',
        name: '高品质作物收集包',
        items: [
          { name: '防风草', quality: 'gold', qCount: 5 },
          { name: '甜瓜', quality: 'gold', qCount: 5 },
          { name: '南瓜', quality: 'gold', qCount: 5 },
          { name: '玉米', quality: 'gold', qCount: 5 },
        ]
      },
      {
        id: 'p_animal',
        name: '动物收集包',
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
        items: [
          { name: '大眼鱼', count: 1 },
          { name: '鲷鱼', count: 1 },
          { name: '鳗鱼', count: 1 },
        ]
      },
      {
        id: 'ft_crab_pot',
        name: '蟹笼收集包',
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
        items: [
          { name: '铜锭', count: 1 },
          { name: '铁锭', count: 1 },
          { name: '金锭', count: 1 },
        ]
      },
      {
        id: 'br_geologist',
        name: '地理学家的收集包',
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
        items: [
          { name: '小麦', count: 10 },
          { name: '干草', count: 10 },
          { name: '苹果', count: 3 },
        ]
      },
      {
        id: 'bb_enchanter',
        name: '魔法师收集包',
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
        name: '失踪的收集包', // 基础献祭也包含
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
];

const REMIX_BUNDLE_DEFS = [
  {
    id: 'crafts_room_rm',
    name: '工艺室',
    bundles: [
      {
        id: 'rm_cr_spring_foraging',
        name: '（混合）春季采集收集包',
        baseBundleId: 'cr_spring_foraging',
        needSlots: 4,
        items: [
          { name: '野山葵', count:1 },
          { name: '黄水仙', count:1 },
          { name: '韭葱', count:1 },
          { name: '蒲公英', count:1 },
          { name: '大葱', count:1 },
        ],
      },
      {
        id: 'rm_cr_winter_foraging',
        name: '（混合）冬季采集收集包',
        baseBundleId: 'cr_winter_foraging',
        needSlots: 4,
        items: [
          { name: '冬根', count: 1 },
          { name: '水晶果', count: 1 },
          { name: '雪山药', count: 1 },
          { name: '番红花', count: 1 },
          { name: '冬青树', count:1 },
        ],
      },
      {
        id: 'rm_cr_sticky',
        name: '黏糊糊收集包',
        baseBundleId: 'cr_construction',
        items: [
          { name:'树液', count:500 },
        ],
      },
      {
        id: 'rm_cr_forest',
        name: '森林收集包',
        baseBundleId: 'cr_construction',
        needSlots: 3,
        items: [
          { name:'苔藓', count:10 },
          { name:'纤维', count:200 },
          { name:'橡子', count:10 },
          { name:'枫树种子', count:10 },
        ],
      },
      {
        id: 'rm_cr_wild_medicine',
        name: '野生药材收集包',
        baseBundleId: 'cr_exotic_foraging',
        items: [
          { name:'紫蘑菇', count:5 },
          { name:'蕨菜', count:5 },
          { name:'白藻', count:5 },
          { name:'啤酒花', count:5 },
        ],
      },
    ]
  },
  {
    id: 'pantry_rm',
    name: '茶水间',
    bundles: [
      {
        id: 'rm_p_spring_crops',
        name: '（混合）春季作物收集包',
        baseBundleId: 'p_spring_crops',
        needSlots: 4,
        items: [
          { name: '防风草', count: 1 },
          { name: '青豆', count: 1 },
          { name: '花椰菜', count: 1 },
          { name: '土豆', count: 1 },
          { name: '甘蓝菜', count: 1 },
          { name: '胡萝卜', count: 1 },
        ],
      },
      {
        id: 'rm_p_summer_crops',
        name: '（混合）夏季作物收集包',
        baseBundleId: 'p_summer_crops',
        needSlots: 4,
        items: [
          { name: '西红柿', count: 1 },
          { name: '辣椒', count: 1 },
          { name: '蓝莓', count: 1 },
          { name: '甜瓜', count: 1 },
          { name: '金皮西葫芦', count: 1 },
        ],
      },
      {
        id: 'rm_p_fall_crops',
        name: '（混合）秋季作物收集包',
        baseBundleId: 'p_fall_crops',
        needSlots: 4,
        items: [
          { name: '玉米', count: 1 },
          { name: '茄子', count: 1 },
          { name: '南瓜', count: 1 },
          { name: '山药', count: 1 },
          { name: '西蓝花', count: 1 },
        ],
      },
      {
        id: 'rm_p_quality_crops',
        name: '（混合）高品质作物收集包',
        baseBundleId: 'p_quality_crops',
        needSlots: 4,
        items: [
          { name: '防风草', quality: 'gold', qCount: 5 },
          { name: '青豆', quality: 'gold', qCount: 5 },
          { name: '土豆', quality: 'gold', qCount: 5 },
          { name: '花椰菜', quality: 'gold', qCount: 5 },
          { name: '甜瓜', quality: 'gold', qCount: 5 },
          { name: '蓝莓', quality: 'gold', qCount: 5 },
          { name: '辣椒', quality: 'gold', qCount: 5 },
          { name: '南瓜', quality: 'gold', qCount: 5 },
          { name: '茄子', quality: 'gold', qCount: 5 },
          { name: '玉米', quality: 'gold', qCount: 5 },
        ],
      },
      {
        id: 'rm_p_rare_crops',
        name: '稀有作物收集包',
        baseBundleId: 'p_quality_crops',
        items: [
          { name: '上古水果', count: 1 },
          { name: '宝石甜莓', count: 1 },
        ],
      },
      {
        id: 'rm_p_fisher',
        name: '渔夫收集包',
        baseBundleId: 'p_animal',
        items: [
          { name: '鱼籽', count: 15 },
          { name: '腌鱼籽', count: 15 },
          { name: '鱿鱼墨汁', count: 1 },
        ],
      },
      {
        id: 'rm_p_garden',
        name: '花园收集包',
        baseBundleId: 'p_animal',
        items: [
          { name: '郁金香', count: 1 },
          { name: '蓝爵', count: 1 },
          { name: '夏季亮片', count: 1 },
          { name: '向日葵', count: 1 },
          { name: '玫瑰仙子', count: 1 },
        ],
      },
      {
        id: 'rm_p_brewer',
        name: '酿酒师收集包',
        baseBundleId: 'p_artisan',
        items: [
          { name: '蜜蜂酒', count: 1 },
          { name: '蜂蜜', count: 1 },
          { name: '淡啤酒', count: 1 },
          { name: '啤酒花', count: 1 },
          { name: '果酒', count: 1 },
          { name: '果汁', count: 1 },
          { name: '绿茶', count: 1 },
          { name: '茶叶', count: 1 },
        ],
        notes: [
          { item: '蜂蜜', text: '用于制作蜜蜂酒' },
          { item: '啤酒花', text: '用于制作淡啤酒' },
          { item: '茶叶', text: '用于制作绿茶' },
        ]
      },
    ]
  },
  {
    id: 'fish_tank_rm',
    name: '鱼缸',
    bundles: [
      {
        id: 'rm_ft_master_fisher',
        name: '钓鱼大师收集包',
        baseBundleId: 'ft_specialty',
        items: [
          { name: '岩浆鳗鱼', count: 1 },
          { name: '蝎鲤鱼', count: 1 },
          { name: '章鱼', count: 1 },
          { name: '水滴鱼', count: 1 },
        ],
      },
      {
        id: 'rm_ft_quality_fish',
        name: '优质鱼收集包',
        baseBundleId: 'ft_specialty',
        items: [
          { name: '大嘴鲈鱼', quality: 'gold', qCount: 1 },
          { name: '西鲱', quality: 'gold', qCount: 1 },
          { name: '金枪鱼', quality: 'gold', qCount: 1 },
          { name: '大眼鱼', quality: 'gold', qCount: 1 },
        ],
      },
    ]
  },
  {
    id: 'boiler_room_rm',
    name: '锅炉房',
    bundles: [
      {
        id: 'rm_br_treasure_hunter',
        name: '宝藏猎人收集包',
        baseBundleIds: ['br_blacksmith', 'br_geologist', 'br_adventurer'],
        items: [
          { name: '紫水晶', count: 1 },
          { name: '海蓝宝石', count: 1 },
          { name: '钻石', count: 1 },
          { name: '绿宝石', count: 1 },
          { name: '红宝石', count: 1 },
          { name: '黄水晶', count: 1 },
        ],
      },
      {
        id: 'rm_br_engineer',
        name: '工程师收集包',
        baseBundleIds: ['br_blacksmith', 'br_geologist', 'br_adventurer'],
        items: [
          { name: '铱矿石', count: 1 },
          { name: '电池组', count: 1 },
          { name: '精炼石英', count: 5 },
        ],
      },
    ],
  },
  {
    id: 'bulletin_board_rm',
    name: '布告栏',
    bundles: [
      {
        id: 'rm_bb_dye',
        name: '染料收集包',
        needSlots: 6,
        baseBundleIds: ['bb_chef','bb_dye','bb_field_research','bb_fodder','bb_enchanter'], 
        items: [
          { name: '红蘑菇', count: 1 },
          { name: '甜菜', count: 1 },

          { name: '海胆', count: 1 },
          { name: '苋菜', count: 1 },

          { name: '向日葵', count: 1 },
          { name: '杨桃', count: 1 },

          { name: '鸭毛', count: 1 },
          { name: '仙人掌果子', count: 1 },

          { name: '海蓝宝石', count: 1 },
          { name: '蓝莓', count: 1 },

          { name: '红叶卷心菜', count: 1 },
          { name: '铱锭', count: 1 },
        ],
      },
      {
        id: 'rm_bb_chef',
        name: '家庭厨师收集包',
        baseBundleIds: ['bb_chef','bb_dye','bb_field_research','bb_fodder','bb_enchanter'], 
        items: [
          { name: '蛋（白色）', count: 10 },
          { name: '牛奶', count: 10 },
          { name: '大麦粉', count: 100 },
        ],
      },
      {
        id: 'rm_bb_kids',
        name: '儿童收集包',
        baseBundleIds: ['bb_chef','bb_dye','bb_field_research','bb_fodder','bb_enchanter'], 
        items: [
          { name: '美洲大树莓', count: 10 },
          { name: '饼干', count: 1 },
          { name: '大麦粉', count: 1 },
          { name: '糖', count: 2 },
          { name: '蛋（白色）', count: 1 },
          { name: '古代玩偶', count: 1 },
          { name: '冰淇淋', count: 1 },
          { name: '牛奶', count: 1 },
        ],
        notes: [
          { item: '大麦粉', text: '用于制作饼干' },
          { item: '糖', text: '用于制作饼干和冰激凌' },
          { item: '蛋（白色）', text: '1个由于制作饼干' },
          { item: '牛奶', text: '用于制作冰激凌' },
        ]
      },
      {
        id: 'rm_bb_forager',
        name: '采集者收集包',
        baseBundleIds: ['bb_chef','bb_dye','bb_field_research','bb_fodder','bb_enchanter'], 
        items: [
          { name: '美洲大树莓', count: 50 },
          { name: '黑莓', count: 50 },
          { name: '野梅', count: 15 },
        ],
      },
      {
        id: 'rm_bb_helpful',
        name: '热心居民收集包',
        baseBundleIds: ['bb_chef','bb_dye','bb_field_research','bb_fodder','bb_enchanter'], 
        items: [
          { name: '兑奖券', count: 1 },
          { name: '谜之盒', count: 5 },
        ],
      },
      {
        id: 'rm_bb_spirit_eve',
        name: '幽灵之夜收集包',
        baseBundleIds: ['bb_chef','bb_dye','bb_field_research','bb_fodder','bb_enchanter'], 
        items: [
          { name: '南瓜灯', count: 1 },
          { name: '南瓜', count: 1 },
          { name: '玉米', count: 10 },
          { name: '蝙蝠翅膀', count: 10 },
        ],
        notes: [
          { item: '南瓜', text: '用于制作南瓜灯' },
        ]
      },
      {
        id: 'rm_bb_winter_star',
        name: '冬日之星收集包',
        baseBundleIds: ['bb_chef','bb_dye','bb_field_research','bb_fodder','bb_enchanter'], 
        items: [
          { name: '冬青树', count: 5 },
          { name: '葡萄干布丁', count: 1 },
          { name: '野梅', count: 2 },
          { name: '大麦粉', count: 2 },
          { name: '糖', count: 1 },
          { name: '塞料面包', count: 1 },
          { name: '蔓越莓', count: 1 },
          { name: '榛子', count: 1 },
          { name: '霜瓜', count: 5 },
        ],
        notes: [
          { item: '野梅', text: '用于制作葡萄干布丁' },
          { item: '大麦粉', text: '用于制作葡萄干布丁和塞料面包' },
          { item: '糖', text: '1个由于制作葡萄干布丁' },
          { item: '牛奶', text: '用于制作冰激凌' },
          { item: '蔓越莓', text: '用于制作塞料面包' },
          { item: '榛子', text: '用于制作塞料面包' },
        ]
      },
    ],
  }
];

// 任务：按大类分组（可扩展新增类别）
const QUEST_GROUPS = [
  {
    id: 'story_1',
    name: '剧情任务第一年',
    quests: [
      {
        id: 's1_smdq',
        name: '神秘的齐',
        items: [
          { name: '电池组', count: 1 },
          { name: '彩虹贝壳', count: 1 },
          { name: '甜菜', count: 10 },
          { name: '太阳精华', count: 1 },
        ],
      },
      {
        id: 's1_qddqq',
        name: '乔迪的请求',
        items: [
          { name: '花椰菜', count: 1 },
        ],
      },
      {
        id: 's1_pmkl',
        name: '潘姆渴了',
        items: [
          { name: '淡啤酒', count: 1 },
          { name: '啤酒花', count: 1 },
        ],
        notes: [
          { item: '啤酒花', text: '用于制作淡啤酒' },
        ],
      },
      {
        id: 's1_zwyj',
        name: '作物研究',
        items: [
          { name: '甜瓜', count: 1 },
        ],
      },
      {
        id: 's1_xgly',
        name: '膝盖疗养',
        items: [
          { name: '辣椒', count: 1 },
        ],
      },
      {
        id: 's1_tnhx',
        name: '讨牛欢心',
        items: [
          { name: '苋菜', count: 1 },
        ],
      },
      {
        id: 's1_dkng',
        name: '雕刻南瓜',
        items: [
          { name: '南瓜', count: 1 },
        ],
      },
      {
        id: 's1_qgzt',
        name: '奇怪纸条',
        items: [
          { name: '枫糖浆', count: 1 },
        ],
      },
      {
        id: 's1_btyy',
        name: '捕条鱿鱼',
        items: [
          { name: '鱿鱼', count: 1 },
        ],
      },
      {
        id: 's1_kltdnl',
        name: '克林特的努力',
        items: [
          { name: '紫水晶', count: 1 },
        ],
      },
      {
        id: 's1_hasj',
        name: '黑暗试剂',
        items: [
          { name: '虚空精华', count: 1 },
        ],
      },
      {
        id: 's1_kltdxm',
        name: '克林特的小忙',
        items: [
          { name: '铁锭', count: 1 },
        ],
      },
      {
        id: 's1_lbdqq',
        name: '罗宾的请求',
        items: [
          { name: '硬木', count: 10 },
        ],
      },
      {
        id: 's1_hyt',
        name: '烩鱼汤',
        items: [
          { name: '青花鱼', count: 1 },
        ],
      },
      {
        id: 's1_mndqq',
        name: '玛妮的请求',
        items: [
          { name: '山洞萝卜', count: 1 },
        ],
      },
      {
        id: 's1_sgy',
        name: '砂锅鱼',
        items: [
          { name: '大嘴鲈鱼', count: 1 },
        ],
      },
      {
        id: 's1_dsz',
        name: '大树桩',
        items: [
          { name: '硬木', count: 100 },
        ],
      },
    ],
  },
  {
    id: 'story_2',
    name: '剧情任务第二年+',
    quests: [
      {
        id: 's2_xxsg',
        name: '新鲜水果',
        items: [
          { name: '杏子', count: 1 },
        ],
      },
      {
        id: 's2_nndlw',
        name: '奶奶的礼物',
        items: [
          { name: '韭葱', count: 1 },
        ],
      },
      {
        id: 's2_paedbg',
        name: '皮埃尔的布告',
        items: [
          { name: '生鱼片', count: 1 },
        ],
      },
      {
        id: 's2_scdc',
        name: '水产调查',
        items: [
          { name: '河豚', count: 1 },
        ],
      },
      {
        id: 's2_sbdxx',
        name: '士兵的星星',
        items: [
          { name: '杨桃', count: 1 },
        ],
      },
      {
        id: 's2_zzdxq',
        name: '镇长的需求',
        items: [
          { name: '松露油', count: 1 },
          { name: '松露', count: 1 },
        ],
        notes: [
          { item: '松露', text: '用于制作松露油' },
        ],
      },
      {
        id: 's2_zjlx',
        name: '征集：龙虾',
        items: [
          { name: '龙虾', count: 1 },
        ],
      },
      {
        id: 's2_pmxydc',
        name: '潘姆需要电池',
        items: [
          { name: '电池组', count: 1 },
        ],
      },
      {
        id: 's2_llfz',
        name: '力量法杖',
        items: [
          { name: '铱锭', count: 1 },
        ],
      },
      {
        id: 's2_blscdxy',
        name: '捕捞蛇齿单线鱼',
        items: [
          { name: '蛇齿单线鱼', count: 1 },
        ],
      },
      {
        id: 's2_yyyp',
        name: '异域饮品',
        items: [
          { name: '椰子', count: 1 },
        ],
      },
    ],
  },
  {
    id: 'special',
    name: '特别任务',
    quests: [
      {
        id: 'spe_bsnl',
        name: '宝石能量',
        items: [
          { name: '红宝石', count: 1 },
          { name: '黄水晶', count: 1 },
          { name: '绿宝石', count: 1 },
          { name: '翡翠', count: 1 },
          { name: '紫水晶', count: 1 },
        ],
      },
      {
        id: 'spe_lj',
        name: '烈酒',
        items: [
          { name: '土豆', count: 12 },
        ],
        notes: [
          { item: '土豆', text: '留12个，等任务开始后酿造' },
        ],
      },
    ],
  },
  {
    id: 'ginger_island',
    name: '姜岛任务',
    quests: [
      {
        id: 'gin_bsn',
        name: '宝石鸟',
        items: [
          { name: '红宝石', count: 1 },
          { name: '黄水晶', count: 1 },
          { name: '绿宝石', count: 1 },
          { name: '海蓝宝石', count: 1 },
          { name: '紫水晶', count: 1 },
        ],
      },
      {
        id: 'gin_mry',
        name: '美人鱼解密',
        items: [
          { name: '长笛块', count: 5 },
        ],
        notes: [
          { item: '土豆', text: '留12个，等任务开始后酿造' },
        ],
      },
      {
        id: 'gin_dxxjt',
        name: '大猩猩祭坛',
        items: [
          { name: '香蕉', count: 1 },
        ],
      },
    ],
  },
];

// 默认勾选策略：你想默认全不选也行；下面先给“全不选”
function getDefaultSelectedQuestIds() {
  return new Set(); // 默认空：刷新后全不选
  // 如果你想默认全选：把下面这段取消注释
  // const s = new Set();
  // QUEST_CATEGORIES.forEach(c => (c.quests || []).forEach(q => s.add(q.id)));
  // return s;
}


// ============================
// 默认勾选策略
// ============================

// 默认：任务全勾选
function getDefaultSelectedQuestIds() {
  const s = new Set();
  QUEST_GROUPS.forEach(g => g.quests.forEach(q => s.add(q.id)));
  return s;
}

