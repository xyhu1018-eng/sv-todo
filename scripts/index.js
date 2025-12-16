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
let donationNotesByItem = new Map(); // itemName -> [text,text...]

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

function bindTooltipInteractions(anchorEl, getText) {
  if (!anchorEl) return;

  const isDesktopHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // 桌面：悬停显示，移开消失
  if (isDesktopHover) {
    anchorEl.addEventListener('mouseenter', (e) => {
      const text = typeof getText === 'function' ? getText() : getText;
      if (!text) return;
      showTooltipNearEl(text, anchorEl);
    });
    anchorEl.addEventListener('mouseleave', () => hideTooltip());
    return;
  }

  // 手机：长按显示，松手消失
  let pressTimer = null;
  const start = () => {
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      const text = typeof getText === 'function' ? getText() : getText;
      if (!text) return;
      showTooltipNearEl(text, anchorEl);
    }, 350);
  };
  const end = () => {
    clearTimeout(pressTimer);
    pressTimer = null;
    hideTooltip();
  };

  anchorEl.addEventListener('touchstart', (e) => { e.stopPropagation(); start(); }, { passive: true });
  anchorEl.addEventListener('touchend', end, { passive: true });
  anchorEl.addEventListener('touchcancel', end, { passive: true });
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

function parseItemNote(raw) {
  const text = (raw || '').trim();
  return {
    text,
    params: null, // 以后扩展：结构化参数放这里
  };
}

async function loadItemsFromCSV() {
  const res = await fetch(ITEMS_CSV_PATH);
  const text = await res.text();

  const records = parseCSV(text);

  items = records.map((record, index) => {
    const needs = {};
    const baseNeeds = {};   //新增：基线需求
    const done = {};

    DEMAND_TYPES.forEach(type => {
      //动态列：不从 CSV 读取
      if (type === '献祭' || type === '任务') {
        needs[type] = 0;
        baseNeeds[type] = 0;
        done[type] = 0;
        return;
      }

      const colName = 'need_' + type;
      const raw = (record[colName] || '').trim();

      // 这里保留你现有的数字解析逻辑
      const n = parseInt(raw || '0', 10);
      const v = Number.isNaN(n) ? 0 : n;

      needs[type] = v;
      baseNeeds[type] = v;
      done[type] = 0;
    });

    const remarkRaw = (record.remark || '').trim().toLowerCase();
    const tags = Array.from(remarkRaw)
      .filter(ch => ITEM_TAG_DEFS && ITEM_TAG_DEFS[ch])
      .filter((v, i, a) => a.indexOf(v) === i);

    //新增：从 CSV 读备注
    const noteInfo = parseItemNote(record.note);

    return {
      id: 'row_' + index,
      name: record.name || '',
      season: record.season || '',
      category: record.category || '',
      favorite: record.favorite || '',
      remark: remarkRaw,
      tags,
      needs,
      baseNeeds,
      note: noteInfo.text,
      noteParams: noteInfo.params,
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
  const noteMap = new Map(); // 新增：收集 notes

  if (typeof DONATION_BUNDLE_GROUPS === 'undefined') {
    donationSourcesByItem = new Map();
    donationNotesByItem = new Map();
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

      // 新增：把 bundle.notes 汇总到 noteMap
      (bundle.notes || []).forEach(n => {
        const itemName = (n.item || '').trim();
        const text = (n.text || '').trim();
        if (!itemName || !text) return;

        if (!noteMap.has(itemName)) noteMap.set(itemName, []);
        noteMap.get(itemName).push(`【${group.name} / ${bundle.name}】${text}`);
      });
    });
  });

  donationSourcesByItem = srcMap;
  donationNotesByItem = noteMap; // 新增
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
      if (type === '献祭' || type === '任务') return; //静态恢复不碰动态列
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

function renderHeaderTo(headerRowId, selectedNeedTypes) {
  const headerRow = document.getElementById(headerRowId);
  if (!headerRow) return;
  headerRow.innerHTML = '';

  [
    { text: '物品', className: 'col-item' },
    { text: '季节', className: 'col-season' },
    { text: '类型', className: 'col-category' }
  ].forEach(({ text, className }) => {
    const th = document.createElement('th');
    th.textContent = text;
    th.className = className;
    headerRow.appendChild(th);
  });

  selectedNeedTypes.forEach(type => {
    const th = document.createElement('th');
    th.textContent = type;
    headerRow.appendChild(th);
  });

  // “最爱”列（按开关）
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

  // 新增：标记列（显示 x/y → 不卖/不留）
  const tagTh = document.createElement('th');
  tagTh.textContent = '标记';
  headerRow.appendChild(tagTh);
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
  // 分组：无 tags 的进主表；有 tags 的进隐藏表
  const normalItems = items.filter(it => !it.tags || it.tags.length === 0);
  const hiddenItems = items.filter(it => it.tags && it.tags.length > 0);

  // 1) 主表
  renderTableInto('items-tbody', 'table-header-row', normalItems);

  // 2) 隐藏表：只有展开时才渲染
  const hiddenWrap = document.getElementById('hidden-items-wrap');
  const isOpen = hiddenWrap && hiddenWrap.style.display !== 'none';
  if (isOpen) {
    renderTableInto('hidden-items-tbody', 'hidden-table-header-row', hiddenItems);
  }
}

function renderTableInto(tbodyId, headerRowId, list) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = '';

  const selectedSeasons = getCheckedValues('filter-season-group');
  const selectedCategories = getCheckedValues('filter-category-group');
  const selectedNeedTypes = getCheckedValues('filter-need-group');

  // 画对应表头
  renderHeaderTo(headerRowId, selectedNeedTypes);

  // === 过滤（沿用你现有逻辑）===
  let filteredItems = list.filter(item => {
    // 需求类型至少选一个
    if (selectedNeedTypes.length === 0) return false;

    // 季节过滤（你目前那套 token 逻辑）
    const itemSeasons = getSeasonTokens(item);
    if (selectedSeasons.length > 0 && itemSeasons.length > 0) {
      if (!itemSeasons.includes(ALL_SEASONS_TOKEN)) {
        const intersects = itemSeasons.some(s => selectedSeasons.includes(s));
        if (!intersects) return false;
      }
    }

    // 类型过滤（你那套多类型 token 逻辑）
    if (selectedCategories.length > 0) {
      const itemCats = getCategoryTokens(item);
      if (itemCats.length > 0) {
        const catIntersects = itemCats.some(c => selectedCategories.includes(c));
        if (!catIntersects) return false;
      }
    }

    return true;
  });

  // 排序：未完成在前，完成在后
  filteredItems.sort((a, b) => {
    const aCompleted = isItemCompleteUnderFilter(a, selectedNeedTypes);
    const bCompleted = isItemCompleteUnderFilter(b, selectedNeedTypes);
    if (aCompleted === bCompleted) return 0;
    return aCompleted ? 1 : -1;
  });

  // === 渲染每一行（基本照搬你原 renderTable 的 forEach 内容）===
  filteredItems.forEach(item => {
    const tr = document.createElement('tr');
    if (isItemCompleteUnderFilter(item, selectedNeedTypes)) {
      tr.classList.add('row-complete');
    }

    // 物品名
    const nameTd = document.createElement('td');
    nameTd.classList.add('item-name');
    nameTd.classList.add('col-item');

    const nameSpan = document.createElement('span');
    nameSpan.className = 'name-text';
    nameSpan.textContent = item.name;

    if (item.note) {
      nameTd.classList.add('has-note');
      bindTooltipInteractions(nameSpan, () => item.note);
    }

    nameTd.appendChild(nameSpan);
    tr.appendChild(nameTd);

    const seasonTd = document.createElement('td');
    seasonTd.classList.add('col-season');
    seasonTd.textContent = item.season || '';
    tr.appendChild(seasonTd);

    const catTd = document.createElement('td');
    catTd.classList.add('col-category');
    catTd.textContent = item.category || '';
    tr.appendChild(catTd);

    // 需求列
    selectedNeedTypes.forEach(type => {
      const need = item.needs[type];
      const doneRaw = item.done[type] || 0;

      const td = document.createElement('td');
      td.classList.add('need-cell');

      const needNum = Number(need || 0);
      const done = Math.min(doneRaw, needNum);

      if (needNum <= 0) {
        td.textContent = '-';
        td.classList.add('no-need');
      } else {
        td.textContent = `${done}/${needNum}`;
        td.classList.add('clickable');
        if (done >= needNum) td.classList.add('need-done');

        td.addEventListener('click', () => {
          const currentDone = item.done[type] || 0;
          if (currentDone < needNum) item.done[type] = currentDone + 1;
          else item.done[type] = 0;
          renderTable(); // 这里保持统一刷新
        });
      }

      function buildDonationTooltipText(itemName) {
        const lines = [];

        const src = donationSourcesByItem.get(itemName) || [];
        if (src.length) {
          lines.push('来源（收集包）：');
          src.forEach(s => {
            lines.push(`- ${s.groupName} / ${s.bundleName} ×${s.count}`);
          });
        }

        const notes = donationNotesByItem.get(itemName) || [];
        if (notes.length) {
          lines.push('');
          lines.push('额外提醒：');
          notes.forEach(t => lines.push(`- ${t}`));
        }

        if (!lines.length) return '';
        return lines.join('\n');
      }

      if (type === '献祭') {
        const tip = buildDonationTooltipText(item.name);
        if (tip) {
          const info = document.createElement('div');
          info.className = 'cell-info';

          // triEl 不存在：直接把 tooltip 绑定到 info 上即可
          bindTooltipInteractions(info, () => tip);

          td.appendChild(info);
        }
      }


      tr.appendChild(td);
    });

    // 最爱列（按开关）
    const favToggle = document.getElementById('toggle-favorite');
    const showFavorite = !favToggle || favToggle.checked;
    if (showFavorite) {
      const favTd = document.createElement('td');
      favTd.textContent = item.favorite || '';
      tr.appendChild(favTd);
    }

    // 总需求列
    const { need, done } = getTotalsForItem(item, selectedNeedTypes);
    const totalTd = document.createElement('td');
    totalTd.classList.add('total-cell');
    totalTd.textContent = need > 0 ? `${done}/${need}` : '-';
    tr.appendChild(totalTd);

    // 操作列：重置本行
    const actionTd = document.createElement('td');
    const resetBtn = document.createElement('button');
    resetBtn.textContent = '重置本行';
    resetBtn.className = 'row-reset-btn';
    resetBtn.addEventListener('click', () => {
      DEMAND_TYPES.forEach(t => (item.done[t] = 0));
      renderTable();
    });
    actionTd.appendChild(resetBtn);
    tr.appendChild(actionTd);

    // 标记列：显示 x/y 对应的 label
    const tagTd = document.createElement('td');
    const tags = item.tags || [];
    tagTd.textContent = tags.length
      ? tags.map(t => (ITEM_TAG_DEFS?.[t]?.label || t)).join(' / ')
      : '';
    tr.appendChild(tagTd);

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

  const toggleHiddenBtn = document.getElementById('toggle-hidden-btn');
  const hiddenWrap = document.getElementById('hidden-items-wrap');

  if (toggleHiddenBtn && hiddenWrap) {
    toggleHiddenBtn.addEventListener('click', () => {
      const isOpen = hiddenWrap.style.display !== 'none';
      hiddenWrap.style.display = isOpen ? 'none' : 'block';
      toggleHiddenBtn.textContent = isOpen ? '＋ 显示隐藏物品' : '－ 隐藏这些物品';

      // 展开时补渲染隐藏表
      if (!isOpen) renderTable();
    });
  }
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
