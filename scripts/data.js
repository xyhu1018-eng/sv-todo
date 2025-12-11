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