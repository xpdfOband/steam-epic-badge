/**
 * storage.js - 本地存储管理模块
 *
 * 封装 Chrome Extension Storage API，提供统一的存储操作接口。
 * 使用 chrome.storage.local 存储大量数据（如历史记录），chrome.storage.sync 存储用户设置。
 *
 * @module storage
 */

// ============================================================
// 存储键名常量
// ============================================================

/** @constant {string} EPIC_HISTORY - 本地赠送数据历史记录 */
const EPIC_HISTORY = 'epic_history';

/** @constant {string} EPIC_CURRENT_FREE - 当前免费游戏列表 */
const EPIC_CURRENT_FREE = 'epic_current_free';

/** @constant {string} EPIC_LAST_FETCH - 上次获取免费游戏的时间戳 */
const EPIC_LAST_FETCH = 'epic_last_fetch';

/** @constant {string} SETTINGS - 用户设置 */
const SETTINGS = 'settings';

/** @constant {string} STATS - 统计数据 */
const STATS = 'stats';

/**
 * 所有存储键名常量集合，方便外部引用
 * @type {Object<string, string>}
 */
const STORAGE_KEYS = {
  EPIC_HISTORY,
  EPIC_CURRENT_FREE,
  EPIC_LAST_FETCH,
  SETTINGS,
  STATS,
};

// ============================================================
// 内部工具函数
// ============================================================

/**
 * 获取指定存储区域的 storage 对象
 * SETTINGS 使用 chrome.storage.sync（跨设备同步），其余使用 chrome.storage.local
 *
 * @param {string} key - 存储键名
 * @returns {chrome.storage.StorageArea} 存储区域对象
 */
function _getStore(key) {
  return key === SETTINGS ? chrome.storage.sync : chrome.storage.local;
}

/**
 * 统一错误处理：打印错误日志并抛出异常
 *
 * @param {string} operation - 操作名称
 * @param {string} key - 相关键名
 * @param {Error} error - 原始错误对象
 * @throws {Error} 重新抛出带有上下文信息的错误
 */
function _handleError(operation, key, error) {
  const message = `[Storage] ${operation} failed (key: ${key}): ${error.message}`;
  console.error(message, error);
  throw new Error(message);
}

/**
 * 包装 chrome.storage 回调为 Promise
 *
 * @param {Function} fn - chrome.storage 方法（需绑定 this）
 * @returns {Promise<any>}
 */
function _promisify(fn) {
  return new Promise((resolve, reject) => {
    try {
      fn((result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

// ============================================================
// 数据操作封装
// ============================================================

/**
 * 获取单个存储值
 *
 * @param {string} key - 存储键名
 * @returns {Promise<any>} 存储的值，不存在时返回 undefined
 *
 * @example
 * const history = await get(EPIC_HISTORY);
 */
async function get(key) {
  try {
    const store = _getStore(key);
    const result = await _promisify((cb) => store.get(key, cb));
    return result[key];
  } catch (error) {
    _handleError('get', key, error);
  }
}

/**
 * 设置单个存储值
 *
 * @param {string} key - 存储键名
 * @param {any} value - 要存储的值（需可序列化）
 * @returns {Promise<void>}
 *
 * @example
 * await set(EPIC_CURRENT_FREE, [{ title: 'Game', ... }]);
 */
async function set(key, value) {
  try {
    const store = _getStore(key);
    await _promisify((cb) => store.set({ [key]: value }, cb));
  } catch (error) {
    _handleError('set', key, error);
  }
}

/**
 * 批量获取多个键的值
 *
 * @param {string[]} keys - 存储键名数组
 * @returns {Promise<Object<string, any>>} 键值对对象
 *
 * @example
 * const data = await getMultiple([EPIC_CURRENT_FREE, EPIC_LAST_FETCH]);
 * // => { epic_current_free: [...], epic_last_fetch: 1234567890 }
 */
async function getMultiple(keys) {
  try {
    // 按存储区域分组，因为一次只能查询一个区域
    const localKeys = keys.filter((k) => k !== SETTINGS);
    const syncKeys = keys.filter((k) => k === SETTINGS);

    const results = {};

    if (localKeys.length > 0) {
      const localResult = await _promisify((cb) =>
        chrome.storage.local.get(localKeys, cb)
      );
      Object.assign(results, localResult);
    }

    if (syncKeys.length > 0) {
      const syncResult = await _promisify((cb) =>
        chrome.storage.sync.get(syncKeys, cb)
      );
      Object.assign(results, syncResult);
    }

    return results;
  } catch (error) {
    _handleError('getMultiple', keys.join(','), error);
  }
}

/**
 * 批量设置多个键值对
 * 会根据键名自动选择 local 或 sync 存储区域
 *
 * @param {Object<string, any>} obj - 键值对对象
 * @returns {Promise<void>}
 *
 * @example
 * await setMultiple({
 *   [EPIC_CURRENT_FREE]: [...],
 *   [EPIC_LAST_FETCH]: Date.now(),
 * });
 */
async function setMultiple(obj) {
  try {
    const localItems = {};
    const syncItems = {};

    for (const [key, value] of Object.entries(obj)) {
      if (key === SETTINGS) {
        syncItems[key] = value;
      } else {
        localItems[key] = value;
      }
    }

    const promises = [];

    if (Object.keys(localItems).length > 0) {
      promises.push(
        _promisify((cb) => chrome.storage.local.set(localItems, cb))
      );
    }

    if (Object.keys(syncItems).length > 0) {
      promises.push(
        _promisify((cb) => chrome.storage.sync.set(syncItems, cb))
      );
    }

    await Promise.all(promises);
  } catch (error) {
    _handleError('setMultiple', Object.keys(obj).join(','), error);
  }
}

/**
 * 删除指定键
 *
 * @param {string|string[]} key - 单个键名或键名数组
 * @returns {Promise<void>}
 *
 * @example
 * await remove(EPIC_LAST_FETCH);
 * await remove([EPIC_HISTORY, EPIC_CURRENT_FREE]);
 */
async function remove(key) {
  try {
    const keys = Array.isArray(key) ? key : [key];

    const localKeys = keys.filter((k) => k !== SETTINGS);
    const syncKeys = keys.filter((k) => k === SETTINGS);

    const promises = [];

    if (localKeys.length > 0) {
      promises.push(
        _promisify((cb) => chrome.storage.local.remove(localKeys, cb))
      );
    }

    if (syncKeys.length > 0) {
      promises.push(
        _promisify((cb) => chrome.storage.sync.remove(syncKeys, cb))
      );
    }

    await Promise.all(promises);
  } catch (error) {
    _handleError('remove', Array.isArray(key) ? key.join(',') : key, error);
  }
}

/**
 * 清空所有扩展存储数据
 * 同时清空 local 和 sync 两个存储区域
 *
 * @returns {Promise<void>}
 *
 * @example
 * await clear();
 */
async function clear() {
  try {
    await Promise.all([
      _promisify((cb) => chrome.storage.local.clear(cb)),
      _promisify((cb) => chrome.storage.sync.clear(cb)),
    ]);
  } catch (error) {
    _handleError('clear', '*', error);
  }
}

// ============================================================
// 缓存管理
// ============================================================

/** 默认缓存有效期：4 小时（毫秒） */
const DEFAULT_CACHE_MAX_AGE = 4 * 60 * 60 * 1000;

/**
 * 缓存时间戳键名的内部映射（加前缀避免冲突）
 * @type {Map<string, string>}
 */
const _cacheTimestampKeys = new Map();

/**
 * 获取缓存时间戳的内部键名
 *
 * @param {string} key - 原始存储键名
 * @returns {string} 带前缀的时间戳键名
 */
function _cacheTsKey(key) {
  if (!_cacheTimestampKeys.has(key)) {
    _cacheTimestampKeys.set(key, `_cache_ts_${key}`);
  }
  return _cacheTimestampKeys.get(key);
}

/**
 * 检查指定缓存是否仍然有效
 *
 * @param {string} key - 存储键名
 * @param {number} [maxAge=DEFAULT_CACHE_MAX_AGE] - 最大有效时间（毫秒），默认 4 小时
 * @returns {Promise<boolean>} 有效返回 true，过期或不存在返回 false
 *
 * @example
 * if (await isCacheValid(EPIC_CURRENT_FREE)) {
 *   // 使用缓存数据
 * }
 */
async function isCacheValid(key, maxAge = DEFAULT_CACHE_MAX_AGE) {
  try {
    const tsKey = _cacheTsKey(key);
    const result = await _promisify((cb) =>
      chrome.storage.local.get(tsKey, cb)
    );
    const timestamp = result[tsKey];

    if (!timestamp) return false;

    return Date.now() - timestamp < maxAge;
  } catch (error) {
    console.warn(`[Storage] isCacheValid check failed for "${key}":`, error);
    return false;
  }
}

/**
 * 更新缓存数据并自动记录当前时间戳
 *
 * @param {string} key - 存储键名
 * @param {any} data - 缓存数据
 * @returns {Promise<void>}
 *
 * @example
 * await updateCache(EPIC_CURRENT_FREE, freeGames);
 */
async function updateCache(key, data) {
  try {
    const tsKey = _cacheTsKey(key);
    await setMultiple({
      [key]: data,
      [tsKey]: Date.now(),
    });
  } catch (error) {
    _handleError('updateCache', key, error);
  }
}

/**
 * 清理所有已过期的缓存
 * 遍历所有缓存时间戳键，删除过期的数据及其时间戳
 *
 * @param {number} [maxAge=DEFAULT_CACHE_MAX_AGE] - 最大有效时间（毫秒）
 * @returns {Promise<number>} 清理的缓存条数
 *
 * @example
 * const cleared = await clearExpired();
 * console.log(`清理了 ${cleared} 条过期缓存`);
 */
async function clearExpired(maxAge = DEFAULT_CACHE_MAX_AGE) {
  try {
    const now = Date.now();
    const allItems = await _promisify((cb) => chrome.storage.local.get(null, cb));

    const keysToRemove = [];

    for (const [k, v] of Object.entries(allItems)) {
      // 只处理带缓存时间戳前缀的键
      if (!k.startsWith('_cache_ts_')) continue;

      if (now - v >= maxAge) {
        const dataKey = k.replace('_cache_ts_', '');
        keysToRemove.push(k);       // 时间戳键
        keysToRemove.push(dataKey); // 对应的数据键
      }
    }

    if (keysToRemove.length > 0) {
      await _promisify((cb) =>
        chrome.storage.local.remove(keysToRemove, cb)
      );
    }

    console.log(`[Storage] 清理了 ${keysToRemove.length / 2} 条过期缓存`);
    return keysToRemove.length / 2;
  } catch (error) {
    console.error('[Storage] clearExpired failed:', error);
    return 0;
  }
}

// ============================================================
// 统计功能
// ============================================================

/**
 * 递增指定统计项的计数
 *
 * @param {string} key - 统计项名称（如 'fetch_count', 'view_count'）
 * @returns {Promise<number>} 递增后的值
 *
 * @example
 * const count = await incrementStat('fetch_count');
 * // => 每次调用自增 1，首次从 0 开始
 */
async function incrementStat(key) {
  try {
    const stats = (await get(STATS)) || {};
    const newValue = (stats[key] || 0) + 1;
    stats[key] = newValue;
    await set(STATS, stats);
    return newValue;
  } catch (error) {
    _handleError('incrementStat', key, error);
  }
}

/**
 * 获取所有统计数据
 *
 * @returns {Promise<Object<string, number>>} 统计键值对
 *
 * @example
 * const stats = await getStats();
 * // => { fetch_count: 42, view_count: 108, ... }
 */
async function getStats() {
  try {
    return (await get(STATS)) || {};
  } catch (error) {
    _handleError('getStats', STATS, error);
  }
}

/**
 * 重置所有统计数据
 *
 * @returns {Promise<void>}
 *
 * @example
 * await resetStats();
 */
async function resetStats() {
  try {
    await set(STATS, {});
  } catch (error) {
    _handleError('resetStats', STATS, error);
  }
}

// ============================================================
// 设置管理
// ============================================================

/**
 * 获取默认设置
 *
 * @returns {Object} 默认设置对象
 *
 * @example
 * const defaults = getDefaultSettings();
 */
function getDefaultSettings() {
  return {
    /** 是否启用通知提醒 */
    notifyEnabled: true,
    /** 是否自动获取免费游戏信息 */
    autoFetch: true,
    /** 检查间隔（分钟） */
    checkInterval: 240,
    /** 是否显示已过期游戏 */
    showExpired: false,
    /** 语言偏好 */
    language: 'zh-CN',
    /** 主题：auto / light / dark */
    theme: 'auto',
  };
}

/**
 * 获取用户设置（已与默认设置合并）
 *
 * @returns {Promise<Object>} 完整的设置对象
 *
 * @example
 * const settings = await getSettings();
 * if (settings.notifyEnabled) { ... }
 */
async function getSettings() {
  try {
    const stored = await get(SETTINGS);
    return { ...getDefaultSettings(), ...stored };
  } catch (error) {
    _handleError('getSettings', SETTINGS, error);
  }
}

/**
 * 部分更新用户设置（浅合并）
 *
 * @param {Object} partial - 要更新的设置项
 * @returns {Promise<Object>} 更新后的完整设置对象
 *
 * @example
 * await updateSettings({ notifyEnabled: false, theme: 'dark' });
 */
async function updateSettings(partial) {
  try {
    const current = await getSettings();
    const updated = { ...current, ...partial };
    await set(SETTINGS, updated);
    return updated;
  } catch (error) {
    _handleError('updateSettings', SETTINGS, error);
  }
}

// ============================================================
// 存储变更监听
// ============================================================

/**
 * 注册存储变更监听器
 * 当存储内容发生变化时触发回调
 *
 * @param {Function} callback - 回调函数，参数为 (changes, areaName)
 *   - changes: Object - 变更的键及 oldValue/newValue
 *   - areaName: string - 'local' 或 'sync'
 * @returns {Function} 取消监听的函数
 *
 * @example
 * const unsubscribe = onChanged((changes, area) => {
 *   if (changes[EPIC_CURRENT_FREE]) {
 *     console.log('免费游戏数据已更新');
 *   }
 * });
 * // 取消监听
 * unsubscribe();
 */
function onChanged(callback) {
  chrome.storage.onChanged.addListener(callback);
  return () => chrome.storage.onChanged.removeListener(callback);
}

// ============================================================
// 导出
// ============================================================

// 检测运行环境：ES Module 导出 或 挂载到全局
if (typeof module !== 'undefined' && module.exports) {
  // CommonJS（测试环境）
  module.exports = {
    // 常量
    STORAGE_KEYS,
    EPIC_HISTORY,
    EPIC_CURRENT_FREE,
    EPIC_LAST_FETCH,
    SETTINGS,
    STATS,
    // 数据操作
    get,
    set,
    getMultiple,
    setMultiple,
    remove,
    clear,
    // 缓存管理
    isCacheValid,
    updateCache,
    clearExpired,
    // 统计
    incrementStat,
    getStats,
    resetStats,
    // 设置
    getSettings,
    updateSettings,
    getDefaultSettings,
    // 监听
    onChanged,
  };
} else {
  // Chrome Extension 环境：挂载到全局
  // 注意：Chrome Extension 的 content script / popup 中不能用 ES Module
  // 这里直接挂载到 self（兼容 Service Worker 和普通页面）
  self.StorageManager = {
    STORAGE_KEYS,
    EPIC_HISTORY,
    EPIC_CURRENT_FREE,
    EPIC_LAST_FETCH,
    SETTINGS,
    STATS,
    get,
    set,
    getMultiple,
    setMultiple,
    remove,
    clear,
    isCacheValid,
    updateCache,
    clearExpired,
    incrementStat,
    getStats,
    resetStats,
    getSettings,
    updateSettings,
    getDefaultSettings,
    onChanged,
  };
}
