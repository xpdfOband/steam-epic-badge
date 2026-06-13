/**
 * Steam Epic Badge - Popup Script
 * ============================================================
 * 处理弹出窗口的交互逻辑：
 * 1. 与 background.js 通信获取数据
 * 2. 显示当前 Epic 免费游戏
 * 3. 显示已标记游戏统计
 * 4. 刷新按钮功能
 * 5. 设置保存和加载
 * 6. 错误处理与加载状态
 * ============================================================
 */

// ============================================================
// DOM 元素引用
// ============================================================

/** 状态指示灯 */
const statusDot = document.getElementById('statusDot');
/** 状态文本 */
const statusText = document.getElementById('statusText');

/** 免费游戏列表容器 */
const freeGamesList = document.getElementById('freeGamesList');
/** 免费游戏加载占位 */
const freeGamesLoading = document.getElementById('freeGamesLoading');
/** 免费游戏为空提示 */
const freeGamesEmpty = document.getElementById('freeGamesEmpty');

/** 刷新按钮 */
const btnRefresh = document.getElementById('btnRefresh');
/** 刷新图标（用于旋转动画） */
const refreshIcon = document.getElementById('refreshIcon');

/** 统计数字：历史赠送 */
const statHistory = document.getElementById('statHistory');
/** 统计数字：当前免费 */
const statCurrent = document.getElementById('statCurrent');
/** 上次更新时间 */
const lastFetchInfo = document.getElementById('lastFetchInfo');

/** 设置开关 */
const toggleSearch = document.getElementById('toggleSearch');
const toggleHomepage = document.getElementById('toggleHomepage');
const toggleDetail = document.getElementById('toggleDetail');
const toggleWishlist = document.getElementById('toggleWishlist');

// ============================================================
// chrome.storage.sync 设置键名
// ============================================================

/** 设置存储键 */
const SETTINGS_KEY = 'popup_settings';

/** 默认设置（所有页面类型默认启用） */
const DEFAULT_SETTINGS = {
  enableSearch: true,
  enableHomepage: true,
  enableDetail: true,
  enableWishlist: true,
};

// ============================================================
// 与 background.js 通信
// ============================================================

/**
 * 向 background.js 发送消息并返回 Promise
 * 统一封装 chrome.runtime.sendMessage，便于 async/await 调用
 *
 * @param {Object} message - 消息对象，包含 action 和 payload
 * @returns {Promise<Object>} background 返回的响应数据
 */
function sendMessage(message) {
  return new Promise((resolve, reject) => {
    // 检查 chrome.runtime 是否可用
    if (!chrome.runtime || !chrome.runtime.sendMessage) {
      reject(new Error('扩展运行时不可用'));
      return;
    }

    chrome.runtime.sendMessage(message, (response) => {
      // 检查通信错误
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

// ============================================================
// 数据加载
// ============================================================

/**
 * 从 background 获取所有统计数据（历史数量、当前免费数量、上次更新时间）
 * 对应 background.js 的 'getAllData' action
 *
 * @returns {Promise<Object>} { historyCount, currentFreeCount, lastFetch }
 */
async function fetchAllData() {
  return sendMessage({ action: 'getAllData', payload: {} });
}

/**
 * 从 background 获取当前免费游戏列表
 * 对应 background.js 的 'getCurrentFree' action
 *
 * @returns {Promise<Object>} { games: [...] }
 */
async function fetchCurrentFree() {
  return sendMessage({ action: 'getCurrentFree', payload: {} });
}

/**
 * 手动触发 background 刷新免费游戏数据
 * 对应 background.js 的 'refresh' action
 *
 * @returns {Promise<Object>} { success: boolean, error?: string }
 */
async function triggerRefresh() {
  return sendMessage({ action: 'refresh', payload: {} });
}

// ============================================================
// UI 渲染
// ============================================================

/**
 * 更新扩展状态显示
 * @param {boolean} active - 是否正常运行
 */
function updateStatus(active) {
  if (active) {
    statusDot.className = 'status-dot status-active';
    statusText.textContent = '运行中';
  } else {
    statusDot.className = 'status-dot status-inactive';
    statusText.textContent = '已禁用';
  }
}

/**
 * 更新数据统计面板
 * @param {Object} data - { historyCount, currentFreeCount, lastFetch }
 */
function updateStats(data) {
  if (!data) return;

  statHistory.textContent = data.historyCount ?? '--';
  statCurrent.textContent = data.currentFreeCount ?? '--';

  if (data.lastFetch) {
    const date = new Date(data.lastFetch);
    const timeStr = date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    lastFetchInfo.textContent = `上次更新：${timeStr}`;
  } else {
    lastFetchInfo.textContent = '上次更新：--';
  }
}

/**
 * 渲染当前免费游戏列表
 * @param {Array} games - 免费游戏数组
 */
function renderFreeGames(games) {
  // 隐藏加载占位
  freeGamesLoading.style.display = 'none';

  if (!games || games.length === 0) {
    freeGamesEmpty.style.display = 'block';
    freeGamesList.innerHTML = '';
    return;
  }

  freeGamesEmpty.style.display = 'none';

  // 构建游戏卡片 HTML
  const cardsHtml = games.map((game) => {
    const title = escapeHtml(game.title || '未知游戏');
    const image = game.image || '';
    const dates = formatFreeDates(game.free_dates);
    const desc = game.description
      ? escapeHtml(truncate(game.description, 60))
      : '';

    return `
      <div class="game-card">
        ${image
          ? `<img class="game-card-img" src="${escapeHtml(image)}" alt="${title}" loading="lazy" onerror="this.style.display='none'">`
          : '<div class="game-card-img game-card-no-img">E</div>'
        }
        <div class="game-card-info">
          <div class="game-card-title">${title}</div>
          <div class="game-card-dates">${dates}</div>
          ${desc ? `<div class="game-card-desc">${desc}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  freeGamesList.innerHTML = cardsHtml;
}

/**
 * 格式化免费赠送日期为可读文本
 * @param {Array} freeDates - 赠送日期数组，每项 { start, end, type }
 * @returns {string} 格式化后的文本
 */
function formatFreeDates(freeDates) {
  if (!freeDates || freeDates.length === 0) {
    return 'Epic 免费赠送';
  }

  // 查找当前有效的赠送
  const now = new Date();
  let activePromo = null;

  for (const promo of freeDates) {
    const start = promo.start ? new Date(promo.start) : null;
    const end = promo.end ? new Date(promo.end) : null;
    if (start && end && now >= start && now <= end) {
      activePromo = promo;
      break;
    }
  }

  // 如果有当前有效的促销，显示倒计时
  if (activePromo && activePromo.end) {
    const endDate = new Date(activePromo.end);
    const remaining = endDate - now;
    if (remaining > 0) {
      const days = Math.floor(remaining / 86400000);
      const hours = Math.floor((remaining % 86400000) / 3600000);
      return `免费中 - 剩余 ${days}天${hours}小时`;
    }
  }

  // 否则显示最近一次赠送日期
  const latest = freeDates[freeDates.length - 1];
  const startDate = formatDate(latest.start);
  const endDate = formatDate(latest.end);

  if (startDate && endDate) {
    return `免费 ${startDate} ~ ${endDate}`;
  }

  return 'Epic 免费赠送';
}

/**
 * 格式化日期字符串为简短格式 (M.D)
 * @param {string} dateStr - ISO 日期字符串
 * @returns {string} 格式化日期
 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return `${d.getMonth() + 1}.${d.getDate()}`;
  } catch {
    return '';
  }
}

/**
 * HTML 转义，防止 XSS
 * @param {string} str - 原始字符串
 * @returns {string} 转义后的字符串
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * 截断字符串到指定长度
 * @param {string} str - 原始字符串
 * @param {number} maxLen - 最大长度
 * @returns {string} 截断后的字符串
 */
function truncate(str, maxLen) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + '...';
}

/**
 * 设置刷新按钮的加载状态
 * @param {boolean} loading - 是否正在加载
 */
function setLoading(loading) {
  if (loading) {
    refreshIcon.classList.add('spinning');
    btnRefresh.disabled = true;
  } else {
    refreshIcon.classList.remove('spinning');
    btnRefresh.disabled = false;
  }
}

// ============================================================
// 设置管理
// ============================================================

/**
 * 从 chrome.storage.sync 加载用户设置
 * @returns {Promise<Object>} 设置对象
 */
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(SETTINGS_KEY, (result) => {
      const saved = result[SETTINGS_KEY] || {};
      // 与默认值合并，确保新增字段有默认值
      resolve({ ...DEFAULT_SETTINGS, ...saved });
    });
  });
}

/**
 * 保存用户设置到 chrome.storage.sync
 * @param {Object} settings - 设置对象
 * @returns {Promise<void>}
 */
async function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [SETTINGS_KEY]: settings }, resolve);
  });
}

/**
 * 将设置对象应用到 UI 开关
 * @param {Object} settings - 设置对象
 */
function applySettingsToUI(settings) {
  toggleSearch.checked = settings.enableSearch;
  toggleHomepage.checked = settings.enableHomepage;
  toggleDetail.checked = settings.enableDetail;
  toggleWishlist.checked = settings.enableWishlist;
}

/**
 * 从 UI 开关读取当前设置
 * @returns {Object} 设置对象
 */
function readSettingsFromUI() {
  return {
    enableSearch: toggleSearch.checked,
    enableHomepage: toggleHomepage.checked,
    enableDetail: toggleDetail.checked,
    enableWishlist: toggleWishlist.checked,
  };
}

/**
 * 绑定设置开关的 change 事件
 * 切换后自动保存
 */
function bindSettingToggles() {
  const toggles = [toggleSearch, toggleHomepage, toggleDetail, toggleWishlist];

  toggles.forEach((toggle) => {
    toggle.addEventListener('change', async () => {
      const settings = readSettingsFromUI();
      await saveSettings(settings);
    });
  });
}

// ============================================================
// 刷新按钮
// ============================================================

/**
 * 绑定刷新按钮点击事件
 * 点击后调用 background 刷新数据，然后重新加载统计和游戏列表
 */
function bindRefreshButton() {
  btnRefresh.addEventListener('click', async () => {
    if (btnRefresh.disabled) return;

    setLoading(true);

    try {
      // 触发 background 刷新
      const result = await triggerRefresh();

      if (result && result.success) {
        // 刷新成功，重新加载所有数据
        await loadAllData();
      } else {
        console.warn('[Popup] 刷新失败:', result?.error);
        showError('刷新失败，请稍后重试');
      }
    } catch (err) {
      console.error('[Popup] 刷新异常:', err);
      showError('刷新失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  });
}

// ============================================================
// 错误处理
// ============================================================

/**
 * 显示简短的错误提示
 * 在免费游戏列表区域显示错误信息，3 秒后自动恢复
 * @param {string} message - 错误提示文本
 */
function showError(message) {
  freeGamesLoading.style.display = 'none';
  freeGamesEmpty.style.display = 'none';
  freeGamesList.innerHTML = `<div class="error-hint">${escapeHtml(message)}</div>`;

  // 3 秒后自动恢复
  setTimeout(() => {
    loadAllData();
  }, 3000);
}

// ============================================================
// 数据加载主流程
// ============================================================

/**
 * 加载所有数据：统计数据 + 免费游戏列表
 * 并行请求以加快加载速度
 */
async function loadAllData() {
  try {
    // 并行请求统计数据和免费游戏列表
    const [statsData, freeData] = await Promise.all([
      fetchAllData().catch(() => null),
      fetchCurrentFree().catch(() => null),
    ]);

    // 更新统计面板
    updateStats(statsData);

    // 更新免费游戏列表
    renderFreeGames(freeData?.games || []);

    // 根据是否有数据判断扩展状态
    updateStatus(true);
  } catch (err) {
    console.error('[Popup] 加载数据失败:', err);
    updateStatus(false);
    showError('无法连接到扩展后台');
  }
}

// ============================================================
// 初始化
// ============================================================

/**
 * Popup 初始化入口
 * 1. 加载并应用用户设置
 * 2. 绑定事件
 * 3. 加载数据
 */
async function init() {
  // 1. 加载设置
  const settings = await loadSettings();
  applySettingsToUI(settings);

  // 2. 绑定事件
  bindSettingToggles();
  bindRefreshButton();

  // 3. 加载数据
  await loadAllData();
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
