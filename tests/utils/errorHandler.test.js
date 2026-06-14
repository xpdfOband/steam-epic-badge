/**
 * errorHandler.test.js - 统一错误处理器测试
 *
 * 测试错误分类、历史记录限制、统计功能
 */

// 模拟 chrome.storage API
const mockLocalStorage = {};

global.chrome = {
  storage: {
    local: {
      get: jest.fn(() => Promise.resolve({ ...mockLocalStorage })),
      remove: jest.fn((keys) => {
        keys.forEach((key) => delete mockLocalStorage[key]);
        return Promise.resolve();
      }),
    },
  },
};

const { ErrorHandler, errorHandler } = require('../../utils/errorHandler');

describe('ErrorHandler', () => {
  beforeEach(() => {
    // 清空错误记录
    errorHandler.errors = [];
    // 清空模拟存储
    Object.keys(mockLocalStorage).forEach(
      (key) => delete mockLocalStorage[key]
    );
    jest.clearAllMocks();
  });

  describe('错误分类', () => {
    test('should categorize network errors', () => {
      const error = new Error('network request failed');
      const result = errorHandler.handle(error);

      expect(result.type).toBe('NETWORK');
    });

    test('should categorize fetch errors as NETWORK', () => {
      const error = new Error('fetch failed');
      const result = errorHandler.handle(error);

      expect(result.type).toBe('NETWORK');
    });

    test('should categorize storage errors', () => {
      const error = new Error('storage quota exceeded');
      const result = errorHandler.handle(error);

      expect(result.type).toBe('STORAGE');
    });

    test('should categorize permission errors', () => {
      const error = new Error('permission denied');
      const result = errorHandler.handle(error);

      expect(result.type).toBe('PERMISSION');
    });

    test('should categorize access errors as PERMISSION', () => {
      const error = new Error('access denied');
      const result = errorHandler.handle(error);

      expect(result.type).toBe('PERMISSION');
    });

    test('should categorize timeout errors', () => {
      const error = new Error('request timeout');
      const result = errorHandler.handle(error);

      expect(result.type).toBe('TIMEOUT');
    });

    test('should categorize unknown errors', () => {
      const error = new Error('something went wrong');
      const result = errorHandler.handle(error);

      expect(result.type).toBe('UNKNOWN');
    });

    test('should be case-insensitive', () => {
      const error = new Error('NETWORK Error');
      const result = errorHandler.handle(error);

      expect(result.type).toBe('NETWORK');
    });
  });

  describe('错误记录', () => {
    test('should record error with timestamp and context', () => {
      const error = new Error('test error');
      const context = { url: 'https://example.com' };
      const result = errorHandler.handle(error, context);

      expect(result.timestamp).toBeDefined();
      expect(result.message).toBe('test error');
      expect(result.stack).toBeDefined();
      expect(result.context).toEqual(context);
      expect(result.type).toBe('UNKNOWN');
    });

    test('should default context to empty object', () => {
      const error = new Error('test error');
      const result = errorHandler.handle(error);

      expect(result.context).toEqual({});
    });

    test('should limit error history to maxErrors', () => {
      // 添加超过限制的错误
      for (let i = 0; i < 150; i++) {
        errorHandler.handle(new Error(`Error ${i}`));
      }

      expect(errorHandler.errors.length).toBeLessThanOrEqual(100);
      // 验证保留的是最新的错误
      expect(errorHandler.errors[0].message).toBe('Error 50');
      expect(errorHandler.errors[99].message).toBe('Error 149');
    });
  });

  describe('错误统计', () => {
    test('should provide error statistics', () => {
      errorHandler.handle(new Error('network error'));
      errorHandler.handle(new Error('storage error'));
      errorHandler.handle(new Error('timeout error'));

      const stats = errorHandler.getStats();

      expect(stats.total).toBe(3);
      expect(stats.byType.NETWORK).toBe(1);
      expect(stats.byType.STORAGE).toBe(1);
      expect(stats.byType.TIMEOUT).toBe(1);
    });

    test('should count multiple errors of same type', () => {
      errorHandler.handle(new Error('network error 1'));
      errorHandler.handle(new Error('network error 2'));
      errorHandler.handle(new Error('unknown error'));

      const stats = errorHandler.getStats();

      expect(stats.total).toBe(3);
      expect(stats.byType.NETWORK).toBe(2);
      expect(stats.byType.UNKNOWN).toBe(1);
    });

    test('should return empty stats when no errors', () => {
      const stats = errorHandler.getStats();

      expect(stats.total).toBe(0);
      expect(stats.byType).toEqual({});
      expect(stats.recent).toEqual([]);
    });

    test('should return at most 10 recent errors', () => {
      for (let i = 0; i < 20; i++) {
        errorHandler.handle(new Error(`Error ${i}`));
      }

      const stats = errorHandler.getStats();

      expect(stats.recent.length).toBe(10);
      expect(stats.recent[0].message).toBe('Error 10');
    });
  });

  describe('错误类型处理', () => {
    test('should handle storage errors by clearing cache', async () => {
      // 设置一些过期缓存
      mockLocalStorage['expired'] = {
        value: 'old',
        timestamp: Date.now() - 1000 * 60 * 60,
        ttl: 1000 * 60 * 10,
      };
      mockLocalStorage['valid'] = {
        value: 'new',
        timestamp: Date.now() - 1000 * 60 * 5,
        ttl: 1000 * 60 * 10,
      };

      errorHandler.handle(new Error('storage quota exceeded'));

      // 等待异步 clearExpiredCache 完成
      await new Promise((r) => setTimeout(r, 10));

      expect(chrome.storage.local.get).toHaveBeenCalled();
      expect(chrome.storage.local.remove).toHaveBeenCalledWith(['expired']);
    });

    test('should not clear valid cache on storage error', async () => {
      mockLocalStorage['valid'] = {
        value: 'data',
        timestamp: Date.now() - 1000 * 60 * 5,
        ttl: 1000 * 60 * 10,
      };

      errorHandler.handle(new Error('storage error'));

      await new Promise((r) => setTimeout(r, 10));

      expect(chrome.storage.local.remove).not.toHaveBeenCalled();
    });
  });

  describe('ErrorHandler 类', () => {
    test('should create independent instances', () => {
      const handler1 = new ErrorHandler();
      const handler2 = new ErrorHandler();

      handler1.handle(new Error('test'));

      expect(handler1.errors.length).toBe(1);
      expect(handler2.errors.length).toBe(0);
    });
  });
});
