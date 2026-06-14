/**
 * 增强日志系统
 * 支持多级别日志、日志过滤、日志持久化
 */
class Logger {
  constructor() {
    this.logs = [];
    this.maxLogs = 1000;
    this.levels = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3
    };
    this.currentLevel = this.levels.INFO;
  }

  /**
   * 记录日志
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   * @returns {Object} 日志条目
   */
  log(level, message, data = {}) {
    if (this.levels[level] < this.currentLevel) {
      return;
    }

    const logEntry = {
      timestamp: Date.now(),
      level,
      message,
      data,
      source: this.getCallerInfo()
    };

    this.logs.push(logEntry);

    // 保持日志在限制范围内
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // 输出到控制台
    this.outputToConsole(logEntry);

    // 存储到 chrome.storage（可选）
    this.persistLogs();

    return logEntry;
  }

  /**
   * 调试日志
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   */
  debug(message, data) {
    return this.log('DEBUG', message, data);
  }

  /**
   * 信息日志
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   */
  info(message, data) {
    return this.log('INFO', message, data);
  }

  /**
   * 警告日志
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   */
  warn(message, data) {
    return this.log('WARN', message, data);
  }

  /**
   * 错误日志
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   */
  error(message, data) {
    return this.log('ERROR', message, data);
  }

  /**
   * 获取调用者信息
   * @returns {Object} 调用者信息
   */
  getCallerInfo() {
    const error = new Error();
    const stack = error.stack.split('\n')[3];
    const match = stack.match(/at (.+) \((.+):(\d+):(\d+)\)/);

    if (match) {
      return {
        function: match[1],
        file: match[2],
        line: match[3],
        column: match[4]
      };
    }

    return null;
  }

  /**
   * 输出到控制台
   * @param {Object} logEntry - 日志条目
   */
  outputToConsole(logEntry) {
    const { level, message, data, source } = logEntry;
    const prefix = `[${level}] ${source ? `${source.function}:` : ''}`;

    switch (level) {
      case 'DEBUG':
        console.debug(prefix, message, data);
        break;
      case 'INFO':
        console.info(prefix, message, data);
        break;
      case 'WARN':
        console.warn(prefix, message, data);
        break;
      case 'ERROR':
        console.error(prefix, message, data);
        break;
    }
  }

  /**
   * 持久化日志
   */
  async persistLogs() {
    try {
      // 只持久化 WARN 和 ERROR 级别的日志
      const importantLogs = this.logs.filter(log =>
        log.level === 'WARN' || log.level === 'ERROR'
      );

      await chrome.storage.local.set({
        _logs: importantLogs.slice(-50) // 只保留最近 50 条重要日志
      });
    } catch (error) {
      // 静默失败，避免日志记录本身导致错误
    }
  }

  /**
   * 获取日志
   * @param {string} level - 日志级别过滤
   * @param {number} limit - 返回数量限制
   * @returns {Array} 日志数组
   */
  getLogs(level = null, limit = 100) {
    let filteredLogs = this.logs;

    if (level) {
      filteredLogs = filteredLogs.filter(log => log.level === level);
    }

    return filteredLogs.slice(-limit);
  }

  /**
   * 清空日志
   */
  clearLogs() {
    this.logs = [];
  }

  /**
   * 设置日志级别
   * @param {string} level - 日志级别
   */
  setLevel(level) {
    if (this.levels[level] !== undefined) {
      this.currentLevel = this.levels[level];
    }
  }
}

// 导出单例
export const logger = new Logger();
