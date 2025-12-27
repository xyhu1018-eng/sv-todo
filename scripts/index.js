// scripts/index.js

const ITEMS_STORAGE_KEY = 'sv_todo_items_v1';
const NOTES_STORAGE_KEY = 'sv_todo_global_notes_v1';

let items = [];       // 表格里的物品数据
let globalNotes = []; // 全局备注数组：[{id, text, done}]

// ===== 献祭/任务：当前勾选集合 =====
let selectedQuestIds = new Set();
let pendingQuestIds = new Set();
let questNotesByItem = new Map(); // itemName -> [ "【组/任务】备注", ... ]

// 反向索引：用于“来源 tooltip”
let donationSourcesByItem = new Map(); // itemName -> [{groupName,bundleName,count}]
let questSourcesByItem = new Map();    // itemName -> [{groupName,questName,count}]
let donationNotesByItem = new Map(); // itemName -> [text,text...]
let donationQualityNeedsByItem = new Map(); // itemName -> [{quality, count, groupName, bundleName}]

// ===== 自定义需求：运行期新增列 & 备注（暂不存 cookie） =====
let customDemandTypes = []; // 仅记录“自定义新增的列名”
let customNotesByItem = new Map(); // itemName -> [text,text,...]

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


function isDonationQualityComplete(item) {
  const qList = donationQualityNeedsByItem.get(item.name) || [];
  if (!qList.length) return true; // 没星级需求 → 不影响完成判定

  const needByQ = {};
  qList.forEach(e => {
    const q = (e.quality || '').trim();
    const c = Number(e.count || 0);
    if (!q || c <= 0) return;
    needByQ[q] = (needByQ[q] || 0) + c;
  });

  const qualities = Object.keys(needByQ);
  if (!qualities.length) return true;

  if (!item.donationQDone) item.donationQDone = {};

  return qualities.every(q => {
    const need = needByQ[q] || 0;
    const done = Number(item.donationQDone[q] || 0);
    return done >= need;
  });
}

function isItemCompleteUnderFilter(item, filteredNeedTypes) {
  const { need, done } = getTotalsForItem(item, filteredNeedTypes);

  // 新增：总需求为0时，允许手动置底
  if (need === 0) return !!item.zeroMuted;
  const baseComplete = need > 0 && done >= need;

  const types =
    Array.isArray(filteredNeedTypes) && filteredNeedTypes.length > 0
      ? filteredNeedTypes
      : DEMAND_TYPES;

  //  只有在“献祭视角”下，星级才会阻止置底
  if (types.includes('献祭')) {
    return baseComplete && isDonationQualityComplete(item);
  }
  return baseComplete;
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

function splitTokens(raw) {
  const s = (raw || '').trim();
  if (!s) return [];
  return s
    .split(/[;、\/\s]+/)
    .map(x => x.trim())
    .filter(Boolean);
}

function getWaterTokens(item) {
  return splitTokens(item.water);
}
function getWeatherTokens(item) {
  return splitTokens(item.weather);
}

function isFishingItem(item) {
  const cats = getCategoryTokens(item);
  return cats.includes('钓鱼');
}

function getAllWaters() {
  const set = new Set();
  items.forEach(it => {
    if (!isFishingItem(it)) return;
    getWaterTokens(it).forEach(w => set.add(w));
  });
  return Array.from(set);
}

function getAllWeathers() {
  const set = new Set();
  items.forEach(it => {
    if (!isFishingItem(it)) return;
    getWeatherTokens(it).forEach(w => set.add(w));
  });
  return Array.from(set);
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

// =====================
// 混合献祭：模块状态（目前不存储，刷新清空）
// =====================

// 已生效的替换规则：[{ baseBundleId: 'p_spring_crops', replaceWithBundleId: 'xxx' }, ...]
// replaceWithBundleId 为空/'' 表示不替换（继续用基础包）
// { baseBundleId, replaceWithBundleId, pickedItemNames?: string[] }
let mixedDonationAppliedRules = [];


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

  const records = parseCSV(text).filter(r => (r.name || '').trim());

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
      water: record.water || '',
      weather: record.weather || '',
      done,
      zeroMuted: false,
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
  const needMap = new Map();   // 普通献祭需求（参与 needs['献祭']）
  const srcMap = new Map();
  const noteMap = new Map();

  const qNeedMap = new Map();  // 星级献祭需求（不参与求和）
  // itemName -> [{quality, count, groupName, bundleName}]

  if (typeof DONATION_BUNDLE_GROUPS === 'undefined') {
    donationSourcesByItem = new Map();
    donationNotesByItem = new Map();
    donationQualityNeedsByItem = new Map();
    return needMap;
  }

  // ========= 1) 先按“全部基础包”生成基础献祭需求 =========
  DONATION_BUNDLE_GROUPS.forEach(group => {
    (group.bundles || []).forEach(bundle => {
      (bundle.items || []).forEach(entry => {
        const name = (entry.name || '').trim();
        if (!name) return;

        const count = Number(entry.count || 0);

        // 星级字段：可选。缺省就当普通献祭
        const quality = (entry.quality || '').trim();
        const qCount = Number(entry.qCount || 0);

        // 普通需求：累加
        if (count > 0) {
          needMap.set(name, (needMap.get(name) || 0) + count);

          if (!srcMap.has(name)) srcMap.set(name, []);
          srcMap.get(name).push({
            groupName: group.name,
            bundleName: bundle.name,
            count
          });
        }

        // 星级需求：不进入 needMap，只记录到 qNeedMap
        if (quality) {
          if (!qNeedMap.has(name)) qNeedMap.set(name, []);
          qNeedMap.get(name).push({
            quality,
            count: qCount > 0 ? qCount : 0,
            groupName: group.name,
            bundleName: bundle.name
          });
        }
      });

      (bundle.notes || []).forEach(n => {
        const itemName = (n.item || '').trim();
        const text = (n.text || '').trim();
        if (!itemName || !text) return;

        if (!noteMap.has(itemName)) noteMap.set(itemName, []);
        noteMap.get(itemName).push(`【${group.name} / ${bundle.name}】${text}`);
      });
    });
  });

  // 先把“基础来源”写回全局（后面替换会继续增删它们）
  donationSourcesByItem = srcMap;
  donationNotesByItem = noteMap;
  donationQualityNeedsByItem = qNeedMap;

  // ========= 2) 再应用“混合献祭”替换规则（覆盖基础包贡献）=========
  const byId = indexDonationBundlesById();

  (mixedDonationAppliedRules || []).forEach(rule => {
    const baseId = (rule.baseBundleId || '').trim();
    const repId = (rule.replaceWithBundleId || '').trim();
    const picked = Array.isArray(rule.pickedItemNames) ? rule.pickedItemNames : [];

    if (!baseId) return;

    // replacement 为空：默认不替换；但如果“该基础包只有唯一混合包”，则自动用那个混合包
    let effectiveRepId = repId;
    if (!effectiveRepId) {
      const uniq = findUniqueRemixBundleForBase(baseId);
      if (uniq && uniq.id) effectiveRepId = uniq.id;
    }
    if (!effectiveRepId) return;

    const baseInfo = byId.get(baseId);
    const repInfo = byId.get(effectiveRepId);
    if (!baseInfo || !repInfo) return;

    // 生成 replacement 的最终 items（支持 needSlots 的多选）
    let repItemsOverride = null;

    const repBundle = repInfo.bundle;
    const needSlots = Number(repBundle.needSlots || 0);

    if (needSlots > 0) {
      const allItems = repBundle.items || [];

      if (picked.length > 0) {
        const pickedSet = new Set(picked);
        repItemsOverride = allItems
          .filter(it => pickedSet.has(it.name))
          .slice(0, needSlots);
      } else {
        // 只有一种可能且不想强制勾选：若候选 <= needSlots，则可直接确定；否则不替换（避免默默选错）
        if (allItems.length <= needSlots) {
          repItemsOverride = allItems.slice();
        } else {
          return;
        }
      }
    }

    // 1) 先减去基础包贡献
    applyBundleContribution(baseInfo, -1, needMap, srcMap, noteMap, qNeedMap);

    // 2) 再加上替换包贡献（可能使用 override items）
    applyBundleContribution(repInfo, +1, needMap, srcMap, noteMap, qNeedMap, repItemsOverride);
  });

  // 最后再写回全局（确保替换后的来源/星级需求同步）
  donationSourcesByItem = srcMap;
  donationNotesByItem = noteMap;
  donationQualityNeedsByItem = qNeedMap;

  return needMap;
}

function getBaseDonationBundleGroups() {
  return (typeof DONATION_BUNDLE_GROUPS !== 'undefined' && Array.isArray(DONATION_BUNDLE_GROUPS))
    ? DONATION_BUNDLE_GROUPS
    : [];
}

function getAllDonationBundleGroups() {
  const groups = [];
  if (typeof DONATION_BUNDLE_GROUPS !== 'undefined' && Array.isArray(DONATION_BUNDLE_GROUPS)) {
    groups.push(...DONATION_BUNDLE_GROUPS);
  }
  if (typeof REMIX_BUNDLE_DEFS !== 'undefined' && Array.isArray(REMIX_BUNDLE_DEFS)) {
    groups.push(...REMIX_BUNDLE_DEFS);
  }
  return groups;
}

function indexDonationBundlesById() {
  const map = new Map();
  const groups = getAllDonationBundleGroups();

  groups.forEach(group => {
    (group.bundles || []).forEach(bundle => {
      // 统一保证 group.name 存在
      const g = group.name ? group : { ...group, name: group.id || '（未命名分组）' };
      map.set(bundle.id, { group: g, bundle });
    });
  });

  return map;
}


function applyBundleContribution({ group, bundle }, op, needMap, srcMap, noteMap, qNeedMap, itemsOverride = null) {
  const itemsToUse = Array.isArray(itemsOverride) ? itemsOverride : (bundle.items || []);
  // op: +1 表示加，-1 表示减
  itemsToUse.forEach(entry => {
    const name = (entry.name || '').trim();
    if (!name) return;

    const count = Number(entry.count || 0);
    const quality = (entry.quality || '').trim();
    const qCount = Number(entry.qCount || 0);

    // 普通需求
    if (count > 0) {
      needMap.set(name, (needMap.get(name) || 0) + op * count);

      if (!srcMap.has(name)) srcMap.set(name, []);
      if (op > 0) {
        srcMap.get(name).push({ groupName: group.name, bundleName: bundle.name, count });
      } else {
        // 删除时：尽量删掉匹配的一条来源（简单实现：找第一条匹配并 splice）
        const arr = srcMap.get(name) || [];
        const i = arr.findIndex(s => s.groupName === group.name && s.bundleName === bundle.name && s.count === count);
        if (i >= 0) arr.splice(i, 1);
      }
    }

    // 星级需求（不计入普通求和）
    if (quality) {
      if (!qNeedMap.has(name)) qNeedMap.set(name, []);
      const arr = qNeedMap.get(name);

      const payload = {
        quality,
        count: qCount > 0 ? qCount : 0,
        groupName: group.name,
        bundleName: bundle.name,
      };

      if (op > 0) {
        arr.push(payload);
      } else {
        const i = arr.findIndex(x =>
          x.quality === payload.quality &&
          x.count === payload.count &&
          x.groupName === payload.groupName &&
          x.bundleName === payload.bundleName
        );
        if (i >= 0) arr.splice(i, 1);
      }
    }
  });

  // notes
  (bundle.notes || []).forEach(n => {
    const itemName = (n.item || '').trim();
    const text = (n.text || '').trim();
    if (!itemName || !text) return;

    const line = `【${group.name} / ${bundle.name}】${text}`;

    if (!noteMap.has(itemName)) noteMap.set(itemName, []);
    const arr = noteMap.get(itemName);

    if (op > 0) {
      arr.push(line);
    } else {
      const i = arr.indexOf(line);
      if (i >= 0) arr.splice(i, 1);
    }
  });
}


function computeQuestNeedsAndSources() {
  const needMap = new Map();
  const srcMap = new Map();
  const noteMap = new Map();

  if (typeof QUEST_GROUPS === 'undefined') {
    questSourcesByItem = new Map();
    questNotesByItem = new Map();
    return needMap;
  }

  QUEST_GROUPS.forEach(group => {
    (group.quests || []).forEach(quest => {
      if (!selectedQuestIds.has(quest.id)) return;

      (quest.items || []).forEach(entry => {
        const name = (entry.name || '').trim();
        const count = Number(entry.count || 0);
        if (!name || count <= 0) return;

        needMap.set(name, (needMap.get(name) || 0) + count);

        if (!srcMap.has(name)) srcMap.set(name, []);
        srcMap.get(name).push({
          groupName: group.name,
          questName: quest.name,
          count
        });
      });

      (quest.notes || []).forEach(n => {
        const itemName = (n.item || '').trim();
        const text = (n.text || '').trim();
        if (!itemName || !text) return;

        if (!noteMap.has(itemName)) noteMap.set(itemName, []);
        noteMap.get(itemName).push(`【${group.name} / ${quest.name}】${text}`);
      });
    });
  });

  questSourcesByItem = srcMap;
  questNotesByItem = noteMap;
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
  const waterGroup = document.getElementById('filter-water-group');
  const weatherGroup = document.getElementById('filter-weather-group');


  if (!seasonGroup || !categoryGroup || !needGroup) return;
  if (waterGroup) waterGroup.innerHTML = '';
  if (weatherGroup) weatherGroup.innerHTML = '';

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

  // ===== 钓鱼专属：水域/天气 =====
  if (waterGroup) {
    getAllWaters().forEach(w => {
      const label = document.createElement('label');
      label.className = 'checkbox-item';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = w;
      cb.checked = true;

      label.appendChild(cb);
      label.appendChild(document.createTextNode(w));
      waterGroup.appendChild(label);
    });
  }

  if (weatherGroup) {
    getAllWeathers().forEach(w => {
      const label = document.createElement('label');
      label.className = 'checkbox-item';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = w;
      cb.checked = true;

      label.appendChild(cb);
      label.appendChild(document.createTextNode(w));
      weatherGroup.appendChild(label);
    });
  }

  // ===== 给“钓鱼”后面挂：只看鱼类/返回 =====
  attachFishOnlyButton();

}

let fishOnlyViewActive = false;
let fishOnlyPrevState = null;

function setCheckboxGroupChecked(containerId, allowedValuesSetOrNull) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    if (!allowedValuesSetOrNull) {
      cb.checked = true;
      return;
    }
    cb.checked = allowedValuesSetOrNull.has(cb.value);
  });
}

function captureCurrentFilterState() {
  return {
    seasons: new Set(getCheckedValues('filter-season-group')),
    categories: new Set(getCheckedValues('filter-category-group')),
    needs: new Set(getCheckedValues('filter-need-group')),
    waters: new Set(getCheckedValues('filter-water-group')),
    weathers: new Set(getCheckedValues('filter-weather-group')),
  };
}

function restoreFilterState(state) {
  if (!state) return;
  setCheckboxGroupChecked('filter-season-group', state.seasons);
  setCheckboxGroupChecked('filter-category-group', state.categories);
  setCheckboxGroupChecked('filter-need-group', state.needs);
  setCheckboxGroupChecked('filter-water-group', state.waters);
  setCheckboxGroupChecked('filter-weather-group', state.weathers);
}

function updateFishBanner() {
  const banner = document.getElementById('fish-view-banner');
  if (!banner) return;
  banner.style.display = fishOnlyViewActive ? 'block' : 'none';
}

function enterFishOnlyView() {
  fishOnlyPrevState = captureCurrentFilterState();
  fishOnlyViewActive = true;

  // 仅保留“钓鱼”
  setCheckboxGroupChecked('filter-category-group', new Set(['钓鱼']));

  updateFishBanner();
  renderTable();
}

function exitFishOnlyView() {
  fishOnlyViewActive = false;
  restoreFilterState(fishOnlyPrevState);
  fishOnlyPrevState = null;

  updateFishBanner();
  renderTable();
}

function toggleFishOnlyView() {
  if (!fishOnlyViewActive) enterFishOnlyView();
  else exitFishOnlyView();
  attachFishOnlyButton(); // 更新按钮文案
}

function attachFishOnlyButton() {
  const group = document.getElementById('filter-category-group');
  if (!group) return;

  // 防止重复挂载：先删旧按钮
  group.querySelectorAll('button.fish-only-btn').forEach(b => b.remove());

  // 找到 value === '钓鱼' 的那一项，挂在 label 后面
  const fishingCb = Array.from(group.querySelectorAll('input[type="checkbox"]'))
    .find(cb => cb.value === '钓鱼');

  if (!fishingCb) return;

  const label = fishingCb.closest('label');
  if (!label) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'fish-only-btn';
  btn.textContent = fishOnlyViewActive ? '返回' : '只看鱼类';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFishOnlyView();
  });

  label.appendChild(btn);
}


// =============== 表头渲染 ===============

function renderHeaderTo(headerRowId, selectedNeedTypes, showTagColumn = true) {
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

/*  const actionTh = document.createElement('th');
  actionTh.textContent = '操作';
  headerRow.appendChild(actionTh);*/

  // 只有需要时才渲染“标记”
  if (showTagColumn) {
    const tagTh = document.createElement('th');
    tagTh.textContent = '标记';
    headerRow.appendChild(tagTh);
  }
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
  renderTableInto('items-tbody', 'table-header-row', normalItems, false);

  // 2) 隐藏表：只有展开时才渲染
  const hiddenWrap = document.getElementById('hidden-items-wrap');
  const isOpen = hiddenWrap && hiddenWrap.style.display !== 'none';
  if (isOpen) {
    renderTableInto('hidden-items-tbody', 'hidden-table-header-row', hiddenItems, true);
  }
}

function renderTableInto(tbodyId, headerRowId, list, showTagColumn = true) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = '';

  const selectedSeasons = getCheckedValues('filter-season-group');
  const selectedCategories = getCheckedValues('filter-category-group');
  const selectedNeedTypes = getCheckedValues('filter-need-group');
  const selectedWaters = getCheckedValues('filter-water-group');
  const selectedWeathers = getCheckedValues('filter-weather-group');


  // 画对应表头
  renderHeaderTo(headerRowId, selectedNeedTypes, showTagColumn);

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

    // ===== 钓鱼专属：水域/天气过滤（仅对“钓鱼”物品生效）=====
    if (isFishingItem(item)) {
      const waterTokens = getWaterTokens(item);
      if (selectedWaters.length > 0 && waterTokens.length > 0) {
        const ok = waterTokens.some(w => selectedWaters.includes(w));
        if (!ok) return false;
      }

      const weatherTokens = getWeatherTokens(item);
      if (selectedWeathers.length > 0 && weatherTokens.length > 0) {
        const ok = weatherTokens.some(w => selectedWeathers.includes(w));
        if (!ok) return false;
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

    // 总需求为0但被手动标记置底（鱼类图鉴用）
    const totalsNow = getTotalsForItem(item, selectedNeedTypes);
    if (totalsNow.need === 0 && item.zeroMuted) {
      tr.classList.add('row-zero-muted');
    }


    // 物品名
    const nameTd = document.createElement('td');
    nameTd.classList.add('item-name');
    nameTd.classList.add('col-item');

    const nameSpan = document.createElement('span');
    nameSpan.className = 'name-text';
    nameSpan.textContent = item.name;

    if (item.note) {
      const extra = customNotesByItem.get(item.name) || [];
      const hasAnyNote = Boolean(item.note) || (extra.length > 0);

      if (hasAnyNote) {
        nameTd.classList.add('has-note');
        bindTooltipInteractions(nameSpan, () => {
          const lines = [];

          if (item.note) lines.push(String(item.note));

          if (extra.length) {
            if (lines.length) lines.push('');
            lines.push('【自定义备注】');
            extra.forEach(t => lines.push(`- ${t}`));
          }

          return lines.join('\n');
        });
      }
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

      // ====== 需求格渲染（支持“献祭只有星级也显示”）======
      const qListForCell = (type === '献祭') ? (donationQualityNeedsByItem.get(item.name) || []) : [];
      const hasQualityNeed = qListForCell.length > 0;

      if (needNum <= 0 && !hasQualityNeed) {
        td.textContent = '-';
        td.classList.add('no-need');
      } else {
        td.textContent = '';
        td.classList.add('clickable');

        // 主行：普通需求 done/need（若普通为 0 且只有星级，可显示空）
        const mainLine = document.createElement('div');
        mainLine.className = 'cell-main';
        mainLine.textContent = needNum > 0 ? `${done}/${needNum}` : '';
        td.appendChild(mainLine);

        // ===== 献祭：星级行 =====
        let qualityCompleteForCell = true; // 用于控制“格子是否灰掉”
        if (type === '献祭' && hasQualityNeed) {
          // 聚合：quality -> totalNeed
          const needByQ = {};
          qListForCell.forEach(e => {
            const q = (e.quality || '').trim();
            const c = Number(e.count || 0);
            if (!q || c <= 0) return;
            needByQ[q] = (needByQ[q] || 0) + c;
          });

          const qualities = Object.keys(needByQ);

          if (!item.donationQDone) item.donationQDone = {};

          qualities.forEach(q => {
            const qNeed = needByQ[q];
            const qDoneRaw = Number(item.donationQDone[q] || 0);
            const qDone = Math.min(qDoneRaw, qNeed);

            const qLine = document.createElement('div');
            qLine.className = `cell-quality q-${q}`;
            qLine.textContent = `${qDone}/${qNeed}`;

            qLine.addEventListener('click', (ev) => {
              ev.stopPropagation();
              const cur = Number(item.donationQDone[q] || 0);
              item.donationQDone[q] = (cur < qNeed) ? (cur + 1) : 0;
              renderTable();
            });

            td.appendChild(qLine);
          });

          // 计算星级是否完成（用于格子灰掉逻辑）
          qualityCompleteForCell = qualities.every(q => Number(item.donationQDone[q] || 0) >= (needByQ[q] || 0));
        }

        // ===== 关键：决定这个格子要不要“灰掉/划掉” =====
        // 规则：普通完成 +（若有星级则星级也完成）才灰掉
        const normalCompleteForCell = (needNum > 0) ? (done >= needNum) : true; // 普通需求为0视为“无需普通”
        const cellComplete = (type === '献祭')
          ? (normalCompleteForCell && qualityCompleteForCell)
          : normalCompleteForCell;

        if (cellComplete) td.classList.add('need-done');
        else td.classList.remove('need-done');

        // 点击主格：只处理普通需求（needNum=0 时不绑定）
        if (needNum > 0) {
          td.addEventListener('click', () => {
            const currentDone = Number(item.done[type] || 0);

            // 单项需求 > 50：每次 +25；否则 +1
            const step = (needNum > 50) ? 25 : 1;

            // 仍然保持“点满后再点归零”的循环逻辑
            if (currentDone >= needNum) {
              item.done[type] = 0;
            } else {
              item.done[type] = Math.min(currentDone + step, needNum); // 不超上限
            }

            renderTable();
          });
        }
      }


      function buildSourcesTooltipText({
        title,
        sources,
        sourceLine,
        extraTitle,
        extraLines,
      }) {
        const lines = [];

        if (Array.isArray(sources) && sources.length) {
          if (title) lines.push(title);
          sources.forEach((s) => lines.push(sourceLine(s)));
        }

        if (Array.isArray(extraLines) && extraLines.length) {
          // 有来源时空一行更清晰；没来源时就不强行加空行
          if (lines.length) lines.push('');
          if (extraTitle) lines.push(extraTitle);
          extraLines.forEach((t) => lines.push(`- ${t}`));
        }

        return lines.length ? lines.join('\n') : '';
      }

      function attachCellInfoTooltip(tdEl, getText) {
        if (!tdEl) return;
        const text = typeof getText === 'function' ? getText() : getText;
        if (!text) return;

        const info = document.createElement('div');
        info.className = 'cell-info';
        bindTooltipInteractions(info, () => text);
        tdEl.appendChild(info);
      }

      // —— 在这里：根据不同需求列挂不同 tooltip ——

      // 献祭
      if (type === '献祭') {
        const tip = buildSourcesTooltipText({
          title: '来源（收集包）：',
          sources: donationSourcesByItem.get(item.name) || [],
          sourceLine: (s) => `- ${s.groupName} / ${s.bundleName} ×${s.count}`,
          extraTitle: '额外提醒：',
          extraLines: donationNotesByItem.get(item.name) || [],
        });
        attachCellInfoTooltip(td, tip);
      }

      // 任务
      if (type === '任务') {
        const tip = buildSourcesTooltipText({
          title: '来源（任务）：',
          sources: questSourcesByItem.get(item.name) || [],
          sourceLine: (s) => `- ${s.groupName} / ${s.questName} ×${s.count}`,
          extraTitle: '任务备注：',
          extraLines: questNotesByItem.get(item.name) || [],
        });
        attachCellInfoTooltip(td, tip);
      }
      tr.appendChild(td);
    });

    // 最爱列（按开关）
    const favToggle = document.getElementById('toggle-favorite');
    const showFavorite = !favToggle || favToggle.checked;
    if (showFavorite) {
      const favTd = document.createElement('td');
      favTd.textContent = item.favorite || '';
      favTd.classList.add('favorite-cell'); 
      tr.appendChild(favTd);
    }

    // 总需求列
    const { need, done } = getTotalsForItem(item, selectedNeedTypes);
    const totalTd = document.createElement('td');
    totalTd.classList.add('total-cell');

    if (need > 0) {
      totalTd.textContent = `${done}/${need}`;
    } else {
      // need === 0：显示 '-'，并允许点击把整行“灰掉置底”（fish 图鉴标记）
      totalTd.textContent = '-';
      totalTd.classList.add('clickable', 'no-need');

      // 让 '-' 也能提示“可点”
      totalTd.title = '点击可标记该物品为已收集（灰显置底）；再点一次取消';

      totalTd.addEventListener('click', (e) => {
        e.stopPropagation();
        item.zeroMuted = !item.zeroMuted;
        renderTable();
      });
    }

    tr.appendChild(totalTd);


    // 操作列：重置本行
    // const actionTd = document.createElement('td');
    // const resetBtn = document.createElement('button');
    // resetBtn.textContent = '重置本行';
    // resetBtn.className = 'row-reset-btn';
    // resetBtn.addEventListener('click', () => {
    //   DEMAND_TYPES.forEach(t => (item.done[t] = 0));
    //   item.donationQDone = {}; // 新增
    //   renderTable();
    // });
    // actionTd.appendChild(resetBtn);
    // tr.appendChild(actionTd);

    // 标记列（仅隐藏表渲染）：显示 x/y/z 对应 label（不卖/不留/无季节）
    if (showTagColumn) {
      const tagTd = document.createElement('td');
      const tags = item.tags || [];
      tagTd.textContent = tags.length
        ? tags.map(t => (ITEM_TAG_DEFS?.[t]?.label || t)).join(' / ')
        : '';
      tr.appendChild(tagTd);
    }

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
    item.donationQDone = {};
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


// =====================
// 混合献祭 UI：渲染/交互
// =====================

function getAllDonationBundlesFlat() {
  const groups = getBaseDonationBundleGroups();
  const all = [];

  groups.forEach(g => {
    (g.bundles || []).forEach(b => {
      all.push({
        id: b.id,
        name: b.name,
        mode: b.mode,
        groupName: g.name || g.id || '',
      });
    });
  });

  return all;
}

function findUniqueRemixBundleForBase(baseBundleId) {
  if (!baseBundleId) return null;

  const groups = (typeof REMIX_BUNDLE_DEFS !== 'undefined' && Array.isArray(REMIX_BUNDLE_DEFS))
    ? REMIX_BUNDLE_DEFS
    : [];

  const hits = [];

  groups.forEach(g => {
    (g.bundles || []).forEach(b => {
      let baseIds = [];
      if (Array.isArray(b.baseBundleIds)) {
        baseIds = b.baseBundleIds.map(x => (x || '').trim()).filter(Boolean);
      } else {
        const one = (b.baseBundleId || '').trim();
        if (one) baseIds = [one];
      }

      if (baseIds.includes(baseBundleId)) hits.push(b);
    });
  });

  return hits.length === 1 ? hits[0] : null;
}

function buildRemixOptionsByBaseId() {
  const byBase = new Map(); // baseId -> [{id,name,needSlots}]
  const groups = (typeof REMIX_BUNDLE_DEFS !== 'undefined' && Array.isArray(REMIX_BUNDLE_DEFS))
    ? REMIX_BUNDLE_DEFS
    : [];

  groups.forEach(g => {
    (g.bundles || []).forEach(b => {
      // 兼容：baseBundleId (string) 或 baseBundleIds (string[])
      let baseIds = [];

      if (Array.isArray(b.baseBundleIds)) {
        baseIds = b.baseBundleIds.map(x => (x || '').trim()).filter(Boolean);
      } else {
        const one = (b.baseBundleId || '').trim();
        if (one) baseIds = [one];
      }

      if (!baseIds.length) return;

      baseIds.forEach(baseId => {
        if (!byBase.has(baseId)) byBase.set(baseId, []);
        byBase.get(baseId).push({
          id: b.id,
          name: b.name || b.id,
          needSlots: Number(b.needSlots || 0),
        });
      });
    });
  });

  // 稳定排序：按名称
  byBase.forEach(list => list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh')));
  return byBase;
}



function renderMixedDonationPanel() {
  const root = document.getElementById('mixed-donation-panel');
  if (!root) return;

  root.innerHTML = '';

  const byId = indexDonationBundlesById();
  const remixByBase = buildRemixOptionsByBaseId();

  // eligible base bundles：只有存在 >=1 个候选混合包的基础包才进入第一下拉
  const allBase = getAllDonationBundlesFlat();
  const eligibleBases = allBase
    .filter(b => remixByBase.has(b.id) && (remixByBase.get(b.id) || []).length > 0)
    .sort((a, b) => `${a.groupName}/${a.name}`.localeCompare(`${b.groupName}/${b.name}`, 'zh'));

  if (!eligibleBases.length) {
    const empty = document.createElement('div');
    empty.className = 'mixed-empty';
    empty.textContent = '未检测到任何可替换的基础献祭包（REMIX_BUNDLE_DEFS 中没有 baseBundleId 映射）。';
    root.appendChild(empty);
    return;
  }

  // 没规则时提示
  if (!mixedDonationAppliedRules.length) {
    const empty = document.createElement('div');
    empty.className = 'mixed-empty';
    empty.textContent = '暂无替换规则（默认：全部使用基础献祭）。';
    root.appendChild(empty);
  }

  mixedDonationAppliedRules.forEach((rule, idx) => {
    const row = document.createElement('div');
    row.className = 'mixed-rule';

    // ===== base select（仅 eligible）=====
    const baseSel = document.createElement('select');
    eligibleBases.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = `${b.groupName} / ${b.name}`;
      baseSel.appendChild(opt);
    });

    // 默认值：已有 baseId 就用它，否则用第一个 eligible
    rule.baseBundleId = rule.baseBundleId || eligibleBases[0].id;
    baseSel.value = rule.baseBundleId;

    // ===== replacement select（只显示该 base 的候选 remixed bundles）=====
    const replaceSel = document.createElement('select');

    function fillReplaceOptionsForBase(baseId) {
      replaceSel.innerHTML = '';

      // 占位空值：不等于“沿用基础包选项”，只是“未选择”
      const optEmpty = document.createElement('option');
      optEmpty.value = '';
      optEmpty.textContent = '（未选择：沿用基础包）';
      replaceSel.appendChild(optEmpty);

      const options = remixByBase.get(baseId) || [];
      options.forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.id;
        opt.textContent = o.needSlots > 0 ? `${o.name}（需选${o.needSlots}）` : o.name;
        replaceSel.appendChild(opt);
      });

      // 若当前 rule 的 replacement 不属于该 base 的候选，则清空
      const validSet = new Set(options.map(o => o.id));
      if (!validSet.has(rule.replaceWithBundleId)) {
        rule.replaceWithBundleId = '';
        rule.pickedItemNames = [];
      }
      replaceSel.value = rule.replaceWithBundleId || '';
    }

    fillReplaceOptionsForBase(rule.baseBundleId);

    // ===== info 文案 =====
    const info = document.createElement('div');
    info.className = 'mixed-info';
    info.textContent = '确认生效后：选择的混合包会覆盖该基础包的献祭需求';

    // ===== 删除 =====
    const delBtn = document.createElement('button');
    delBtn.className = 'danger';
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', () => {
      mixedDonationAppliedRules.splice(idx, 1);
      renderMixedDonationPanel();
    });

    // ===== 事件：改 base 时刷新 replacement 列表 =====
    baseSel.addEventListener('change', () => {
      rule.baseBundleId = baseSel.value;
      rule.replaceWithBundleId = '';
      rule.pickedItemNames = [];
      fillReplaceOptionsForBase(rule.baseBundleId);
      renderMixedDonationPanel(); // 重新渲染以更新多选区
    });

    // ===== 事件：改 replacement 时清空多选并重渲染 =====
    replaceSel.addEventListener('change', () => {
      rule.replaceWithBundleId = replaceSel.value;
      rule.pickedItemNames = [];
      renderMixedDonationPanel(); // 重新渲染以显示/隐藏多选区
    });

    row.appendChild(baseSel);
    row.appendChild(replaceSel);
    row.appendChild(info);
    row.appendChild(delBtn);

    // ===== 多选区：仅当选中的 remixed bundle 有 needSlots 时显示 =====
    const repId = (rule.replaceWithBundleId || '').trim();
    if (repId) {
      const repInfo = byId.get(repId);
      const repBundle = repInfo?.bundle;
      const needSlots = Number(repBundle?.needSlots || 0);

      if (needSlots > 0) {
        row.appendChild(renderNeedSlotsPicker(repBundle, rule));
      }
    }

    root.appendChild(row);
  });
}

function renderNeedSlotsPicker(repBundle, rule) {
  const needSlots = Number(repBundle.needSlots || 0);
  const allItems = Array.isArray(repBundle.items) ? repBundle.items : [];

  const picked = new Set(Array.isArray(rule.pickedItemNames) ? rule.pickedItemNames : []);

  const wrap = document.createElement('div');
  wrap.className = 'mixed-pick';

  const title = document.createElement('div');
  title.className = 'mixed-pick-title';
  title.textContent = `该混合包需从候选中选择 ${needSlots} 个：`;
  wrap.appendChild(title);

  const list = document.createElement('div');
  list.className = 'mixed-pick-list';

  allItems.forEach(it => {
    const label = document.createElement('label');
    label.className = 'mixed-pick-item';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = picked.has(it.name);

    cb.addEventListener('change', () => {
      const cur = new Set(Array.isArray(rule.pickedItemNames) ? rule.pickedItemNames : []);

      if (cb.checked) cur.add(it.name);
      else cur.delete(it.name);

      // 超过 needSlots：撤回
      if (cur.size > needSlots) {
        cb.checked = false;
        return;
      }

      rule.pickedItemNames = Array.from(cur);
      // 不强制重渲染：选择过程不闪烁；确认生效时会统一重算
    });

    label.appendChild(cb);

    const text = document.createElement('span');
    text.className = 'mixed-pick-text';
    text.textContent = `${it.name}${Number(it.count || 0) > 0 ? ` ×${it.count}` : ''}`;

    label.appendChild(text);
    list.appendChild(label);
  });

  wrap.appendChild(list);

  const foot = document.createElement('div');
  foot.className = 'mixed-pick-foot';
  foot.textContent = `已选：${picked.size}/${needSlots}`;
  wrap.appendChild(foot);

  return wrap;
}


function setupMixedDonationPanelEvents() {
  const btnAdd = document.getElementById('mixed-donation-add-rule');
  const btnApply = document.getElementById('mixed-donation-apply');
  const details = document.getElementById('mixed-donation-details');

  if (btnAdd) {
    btnAdd.addEventListener('click', () => {
      mixedDonationAppliedRules.push({ baseBundleId: '', replaceWithBundleId: '' });
      renderMixedDonationPanel();
    });
  }

  if (btnApply) {
    btnApply.addEventListener('click', () => {
      // 过滤掉 baseBundleId 为空的空规则
      mixedDonationAppliedRules = mixedDonationAppliedRules
        .map(r => ({
          baseBundleId: (r.baseBundleId || '').trim(),
          replaceWithBundleId: (r.replaceWithBundleId || '').trim(),
          pickedItemNames: Array.isArray(r.pickedItemNames) ? r.pickedItemNames.slice() : [],
        }))
        .filter(r => r.baseBundleId);


      // 触发重算 + 重新渲染
      recomputeDynamicNeeds();
      renderTable();

      // 自动折叠回去
      if (details) details.open = false;
    });
  }
}

/**
 * 渲染任务选择面板（两层：分类 -> 任务）
 * checkbox 只改 pendingQuestIds，不触发重算 
 */

function renderQuestPanel() {
  const root = document.getElementById('quest-panel');
  if (!root) return;

  root.innerHTML = '';

  if (typeof QUEST_GROUPS === 'undefined' || !Array.isArray(QUEST_GROUPS) || QUEST_GROUPS.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'mixed-empty';
    empty.textContent = '未检测到任何任务数据（QUEST_GROUPS 为空）。';
    root.appendChild(empty);
    return;
  }

  QUEST_GROUPS.forEach(group => {
    const block = document.createElement('div');
    block.className = 'quest-group';

    const title = document.createElement('div');
    title.className = 'quest-group-title';
    title.textContent = group.name || group.id || '未命名分类';
    block.appendChild(title);

    const list = document.createElement('div');
    list.className = 'quest-list';

    (group.quests || []).forEach(quest => {
      const row = document.createElement('label');
      row.className = 'quest-item';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.questId = quest.id;

      cb.checked = pendingQuestIds.has(quest.id);

      cb.addEventListener('change', () => {
        if (cb.checked) pendingQuestIds.add(quest.id);
        else pendingQuestIds.delete(quest.id);
      });

      const span = document.createElement('span');
      span.textContent = quest.name || quest.id || '未命名任务';

      row.appendChild(cb);
      row.appendChild(span);
      list.appendChild(row);
    });

    block.appendChild(list);
    root.appendChild(block);
  });
}

function syncQuestCheckboxesFromPending() {
  document
    .querySelectorAll('input[type="checkbox"][data-quest-id]')
    .forEach(cb => {
      cb.checked = pendingQuestIds.has(cb.dataset.questId);
    });
}

/**
 * 任务面板按钮：只改 pending；点“确认生效”才写入 selectedQuestIds 并重算/重绘
 */
function setupQuestPanelEvents() {
  const qNone = document.getElementById('quest-select-none');
  const qAll = document.getElementById('quest-select-all');
  const qApply = document.getElementById('quest-apply');
  const details = document.getElementById('quest-details');

  if (qNone) {
    qNone.addEventListener('click', () => {
      pendingQuestIds = new Set();
      syncQuestCheckboxesFromPending();
    });
  }

  if (qAll) {
    qAll.addEventListener('click', () => {
      pendingQuestIds = getDefaultSelectedQuestIds(); // 你已有
      syncQuestCheckboxesFromPending();
    });
  }

  if (qApply) {
    qApply.addEventListener('click', () => {
      //确认：pending -> selected
      selectedQuestIds = new Set(pendingQuestIds);

      //生效后重算/重绘
      recomputeDynamicNeeds();
      renderTable();

      //折叠面板
      if (details) details.open = false;
    });
  }
}



function syncQuestCheckboxesFromPending() {
  document.querySelectorAll('input[type="checkbox"][data-quest-id]').forEach(cb => {
    cb.checked = pendingQuestIds.has(cb.dataset.questId);
  });
}

function setupQuestPanelEvents() {
  const qNone = document.getElementById('quest-select-none');
  const qAll = document.getElementById('quest-select-all');
  const qApply = document.getElementById('quest-apply');
  const details = document.getElementById('quest-details');

  if (qNone) qNone.addEventListener('click', () => {
    pendingQuestIds = new Set();
    syncQuestCheckboxesFromPending();
  });

  if (qAll) qAll.addEventListener('click', () => {
    pendingQuestIds = getDefaultSelectedQuestIds();
    syncQuestCheckboxesFromPending();
  });

  if (qApply) qApply.addEventListener('click', () => {
    selectedQuestIds = new Set(pendingQuestIds);
    recomputeDynamicNeeds();
    renderTable();
    if (details) details.open = false;
  });
}

function ensureDemandTypeExists(typeName) {
  const t = (typeName || '').trim();
  if (!t) return false;

  if (!DEMAND_TYPES.includes(t)) {
    DEMAND_TYPES.push(t); // const 数组允许 push
  }
  if (!customDemandTypes.includes(t) && t !== '献祭' && t !== '任务') {
    customDemandTypes.push(t);
  }

  // 给所有 item 补齐字段
  items.forEach(it => {
    if (!it.needs) it.needs = {};
    if (!it.baseNeeds) it.baseNeeds = {};
    if (!it.done) it.done = {};

    if (typeof it.needs[t] === 'undefined') it.needs[t] = 0;
    if (typeof it.baseNeeds[t] === 'undefined') it.baseNeeds[t] = 0;
    if (typeof it.done[t] === 'undefined') it.done[t] = 0;
  });

  return true;
}

function ensureItemExistsByName(itemName) {
  const name = (itemName || '').trim();
  if (!name) return null;

  let it = items.find(x => (x.name || '').trim() === name);
  if (it) return it;

  // 创建临时物品（刷新消失，后续可接 cookie）
  const needs = {};
  const baseNeeds = {};
  const done = {};
  DEMAND_TYPES.forEach(tp => {
    needs[tp] = 0;
    baseNeeds[tp] = 0;
    done[tp] = 0;
  });

  it = {
    id: 'tmp_' + Date.now() + '_' + Math.random().toString(16).slice(2),
    name,
    season: '',
    category: '',
    favorite: '',
    remark: '',
    tags: [],
    needs,
    baseNeeds,
    note: '',
    noteParams: null,
    done,
  };

  items.push(it);
  return it;
}

function addCustomNote(itemName, text) {
  const name = (itemName || '').trim();
  const t = (text || '').trim();
  if (!name || !t) return;

  if (!customNotesByItem.has(name)) customNotesByItem.set(name, []);
  customNotesByItem.get(name).push(t);
}

function renderCustomDemandPanel() {
  const root = document.getElementById('custom-demand-panel');
  if (!root) return;

  const rowsEl = document.getElementById('custom-demand-rows');
  const addRowBtn = document.getElementById('custom-demand-add-row');
  const applyBtn = document.getElementById('custom-demand-apply');
  const addTypeBtn = document.getElementById('custom-demand-type-add');
  const typeNameInput = document.getElementById('custom-demand-type-name');
  const detailsEl = document.getElementById('custom-demand-details');

  function buildTypeOptionsHtml() {
    if (!customDemandTypes.length) {
      return `<option value="">（请先添加需求列）</option>`;
    }
    return [
      `<option value="">选择需求列…</option>`,
      ...customDemandTypes.map(t => `<option value="${t}">${t}</option>`)
    ].join('');
  }

  function addRow(prefill = {}) {
    if (!rowsEl) return;

    const row = document.createElement('div');
    row.className = 'custom-demand-row';

    row.innerHTML = `
      <select class="custom-demand-type">
        ${buildTypeOptionsHtml()}
      </select>
      <input class="custom-demand-item" type="text" placeholder="物品名（允许新物品）" />
      <input class="custom-demand-count" type="number" min="1" step="1" placeholder="数量" />
      <input class="custom-demand-note" type="text" placeholder="备注（可选）" />
      <button class="btn-del" type="button">删除</button>
    `;

    const sel = row.querySelector('.custom-demand-type');
    const itemInput = row.querySelector('.custom-demand-item');
    const countInput = row.querySelector('.custom-demand-count');
    const noteInput = row.querySelector('.custom-demand-note');
    const delBtn = row.querySelector('.btn-del');

    if (sel && prefill.type) sel.value = prefill.type;
    if (itemInput && prefill.item) itemInput.value = prefill.item;
    if (countInput && prefill.count) countInput.value = String(prefill.count);
    if (noteInput && prefill.note) noteInput.value = prefill.note;

    if (delBtn) delBtn.addEventListener('click', () => row.remove());

    rowsEl.appendChild(row);
  }

  function refreshAllTypeSelects() {
    if (!rowsEl) return;
    rowsEl.querySelectorAll('select.custom-demand-type').forEach(sel => {
      const prev = sel.value;
      sel.innerHTML = buildTypeOptionsHtml();
      // 尝试保留原选择
      if (customDemandTypes.includes(prev)) sel.value = prev;
    });
  }

  // 绑定：新增需求列
  if (addTypeBtn && typeNameInput) {
    addTypeBtn.onclick = () => {
      const t = (typeNameInput.value || '').trim();
      if (!t) return;

      ensureDemandTypeExists(t);

      // 新增列后：刷新筛选区 + 所有下拉
      renderFilterOptions();
      refreshAllTypeSelects();
      renderTable();

      typeNameInput.value = '';
    };
  }

  // 绑定：加一行
  if (addRowBtn) {
    addRowBtn.onclick = () => addRow();
  }

  // 绑定：确认生效
  if (applyBtn) {
    applyBtn.onclick = () => {
      if (!rowsEl) return;

      const rows = Array.from(rowsEl.querySelectorAll('.custom-demand-row'));
      rows.forEach(r => {
        const type = (r.querySelector('.custom-demand-type')?.value || '').trim();
        const itemName = (r.querySelector('.custom-demand-item')?.value || '').trim();
        const countRaw = r.querySelector('.custom-demand-count')?.value;
        const note = (r.querySelector('.custom-demand-note')?.value || '').trim();

        const count = Number(countRaw || 0);

        if (!type || !itemName || !Number.isFinite(count) || count <= 0) return;

        ensureDemandTypeExists(type);

        const it = ensureItemExistsByName(itemName);
        if (!it) return;

        // 写入“基础需求”，让它在 recomputeDynamicNeeds 后仍保留
        it.baseNeeds[type] = Number(it.baseNeeds[type] || 0) + count;
        it.needs[type] = Number(it.needs[type] || 0) + count;

        if (note) {
          addCustomNote(it.name, `【${type}】${note}`);
        }
      });

      // 重算（把献祭/任务动态部分重新叠上去），并刷新 UI
      recomputeDynamicNeeds();
      renderFilterOptions();
      renderTable();

      // 自动折叠
      if (detailsEl) detailsEl.open = false;
    };
  }

  // 初始化：至少给一行
  if (rowsEl && rowsEl.children.length === 0) addRow();
}


function setupEvents() {
  const resetBtn = document.getElementById('reset-all-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetAllProgress);
  }

  ['filter-season-group', 'filter-category-group', 'filter-need-group', 'filter-water-group', 'filter-weather-group'].forEach(
.forEach(
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


  // 任务面板全局按钮
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
  selectedQuestIds = getDefaultSelectedQuestIds();
  pendingQuestIds = new Set(selectedQuestIds);

  // 先算一遍动态需求
  recomputeDynamicNeeds();

  // 渲染面板
  renderQuestPanel();
  setupQuestPanelEvents();
  renderMixedDonationPanel();
  setupMixedDonationPanelEvents();
  renderCustomDemandPanel();

  // 原有 UI
  renderFilterOptions();
  setupEvents();
  renderTable();
  renderGlobalNotes();
});
