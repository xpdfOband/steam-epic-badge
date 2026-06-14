/**
 * integration.test.js - 集成测试
 *
 * 测试各模块协同工作的能力
 */

// 模拟 chrome.storage API
const mockLocalStorage = {};

global.chrome = {
  storage: {
    local: {
      get: jest.fn(() => Promise.resolve({ ...mockLocalStorage })),
      set: jest.fn((data) => {
        Object.assign(mockLocalStorage, data);
        return Promise.resolve();
      }),
      remove: jest.fn((keys) => {
        keys.forEach((key) => delete mockLocalStorage[key]);
        return Promise.resolve();
      }),
    },
  },
};

import { throttle, waitForElement, createLookupMap } from '../utils/performance';
import { errorHandler } from '../utils/errorHandler';

// logger.js 使用 export 语法，需要通过 require 拿
// babel-jest 会处理 ESM 转换
const loggerModule = require('../utils/logger');
const logger = loggerModule.logger || loggerModule.default;

describe('Integration Tests', () => {
  beforeEach(() => {
    // 重置各模块状态
    errorHandler.errors = [];
    if (logger && logger.clearLogs) {
      logger.clearLogs();
    }
    Object.keys(mockLocalStorage).forEach(
      (key) => delete mockLocalStorage[key]
    );
  });

  test('performance tools: throttle should limit call frequency', async () => {
    let callCount = 0;
    const throttledFn = throttle(() => callCount++, 100);
    throttledFn();
    throttledFn();
    throttledFn();
    // 第一次立即执行，后续被节流
    expect(callCount).toBe(1);

    await new Promise(resolve => setTimeout(resolve, 150));
    // trailing edge 触发一次
    expect(callCount).toBe(2);
  });

  test('errorHandler should categorize and record errors', () => {
    // 处理不同类型的错误
    errorHandler.handle(new Error('Network timeout'));
    errorHandler.handle(new Error('Storage quota exceeded'));
    errorHandler.handle(new Error('Unknown problem'));

    const stats = errorHandler.getStats();
    expect(stats.total).toBe(3);
    expect(stats.byType['NETWORK']).toBe(1);
    expect(stats.byType['STORAGE']).toBe(1);
    expect(stats.byType['UNKNOWN']).toBe(1);
  });

  test('logger should record and filter logs', () => {
    logger.info('Integration test info');
    logger.warn('Integration test warning');
    logger.error('Integration test error');

    const allLogs = logger.getLogs();
    expect(allLogs.length).toBe(3);

    const warnLogs = logger.getLogs('WARN');
    expect(warnLogs.length).toBe(1);
    expect(warnLogs[0].message).toBe('Integration test warning');

    const errorLogs = logger.getLogs('ERROR');
    expect(errorLogs.length).toBe(1);
  });

  test('createLookupMap should enable O(1) lookup for game data', () => {
    const games = [
      { title: 'Game A', steam_appid: 100 },
      { title: 'Game B', steam_appid: 200 },
      { title: 'Game C', steam_appid: 300 },
    ];

    const gameMap = createLookupMap(games, g => g.steam_appid);
    expect(gameMap.size).toBe(3);
    expect(gameMap.get(200)).toEqual({ title: 'Game B', steam_appid: 200 });
    expect(gameMap.get(999)).toBeUndefined();
  });

  test('errorHandler and logger should work together', () => {
    // 模拟一个带有日志的错误处理流程
    const error = new Error('fetch failed');

    // 记录日志
    logger.warn('API request failed, using fallback', { url: 'https://example.com' });

    // 错误处理器记录错误
    errorHandler.handle(error, { source: 'integration-test' });

    // 验证两者状态
    const stats = errorHandler.getStats();
    expect(stats.total).toBe(1);
    expect(stats.recent[0].context.source).toBe('integration-test');

    const logs = logger.getLogs('WARN');
    expect(logs.length).toBe(1);
    expect(logs[0].message).toBe('API request failed, using fallback');
  });
});
