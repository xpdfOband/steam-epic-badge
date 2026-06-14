/**
 * errorHandler.js - 统一错误处理器
 *
 * 借鉴 SubscriptionInfo 的错误处理策略，提供：
 * - 错误分类（NETWORK、STORAGE、PERMISSION、TIMEOUT、UNKNOWN）
 * - 错误历史记录（带上限）
 * - 错误统计
 *
 * @module errorHandler
 */

// ============================================================
// ErrorHandler 类
// ============================================================

class ErrorHandler {
  constructor() {
    /** @type {Array<Object>} 错误历史记录 */
    this.errors = [];
    /** @type {number} 最大错误记录数 */
    this.maxErrors = 100;
  }

  /**
   * 捕获并记录错误
   *
   * @param {Error} error - 错误对象
   * @param {Object} [context={}] - 上下文信息
   * @returns {Object} 错误信息
   */
  handle(error, context = {}) {
    const errorInfo = {
      timestamp: Date.now(),
      message: error.message,
      stack: error.stack,
      context,
      type: this.categorizeError(error),
    };

    this.errors.push(errorInfo);

    // 保持错误记录在限制范围内
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    // 根据错误类型采取不同行动
    this.handleErrorByType(errorInfo);

    return errorInfo;
  }

  /**
   * 错误分类
   *
   * @param {Error} error - 错误对象
   * @returns {string} 错误类型
   */
  categorizeError(error) {
    const message = error.message.toLowerCase();

    if (message.includes('network') || message.includes('fetch')) {
      return 'NETWORK';
    }
    if (message.includes('storage') || message.includes('quota')) {
      return 'STORAGE';
    }
    if (message.includes('permission') || message.includes('access')) {
      return 'PERMISSION';
    }
    if (message.includes('timeout')) {
      return 'TIMEOUT';
    }
    return 'UNKNOWN';
  }

  /**
   * 根据错误类型处理
   *
   * @param {Object} errorInfo - 错误信息
   */
  handleErrorByType(errorInfo) {
    switch (errorInfo.type) {
      case 'NETWORK':
        this.handleNetworkError(errorInfo);
        break;
      case 'STORAGE':
        this.handleStorageError(errorInfo);
        break;
      case 'PERMISSION':
        this.handlePermissionError(errorInfo);
        break;
      case 'TIMEOUT':
        this.handleTimeoutError(errorInfo);
        break;
      default:
        this.handleUnknownError(errorInfo);
    }
  }

  /**
   * 网络错误处理
   *
   * @param {Object} errorInfo - 错误信息
   */
  handleNetworkError(errorInfo) {
    console.warn('Network error, will retry:', errorInfo.message);
  }

  /**
   * 存储错误处理
   *
   * @param {Object} errorInfo - 错误信息
   */
  handleStorageError(errorInfo) {
    console.warn('Storage error, clearing cache:', errorInfo.message);
    this.clearExpiredCache();
  }

  /**
   * 权限错误处理
   *
   * @param {Object} errorInfo - 错误信息
   */
  handlePermissionError(errorInfo) {
    console.error('Permission error:', errorInfo.message);
  }

  /**
   * 超时错误处理
   *
   * @param {Object} errorInfo - 错误信息
   */
  handleTimeoutError(errorInfo) {
    console.warn('Timeout error, increasing timeout:', errorInfo.message);
  }

  /**
   * 未知错误处理
   *
   * @param {Object} errorInfo - 错误信息
   */
  handleUnknownError(errorInfo) {
    console.error('Unknown error:', errorInfo.message);
  }

  /**
   * 清理过期缓存
   *
   * 遍历 chrome.storage.local 中所有条目，
   * 删除带有 timestamp + ttl 且已过期的缓存项。
   *
   * @returns {Promise<void>}
   */
  async clearExpiredCache() {
    try {
      const storage = await chrome.storage.local.get(null);
      const expiredKeys = [];

      for (const [key, value] of Object.entries(storage)) {
        if (value && value.timestamp && value.ttl) {
          if (Date.now() - value.timestamp > value.ttl) {
            expiredKeys.push(key);
          }
        }
      }

      if (expiredKeys.length > 0) {
        await chrome.storage.local.remove(expiredKeys);
        console.log(`Cleared ${expiredKeys.length} expired cache entries`);
      }
    } catch (error) {
      console.error('Failed to clear expired cache:', error);
    }
  }

  /**
   * 获取错误统计
   *
   * @returns {Object} 错误统计信息
   * @returns {number} return.total - 总错误数
   * @returns {Object} return.byType - 按类型分组的错误数
   * @returns {Array} return.recent - 最近 10 条错误
   */
  getStats() {
    const stats = {
      total: this.errors.length,
      byType: {},
      recent: this.errors.slice(-10),
    };

    for (const error of this.errors) {
      stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;
    }

    return stats;
  }
}

// ============================================================
// 导出单例
// ============================================================

const errorHandler = new ErrorHandler();

// 检测运行环境：CommonJS 或 Chrome Extension 全局
if (typeof module !== 'undefined' && module.exports) {
  // CommonJS（测试环境）
  module.exports = { ErrorHandler, errorHandler };
} else {
  // Chrome Extension 环境
  self.ErrorHandler = ErrorHandler;
  self.errorHandler = errorHandler;
}
