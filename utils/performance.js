/**
 * 节流函数 - 限制函数调用频率
 * 借鉴 SubscriptionInfo 的 throttle 实现
 * @param {Function} fn - 要节流的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} 节流后的函数
 */
export function throttle(fn, delay = 1000) {
  let lastCall = 0;
  let timeoutId = null;

  return function (...args) {
    const now = Date.now();

    if (now - lastCall >= delay) {
      lastCall = now;
      fn.apply(this, args);
    } else {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        fn.apply(this, args);
      }, delay - (now - lastCall));
    }
  };
}

/**
 * 等待元素出现 - 使用 MutationObserver 监听 DOM 变化
 * 借鉴 SubscriptionInfo 的 waitForElement 实现
 * @param {string} selector - CSS 选择器
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<Element>} 找到的元素
 */
export function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver((mutations) => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found within ${timeout}ms`));
    }, timeout);
  });
}

/**
 * 创建查找 Map - O(1) 时间复杂度查找
 * @param {Array} array - 数据数组
 * @param {Function} keyFn - 提取键的函数
 * @returns {Map} 查找 Map
 */
export function createLookupMap(array, keyFn) {
  return new Map(array.map(item => [keyFn(item), item]));
}

/**
 * 创建查找 Set - O(1) 时间复杂度检查
 * @param {Array} array - 数据数组
 * @param {Function} keyFn - 提取键的函数
 * @returns {Set} 查找 Set
 */
export function createLookupSet(array, keyFn) {
  return new Set(array.map(keyFn));
}
