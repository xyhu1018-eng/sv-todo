// scripts/index.js

const ITEMS_STORAGE_KEY = 'sv_todo_items_v1';
const NOTES_STORAGE_KEY = 'sv_todo_global_notes_v1';

let items = [];       // 表格里的物品数据
let globalNotes = []; // 全局备注数组：[{id, text, done}]

// ===== 献祭/任务：当前勾选集合 =====
let selectedDonationBundleIds = new Set();
let selectedQuestIds = new Set();

// 反向索引：用于“来源 tooltip”
let donationSourcesByItem = new Map(); // itemName -> [{groupName,bundleName,count}]
let questSourcesByItem = new Map();    // itemName -> [{groupName,questName,count}]

// ===== tooltip =====
function getTooltipEl() {
  return document.getElementById('tooltip');
}

function showTooltipAt(text, x, y) {
  const el = getTooltipEl();
  if (!el) return;
  el.textContent = text;

  // 先显示再测量
  el.classList.remove('hidden');

  // 防止出屏幕
  const pad = 10;
  const rect = el.getBoundingClientRect();
  let left = x;
  let top = y;

  if (left + rect.width + pad > window.innerWidth) {
    left = window.innerWidth - rect.width - pad;
  }
  if (top + rect.height + pad > window.innerHeight) {
    top = window.innerHeight - rect.height - pad;
  }
  if (left < pad) left = pad;
  if (top < pad) top = pad;

  el.style.left = left + 'px';
  el.style.top = top + 'px';
}

function showTooltipNearEl(text, anchorEl) {
  const r = anchorEl.getBoundingClientRect();
  showTooltipAt(text, r.left + 6, r.bottom + 8);
}

function hideTooltip() {
  const el = getTooltipEl();
  if (!el) return;
  el.classList.add('hidden');
}

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
      baseNeeds, // 新增
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

function computeDonationNeedsAndSources() {
  const needMap = new Map();
  const srcMap = new Map();

  if (typeof DONATION_BUNDLE_GROUPS === 'undefined') {
    donationSourcesByItem = new Map();
    return needMap;
  }

  DONATION_BUNDLE_GROUPS.forEach(group => {
    group.bundles.forEach(bundle => {
      if (!selectedDonationBundleIds.has(bundle.id)) return;

      (bundle.items || []).forEach(entry => {
        const name = entry.name;
        const count = Number(entry.count || 0);

        needMap.set(name, (needMap.get(name) || 0) + count);

        if (!srcMap.has(name)) srcMap.set(name, []);
        srcMap.get(name).push({
          groupName: group.name,
          bundleName: bundle.name,
          count
        });
      });
    });
  });

  donationSourcesByItem = srcMap;
  return needMap;
}

function computeQuestNeedsAndSources() {
  const needMap = new Map();
  const srcMap = new Map();

  if (typeof QUEST_GROUPS === 'undefined') {
    questSourcesByItem = new Map();
    return needMap;
  }

  QUEST_GROUPS.forEach(group => {
    group.quests.forEach(quest => {
      if (!selectedQuestIds.has(quest.id)) return;

      (quest.items || []).forEach(entry => {
        const name = entry.name;
        const count = Number(entry.count || 0);

        needMap.set(name, (needMap.get(name) || 0) + count);

        if (!srcMap.has(name)) srcMap.set(name, []);
        srcMap.get(name).push({
          groupName: group.name,
          questName: quest.name,
          count
        });
      });
    });
  });

  questSourcesByItem = srcMap;
  return needMap;
}

function recomputeDynamicNeeds() {
  // 1) 恢复基线
  items.forEach(item => {
    DEMAND_TYPES.forEach(type => {
      if (item.baseNeeds && type in item.baseNeeds) {
        item.needs[type] = item.baseNeeds[type];
      }
    });
  });

  // 2) 生成献祭/任务需求
  const donationNeedMap = computeDonationNeedsAndSources();
  const questNeedMap = computeQuestNeedsAndSources();

  items.forEach(item => {
    const d = donationNeedMap.get(item.name) || 0;
    const q = questNeedMap.get(item.name) || 0;

    // 你目前的需求是：献祭/任务主要由系统生成。
    // 如果你还想“保留 CSV 里手填的一点点额外需求”，可以改成叠加。
    item.needs['献祭'] = d;
    item.needs['任务'] = q;

    // 如果你想叠加（可选）：
    // item.needs['献祭'] = (item.baseNeeds?.['献祭'] || 0) + d;
    // item.needs['任务'] = (item.baseNeeds?.['任务'] || 0) + q;
  });
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

    // 1. 季节过滤：
    //    - 如果勾了季节 && 物品本身写了季节：
    //         要么是“四季”，要么与勾选项有交集；
    //    - 如果物品季节为空：不参与季节过滤（总是通过）
    if (selectedSeasons.length > 0 && itemSeasons.length > 0) {
      if (!itemSeasons.includes(ALL_SEASONS_TOKEN)) {
        const intersects = itemSeasons.some(s =>
          selectedSeasons.includes(s)
        );
        if (!intersects) return false;
      }
    }

    // 2. 物品类型过滤：
    //    - 勾了类型 && 物品有类型标签时：要有交集
    //    - 物品类型为空：不参与过滤（总是通过）
    if (selectedCategories.length > 0) {
      const itemCats = getCategoryTokens(item);
      if (itemCats.length > 0) {
        const catIntersects = itemCats.some(c =>
          selectedCategories.includes(c)
        );
        if (!catIntersects) return false;
      }
    }

    // 3. 需求类型过滤：
    //    - 至少要勾选一个需求类型，否则直接不显示任何行
    //    - 不再根据“有没有 >0 的需求”来筛掉物品，
    //      这样名字刚录完、需求还没填，或者只有 x，也能显示出来。
    if (selectedNeedTypes.length === 0) {
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
  nameTd.classList.add('item-name');

  const nameSpan = document.createElement('span');
  nameSpan.className = 'name-text';
  nameSpan.textContent = item.name;

  const note = (typeof ITEM_NOTES !== 'undefined') ? ITEM_NOTES[item.name] : null;
  if (note) {
    nameTd.classList.add('has-note');

    // 备注文本格式化
    const noteText =
      note.kind === 'recipe'
        ? `用 ${note.n} 个「${item.name}」做「${note.as}」；机器：${note.machine}；耗时：${note.days} 天` +
          (note.extra ? `；${note.extra}` : '')
        : (note.text || '');

    // 长按显示（手机友好）
    let pressTimer = null;
    const startPress = (e) => {
      pressTimer = setTimeout(() => {
        showTooltipNearEl(noteText, nameSpan);
      }, 420);
    };
    const cancelPress = () => {
      if (pressTimer) clearTimeout(pressTimer);
      pressTimer = null;
    };

    nameSpan.addEventListener('pointerdown', startPress);
    nameSpan.addEventListener('pointerup', cancelPress);
    nameSpan.addEventListener('pointercancel', cancelPress);
    nameSpan.addEventListener('pointerleave', cancelPress);

    // 也允许点击直接弹（桌面更方便）
    nameSpan.addEventListener('click', (e) => {
      e.stopPropagation();
      showTooltipNearEl(noteText, nameSpan);
    });
  }

  nameTd.appendChild(nameSpan);
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
      
      // 如果是“献祭/任务”列，并且当前有需求或有来源信息，则显示小三角用于查看来源
      if (type === '献祭' || type === '任务') {
        const sources =
          type === '献祭'
            ? (donationSourcesByItem.get(item.name) || [])
            : (questSourcesByItem.get(item.name) || []);

        if (sources.length > 0) {
          const info = document.createElement('div');
          info.className = 'cell-info';
          info.title = '查看来源';

          info.addEventListener('click', (e) => {
            e.stopPropagation(); // 不触发加数量
            const lines = sources.map(s => {
              if (type === '献祭') return `${s.groupName} / ${s.bundleName} ×${s.count}`;
              return `${s.groupName} / ${s.questName} ×${s.count}`;
            });
            showTooltipNearEl(lines.join('\n'), td);
          });

          td.appendChild(info);
        }
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

function renderDonationPanel() {
  const root = document.getElementById('donation-bundles-panel');
  if (!root) return;
  root.innerHTML = '';

  if (typeof DONATION_BUNDLE_GROUPS === 'undefined') {
    root.textContent = '未定义 DONATION_BUNDLE_GROUPS（请在 data.js 中添加）';
    return;
  }

  DONATION_BUNDLE_GROUPS.forEach(group => {
    const block = document.createElement('div');
    block.className = 'group-block';

    const title = document.createElement('div');
    title.className = 'group-title';
    title.textContent = group.name;

    const actions = document.createElement('div');
    actions.className = 'group-actions';

    const btnAll = document.createElement('button');
    btnAll.textContent = '全选';
    btnAll.addEventListener('click', () => {
      group.bundles.forEach(b => selectedDonationBundleIds.add(b.id));
      syncDonationCheckboxes();
      recomputeDynamicNeeds();
      renderTable();
    });

    const btnNone = document.createElement('button');
    btnNone.textContent = '全不选';
    btnNone.addEventListener('click', () => {
      group.bundles.forEach(b => selectedDonationBundleIds.delete(b.id));
      syncDonationCheckboxes();
      recomputeDynamicNeeds();
      renderTable();
    });

    actions.appendChild(btnAll);
    actions.appendChild(btnNone);

    const head = document.createElement('div');
    head.className = 'group-title';
    head.innerHTML = `<span>${group.name}</span>`;
    head.appendChild(actions);

    block.appendChild(head);

    const list = document.createElement('div');
    list.className = 'checkbox-group';

    group.bundles.forEach(bundle => {
      const label = document.createElement('label');
      label.className = 'checkbox-item';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.bundleId = bundle.id;
      cb.checked = selectedDonationBundleIds.has(bundle.id);

      cb.addEventListener('change', () => {
        if (cb.checked) selectedDonationBundleIds.add(bundle.id);
        else selectedDonationBundleIds.delete(bundle.id);

        recomputeDynamicNeeds();
        renderTable();
      });

      const suffix = bundle.mode === DONATION_MODE_MIXED ? '（混合）' : '';
      label.appendChild(cb);
      label.appendChild(document.createTextNode(`${bundle.name}${suffix}`));
      list.appendChild(label);
    });

    block.appendChild(list);
    root.appendChild(block);
  });
}

function syncDonationCheckboxes() {
  document.querySelectorAll('input[type="checkbox"][data-bundle-id]').forEach(cb => {
    cb.checked = selectedDonationBundleIds.has(cb.dataset.bundleId);
  });
}

function renderQuestPanel() {
  const root = document.getElementById('quest-panel');
  if (!root) return;
  root.innerHTML = '';

  if (typeof QUEST_GROUPS === 'undefined') {
    root.textContent = '未定义 QUEST_GROUPS（请在 data.js 中添加）';
    return;
  }

  QUEST_GROUPS.forEach(group => {
    const block = document.createElement('div');
    block.className = 'group-block';

    const actions = document.createElement('div');
    actions.className = 'group-actions';

    const btnAll = document.createElement('button');
    btnAll.textContent = '全选';
    btnAll.addEventListener('click', () => {
      group.quests.forEach(q => selectedQuestIds.add(q.id));
      syncQuestCheckboxes();
      recomputeDynamicNeeds();
      renderTable();
    });

    const btnNone = document.createElement('button');
    btnNone.textContent = '全不选';
    btnNone.addEventListener('click', () => {
      group.quests.forEach(q => selectedQuestIds.delete(q.id));
      syncQuestCheckboxes();
      recomputeDynamicNeeds();
      renderTable();
    });

    actions.appendChild(btnAll);
    actions.appendChild(btnNone);

    const head = document.createElement('div');
    head.className = 'group-title';
    head.innerHTML = `<span>${group.name}</span>`;
    head.appendChild(actions);

    block.appendChild(head);

    const list = document.createElement('div');
    list.className = 'checkbox-group';

    group.quests.forEach(quest => {
      const label = document.createElement('label');
      label.className = 'checkbox-item';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.questId = quest.id;
      cb.checked = selectedQuestIds.has(quest.id);

      cb.addEventListener('change', () => {
        if (cb.checked) selectedQuestIds.add(quest.id);
        else selectedQuestIds.delete(quest.id);

        recomputeDynamicNeeds();
        renderTable();
      });

      label.appendChild(cb);
      label.appendChild(document.createTextNode(quest.name));
      list.appendChild(label);
    });

    block.appendChild(list);
    root.appendChild(block);
  });
}

function syncQuestCheckboxes() {
  document.querySelectorAll('input[type="checkbox"][data-quest-id]').forEach(cb => {
    cb.checked = selectedQuestIds.has(cb.dataset.questId);
  });
}

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

    // 献祭面板全局按钮
  const btnBase = document.getElementById('donation-select-base');
  const btnNone = document.getElementById('donation-select-none');
  const btnAll = document.getElementById('donation-select-all');

  if (btnBase) btnBase.addEventListener('click', () => {
    selectedDonationBundleIds = getDefaultSelectedDonationBundleIds();
    syncDonationCheckboxes();
    recomputeDynamicNeeds();
    renderTable();
  });

  if (btnNone) btnNone.addEventListener('click', () => {
    selectedDonationBundleIds = new Set();
    syncDonationCheckboxes();
    recomputeDynamicNeeds();
    renderTable();
  });

  if (btnAll) btnAll.addEventListener('click', () => {
    const s = new Set();
    DONATION_BUNDLE_GROUPS.forEach(g => g.bundles.forEach(b => s.add(b.id)));
    selectedDonationBundleIds = s;
    syncDonationCheckboxes();
    recomputeDynamicNeeds();
    renderTable();
  });

  // 任务面板全局按钮
  const qNone = document.getElementById('quest-select-none');
  const qAll = document.getElementById('quest-select-all');

  if (qNone) qNone.addEventListener('click', () => {
    selectedQuestIds = new Set();
    syncQuestCheckboxes();
    recomputeDynamicNeeds();
    renderTable();
  });

  if (qAll) qAll.addEventListener('click', () => {
    selectedQuestIds = getDefaultSelectedQuestIds();
    syncQuestCheckboxes();
    recomputeDynamicNeeds();
    renderTable();
  });

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
  document.addEventListener('click', (e) => {
    // 点到 tooltip 自己不关
    if (e.target && (e.target.id === 'tooltip' || e.target.closest('#tooltip'))) return;
    hideTooltip();
  });
}

// =============== 启动 ===============

document.addEventListener('DOMContentLoaded', async () => {
  await loadItemsFromCSV();
  loadNotes();

  // 初始化默认勾选
  selectedDonationBundleIds = getDefaultSelectedDonationBundleIds();
  selectedQuestIds = getDefaultSelectedQuestIds();

  // 先算一遍动态需求
  recomputeDynamicNeeds();

  // 渲染面板
  renderDonationPanel();
  renderQuestPanel();

  // 原有 UI
  renderFilterOptions();
  setupEvents();
  renderTable();
  renderGlobalNotes();
});
