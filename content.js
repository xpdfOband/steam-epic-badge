/**
 * Steam Epic Badge - Content Script
 * ============================================================
 * 在 Steam 商店页面检测游戏信息，查询 Epic 赠送记录，并注入角标
 *
 * 功能：
 * 1. 检测页面类型（首页、搜索、详情、愿望单等）
 * 2. 提取游戏 AppID 和名称
 * 3. 注入 Epic 赠送角标
 * 4. MutationObserver 监听动态加载
 * 5. 与 background.js 通信查询数据
 * ============================================================
 */

(function () {
  "use strict";

  // ============================================================
  // 配置常量
  // ============================================================

  /** 角标 CSS 类名 */
  const BADGE_CLASS = "epic-badge";

  /** 已注入标记属性，防止重复注入 */
  const ATTR_INJECTED = "data-epic-badge-injected";

  /** 父容器标记类 */
  const PARENT_CLASS = "epic-badge-parent";

  /** 防抖延迟（毫秒） */
  const DEBOUNCE_DELAY = 300;

  /** 批量查询最大数量 */
  const BATCH_SIZE = 20;

  // ============================================================
  // 用户设置
  // ============================================================

  /** 设置存储键 */
  const SETTINGS_KEY = 'popup_settings';

  /** 当前页面设置 */
  let pageSettings = {
    enableSearch: true,
    enableHomepage: true,
    enableDetail: true,
    enableWishlist: true,
  };

  /**
   * 从 chrome.storage.sync 加载用户设置
   */
  async function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(SETTINGS_KEY, (result) => {
        const saved = result[SETTINGS_KEY] || {};
        pageSettings = { ...pageSettings, ...saved };
        resolve(pageSettings);
      });
    });
  }

  /**
   * 检查当前页面类型是否启用
   */
  function isPageEnabled(pageType) {
    switch (pageType) {
      case 'search': return pageSettings.enableSearch;
      case 'homepage': return pageSettings.enableHomepage;
      case 'detail': return pageSettings.enableDetail;
      case 'wishlist': return pageSettings.enableWishlist;
      default: return true;
    }
  }

  // ============================================================
  // 选择器配置
  // ============================================================

  /**
   * 各页面类型的选择器映射
   * 每个选择器对应一种游戏元素的 DOM 结构
   */
  const SELECTORS = {
    // 搜索结果页 - 每个搜索结果行
    search: ".search_result_row",

    // 首页推荐 - 高亮推荐游戏（旧版 Steam）
    homepage_highlight: ".highlighted_app",

    // 首页常规推荐 - 带 /app/ 链接的元素（旧版 Steam）
    homepage_capsule: '.cap a[href*="/app/"]',

    // 首页特惠/新品等板块（旧版 Steam）
    homepage_tab: '.tab_item a[href*="/app/"]',

    // 首页主轮播胶囊（新版 Steam 2025+）
    homepage_main_capsule: 'a.store_main_capsule[href*="/app/"]',

    // 首页折扣区域（新版 Steam 2025+）
    homepage_discount: '.home_discount_games_ctn a[href*="/app/"]',

    // 首页标签页内容区域（新版 Steam 2025+）
    homepage_tab_content: '.tab_content_items a[href*="/app/"]',

    // 游戏详情页 - 游戏名称
    detail_name: ".apphub_AppName",

    // 愿望单页面 - 每个愿望单行
    wishlist: ".wishlist_row",

    // 通用游戏链接（兜底选择器）
    generic_link: 'a[href*="store.steampowered.com/app/"]',

    // 相似游戏/推荐区块
    recommended: '.recommendation_highlight a[href*="/app/"]',
    similar: ".similar_grid_item",

    // 搜索建议下拉
    search_suggestion: ".search_suggestion_contents a[href*='/app/']",
  };

  // ============================================================
  // 页面类型检测
  // ============================================================

  /**
   * 检测当前页面类型
   * @returns {string} 页面类型标识
   */
  function detectPageType() {
    const url = window.location.href;
    const pathname = window.location.pathname;

    // 游戏详情页：/app/{appid}/
    if (/\/app\/\d+/.test(pathname)) {
      return "detail";
    }

    // 搜索结果页
    if (pathname === "/search/" || pathname.startsWith("/search")) {
      return "search";
    }

    // 愿望单页
    if (pathname.includes("/wishlist") || pathname.includes("/wishlist/")) {
      return "wishlist";
    }

    // 标签/分类浏览页
    if (pathname.startsWith("/tags/") || pathname.startsWith("/category/")) {
      return "category";
    }

    // 首页（排除上述情况）
    if (
      pathname === "/" ||
      pathname === "" ||
      pathname.startsWith("/?")
    ) {
      return "homepage";
    }

    // 其他页面（如特殊活动页）
    return "other";
  }

  // ============================================================
  // 游戏信息提取
  // ============================================================

  /**
   * 从 URL 中提取 Steam AppID
   * @param {string} url - Steam 商店 URL
   * @returns {number|null} AppID 或 null
   */
  function extractAppIdFromUrl(url) {
    if (!url) return null;

    // 匹配 /app/数字/ 格式
    const match = url.match(/\/app\/(\d+)/);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
    return null;
  }

  /**
   * 从游戏详情页提取游戏名称
   * @returns {string|null} 游戏名称
   */
  function extractDetailPageName() {
    // 详情页游戏名称选择器
    const selectors = [
      ".apphub_AppName",
      ".game_area_purchase_game .game_purchase_action",
      "#appHubAppName",
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim()) {
        return el.textContent.trim();
      }
    }
    return null;
  }

  /**
   * 从单个游戏元素中提取信息
   * @param {Element} element - DOM 元素
   * @returns {object|null} 包含 appId 和 name 的对象
   */
  function extractGameInfo(element) {
    if (!element) return null;

    // 方法1：从 href 属性提取 AppID
    let appId = null;
    let name = null;

    // 检查元素本身是否是链接
    if (element.tagName === "A" && element.href) {
      appId = extractAppIdFromUrl(element.href);
    }

    // 检查元素内部的链接
    if (!appId) {
      const link = element.querySelector('a[href*="/app/"]');
      if (link) {
        appId = extractAppIdFromUrl(link.href);
      }
    }

    // 检查父元素链接
    if (!appId && element.closest('a[href*="/app/"]')) {
      appId = extractAppIdFromUrl(element.closest('a[href*="/app/"]').href);
    }

    // 如果仍然没有 AppID，返回 null
    if (!appId) return null;

    // 提取游戏名称
    name = extractGameName(element, appId);

    return { appId, name };
  }

  /**
   * 从元素中提取游戏名称
   * @param {Element} element - DOM 元素
   * @param {number} appId - AppID（用于兜底）
   * @returns {string} 游戏名称
   */
  function extractGameName(element, appId) {
    // 0. 交互式推荐器 button 卡片：游戏名在 h2 里
    const recButton = element.closest('button');
    if (recButton) {
      const h2 = recButton.querySelector('h2');
      if (h2 && h2.textContent.trim()) return h2.textContent.trim();
    }

    // 0.5. 推荐区卡片：游戏名在 img 的 alt 属性中
    if (element.tagName === 'A') {
      const img = element.querySelector('img[alt]');
      if (img && img.alt && img.alt.trim()) {
        return img.alt.trim();
      }
    }

    // 按优先级尝试各种名称选择器
    const nameSelectors = [
      // 搜索结果
      ".title",
      ".search_name .title",

      // 首页推荐
      ".app_name",
      ".highlighted_app_name",

      // 愿望单
      ".wishlistAppName",

      // 通用
      ".game_area_app_name",
      ".tab_item_name",
      ".similar_game_name",
    ];

    for (const selector of nameSelectors) {
      const nameEl = element.querySelector(selector);
      if (nameEl && nameEl.textContent.trim()) {
        return nameEl.textContent.trim();
      }
    }

    // 兜底：使用元素的文本内容（截取前50字符）
    const text = element.textContent.trim();
    if (text && text.length > 0) {
      return text.substring(0, 50).replace(/\n/g, " ");
    }

    // 最终兜底
    return `App ${appId}`;
  }

  /**
   * 从详情页提取当前游戏的完整信息
   * @returns {object|null} 包含 appId、name 和 element 的对象
   */
  function extractDetailPageInfo() {
    const appId = extractAppIdFromUrl(window.location.href);
    if (!appId) return null;

    const name = extractDetailPageName();
    // 详情页的游戏名称元素作为注入目标
    const element = document.querySelector(".apphub_AppName") ||
                    document.querySelector("#appHubAppName") ||
                    document.querySelector(".game_area_purchase_game");
    return { appId, name: name || `App ${appId}`, element };
  }

  // ============================================================
  // 角标注入
  // ============================================================

  /**
   * 检查元素是否已注入角标
   * @param {Element} element - DOM 元素
   * @returns {boolean} 是否已注入
   */
  function isAlreadyInjected(element) {
    return element.hasAttribute(ATTR_INJECTED);
  }

  /**
   * 标记元素为已注入
   * @param {Element} element - DOM 元素
   */
  function markAsInjected(element) {
    element.setAttribute(ATTR_INJECTED, "true");
  }

  /**
   * 创建 Epic 赠送角标元素
   * @param {string} tooltipText - 提示文本（赠送日期）
   * @returns {Element} 角标 DOM 元素
   */
  function createBadgeElement(tooltipText, isCurrentlyFree) {
    const badge = document.createElement("div");
    badge.className = BADGE_CLASS + (isCurrentlyFree ? " currently-free" : "");
    badge.setAttribute("data-tooltip", tooltipText);

    // 添加箭头元素（用于 tooltip 指示）
    const arrow = document.createElement("span");
    arrow.className = "tooltip-arrow";
    badge.appendChild(arrow);

    return badge;
  }

  /**
   * 格式化赠送日期为可读文本（完整年月日）
   * @param {Array} freeDates - 赠送日期数组
   * @returns {string} 格式化后的文本
   */
  function formatFreeDates(freeDates) {
    if (!freeDates || freeDates.length === 0) {
      return "Epic 曾免费赠送";
    }

    // 取最近一次赠送记录
    const latest = freeDates[freeDates.length - 1];
    const startDate = latest.start || "";
    const endDate = latest.end || "";

    if (startDate && endDate) {
      // 格式化日期为 YYYY-MM-DD
      const formatDate = (dateStr) => {
        const parts = dateStr.split("-");
        if (parts.length === 3) {
          return `${parts[0]}年${parseInt(parts[1])}月${parseInt(parts[2])}日`;
        }
        return dateStr;
      };

      const count = freeDates.length;
      const countText = count > 1 ? `（共${count}次）` : "";
      return `Epic 曾免费赠送 ${formatDate(startDate)} - ${formatDate(endDate)}${countText}`;
    }

    return "Epic 曾免费赠送";
  }

  /**
   * 确保父容器有正确的定位样式
   * @param {Element} parent - 父容器元素
   */
  function ensureParentPosition(parent) {
    if (!parent.classList.contains(PARENT_CLASS)) {
      parent.classList.add(PARENT_CLASS);

      // 如果父容器没有 position，设置为 relative
      const computedStyle = window.getComputedStyle(parent);
      if (computedStyle.position === "static") {
        parent.style.position = "relative";
      }
    }
  }

  /**
   * 在游戏卡片中查找标题区域作为角标容器
   * 新版 Steam 首页的 store_main_capsule 是封面图，角标应放在标题附近
   * @param {Element} linkEl - 游戏链接元素
   * @returns {Element} 适合放置角标的容器
   */
  function findTitleArea(linkEl) {
    // 0. 交互式推荐器 <button> 卡片（Steam Labs recommender）
    //    按钮内包含 h2 标题 + "因为您想要"等文本，角标放卡片左下角
    const recButton = linkEl.closest('button');
    if (recButton) {
      return recButton;
    }

    // 0.5. 首页推荐区卡片：link 直接包含 img + 价格，没有中间容器
    //    检测方式：link 内有 img 但没有 .title/.app_name 等标题元素
    if (linkEl.tagName === 'A' && linkEl.querySelector('img') &&
        !linkEl.querySelector('.title, .app_name, .tab_item_name, .search_name')) {
      return linkEl;
    }

    // 1. 新版 Steam tab 行：<a class="tab_row_item">
    const tabRow = linkEl.closest('.tab_row_item');
    if (tabRow) {
      const content = tabRow.querySelector('.tab_item_content');
      if (content) return content;
      const titleEl = tabRow.querySelector('.tab_item_title');
      if (titleEl) return titleEl.parentElement;
      return tabRow;
    }

    // 2. 首页大轮播胶囊：<a class="store_main_capsule">
    const mainCapsule = linkEl.closest('.store_main_capsule');
    if (mainCapsule) {
      const info = mainCapsule.querySelector('.info');
      if (info) return info;
      return mainCapsule;
    }

    // 3. 推荐/深度挖掘胶囊：<a class="sale_capsule">
    const saleCapsule = linkEl.closest('.sale_capsule');
    if (saleCapsule) {
      return saleCapsule;
    }

    // 4. 折扣/特惠胶囊：<a class="store_capsule">
    const storeCapsule = linkEl.closest('.store_capsule');
    if (storeCapsule) {
      return storeCapsule;
    }

    // 5. 鉴赏家推荐胶囊：<a class="curator_giant_capsule">
    const curatorCapsule = linkEl.closest('.curator_giant_capsule');
    if (curatorCapsule) {
      return curatorCapsule;
    }

    // 6. 折扣区域
    const discountLink = linkEl.closest('.home_discount_games_ctn a[href*="/app/"]');
    if (discountLink) {
      const info = discountLink.querySelector('.info');
      if (info) return info;
      return discountLink;
    }

    return null;
  }

  /**
   * 向指定元素注入角标
   * @param {Element} element - 目标元素
   * @param {object} gameData - 游戏数据（包含 freeDates）
   */
  function injectBadge(element, gameData) {
    // 检查是否已注入
    if (isAlreadyInjected(element)) return;

    // 标记为已注入
    markAsInjected(element);

    // 确定角标插入位置
    let targetParent = null;

    // 首页大图特殊处理：直接注入到 .highlighted_app 容器本身
    // 因为其内部的图片容器可能有 overflow:hidden 裁剪角标
    if (element.classList.contains("highlighted_app") || element.matches(".highlighted_app")) {
      targetParent = element;
      // 强制 overflow:visible 防止角标被裁剪
      element.style.setProperty("overflow", "visible", "important");
    } else {
      // 策略1：新版 Steam 布局 — 查找标题区域而不是封面图容器
      const titleArea = findTitleArea(element);
      if (titleArea) {
        targetParent = titleArea;
      } else {
        // 策略2：查找图片容器（旧版 Steam 选择器）
        const imgContainer =
          element.querySelector(
            ".search_capsule, .game_capsule_ctn, .tab_item_cap, .small_cap, .app_header_image_ctn, .game_header_image_ctn, .highlighted_app_img, .highlighted_capsule"
          ) || element.querySelector("img")?.parentElement;

        if (imgContainer && imgContainer !== element) {
          targetParent = imgContainer;
        } else {
          // 策略3：使用元素本身
          targetParent = element;
        }
      }
    }

    // 确保父容器有正确定位
    ensureParentPosition(targetParent);

    // 格式化提示文本
    const tooltipText = formatFreeDates(gameData.freeDates);

    // 创建并注入角标
    const badge = createBadgeElement(tooltipText, gameData.details?.isCurrentlyFree);
    targetParent.appendChild(badge);
  }

  /**
   * Epic Games logo URL（扩展内图片资源）
   */
  const EPIC_LOGO_URL = chrome.runtime.getURL('icons/epic-games.jpg');

  /**
   * 格式化日期为中文年月日
   */
  function formatDateCN(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[0]}年${parseInt(parts[1])}月${parseInt(parts[2])}日`;
    }
    return dateStr;
  }

  /**
   * 在详情页注入 Epic 赠送信息面板（放在购买区域上方）
   * @param {object} gameData - 游戏数据
   */
  function injectDetailPanel(gameData) {
    const existingPanel = document.querySelector('.epic-detail-panel');
    if (existingPanel) return;

    const addToCartArea = document.querySelector('.game_area_purchase_game') ||
                          document.querySelector('#game_area_purchase') ||
                          document.querySelector('.game_area_purchase');

    if (!addToCartArea) {
      console.log("[Epic Badge] 未找到购买区域，跳过详情面板注入");
      return;
    }

    const freeDates = gameData.freeDates || [];
    const count = freeDates.length;

    // 今天日期，用于判断赠送状态
    const today = new Date().toISOString().split('T')[0];

    // isCurrentlyFree：来自 Epic API 或今天落在某个赠送区间内
    const isCurrentlyFree = gameData.details?.isCurrentlyFree
      || freeDates.some(d => d.start && d.end && d.start <= today && today <= d.end);

    // 即将到来的免费赠送（开始日期在今天之后）
    const upcomingFree = freeDates.find(d => d.start && d.start > today);

    // 构建所有赠送日期列表
    let datesHtml = '';
    if (count > 0) {
      datesHtml = '<div class="epic-detail-dates">';
      [...freeDates].reverse().forEach((d, i) => {
        const start = formatDateCN(d.start);
        const end = formatDateCN(d.end);
        datesHtml += `
          <div class="epic-detail-date-row ${i === 0 ? 'latest' : ''}">
            <span class="epic-detail-date-dot"></span>
            <span class="epic-detail-date-range">${start} - ${end}</span>
            ${i === 0 ? '<span class="epic-detail-date-badge">最近</span>' : ''}
          </div>`;
      });
      datesHtml += '</div>';
    }

    const panel = document.createElement('div');
    panel.className = 'epic-detail-panel';

    panel.innerHTML = `
      <div class="epic-detail-header">
        <span class="epic-detail-icon"><img class="epic-detail-logo" src="${EPIC_LOGO_URL}" alt="Epic Games"></span>
        <span class="epic-detail-title">Epic Games 赠送记录</span>
        ${count > 0 ? `<span class="epic-detail-count">${count} 次</span>` : ''}
      </div>
      <div class="epic-detail-body">
        ${datesHtml || '<div class="epic-detail-empty">暂无赠送记录</div>'}
        ${isCurrentlyFree ? '<div class="epic-detail-status">现在免费！限时领取中 →</div>' : ''}
        ${!isCurrentlyFree && upcomingFree ? `<div class="epic-detail-upcoming">即将免费：${formatDateCN(upcomingFree.start)} - ${formatDateCN(upcomingFree.end)}</div>` : ''}
      </div>
      ${isCurrentlyFree || upcomingFree ? '<a class="epic-detail-link" href="https://store.epicgames.com/" target="_blank">Epic 商店页 ↗</a>' : ''}
    `;

    addToCartArea.parentNode.insertBefore(panel, addToCartArea);

    // 点击"现在免费"跳转 Epic 商店
    if (isCurrentlyFree) {
      panel.querySelector('.epic-detail-status').addEventListener('click', (e) => {
        window.open('https://store.epicgames.com/', '_blank');
      });
    }
  }

  // ============================================================
  // 页面扫描与批量处理
  // ============================================================

  /** 已处理的 AppID 集合（避免重复查询） */
  const processedAppIds = new Set();

  /** 待查询的游戏信息队列 */
  let pendingQueries = [];

  /** 查询定时器 */
  let queryTimer = null;

  /**
   * 扫描页面上的游戏元素
   * @returns {Array} 游戏信息数组
   */
  function scanPageForGames() {
    const pageType = detectPageType();
    const games = [];
    const seenAppIds = new Set();

    console.log(`[Epic Badge] 扫描页面类型: ${pageType}`);

    // 根据页面类型选择选择器
    let selectorsToUse = [];

    switch (pageType) {
      case "search":
        selectorsToUse = [SELECTORS.search];
        break;

      case "detail":
        // 详情页单独处理
        const detailInfo = extractDetailPageInfo();
        if (detailInfo) {
          return [detailInfo];
        }
        return [];

      case "wishlist":
        selectorsToUse = [SELECTORS.wishlist];
        break;

      case "homepage":
        selectorsToUse = [
          // 新版 Steam（2025+）
          SELECTORS.homepage_main_capsule,
          SELECTORS.homepage_discount,
          SELECTORS.homepage_tab_content,
          // 旧版 Steam（兼容）
          SELECTORS.homepage_highlight,
          SELECTORS.homepage_capsule,
          SELECTORS.homepage_tab,
          SELECTORS.recommended,
          // 通用兜底
          SELECTORS.generic_link,
        ];
        break;

      case "category":
        selectorsToUse = [SELECTORS.search, SELECTORS.generic_link];
        break;

      default:
        // 其他页面使用通用选择器
        selectorsToUse = [
          SELECTORS.generic_link,
          SELECTORS.recommended,
          SELECTORS.similar,
        ];
        break;
    }

    // 遍历选择器收集游戏元素
    for (const selector of selectorsToUse) {
      const elements = document.querySelectorAll(selector);

      elements.forEach((element) => {
        const info = extractGameInfo(element);
        if (info && !seenAppIds.has(info.appId)) {
          seenAppIds.add(info.appId);
          games.push({ ...info, element });
        }
      });
    }

    console.log(`[Epic Badge] 发现 ${games.length} 个游戏元素`);
    return games;
  }

  /**
   * 将游戏加入查询队列
   * @param {Array} games - 游戏信息数组
   */
  function enqueueGames(games) {
    games.forEach((game) => {
      // 跳过已处理的
      if (processedAppIds.has(game.appId)) return;

      // 标记为待处理
      processedAppIds.add(game.appId);
      pendingQueries.push(game);
    });

    // 触发批量查询（防抖）
    scheduleBatchQuery();
  }

  /**
   * 安排批量查询（防抖处理）
   */
  function scheduleBatchQuery() {
    if (queryTimer) {
      clearTimeout(queryTimer);
    }

    queryTimer = setTimeout(() => {
      flushBatchQuery();
    }, DEBOUNCE_DELAY);
  }

  /**
   * 执行批量查询
   */
  function flushBatchQuery() {
    if (pendingQueries.length === 0) return;

    // 取出一批待查询项
    const batch = pendingQueries.splice(0, BATCH_SIZE);

    // 提取 AppID 列表
    const appIds = batch.map((g) => g.appId);

    console.log(`[Epic Badge] 批量查询 ${appIds.length} 个游戏:`, appIds);

    // 发送到 background.js 查询
    queryBackground(appIds, batch);

    // 如果还有剩余，继续处理
    if (pendingQueries.length > 0) {
      scheduleBatchQuery();
    }
  }

  // ============================================================
  // Background 通信
  // ============================================================

  /**
   * 向 background.js 发送批量查询请求
   * @param {Array<number>} appIds - AppID 列表
   * @param {Array} games - 对应的游戏信息数组
   */
  function queryBackground(appIds, games) {
    if (!chrome.runtime || !chrome.runtime.sendMessage) {
      return;
    }

    chrome.runtime.sendMessage(
      { action: "queryBatchByIds", payload: { appIds } },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("[Epic Badge] 通信错误:", chrome.runtime.lastError.message);
          return;
        }
        if (response && response.success) {
          handleQueryResponse(response.data, games);
        }
      }
    );
  }

  /**
   * 处理 background 返回的查询结果
   * @param {object} data - 查询结果，键为 AppID，值为游戏数据
   * @param {Array} games - 原始游戏信息数组（含 element 引用）
   */
  function handleQueryResponse(data, games) {
    if (!data) return;

    const pageType = detectPageType();

    games.forEach((game) => {
      const epicData = data[game.appId];
      if (epicData && epicData.isFree) {
        // 详情页使用专门的面板，其他页面使用角标
        if (pageType === 'detail') {
          injectDetailPanel(epicData);
        } else {
          injectBadge(game.element, epicData);
        }
      }
    });
  }

  // ============================================================
  // MutationObserver 监听
  // ============================================================

  /** MutationObserver 实例 */
  let observer = null;

  /** 观察防抖定时器 */
  let observerTimer = null;

  /**
   * 创建 MutationObserver 监听 DOM 变化
   */
  function setupObserver() {
    // 如果已有观察器，先断开
    if (observer) {
      observer.disconnect();
    }

    observer = new MutationObserver((mutations) => {
      // 检查是否有新增节点
      let hasNewNodes = false;

      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          hasNewNodes = true;
          break;
        }
      }

      if (!hasNewNodes) return;

      // 防抖处理
      if (observerTimer) {
        clearTimeout(observerTimer);
      }

      observerTimer = setTimeout(() => {
        console.log("[Epic Badge] 检测到 DOM 变化，重新扫描");
        scanAndProcess();
      }, DEBOUNCE_DELAY);
    });

    // 开始观察
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    console.log("[Epic Badge] MutationObserver 已启动");
  }

  // ============================================================
  // 主流程
  // ============================================================

  /**
   * 扫描页面并处理游戏角标注入
   */
  function scanAndProcess() {
    const games = scanPageForGames();
    if (games.length > 0) {
      enqueueGames(games);
    }
  }

  /**
   * 初始化 content script
   */
  async function init() {
    // 加载设置并检查页面是否启用
    await loadSettings();
    const pageType = detectPageType();
    if (!isPageEnabled(pageType)) {
      return;
    }

    // 初始扫描
    scanAndProcess();

    // 设置 DOM 变化监听
    setupObserver();

    // 监听设置变化（popup 切换开关时实时响应）
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes[SETTINGS_KEY]) {
        const newSettings = changes[SETTINGS_KEY].newValue || {};
        pageSettings = { ...pageSettings, ...newSettings };
        if (!isPageEnabled(detectPageType())) {
          document.querySelectorAll(`.${BADGE_CLASS}`).forEach(el => el.remove());
          document.querySelectorAll(`[${ATTR_INJECTED}]`).forEach(el =>
            el.removeAttribute(ATTR_INJECTED)
          );
        } else {
          processedAppIds.clear();
          scanAndProcess();
        }
      }
    });

    // 监听来自 background 的消息（如数据更新通知）
    if (chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === "FORCE_REFRESH") {
          console.log("[Epic Badge] 收到强制刷新指令");
          // 清除已处理记录，重新扫描
          processedAppIds.clear();
          scanAndProcess();
          sendResponse({ success: true });
        }
      });
    }
  }

  // ============================================================
  // 启动
  // ============================================================

  // 确保 DOM 已准备好
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
