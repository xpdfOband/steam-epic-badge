/**
 * storage.test.js - 存储工具函数测试
 *
 * 测试 sessionStorage 支持和批量查询功能
 */

// 模拟 chrome.storage API
const mockSessionStorage = {};
const mockLocalStorage = {};

global.chrome = {
  storage: {
    session: {
      get: jest.fn((key, callback) => {
        const result = {};
        if (typeof key === 'string') {
          result[key] = mockSessionStorage[key] || null;
        }
        callback(result);
      }),
      set: jest.fn((items, callback) => {
        Object.assign(mockSessionStorage, items);
        if (callback) callback();
      }),
    },
    local: {
      get: jest.fn((keys, callback) => {
        const result = {};
        if (Array.isArray(keys)) {
          keys.forEach((key) => {
            if (mockLocalStorage[key] !== undefined) {
              result[key] = mockLocalStorage[key];
            }
          });
        }
        callback(result);
      }),
      set: jest.fn((items, callback) => {
        Object.assign(mockLocalStorage, items);
        if (callback) callback();
      }),
    },
  },
  runtime: {
    lastError: null,
  },
};

const {
  getSessionData,
  setSessionData,
  queryBatchByAppIds,
} = require('../../utils/storage');

describe('Storage Utils', () => {
  beforeEach(() => {
    // 清空模拟存储
    Object.keys(mockSessionStorage).forEach(
      (key) => delete mockSessionStorage[key]
    );
    Object.keys(mockLocalStorage).forEach(
      (key) => delete mockLocalStorage[key]
    );
    jest.clearAllMocks();
    chrome.runtime.lastError = null;
  });

  describe('sessionStorage', () => {
    test('should get and set session data', async () => {
      const testValue = 'test_value';

      await setSessionData('testKey', testValue, 15);
      const result = await getSessionData('testKey');

      expect(result).toBeDefined();
      expect(result.value).toBe(testValue);
      expect(result.timestamp).toBeDefined();
      expect(result.ttl).toBe(15 * 60 * 1000);
    });

    test('should return null for non-existent key', async () => {
      const result = await getSessionData('nonExistentKey');
      expect(result).toBeNull();
    });

    test('should handle expired data', async () => {
      // 设置一个已过期的数据（手动设置 timestamp 为过去时间）
      mockSessionStorage['expiredKey'] = {
        value: 'expired',
        timestamp: Date.now() - 1000 * 60 * 20, // 20 分钟前
        ttl: 1000 * 60 * 10, // 10 分钟 TTL
      };

      const result = await getSessionData('expiredKey');
      expect(result).toBeNull();
    });

    test('should return data if not expired', async () => {
      // 设置一个未过期的数据
      const now = Date.now();
      mockSessionStorage['validKey'] = {
        value: 'valid',
        timestamp: now - 1000 * 60 * 5, // 5 分钟前
        ttl: 1000 * 60 * 10, // 10 分钟 TTL
      };

      const result = await getSessionData('validKey');
      expect(result).toBeDefined();
      expect(result.value).toBe('valid');
    });

    test('should use default TTL of 15 minutes', async () => {
      await setSessionData('defaultTtlKey', 'data');

      expect(mockSessionStorage['defaultTtlKey']).toBeDefined();
      expect(mockSessionStorage['defaultTtlKey'].ttl).toBe(15 * 60 * 1000);
    });

    test('should handle chrome.runtime.lastError', async () => {
      chrome.runtime.lastError = { message: 'Session storage error' };

      const result = await getSessionData('errorKey');
      expect(result).toBeNull();
    });
  });

  describe('queryBatchByAppIds', () => {
    test('should batch query by app IDs', async () => {
      const appIds = ['123', '456', '789'];
      const mockData = {
        '123': { name: 'Game 1' },
        '456': { name: 'Game 2' },
      };

      chrome.storage.local.get.mockImplementation((keys, callback) => {
        const result = {};
        keys.forEach((key) => {
          if (mockData[key]) {
            result[key] = mockData[key];
          }
        });
        callback(result);
      });

      const result = await queryBatchByAppIds(appIds);

      expect(result).toBeDefined();
      expect(result['123']).toEqual({ name: 'Game 1' });
      expect(result['456']).toEqual({ name: 'Game 2' });
      expect(result['789']).toBeUndefined();
      expect(chrome.storage.local.get).toHaveBeenCalledWith(
        appIds,
        expect.any(Function)
      );
    });

    test('should handle empty array', async () => {
      const result = await queryBatchByAppIds([]);
      expect(result).toEqual({});
      expect(chrome.storage.local.get).not.toHaveBeenCalled();
    });

    test('should handle non-array input', async () => {
      const result = await queryBatchByAppIds(null);
      expect(result).toEqual({});
      expect(chrome.storage.local.get).not.toHaveBeenCalled();
    });

    test('should handle chrome.runtime.lastError', async () => {
      chrome.runtime.lastError = { message: 'Storage error' };

      await expect(queryBatchByAppIds(['123'])).rejects.toThrow(
        'Storage error'
      );
    });
  });
});
