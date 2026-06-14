/**
 * Content Script 测试
 * 测试 DOM 扫描、角标注入、游戏查找表初始化等功能
 */

// Mock performance utilities（jest.mock 会被提升到文件顶部）
jest.mock('../utils/performance', () => ({
  throttle: jest.fn((fn) => fn),
  waitForElement: jest.fn(() => Promise.resolve(globalThis.document.createElement('div'))),
  createLookupMap: jest.fn((arr, keyFn) => {
    const map = new Map();
    arr.forEach(item => map.set(keyFn(item), item));
    return map;
  })
}));

// 在 require content.js 之前设置 Chrome API mock
// 注意：不能用 import，因为 Babel 会把 import 提升到文件顶部，
// 导致 global.chrome 还没设置时 content.js 就已经加载了
global.chrome = {
  storage: {
    sync: {
      get: jest.fn((key, cb) => cb({ popup_settings: {} })),
      set: jest.fn(),
      onChanged: { addListener: jest.fn() }
    },
    local: {
      get: jest.fn((key, cb) => cb({})),
      set: jest.fn()
    },
    onChanged: { addListener: jest.fn() }
  },
  runtime: {
    getURL: jest.fn(path => `chrome-extension://mock/${path}`),
    sendMessage: jest.fn(),
    lastError: null,
    onMessage: { addListener: jest.fn() }
  }
};

// 使用 require 代替 import，确保 chrome mock 已就绪
const { scanPageForGames, initializeGamesLookup } = require('../content');
const { createLookupMap } = require('../utils/performance');

describe('Content Script Integration', () => {
  beforeEach(() => {
    // 模拟 Steam 详情页 DOM
    document.body.innerHTML = `
      <div class="game_area_purchase_game">
        <div class="apphub_AppName">Test Game</div>
      </div>
    `;

    // 设置 URL 为详情页
    window.history.pushState({}, '', '/app/123/');

    // 重置 mock
    jest.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    window.history.pushState({}, '', '/');
  });

  test('should detect game on detail page', () => {
    const games = scanPageForGames();

    // 详情页应检测到一个游戏
    expect(games.length).toBe(1);
    expect(games[0].appId).toBe(123);
    expect(games[0].name).toBe('Test Game');
  });

  test('should initialize games lookup map', async () => {
    // 模拟 storage 返回数据
    const mockData = {
      '123': { appId: 123, name: 'Game A', isFree: true, freeDates: [] },
      '456': { appId: 456, name: 'Game B', isFree: false, freeDates: [] }
    };
    chrome.storage.local.get.mockImplementation((key, cb) => cb(mockData));

    await initializeGamesLookup();

    // 验证 storage 被调用（null key 表示获取所有数据）
    expect(chrome.storage.local.get).toHaveBeenCalledWith(null, expect.any(Function));

    // 验证 createLookupMap 被调用
    expect(createLookupMap).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ appId: 123 }),
        expect.objectContaining({ appId: 456 })
      ]),
      expect.any(Function)
    );
  });

  test('should not inject duplicate badges', () => {
    // 第一次扫描
    const games1 = scanPageForGames();
    expect(games1.length).toBe(1);

    // 第二次扫描同一页面
    const games2 = scanPageForGames();
    expect(games2.length).toBe(1);
  });

  test('should handle search page type', () => {
    // 设置 URL 为搜索页
    window.history.pushState({}, '', '/search/?term=test');

    document.body.innerHTML = `
      <div class="search_result_row">
        <a href="/app/456/">
          <div class="title">Search Result Game</div>
        </a>
      </div>
    `;

    const games = scanPageForGames();
    expect(games.length).toBe(1);
    expect(games[0].appId).toBe(456);
    expect(games[0].name).toBe('Search Result Game');
  });

  test('should handle homepage type', () => {
    window.history.pushState({}, '', '/');

    document.body.innerHTML = `
      <a class="store_main_capsule" href="/app/789/">
        <img alt="Homepage Game">
      </a>
    `;

    const games = scanPageForGames();
    expect(games.length).toBe(1);
    expect(games[0].appId).toBe(789);
  });

  test('should return empty array when no games found', () => {
    window.history.pushState({}, '', '/some-other-page');
    document.body.innerHTML = '<div>No games here</div>';

    const games = scanPageForGames();
    expect(games.length).toBe(0);
  });
});
