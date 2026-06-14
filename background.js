/**
 * Steam-Epic Badge - Background Service Worker
 *
 * 职责：
 * 1. 加载本地 epic_history.json 历史赠送数据
 * 2. 从 Epic 官方 API 获取当前免费游戏
 * 3. 使用 chrome.storage.local 缓存所有数据
 * 4. 监听 content.js 消息，提供查询接口
 * 5. 使用 chrome.alarms 定时刷新 API 数据
 */

// ============================================================
// 常量定义
// ============================================================

/** Epic 免费游戏促销 API */
const EPIC_API_URL =
  'https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US';

/** 本地历史数据路径（相对于扩展根目录） */
const LOCAL_HISTORY_PATH = 'data/epic_history.json';

/** chrome.storage.local 缓存键 */
const STORAGE_KEY_HISTORY = 'epic_history';       // 本地历史数据
const STORAGE_KEY_CURRENT = 'epic_current_free';  // API 当前免费游戏
const STORAGE_KEY_LAST_FETCH = 'epic_last_fetch'; // 上次 API 拉取时间戳

/** 定时刷新闹钟名称 */
const ALARM_NAME = 'refresh-epic-free-games';

/** 刷新间隔（分钟） */
const REFRESH_INTERVAL_MINUTES = 60;

/** 存储键：上次已知的免费游戏列表（用于检测新游戏） */
const STORAGE_KEY_LAST_KNOWN = 'epic_last_known_free';

/** 存储键：即将赠送的游戏 */
const STORAGE_KEY_UPCOMING = 'epic_upcoming_free';

// ============================================================
// L1 内存索引 — O(1) 查找替代 O(n) 线性搜索
// ============================================================

/** @type {Map<string, object>} steam_appid -> game */
const _indexBySteamAppId = new Map();
/** @type {Map<string, object>} epic_id (lowercase) -> game */
const _indexByEpicId = new Map();
/** @type {Map<string, object>} offerId (lowercase) -> game */
const _indexByOfferId = new Map();

/**
 * 从游戏数组构建内存索引
 * @param {Array} games
 */
function buildIndex(games) {
  _indexBySteamAppId.clear();
  _indexByEpicId.clear();
  _indexByOfferId.clear();
  for (const game of games) {
    if (game.steam_appid) {
      _indexBySteamAppId.set(String(game.steam_appid), game);
    }
    if (game.epic_id) {
      _indexByEpicId.set(String(game.epic_id).toLowerCase(), game);
    }
    if (game.offerId) {
      _indexByOfferId.set(String(game.offerId).toLowerCase(), game);
    }
  }
  log('log', `内存索引构建完成: ${_indexBySteamAppId.size} 条 steam_appid, ${_indexByEpicId.size} 条 epic_id`);
}

/**
 * 通过 AppID 从内存索引查找游戏（O(1)）
 * 支持 steam_appid、epic_id、offerId 三种 ID
 * @param {string} appId
 * @returns {object|null} 匹配的游戏对象或 null
 */
function lookupByAppId(appId) {
  const id = String(appId).trim();
  const lowerId = id.toLowerCase();
  return _indexBySteamAppId.get(id)
    || _indexByEpicId.get(lowerId)
    || _indexByOfferId.get(lowerId)
    || null;
}

/**
 * 通过名称模糊匹配从内存索引查找游戏
 * @param {string} name
 * @returns {object|null}
 */
function lookupByName(name) {
  if (!name) return null;
  const lowerName = name.toLowerCase();
  // 先精确匹配
  for (const game of _indexByEpicId.values()) {
    if (game.title && game.title.toLowerCase() === lowerName) return game;
  }
  // 再模糊匹配
  for (const game of _indexByEpicId.values()) {
    if (game.title && fuzzyMatch(game.title, name)) return game;
  }
  return null;
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 统一日志输出，带 [EpicBadge] 前缀方便过滤
 * @param {'log'|'warn'|'error'} level
 * @param  {...any} args
 */
function log(level, ...args) {
  const prefix = '[EpicBadge]';
  if (level === 'error') {
    console.error(prefix, ...args);
  } else if (level === 'warn') {
    console.warn(prefix, ...args);
  } else {
    console.log(prefix, ...args);
  }
}

/**
 * 将数据写入 chrome.storage.local
 * @param {string} key
 * @param {*} value
 * @returns {Promise<void>}
 */
async function setStorage(key, value) {
  return chrome.storage.local.set({ [key]: value });
}

/**
 * 从 chrome.storage.local 读取数据
 * @param {string} key
 * @returns {Promise<*>}
 */
async function getStorage(key) {
  const result = await chrome.storage.local.get(key);
  return result[key];
}

/**
 * 字符串相似度比较（简易版，用于模糊匹配游戏名）
 * 将两个字符串都转为小写，检查短的那个是否是长的那个的子串
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
function normalizeName(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[^\w\s\u4e00-\u9fff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 计算编辑距离（Levenshtein Distance）
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * 智能游戏名称匹配（多层策略）
 * 1. 标准化后精确匹配
 * 2. 包含匹配（短串 >= 长串 50%）
 * 3. 编辑距离匹配（距离 <=3 且 <=30% 总长）
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function fuzzyMatch(a, b) {
  if (!a || !b) return false;
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  // 1. 精确匹配
  if (na === nb) return true;
  // 2. 包含匹配
  const longer = na.length > nb.length ? na : nb;
  const shorter = na.length > nb.length ? nb : na;
  if (longer.includes(shorter) && shorter.length >= longer.length * 0.5) return true;
  // 3. 编辑距离匹配
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return dist <= 3 && dist <= maxLen * 0.3;
}

// ============================================================
// 数据加载
// ============================================================

/**
 * 从扩展包内加载 data/epic_history.json
 * Service Worker 中无法直接用相对路径，需要 chrome.runtime.getURL
 * @returns {Promise<Object>} { games: [...], last_updated: "..." }
 */
async function loadLocalHistory() {
  try {
    const url = chrome.runtime.getURL(LOCAL_HISTORY_PATH);
    log('log', '加载本地历史数据:', url);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`加载本地数据失败: HTTP ${response.status}`);
    }
    const data = await response.json();
    log('log', `本地历史数据加载完成，共 ${data.games?.length ?? 0} 条记录`);
    return data;
  } catch (err) {
    log('error', '加载本地历史数据异常:', err);
    return { games: [], last_updated: null };
  }
}

/**
 * 从 Epic 官方 API 获取当前免费游戏信息
 * @returns {Promise<Array>} 当前免费游戏列表
 */
async function fetchCurrentFreeGames() {
  try {
    log('log', '正在请求 Epic 免费游戏 API...');
    const response = await fetch(EPIC_API_URL, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Epic API 返回 HTTP ${response.status}`);
    }

    const data = await response.json();
    const elements = data?.data?.Catalog?.searchStore?.elements ?? [];
    log('log', `Epic API 返回 ${elements.length} 个游戏条目`);

    // 筛选出有免费促销信息的游戏
    const freeGames = [];

    for (const elem of elements) {
      const title = elem.title;
      const effectiveDate = elem.effectiveDate; // Unix 时间戳字符串（秒）

      // 检查 promotions 字段
      const promotions = elem.promotions;
      if (!promotions) continue;

      // 当前有效的促销
      const currentPromos = promotions.promotionalOffers ?? [];
      // 即将开始的促销
      const upcomingPromos = promotions.upcomingPromotionalOffers ?? [];

      // 查找免费促销（折扣价格为 0）
      const allPromos = [...currentPromos, ...upcomingPromos];
      let freeInfo = null;

      for (const promoGroup of allPromos) {
        for (const offer of promoGroup.promotionalOffers ?? []) {
          if (offer.discountSetting?.discountPercentage === 0) {
            freeInfo = {
              start: offer.startDate,
              end: offer.endDate,
            };
            break;
          }
        }
        if (freeInfo) break;
      }

      if (!freeInfo && !isCurrentlyFree(elem)) {
        continue;
      }

      // 提取游戏信息
      const gameInfo = {
        title: title,
        epic_id: elem.productSlug || elem.offerId || '',
        steam_appid: null, // Epic API 不直接提供 Steam AppID，需通过本地数据匹配
        free_dates: freeInfo
          ? [{ start: freeInfo.start, end: freeInfo.end, type: 'giveaway' }]
          : [],
        image: extractImageUrl(elem),
        // 额外存储当前促销状态
        isCurrentlyFree: true,
        description: elem.description || '',
        offerId: elem.offerId || '',
      };

      freeGames.push(gameInfo);
    }

    log('log', `筛选出 ${freeGames.length} 款免费游戏`);
    return freeGames;
  } catch (err) {
    log('error', '请求 Epic API 异常:', err);
    return [];
  }
}

/**
 * 判断游戏元素是否当前免费（价格为 0）
 * @param {Object} elem
 * @returns {boolean}
 */
function isCurrentlyFree(elem) {
  const price = elem.price;
  if (!price) return false;
  const totalPrice = price.totalPrice;
  if (!totalPrice) return false;
  return totalPrice.discountPrice === 0 && totalPrice.originalPrice > 0;
}


/**
 * 从游戏元素中提取封面图 URL
 * @param {Object} elem
 * @returns {string|null}
 */
function extractImageUrl(elem) {
  // 优先使用 DieselStoreFrontWide 图片（横幅）
  const keyImages = elem.keyImages ?? [];
  for (const img of keyImages) {
    if (img.type === 'DieselStoreFrontWide' || img.type === 'OfferImageWide') {
      return img.url;
    }
  }
  // 回退到第一张图片
  if (keyImages.length > 0) {
    return keyImages[0].url;
  }
  return null;
}

// ============================================================
// 数据同步与缓存
// ============================================================

/**
 * 初始化：加载本地数据并缓存到 chrome.storage.local
 * 同时触发一次 API 刷新
 */
async function initializeData() {
  log('log', '=== 初始化数据 ===');

  // 1. 加载本地历史数据
  const historyData = await loadLocalHistory();
  await setStorage(STORAGE_KEY_HISTORY, historyData);
  log('log', `本地历史数据已缓存: ${historyData.games.length} 条`);

  // 2. 拉取 Epic API 当前免费游戏
  await refreshCurrentFreeGames();

  // 3. 构建内存索引
  await rebuildIndex();

  log('log', '=== 初始化完成 ===');
}

/**
 * 从 storage 读取数据并重建内存索引
 * 在初始化和数据刷新后调用
 */
async function rebuildIndex() {
  const historyData = (await getStorage(STORAGE_KEY_HISTORY)) || { games: [] };
  const currentFree = (await getStorage(STORAGE_KEY_CURRENT)) || [];
  // 合并历史和当前免费游戏，当前免费的标记 isCurrentlyFree
  const allGames = [
    ...historyData.games,
    ...currentFree.map(g => ({ ...g, isCurrentlyFree: true })),
  ];
  buildIndex(allGames);
}

/**
 * 刷新当前免费游戏数据并更新缓存
 * 同时检测新游戏并发送通知
 */
async function refreshCurrentFreeGames() {
  log('log', '开始刷新 Epic 当前免费游戏...');

  const currentFree = await fetchCurrentFreeGames();
  await setStorage(STORAGE_KEY_CURRENT, currentFree);
  await setStorage(STORAGE_KEY_LAST_FETCH, Date.now());

  // 检测新赠送的游戏
  await detectAndNotifyNewGames(currentFree);

  // 自动将当前免费游戏添加到历史记录
  await addCurrentToHistory(currentFree);

  // 重建内存索引
  await rebuildIndex();

  log('log', `当前免费游戏数据已更新: ${currentFree.length} 款`);
}

/**
 * 检测新赠送的游戏并发送通知
 * @param {Array} currentFree - 当前免费游戏列表
 */
async function detectAndNotifyNewGames(currentFree) {
  const lastKnown = (await getStorage(STORAGE_KEY_LAST_KNOWN)) || [];

  // 找出新游戏（在 currentFree 中但不在 lastKnown 中）
  const lastKnownTitles = new Set(lastKnown.map(g => g.title));
  const newGames = currentFree.filter(g => !lastKnownTitles.has(g.title));

  if (newGames.length > 0) {
    log('log', `发现 ${newGames.length} 款新免费游戏:`, newGames.map(g => g.title));

    // 更新已知列表
    await setStorage(STORAGE_KEY_LAST_KNOWN, currentFree);

    // 发送通知
    sendNewFreeGamesNotification(newGames);
  } else {
    // 更新已知列表
    await setStorage(STORAGE_KEY_LAST_KNOWN, currentFree);
  }
}

/**
 * 发送新免费游戏通知
 * @param {Array} newGames - 新免费游戏列表
 */
function sendNewFreeGamesNotification(newGames) {
  if (!chrome.notifications) return;

  const titles = newGames.map(g => g.title).join('、');
  const message = newGames.length === 1
    ? `${titles} 现在可以在 Epic Games 免费领取！`
    : `${newGames.length} 款新游戏可以免费领取：${titles}`;

  chrome.notifications.create('epic-new-free-games', {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: '🎮 Epic 新免费游戏！',
    message: message,
    priority: 2,
    requireInteraction: true,
  }, (notificationId) => {
    if (chrome.runtime.lastError) {
      log('error', '通知发送失败:', chrome.runtime.lastError.message);
    } else {
      log('log', '通知已发送:', notificationId);
    }
  });
}

/**
 * 将当前免费游戏自动添加到历史记录
 * @param {Array} currentFree - 当前免费游戏列表
 */
async function addCurrentToHistory(currentFree) {
  if (!currentFree || currentFree.length === 0) return;

  const historyData = (await getStorage(STORAGE_KEY_HISTORY)) || { games: [], last_updated: null };
  const existingTitles = new Set(historyData.games.map(g => g.title));

  let addedCount = 0;

  for (const game of currentFree) {
    if (!existingTitles.has(game.title) && game.free_dates && game.free_dates.length > 0) {
      // 添加到历史记录
      historyData.games.push({
        title: game.title,
        epic_id: game.epic_id || game.title.toLowerCase().replace(/\s+/g, '-'),
        steam_appid: game.steam_appid || null,
        free_dates: game.free_dates,
        image: game.image || null,
      });
      addedCount++;
    }
  }

  if (addedCount > 0) {
    historyData.last_updated = new Date().toISOString().split('T')[0];
    await setStorage(STORAGE_KEY_HISTORY, historyData);
    log('log', `已将 ${addedCount} 款新游戏添加到历史记录`);
  }
}

// ============================================================
// 查询接口
// ============================================================

/** 未匹配时的空结果 */
const EMPTY_RESULT = { isFree: false, freeDates: [], source: null, details: null };

/**
 * 从游戏对象构建统一的查询结果
 * @param {object} game - 游戏数据
 * @param {boolean} [isCurrentlyFree=false] - 是否当前免费
 * @returns {object} 标准查询结果
 */
function _buildResult(game, isCurrentlyFree = false) {
  return {
    isFree: true,
    freeDates: game.free_dates.map(d => ({ start: d.start, end: d.end })),
    source: 'epic',
    details: {
      title: game.title,
      epic_id: game.epic_id,
      steam_appid: game.steam_appid,
      image: game.image,
      ...(isCurrentlyFree && { isCurrentlyFree: true }),
    },
  };
}


/**
 * 根据游戏名称查询是否为 Epic 赠送游戏
 * @param {string} gameName 游戏名称
 * @returns {Promise<Object>}
 */
function queryByGameName(gameName) {
  if (!gameName) return Promise.resolve(EMPTY_RESULT);
  const match = lookupByName(gameName.trim());
  return Promise.resolve(match ? _buildResult(match, match.isCurrentlyFree === true) : EMPTY_RESULT);
}

/**
 * 根据 Epic ID 或 Steam AppID 查询
 * @param {string|number} appId
 * @returns {Promise<Object>}
 */
function queryByAppId(appId) {
  if (!appId && appId !== 0) return Promise.resolve(EMPTY_RESULT);
  const match = lookupByAppId(appId);
  return Promise.resolve(match ? _buildResult(match, match.isCurrentlyFree === true) : EMPTY_RESULT);
}

/**
 * 批量查询 — 使用内存索引 O(1) 查找，无需每次读 storage
 * @param {Array<number|string>} appIds
 * @returns {Promise<Object>} { [appId]: result }
 */
async function queryBatchByAppIds(appIds) {
  const data = {};
  for (const appId of appIds) {
    const game = lookupByAppId(appId);
    data[appId] = game ? _buildResult(game, game.isCurrentlyFree === true) : EMPTY_RESULT;
  }
  return data;
}

// ============================================================
// 消息监听（与 content.js 通信）
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action, payload } = message;
  log('log', `收到消息: action=${action}`, payload);

  switch (action) {
    // ---- 按 AppID 批量查询（content.js 使用） ----
    case 'queryBatchByIds': {
      const { appIds } = payload || {};
      if (!Array.isArray(appIds)) {
        sendResponse({ success: false, error: 'appIds must be an array' });
        return false;
      }
      queryBatchByAppIds(appIds).then(data => {
        sendResponse({ success: true, data });
      }).catch(err => {
        log('error', 'queryBatchByIds 失败:', err);
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }

    // ---- 按名称/ID 批量查询 ----
    case 'queryBatch': {
      const { games } = payload || {};
      if (!Array.isArray(games)) {
        sendResponse({ results: [] });
        return false;
      }

      (async () => {
        const results = games.map(item => {
          const name = typeof item === 'string' ? item : item.gameName;
          const id = item.appId;
          if (name) {
            const match = lookupByName(name);
            return match ? _buildResult(match, true) : EMPTY_RESULT;
          }
          if (id) {
            const match = lookupByAppId(id);
            return match ? _buildResult(match, true) : EMPTY_RESULT;
          }
          return EMPTY_RESULT;
        });
        sendResponse({ results });
      })();

      return true;
    }

    // ---- 获取所有缓存数据（调试用） ----
    case 'getAllData': {
      (async () => {
        const history = (await getStorage(STORAGE_KEY_HISTORY)) || { games: [] };
        const current = (await getStorage(STORAGE_KEY_CURRENT)) || [];
        const lastFetch = (await getStorage(STORAGE_KEY_LAST_FETCH)) || null;
        sendResponse({
          historyCount: history.games.length,
          currentFreeCount: current.length,
          lastFetch: lastFetch ? new Date(lastFetch).toISOString() : null,
        });
      })();
      return true;
    }

    // ---- 手动触发刷新 ----
    case 'refresh': {
      refreshCurrentFreeGames().then(() => {
        sendResponse({ success: true });
      }).catch(err => {
        log('error', '手动刷新失败:', err);
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }

    // ---- 获取当前免费游戏列表 ----
    case 'getCurrentFree': {
      getStorage(STORAGE_KEY_CURRENT).then(data => {
        sendResponse({ games: data || [] });
      });
      return true;
    }

    // ---- 获取历史数据 ----
    case 'getHistory': {
      getStorage(STORAGE_KEY_HISTORY).then(data => {
        sendResponse({ games: data?.games || [] });
      });
      return true;
    }

    default:
      log('warn', `未知 action: ${action}`);
      sendResponse({ error: 'unknown action' });
      return false;
  }
});

// ============================================================
// 安装与启动事件
// ============================================================

/**
 * Service Worker 唤醒时重建内存索引
 * SW 可能被 Chrome 终止后重启，内存索引会丢失
 */
chrome.runtime.onStartup.addListener(async () => {
  log('log', 'SW 唤醒，重建内存索引...');
  await rebuildIndex();
});

/**
 * 扩展安装或更新时触发
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  log('log', '扩展已安装/更新:', details.reason);

  // 首次安装时初始化数据
  if (details.reason === 'install' || details.reason === 'update') {
    await initializeData();
  }

  // 创建定时刷新闹钟
  // chrome.alarms 会自动覆盖同名闹钟
  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: REFRESH_INTERVAL_MINUTES,     // 首次触发延迟
    periodInMinutes: REFRESH_INTERVAL_MINUTES,    // 重复间隔
  });

  log('log', `定时刷新闹钟已设置: 每 ${REFRESH_INTERVAL_MINUTES} 分钟`);
});

/**
 * 通知点击事件：打开 Epic 免费游戏页面
 */
if (chrome.notifications) {
  chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationId === 'epic-new-free-games') {
      chrome.tabs.create({ url: 'https://store.epicgames.com/free-games' }).catch(() => {
        // 没有窗口时忽略错误
      });
      chrome.notifications.clear(notificationId);
    }
  });
}

/**
 * 闹钟触发时刷新数据
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;

  log('log', '闹钟触发，开始定时刷新...');
  await refreshCurrentFreeGames();
  log('log', '定时刷新完成');
});

// ============================================================
// Service Worker 唤醒时恢复
// ============================================================

/**
 * Service Worker 可能被浏览器随时终止。
 * 在启动时检查缓存是否存在，如果不存在则重新初始化。
 * 这确保了 Service Worker 被唤醒后数据是可用的。
 */
(async function onStartup() {
  log('log', 'Service Worker 启动');

  // 检查缓存中是否有数据
  const lastFetch = await getStorage(STORAGE_KEY_LAST_FETCH);
  if (!lastFetch) {
    log('log', '缓存为空，执行初始化...');
    await initializeData();
  } else {
    const age = Date.now() - lastFetch;
    const ageMinutes = Math.round(age / 60000);
    log('log', `缓存数据年龄: ${ageMinutes} 分钟`);

    // 如果缓存超过 2 小时，立即刷新一次
    if (age > 2 * 60 * 60 * 1000) {
      log('log', '缓存过期，执行刷新...');
      await refreshCurrentFreeGames();
    }
  }

  // 确保闹钟存在（Service Worker 重启后闹钟可能丢失）
  const existingAlarm = await chrome.alarms.get(ALARM_NAME);
  if (!existingAlarm) {
    chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: REFRESH_INTERVAL_MINUTES,
      periodInMinutes: REFRESH_INTERVAL_MINUTES,
    });
    log('log', '闹钟已重新创建');
  }
})();

// ============================================================
// 导出（供测试用，Service Worker 中通常不需要）
// ============================================================

// 以下代码仅在 Node.js 测试环境中生效
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fuzzyMatch,
    queryByGameName,
    queryByAppId,
    fetchCurrentFreeGames,
  };
}
