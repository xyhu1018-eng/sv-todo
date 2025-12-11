// scripts/index.js

const ITEMS_STORAGE_KEY = 'sv_todo_items_v1';
const NOTES_STORAGE_KEY = 'sv_todo_global_notes_v1';

let items = [];       // 表格里的物品数据
let globalNotes = []; // 全局备注数组：[{id, text, done}]

// =============== 小工具函数 ===============

function getCheckedValues(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return [];
  return Array.from(
    container.querySelectorAll('input[type="checkbox"]:checked')
  ).map(cb => cb.value);
}

// 生成简单的备注 id
function makeNoteId() {
  return 'note_' + Date.now() + '_' + Math.random().toString(16).slice(2);
}

// 计算一行在当前“需求类型视角”下总需求/已完成
function getTotalsForItem(item, filteredNeedTypes) {
  const types =
    Array.isArray(filteredNeedTypes) && filteredNeedTypes.length > 0
      ? filteredNeedTypes
      : DEMAND_TYPES;

  let need = 0;
  let done = 0;
  let hasInfinite = false;

  types.forEach(type => {
    const n = item.needs[type];

    if (n === 'x') {
      hasInfinite = true;
      return; // 不参与求和
    }

    const num = n || 0;
    const dRaw = item.done[type] || 0;
    const d = Math.min(dRaw, num);
    need += num;
    done += d;
  });

  return { need, done, hasInfinite };
}


function isItemCompleteUnderFilter(item, filteredNeedTypes) {
  const { need, done } = getTotalsForItem(item, filteredNeedTypes);
  return need > 0 && done >= need;
}

function getAllSeasons() {
  const set = new Set();

  items.forEach(item => {
    const seasons = getSeasonTokens(item);
    seasons.forEach(s => {
      // “四季”是特殊标记，不作为筛选选项出现
      if (s === ALL_SEASONS_TOKEN) return;
      set.add(s);
    });
  });

  return Array.from(set);
}

function getAllCategories() {
  const set = new Set();

  items.forEach(item => {
    const cats = getCategoryTokens(item);
    cats.forEach(c => set.add(c));
  });

  return Array.from(set);
}

const ALL_SEASONS_TOKEN = '四季';

// 把 item.season 字符串解析成一个数组，比如：
// '夏;秋' -> ['夏','秋']
// '四季'  -> ['四季']
// ''      -> []
function getSeasonTokens(item) {
  const raw = (item.season || '').trim();
  if (!raw) return [];
  if (raw === ALL_SEASONS_TOKEN) return [ALL_SEASONS_TOKEN];

  // 用分号 / 空格 / 斜杠 等分隔，你现在只要记住用“;”就行
  return raw
    .split(/[;、\/\s]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function getCategoryTokens(item) {
  const raw = (item.category || '').trim();
  if (!raw) return [];

  // 分隔符：分号 / 顿号 / 斜杠 / 空格 都算分隔
  return raw
    .split(/[;、\/\s]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

// =============== 状态加载 & 保存 ===============

// =============== 状态加载 & 保存（无 localStorage 版） ===============

/*function loadItems() {
  // 不再读取 localStorage，直接用 INITIAL_ITEMS 初始化
  items = INITIAL_ITEMS.map(base => {
    const needs = {};
    const done = {};
    DEMAND_TYPES.forEach(type => {
      needs[type] = base.needs?.[type] || 0;
      done[type] = 0; // 每次刷新页面，进度从 0 开始
    });
    return {
      id: base.id,
      name: base.name,
      season: base.season,
      category: base.category,
      needs,
      done,
      favorite: base.favorite || ''
    };
  });
}*/

// ========== 简单 CSV 解析器（支持最常用的情况） ==========
function parseCSV(text) {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l);

  const header = lines[0].split(',').map(s => s.trim());
  const rows = lines.slice(1);

  return rows.map(line => {
    const cols = line.split(',').map(s => s.trim());
    const obj = {};
    header.forEach((key, i) => {
      obj[key] = cols[i] ?? '';
    });
    return obj;
  });
}

async function loadItemsFromCSV() {
  const res = await fetch(ITEMS_CSV_PATH);
  const text = await res.text();

  const records = parseCSV(text);

  items = records.map((record, index) => {
    const needs = {};
    const done = {};

    DEMAND_TYPES.forEach(type => {
      const colName = 'need_' + type;
      const raw = (record[colName] || '').trim();

      if (raw.toLowerCase() === 'x') {
        needs[type] = 'x'; // 特殊：无限需求
        done[type] = 0;
      } else {
        const n = parseInt(raw || '0', 10);
        needs[type] = Number.isNaN(n) ? 0 : n;
        done[type] = 0;
      }
    });


    return {
      id: 'row_' + index,
      name: record.name || '',
      season: record.season || '',
      category: record.category || '',
      favorite: record.favorite || '',
      needs,
      done
    };
  });
}

function saveItems() {
  // 暂时禁用存储：留空，方便以后恢复
  // localStorage.setItem(ITEMS_STORAGE_KEY, JSON.stringify(items));
}

// 全局备注：同样不再存储，刷新页面就清空
function loadNotes() {
  // 如果你之后想要“默认备注”，可以改成预填一个数组
  globalNotes = [];
}

function saveNotes() {
  // 暂时禁用存储
  // localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(globalNotes));
}

// =============== 过滤区渲染 ===============

function renderFilterOptions() {
  const seasonGroup = document.getElementById('filter-season-group');
  const categoryGroup = document.getElementById('filter-category-group');
  const needGroup = document.getElementById('filter-need-group');

  if (!seasonGroup || !categoryGroup || !needGroup) return;

  seasonGroup.innerHTML = '';
  categoryGroup.innerHTML = '';
  needGroup.innerHTML = '';

  getAllSeasons().forEach(season => {
    const label = document.createElement('label');
    label.className = 'checkbox-item';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = season;
    cb.checked = true; // 默认全选

    label.appendChild(cb);
    label.appendChild(document.createTextNode(season));
    seasonGroup.appendChild(label);
  });

  getAllCategories().forEach(cat => {
    const label = document.createElement('label');
    label.className = 'checkbox-item';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = cat;
    cb.checked = true;

    label.appendChild(cb);
    label.appendChild(document.createTextNode(cat));
    categoryGroup.appendChild(label);
  });

  DEMAND_TYPES.forEach(type => {
    const label = document.createElement('label');
    label.className = 'checkbox-item';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = type;
    cb.checked = true;

    label.appendChild(cb);
    label.appendChild(document.createTextNode(type));
    needGroup.appendChild(label);
  });
}

// =============== 表头渲染 ===============

function renderHeader(selectedNeedTypes) {
  const headerRow = document.getElementById('table-header-row');
  headerRow.innerHTML = '';

  ['物品', '季节', '类型'].forEach(text => {
    const th = document.createElement('th');
    th.textContent = text;
    headerRow.appendChild(th);
  });

  // 只显示被勾选的需求类型列
  selectedNeedTypes.forEach(type => {
    const th = document.createElement('th');
    th.textContent = type;
    headerRow.appendChild(th);
  });

  //“最爱”列（按开关）
  const favToggle = document.getElementById('toggle-favorite');
  const showFavorite = !favToggle || favToggle.checked;
  if (showFavorite) {
    const favTh = document.createElement('th');
    favTh.textContent = '最爱';
    headerRow.appendChild(favTh);
  }

  const totalTh = document.createElement('th');
  totalTh.textContent = '总需求完成';
  headerRow.appendChild(totalTh);

  const actionTh = document.createElement('th');
  actionTh.textContent = '操作';
  headerRow.appendChild(actionTh);
}

// =============== 全局备注渲染 ===============

function renderGlobalNotes() {
  const listEl = document.getElementById('global-notes-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  const sorted = [...globalNotes].sort((a, b) => {
    if (a.done === b.done) return 0;
    return a.done ? 1 : -1;
  });

  sorted.forEach(note => {
    const row = document.createElement('div');
    row.className = 'note-item';
    if (note.done) row.classList.add('note-done');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = note.done;

    const span = document.createElement('span');
    span.className = 'note-text';
    span.textContent = note.text;

    cb.addEventListener('change', () => {
      const target = globalNotes.find(n => n.id === note.id);
      if (target) {
        target.done = cb.checked;
        globalNotes.sort((a, b) => {
          if (a.done === b.done) return 0;
          return a.done ? 1 : -1;
        });
        saveNotes();
        renderGlobalNotes();
      }
    });

    row.appendChild(cb);
    row.appendChild(span);
    listEl.appendChild(row);
  });
}

// =============== 表格渲染 ===============

function renderTable() {
  const tbody = document.getElementById('items-tbody');
  tbody.innerHTML = '';

  const selectedSeasons = getCheckedValues('filter-season-group');
  const selectedCategories = getCheckedValues('filter-category-group');
  const selectedNeedTypes = getCheckedValues('filter-need-group');

  // 每次渲染表格时重画表头
  renderHeader(selectedNeedTypes);

  let filteredItems = items.filter(item => {
    const itemSeasons = getSeasonTokens(item);

    // 1. 处理季节过滤
    if (selectedSeasons.length > 0) {
      // 如果是四季作物，自动通过
      if (!itemSeasons.includes(ALL_SEASONS_TOKEN)) {
        // 否则要求：itemSeasons 和 selectedSeasons 至少有一个交集
        const intersects = itemSeasons.some(s => selectedSeasons.includes(s));
        if (!intersects) return false;
      }
    }
    // 2. 物品类型过滤（保持原来逻辑）
    if (selectedCategories.length > 0) {
      const itemCats = getCategoryTokens(item);
      // 要求 itemCats 与 selectedCategories 至少有一个交集
      const catIntersects = itemCats.some(c =>
        selectedCategories.includes(c)
      );
      if (!catIntersects) return false;
    }

    // 3. 需求类型过滤（保持你现在的写法）
    if (selectedNeedTypes.length > 0) {
      const hasNeed = selectedNeedTypes.some(
        type => (item.needs[type] || 0) > 0
      );
      if (!hasNeed) return false;
    } else {
      return false;
    }

    return true;
  });

  filteredItems.sort((a, b) => {
    const aCompleted = isItemCompleteUnderFilter(a, selectedNeedTypes);
    const bCompleted = isItemCompleteUnderFilter(b, selectedNeedTypes);
    if (aCompleted === bCompleted) return 0;
    return aCompleted ? 1 : -1;
  });

  filteredItems.forEach(item => {
    const tr = document.createElement('tr');

    if (isItemCompleteUnderFilter(item, selectedNeedTypes)) {
      tr.classList.add('row-complete');
    }

    const nameTd = document.createElement('td');
    nameTd.textContent = item.name;
    tr.appendChild(nameTd);

    const seasonTd = document.createElement('td');
    seasonTd.textContent = item.season || '';
    tr.appendChild(seasonTd);

    const catTd = document.createElement('td');
    catTd.textContent = item.category || '';
    tr.appendChild(catTd);

    // 需求类型格子：只渲染选中的列
    selectedNeedTypes.forEach(type => {
      const need = item.needs[type];
      const doneRaw = item.done[type] || 0;
      const td = document.createElement('td');
      td.classList.add('need-cell');

      // === 1. x 型需求 ===
      if (need === 'x') {
        // 显示：x / x（或你想显示成 ✔、已完成都可以，我先保持一致）
        const done = doneRaw > 0 ? '✔' : 'x';

        td.textContent = done;
        td.classList.add('clickable');

        if (doneRaw > 0) td.classList.add('need-done');

        td.addEventListener('click', () => {
          item.done[type] = doneRaw > 0 ? 0 : 1; // 一键完成/取消
          saveItems();
          renderTable();
        });

        tr.appendChild(td);
        return; // 继续下一列
      }

      // === 2. 普通数字需求（你的原逻辑） ===
      const needNum = need || 0;
      const done = Math.min(doneRaw, needNum);

      if (needNum <= 0) {
        td.textContent = '-';
        td.classList.add('no-need');
      } else {
        td.textContent = `${done}/${needNum}`;
        td.classList.add('clickable');

        if (done >= needNum) {
          td.classList.add('need-done');
        }

        td.addEventListener('click', () => {
          const currentDone = item.done[type] || 0;
          if (currentDone < needNum) {
            item.done[type] = currentDone + 1;
          } else {
            item.done[type] = 0;
          }
          saveItems();
          renderTable();
        });
      }

      tr.appendChild(td);
    });

    //“最爱”列（按开关显示，不参与求和）
    const favToggle = document.getElementById('toggle-favorite');
    const showFavorite = !favToggle || favToggle.checked;
    if (showFavorite) {
      const favTd = document.createElement('td');
      favTd.textContent = item.favorite || '';
      tr.appendChild(favTd);
    }

    // 总需求列
    // 总需求列（支持 x 型无限需求）
    const { need, done, hasInfinite } = getTotalsForItem(item, selectedNeedTypes);
    const totalTd = document.createElement('td');
    totalTd.classList.add('total-cell');

    if (hasInfinite) {
      totalTd.textContent = '-';   // 有 x 类型 → 总需求无法统计 → 用 '-' 标记
    } else {
      totalTd.textContent = need > 0 ? `${done}/${need}` : '-';
    }

    tr.appendChild(totalTd);


    // 操作列：重置本行（不影响全局备注）
    const actionTd = document.createElement('td');
    const resetBtn = document.createElement('button');
    resetBtn.textContent = '重置本行';
    resetBtn.className = 'row-reset-btn';

    resetBtn.addEventListener('click', () => {
      DEMAND_TYPES.forEach(type => {
        item.done[type] = 0;
      });
      saveItems();
      renderTable();
    });

    actionTd.appendChild(resetBtn);
    tr.appendChild(actionTd);

    tbody.appendChild(tr);
  });
}

// =============== 重置全部 ===============

function resetAllProgress() {
  const ok = window.confirm('确认要将所有需求进度和备注复选状态重置为 0 吗？');
  if (!ok) return;

  items.forEach(item => {
    DEMAND_TYPES.forEach(type => {
      item.done[type] = 0;
    });
  });
  saveItems();

  globalNotes.forEach(n => {
    n.done = false;
  });
  saveNotes();

  renderTable();
  renderGlobalNotes();
}

// =============== 事件绑定 ===============

function setupEvents() {
  const resetBtn = document.getElementById('reset-all-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetAllProgress);
  }

  ['filter-season-group', 'filter-category-group', 'filter-need-group'].forEach(
    id => {
      const container = document.getElementById(id);
      if (!container) return;
      container.addEventListener('change', e => {
        if (e.target.matches('input[type="checkbox"]')) {
          renderTable();
        }
      });
    }
  );

  const addInput = document.getElementById('global-note-input');
  const addBtn = document.getElementById('global-note-add-btn');

  //新增：最爱列开关
  const favToggle = document.getElementById('toggle-favorite');
  if (favToggle) {
    favToggle.addEventListener('change', renderTable);
  }

  function addNoteFromInput() {
    if (!addInput) return;
    const text = addInput.value.trim();
    if (!text) return;
    globalNotes.push({
      id: makeNoteId(),
      text,
      done: false
    });
    addInput.value = '';
    saveNotes();
    renderGlobalNotes();
  }

  if (addBtn) {
    addBtn.addEventListener('click', addNoteFromInput);
  }
  if (addInput) {
    addInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        addNoteFromInput();
      }
    });
  }
}

// =============== 启动 ===============

document.addEventListener('DOMContentLoaded', async () => {
  await loadItemsFromCSV();   // CSV 填充 items
  loadNotes();                // 如果你仍然保留全局备注
  renderFilterOptions();
  setupEvents();
  renderTable();
  renderGlobalNotes();
});
