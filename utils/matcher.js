/**
 * 游戏名称匹配算法模块
 * 用于匹配 Steam 和 Epic 平台的游戏名称
 *
 * @module matcher
 */

// 匹配结果缓存，避免重复计算
const matchCache = new Map();

/**
 * 计算两个字符串的编辑距离（Levenshtein Distance）
 * 使用动态规划算法，时间复杂度 O(m*n)
 *
 * @param {string} str1 - 第一个字符串
 * @param {string} str2 - 第二个字符串
 * @returns {number} 编辑距离
 *
 * @example
 * levenshtein('kitten', 'sitting')  // 返回 3
 * levenshtein('abc', 'abc')         // 返回 0
 */
function levenshtein(str1, str2) {
  const m = str1.length;
  const n = str2.length;

  // 创建 DP 矩阵
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  // 初始化边界
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // 填充矩阵
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],      // 删除
          dp[i][j - 1],      // 插入
          dp[i - 1][j - 1]   // 替换
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * 标准化字符串
 * - 转小写
 * - 移除特殊字符（保留中文、英文、数字）
 * - 去除首尾空格
 * - 将多个连续空格合并为单个空格
 *
 * @param {string} str - 原始字符串
 * @returns {string} 标准化后的字符串
 *
 * @example
 * normalize('Cyberpunk 2077™')        // 返回 'cyberpunk 2077'
 * normalize('  Grand Theft Auto V  ') // 返回 'grand theft auto v'
 * normalize('原神')                    // 返回 '原神'
 */
function normalize(str) {
  if (!str || typeof str !== 'string') return '';

  return str
    .toLowerCase()                         // 转小写
    .replace(/[^\w\s一-鿿]/g, '') // 移除特殊字符，保留中文、英文、数字、下划线、空格
    .replace(/\s+/g, ' ')                 // 合并多个空格
    .trim();                              // 去除首尾空格
}

/**
 * 生成缓存键
 *
 * @param {string} steamTitle - Steam 游戏名称
 * @param {string} epicTitle - Epic 游戏名称
 * @returns {string} 缓存键
 */
function getCacheKey(steamTitle, epicTitle) {
  return `${steamTitle}|||${epicTitle}`;
}

/**
 * 匹配单个游戏
 * 按优先级尝试以下匹配方式：
 * 1. Steam AppID 直接匹配
 * 2. 精确匹配（标准化后完全相同）
 * 3. 包含匹配（一方包含另一方）
 * 4. 编辑距离匹配（阈值 3）
 *
 * @param {string} steamTitle - Steam 游戏名称
 * @param {string} epicTitle - Epic 游戏名称（可选，当使用 epicData 时）
 * @param {number|string} steamAppid - Steam AppID（可选）
 * @param {Object} epicData - Epic 数据库中的游戏数据（可选）
 * @param {number|string} [epicData.appId] - Epic App ID
 * @param {string} [epicData.title] - Epic 游戏名称
 * @returns {Object|null} 匹配结果，无匹配返回 null
 *
 * @example
 * // 精确匹配
 * matchGame('Cyberpunk 2077', 'Cyberpunk 2077')
 * // 返回 { matched: true, method: 'exact', score: 1, ... }
 *
 * // AppID 匹配
 * matchGame('Game Name', null, 12345, { appId: '12345', title: 'Game Name' })
 */
function matchGame(steamTitle, epicTitle, steamAppid, epicData) {
  // 参数处理
  const epic = epicData || {};
  const epicName = epicTitle || epic.title || '';
  const epicAppId = epic.appId || '';

  // 检查缓存
  const cacheKey = getCacheKey(steamTitle, epicName);
  if (matchCache.has(cacheKey)) {
    return matchCache.get(cacheKey);
  }

  let result = null;

  // 1. Steam AppID 直接匹配
  if (steamAppid && epicAppId && String(steamAppid) === String(epicAppId)) {
    result = {
      matched: true,
      method: 'appid',
      score: 1,
      steamTitle,
      epicTitle: epicName,
      steamAppid,
      epicAppId
    };
    matchCache.set(cacheKey, result);
    return result;
  }

  // 标准化名称
  const normalizedSteam = normalize(steamTitle);
  const normalizedEpic = normalize(epicName);

  // 空值检查
  if (!normalizedSteam || !normalizedEpic) {
    matchCache.set(cacheKey, null);
    return null;
  }

  // 2. 精确匹配
  if (normalizedSteam === normalizedEpic) {
    result = {
      matched: true,
      method: 'exact',
      score: 1,
      steamTitle,
      epicTitle: epicName,
      normalizedTitle: normalizedSteam
    };
    matchCache.set(cacheKey, result);
    return result;
  }

  // 3. 包含匹配
  // 一方完全包含另一方，且长度差异不超过 50%
  if (normalizedSteam.includes(normalizedEpic) || normalizedEpic.includes(normalizedSteam)) {
    const longer = normalizedSteam.length > normalizedEpic.length ? normalizedSteam : normalizedEpic;
    const shorter = normalizedSteam.length > normalizedEpic.length ? normalizedEpic : normalizedSteam;

    // 长度差异在 50% 以内才算包含匹配
    if (shorter.length >= longer.length * 0.5) {
      const score = shorter.length / longer.length;
      result = {
        matched: true,
        method: 'contains',
        score: Math.round(score * 100) / 100,
        steamTitle,
        epicTitle: epicName,
        normalizedTitle: normalizedSteam,
        contained: shorter === normalizedEpic ? 'epic' : 'steam'
      };
      matchCache.set(cacheKey, result);
      return result;
    }
  }

  // 4. 编辑距离匹配
  const distance = levenshtein(normalizedSteam, normalizedEpic);
  const maxLength = Math.max(normalizedSteam.length, normalizedEpic.length);

  // 阈值：编辑距离 <= 3，且编辑距离不超过总长度的 30%
  if (distance <= 3 && distance <= maxLength * 0.3) {
    const score = 1 - (distance / maxLength);
    result = {
      matched: true,
      method: 'levenshtein',
      score: Math.round(score * 100) / 100,
      distance,
      steamTitle,
      epicTitle: epicName,
      normalizedTitle: normalizedSteam
    };
    matchCache.set(cacheKey, result);
    return result;
  }

  // 无匹配
  matchCache.set(cacheKey, null);
  return null;
}

/**
 * 批量匹配游戏
 * 将 Steam 游戏列表与 Epic 数据库进行匹配
 *
 * @param {Array<Object>} steamGames - Steam 游戏列表
 * @param {string} steamGames[].name - Steam 游戏名称
 * @param {number|string} [steamGames[].appid] - Steam AppID
 * @param {Array<Object>} epicDatabase - Epic 游戏数据库
 * @param {string} epicDatabase[].title - Epic 游戏名称
 * @param {number|string} [epicDatabase[].appId] - Epic App ID
 * @returns {Object} 匹配结果
 * @returns {Array} result.matched - 已匹配的游戏列表
 * @returns {Array} result.unmatched - 未匹配的 Steam 游戏列表
 * @returns {Object} result.stats - 统计信息
 *
 * @example
 * const steamGames = [
 *   { name: 'Cyberpunk 2077', appid: 1091500 },
 *   { name: 'The Witcher 3', appid: 292030 }
 * ];
 * const epicDatabase = [
 *   { title: 'Cyberpunk 2077', appId: 'abc123' },
 *   { title: 'Fortnite', appId: 'fn456' }
 * ];
 * const result = matchBatch(steamGames, epicDatabase);
 * // result.matched: [{ steam: {...}, epic: {...}, method: 'exact', score: 1 }]
 * // result.unmatched: [{ name: 'The Witcher 3', appid: 292030 }]
 */
function matchBatch(steamGames, epicDatabase) {
  if (!Array.isArray(steamGames) || !Array.isArray(epicDatabase)) {
    return { matched: [], unmatched: [], stats: { total: 0, matched: 0, unmatched: 0 } };
  }

  // 构建 Epic 游戏索引，优化查找性能
  const epicByNormalizedTitle = new Map();
  const epicByAppId = new Map();

  for (const epic of epicDatabase) {
    // 按 AppID 索引
    if (epic.appId) {
      epicByAppId.set(String(epic.appId), epic);
    }
    // 按标准化名称索引
    const normalized = normalize(epic.title);
    if (normalized) {
      if (!epicByNormalizedTitle.has(normalized)) {
        epicByNormalizedTitle.set(normalized, []);
      }
      epicByNormalizedTitle.get(normalized).push(epic);
    }
  }

  const matched = [];
  const unmatched = [];
  const methodStats = {
    appid: 0,
    exact: 0,
    contains: 0,
    levenshtein: 0
  };

  for (const steam of steamGames) {
    let found = false;

    // 1. 尝试 AppID 匹配
    if (steam.appid) {
      const epicByApp = epicByAppId.get(String(steam.appid));
      if (epicByApp) {
        const result = matchGame(steam.name, null, steam.appid, epicByApp);
        if (result) {
          matched.push({ steam, epic: epicByApp, ...result });
          methodStats.appid++;
          found = true;
        }
      }
    }

    if (found) continue;

    // 2. 尝试精确匹配
    const normalizedSteam = normalize(steam.name);
    const exactMatches = epicByNormalizedTitle.get(normalizedSteam);
    if (exactMatches && exactMatches.length > 0) {
      matched.push({
        steam,
        epic: exactMatches[0],
        matched: true,
        method: 'exact',
        score: 1,
        steamTitle: steam.name,
        epicTitle: exactMatches[0].title
      });
      methodStats.exact++;
      continue;
    }

    // 3. 尝试包含匹配和编辑距离匹配
    let bestMatch = null;
    let bestScore = 0;

    for (const epic of epicDatabase) {
      const result = matchGame(steam.name, epic.title, steam.appid, epic);
      if (result && result.score > bestScore) {
        bestMatch = { steam, epic, ...result };
        bestScore = result.score;
      }
    }

    if (bestMatch && bestMatch.method !== 'exact') {
      matched.push(bestMatch);
      methodStats[bestMatch.method]++;
    } else {
      unmatched.push(steam);
    }
  }

  return {
    matched,
    unmatched,
    stats: {
      total: steamGames.length,
      matched: matched.length,
      unmatched: unmatched.length,
      methods: methodStats
    }
  };
}

/**
 * 清空匹配缓存
 */
function clearCache() {
  matchCache.clear();
}

/**
 * 获取缓存大小
 *
 * @returns {number} 缓存条目数
 */
function getCacheSize() {
  return matchCache.size;
}

// 导出函数
module.exports = {
  levenshtein,
  normalize,
  matchGame,
  matchBatch,
  clearCache,
  getCacheSize
};
