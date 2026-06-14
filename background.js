/**
 * Steam-Epic Badge - Background Service Worker
 *
 * 职责：
 * 1. 从 epic_history.json 加载所有游戏数据（唯一数据源）
 * 2. 从 Epic API 获取当前免费/即将免费游戏
 * 3. 统一存储在 chrome.storage.local（key: epic_games）
 * 4. 监听 content.js 消息，提供查询接口
 * 5. 使用 chrome.alarms 定时刷新 API 数据
 */

// ============================================================
// 常量定义
// ============================================================

/** Epic 免费游戏促销 API */
const EPIC_API_URL =
  'https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US';

/** Steam 搜索 API */
const STEAM_SEARCH_URL = 'https://store.steampowered.com/api/storesearch/';

/** 本地历史数据路径（相对于扩展根目录） */
const LOCAL_HISTORY_PATH = 'data/epic_history.json';

/** chrome.storage.local 唯一缓存键 */
const STORAGE_KEY = 'epic_games';

/** 上次 API 拉取时间戳 */
const STORAGE_KEY_LAST_FETCH = 'epic_last_fetch';

/** 定时刷新闹钟名称 */
const ALARM_NAME = 'refresh-epic-free-games';

/** 刷新间隔（分钟） */
const REFRESH_INTERVAL_MINUTES = 60;

// ============================================================
// L1 内存索引 — O(1) 查找
// ============================================================

/** @type {Map<string, object>} steam_appid -> game */
const _indexBySteamAppId = new Map();
/** @type {Map<string, object>} epic_id (lowercase) -> game */
const _indexByEpicId = new Map();

/**
 * 从游戏数组构建内存索引
 * @param {Array} games
 */
function buildIndex(games) {
  _indexBySteamAppId.clear();
  _indexByEpicId.clear();
  for (const game of games) {
    if (game.steam_appid) {
      _indexBySteamAppId.set(String(game.steam_appid), game);
    }
    if (game.epic_id) {
      _indexByEpicId.set(String(game.epic_id).toLowerCase(), game);
    }
  }
  log('log', `内存索引构建完成: ${_indexBySteamAppId.size} 条 steam_appid, ${_indexByEpicId.size} 条 epic_id`);
}

/**
 * 通过 AppID 从内存索引查找游戏（O(1)）
 * @param {string} appId
 * @returns {object|null}
 */
function lookupByAppId(appId) {
  const id = String(appId).trim();
  const lowerId = id.toLowerCase();
  return _indexBySteamAppId.get(id)
    || _indexByEpicId.get(lowerId)
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
 * 统一日志输出
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
 * 字符串相似度比较
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function fuzzyMatch(a, b) {
  if (!a || !b) return false;
  const normalize = s => s.toLowerCase().replace(/[™®©]/g, '').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

// ============================================================
// Epic API 数据获取
// ============================================================

/**
 * 从 Epic API 获取当前免费/即将免费游戏
 * @returns {Promise<Array>} 游戏列表
 */
async function fetchCurrentFreeGames() {
  try {
    log('log', '正在请求 Epic 免费游戏 API...');
    const response = await fetch(EPIC_API_URL, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Epic API 返回 HTTP ${response.status}`);
    }

    const data = await response.json();
    const elements = data?.data?.Catalog?.searchStore?.elements ?? [];
    log('log', `Epic API 返回 ${elements.length} 个游戏条目`);

    const freeGames = [];
    const now = new Date();

    for (const elem of elements) {
      const title = elem.title;
      const promotions = elem.promotions;
      if (!promotions) continue;

      const currentPromos = promotions.promotionalOffers ?? [];
      const upcomingPromos = promotions.upcomingPromotionalOffers ?? [];

      // 查找免费促销
      let freeInfo = null;
      let isCurrentlyFree = false;
      let isUpcoming = false;

      for (const promoGroup of currentPromos) {
        for (const offer of promoGroup.promotionalOffers ?? []) {
          if (offer.discountSetting?.discountPercentage === 0) {
            freeInfo = {
              start: offer.startDate,
              end: offer.endDate,
            };
            isCurrentlyFree = true;
            break;
          }
        }
        if (freeInfo) break;
      }

      if (!freeInfo) {
        for (const promoGroup of upcomingPromos) {
          for (const offer of promoGroup.promotionalOffers ?? []) {
            if (offer.discountSetting?.discountPercentage === 0) {
              freeInfo = {
                start: offer.startDate,
                end: offer.endDate,
              };
              isUpcoming = true;
              break;
            }
          }
          if (freeInfo) break;
        }
      }

      if (!freeInfo) continue;

      // 提取 epic_id
      const catalogNs = elem.catalogNs;
      const pageSlug = catalogNs?.mappings?.[0]?.pageSlug || '';
      const epicId = pageSlug || elem.productSlug || elem.offerId || elem.id || '';

      freeGames.push({
        title,
        epic_id: epicId,
        steam_appid: null, // 需要后续匹配
        free_dates: [{ start: freeInfo.start, end: freeInfo.end, type: 'giveaway' }],
        image: extractImageUrl(elem),
        status: isCurrentlyFree ? 'current' : 'upcoming',
      });
    }

    log('log', `筛选出 ${freeGames.length} 款免费游戏`);
    return freeGames;
  } catch (err) {
    log('error', '请求 Epic API 异常:', err);
    return [];
  }
}

/**
 * 从游戏元素中提取封面图 URL
 * @param {Object} elem
 * @returns {string|null}
 */
function extractImageUrl(elem) {
  const keyImages = elem.keyImages ?? [];
  for (const img of keyImages) {
    if (img.type === 'DieselStoreFrontWide' || img.type === 'OfferImageWide') {
      return img.url;
    }
  }
  if (keyImages.length > 0) {
    return keyImages[0].url;
  }
  return null;
}

/**
 * 通过 Steam API 搜索游戏的 AppID
 * @param {string} gameName
 * @returns {Promise<number|null>}
 */
async function searchSteamAppId(gameName) {
  try {
    const url = `${STEAM_SEARCH_URL}?term=${encodeURIComponent(gameName)}&l=english&cc=US`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.items || data.items.length === 0) return null;

    const bestMatch = data.items.find(item =>
      item.name && fuzzyMatch(item.name, gameName)
    ) || data.items[0];

    return bestMatch.id || null;
  } catch (err) {
    log('warn', `Steam API 查询失败: ${gameName}`, err.message);
    return null;
  }
}

// ============================================================
// 数据同步与缓存
// ============================================================

/**
 * 初始化：从 epic_history.json 加载数据，然后刷新 Epic API
 */
async function initializeData() {
  log('log', '=== 初始化数据 ===');

  // 1. 从本地 epic_history.json 加载
  const historyData = await loadLocalHistory();
  await setStorage(STORAGE_KEY, historyData);
  log('log', `本地历史数据已加载: ${historyData.games.length} 条`);

  // 2. 从 Epic API 获取当前免费/即将免费
  await refreshEpicFreeGames();

  // 3. 构建内存索引
  await rebuildIndex();

  log('log', '=== 初始化完成 ===');
}

/**
 * 从 storage 读取数据并重建内存索引
 */
async function rebuildIndex() {
  const data = (await getStorage(STORAGE_KEY)) || { games: [] };
  buildIndex(data.games);
}

/**
 * 从本地 epic_history.json 加载数据
 * @returns {Promise<Object>} { games: [...] }
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
    return { games: [] };
  }
}

/**
 * 刷新 Epic 免费游戏数据
 * 流程：
 * 1. 从 Epic API 获取当前免费/即将免费
 * 2. 匹配 steam_appid（先查历史，没有查 Steam API）
 * 3. 合并到统一数据源
 */
async function refreshEpicFreeGames() {
  log('log', '开始刷新 Epic 免费游戏...');

  const epicGames = await fetchCurrentFreeGames();
  if (epicGames.length === 0) {
    log('log', '没有获取到免费游戏');
    return;
  }

  // 读取当前数据
  const data = (await getStorage(STORAGE_KEY)) || { games: [] };
  let dataUpdated = false;

  for (const epicGame of epicGames) {
    // 查找是否已存在（按 epic_id 或 title 匹配）
    const existing = data.games.find(g =>
      g.epic_id === epicGame.epic_id ||
      fuzzyMatch(g.title, epicGame.title)
    );

    if (existing) {
      // 已存在：更新状态和免费日期
      existing.status = epicGame.status;

      // 合并免费日期（去重）
      const existingDates = new Set(
        existing.free_dates.map(d => `${d.start}_${d.end}`)
      );
      for (const newDate of epicGame.free_dates) {
        const key = `${newDate.start}_${newDate.end}`;
        if (!existingDates.has(key)) {
          existing.free_dates.push(newDate);
          existingDates.add(key);
        }
      }

      // 补充 steam_appid
      if (!existing.steam_appid && epicGame.steam_appid) {
        existing.steam_appid = epicGame.steam_appid;
      }

      dataUpdated = true;
      log('log', `[更新] ${existing.title} -> status=${existing.status}`);
    } else {
      // 新游戏：匹配 steam_appid
      if (!epicGame.steam_appid) {
        // 先查历史
        const historyMatch = data.games.find(g => fuzzyMatch(g.title, epicGame.title));
        if (historyMatch?.steam_appid) {
          epicGame.steam_appid = historyMatch.steam_appid;
          log('log', `[历史匹配] ${epicGame.title} -> ${historyMatch.steam_appid}`);
        } else {
          // 查 Steam API
          const steamId = await searchSteamAppId(epicGame.title);
          if (steamId) {
            epicGame.steam_appid = steamId;
            log('log', `[Steam查询] ${epicGame.title} -> ${steamId}`);
          }
        }
      }

      // 添加到数据源
      data.games.push(epicGame);
      dataUpdated = true;
      log('log', `[新增] ${epicGame.title} (steam_appid=${epicGame.steam_appid})`);
    }
  }

  // 将历史游戏中没有 status 的标记为 history
  for (const game of data.games) {
    if (!game.status) {
      game.status = 'history';
    }
  }

  // 保存更新
  if (dataUpdated) {
    data.last_updated = new Date().toISOString().split('T')[0];
    await setStorage(STORAGE_KEY, data);
    log('log', '数据已更新');
  }

  // 重建内存索引
  await rebuildIndex();

  // 检测新游戏并通知
  await detectAndNotifyNewGames(epicGames);

  await setStorage(STORAGE_KEY_LAST_FETCH, Date.now());
  log('log', `Epic 免费游戏刷新完成: ${epicGames.length} 款`);
}

/**
 * 检测新赠送的游戏并发送通知
 * @param {Array} currentGames - 当前免费游戏列表
 */
async function detectAndNotifyNewGames(currentGames) {
  const lastKnown = (await getStorage('epic_last_known')) || [];
  const lastKnownTitles = new Set(lastKnown.map(g => g.title));
  const newGames = currentGames.filter(g => !lastKnownTitles.has(g.title));

  if (newGames.length > 0) {
    log('log', `发现 ${newGames.length} 款新免费游戏:`, newGames.map(g => g.title));
    sendNewFreeGamesNotification(newGames);
  }

  await setStorage('epic_last_known', currentGames);
}

/**
 * 发送新免费游戏通知
 * @param {Array} newGames
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
    message,
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

// ============================================================
// 查询接口
// ============================================================

/** 未匹配时的空结果 */
const EMPTY_RESULT = { isFree: false, freeDates: [], source: null, details: null };

/**
 * 从游戏对象构建统一的查询结果
 * @param {object} game
 * @returns {object}
 */
function _buildResult(game) {
  const isCurrent = game.status === 'current';
  const isUpcoming = game.status === 'upcoming';
  const isFree = isCurrent || isUpcoming || game.free_dates?.length > 0;

  return {
    isFree,
    freeDates: (game.free_dates || []).map(d => ({ start: d.start, end: d.end })),
    source: 'epic',
    details: {
      title: game.title,
      epic_id: game.epic_id,
      steam_appid: game.steam_appid,
      image: game.image,
      isCurrentlyFree: isCurrent,
      isUpcoming,
    },
  };
}

/**
 * 根据游戏名称查询
 * @param {string} gameName
 * @returns {Promise<Object>}
 */
function queryByGameName(gameName) {
  if (!gameName) return Promise.resolve(EMPTY_RESULT);
  const match = lookupByName(gameName.trim());
  return Promise.resolve(match ? _buildResult(match) : EMPTY_RESULT);
}

/**
 * 根据 AppID 查询
 * @param {string|number} appId
 * @returns {Promise<Object>}
 */
function queryByAppId(appId) {
  if (!appId && appId !== 0) return Promise.resolve(EMPTY_RESULT);
  const match = lookupByAppId(appId);
  return Promise.resolve(match ? _buildResult(match) : EMPTY_RESULT);
}

/**
 * 批量查询
 * @param {Array<number|string>} appIds
 * @returns {Promise<Object>}
 */
async function queryBatchByAppIds(appIds) {
  const data = {};
  for (const appId of appIds) {
    const game = lookupByAppId(appId);
    data[appId] = game ? _buildResult(game) : EMPTY_RESULT;
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
            return match ? _buildResult(match) : EMPTY_RESULT;
          }
          if (id) {
            const match = lookupByAppId(id);
            return match ? _buildResult(match) : EMPTY_RESULT;
          }
          return EMPTY_RESULT;
        });
        sendResponse({ results });
      })();
      return true;
    }

    case 'getAllData': {
      (async () => {
        const data = (await getStorage(STORAGE_KEY)) || { games: [] };
        const lastFetch = (await getStorage(STORAGE_KEY_LAST_FETCH)) || null;
        sendResponse({
          totalGames: data.games.length,
          currentFree: data.games.filter(g => g.status === 'current').length,
          upcoming: data.games.filter(g => g.status === 'upcoming').length,
          history: data.games.filter(g => g.status === 'history').length,
          lastFetch: lastFetch ? new Date(lastFetch).toISOString() : null,
        });
      })();
      return true;
    }

    case 'refresh': {
      refreshEpicFreeGames().then(() => {
        sendResponse({ success: true });
      }).catch(err => {
        log('error', '手动刷新失败:', err);
        sendResponse({ success: false, error: err.message });
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

  if (details.reason === 'install' || details.reason === 'update') {
    await initializeData();
  }

  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: REFRESH_INTERVAL_MINUTES,
    periodInMinutes: REFRESH_INTERVAL_MINUTES,
  });

  log('log', `定时刷新闹钟已设置: 每 ${REFRESH_INTERVAL_MINUTES} 分钟`);
});

/**
 * 通知点击事件
 */
if (chrome.notifications) {
  chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationId === 'epic-new-free-games') {
      chrome.tabs.create({ url: 'https://store.epicgames.com/free-games' }).catch(() => {});
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
  await refreshEpicFreeGames();
  log('log', '定时刷新完成');
});

/**
 * Service Worker 启动时检查缓存
 */
(async function onStartup() {
  log('log', 'Service Worker 启动');

  const lastFetch = await getStorage(STORAGE_KEY_LAST_FETCH);
  if (!lastFetch) {
    log('log', '缓存为空，执行初始化...');
    await initializeData();
  } else {
    const age = Date.now() - lastFetch;
    const ageMinutes = Math.round(age / 60000);
    log('log', `缓存数据年龄: ${ageMinutes} 分钟`);

    if (age > 2 * 60 * 60 * 1000) {
      log('log', '缓存过期，执行刷新...');
      await refreshEpicFreeGames();
    }
  }

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
// 导出（供测试用）
// ============================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fuzzyMatch,
    queryByGameName,
    queryByAppId,
    fetchCurrentFreeGames,
  };
}
