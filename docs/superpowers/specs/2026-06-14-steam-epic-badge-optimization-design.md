# Steam Epic Badge 优化设计文档

## 项目概述

**项目名称**：Steam Epic Badge  
**当前版本**：1.0.0  
**优化目标**：参考 SubscriptionInfo 项目，对 steam-epic-badge 进行渐进式优化  
**优化范围**：性能优化、发布自动化、代码架构改进  
**技术栈**：Manifest V3、原生 JavaScript、GitHub Actions、SCSS（可选）

## 背景分析

### 参考项目 SubscriptionInfo 的优势

1. **多浏览器支持**：分离的 manifest 文件和自动化构建流程
2. **性能优化**：throttle、Map/Set、sessionStorage、waitForElement
3. **代码架构**：SCSS 预处理、i18n 国际化、模块化设计
4. **发布流程**：GitHub Actions 自动化构建和发布

### 当前项目 steam-epic-badge 的特点

1. **本地数据驱动**：历史数据存储在扩展内 JSON 文件
2. **模块化程度高**：独立的 utils/matcher.js 和 utils/storage.js
3. **缓存管理完善**：storage.js 有完整的缓存过期机制
4. **通知系统**：chrome.notifications 支持新免费游戏通知

## 设计方案

### 一、整体架构

#### 1.1 优化阶段规划

```
阶段 1：性能优化（1-2 周）
├── 工具函数库增强
├── 缓存策略优化
└── DOM 操作优化

阶段 2：发布自动化（1 周）
├── GitHub Actions 工作流
├── 版本管理自动化
└── Release 流程

阶段 3：代码架构改进（可选，2-3 周）
├── SCSS 迁移
├── i18n 基础
└── 模块化重构
```

#### 1.2 技术栈保持

- **Manifest V3**：保持 Chrome 专用，不升级到 V4
- **原生 JavaScript**：不引入构建工具，保持简单
- **GitHub Actions**：CI/CD 自动化
- **纯 CSS → SCSS**：阶段 3 可选迁移

#### 1.3 核心原则

1. **向后兼容**：所有优化不影响现有功能
2. **渐进增强**：每个阶段独立可测试
3. **最小改动**：只改必要的部分，不重构整个架构

### 二、性能优化设计

#### 2.1 工具函数库增强

**新增 `utils/performance.js`**：

```javascript
// throttle 函数（借鉴 SubscriptionInfo）
function throttle(fn, delay = 1000) {
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

// waitForElement 函数（借鉴 SubscriptionInfo）
function waitForElement(selector, timeout = 5000) {
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

// Map/Set 优化查找
function createLookupMap(array, keyFn) {
  return new Map(array.map(item => [keyFn(item), item]));
}

function createLookupSet(array, keyFn) {
  return new Set(array.map(keyFn));
}
```

#### 2.2 缓存策略优化

**增强 `utils/storage.js`**：

```javascript
// 添加 sessionStorage 支持
async function getSessionData(key) {
  return new Promise((resolve) => {
    chrome.storage.session.get(key, (result) => {
      resolve(result[key] || null);
    });
  });
}

async function setSessionData(key, value, ttlMinutes = 15) {
  const data = {
    value,
    timestamp: Date.now(),
    ttl: ttlMinutes * 60 * 1000
  };
  return new Promise((resolve) => {
    chrome.storage.session.set({ [key]: data }, resolve);
  });
}

// 批量查询优化（增强版）
async function queryBatchByAppIds(appIds) {
  if (appIds.length === 0) return {};
  
  // 1. 先查 sessionStorage（临时缓存）
  const sessionResult = await getSessionData('game_cache');
  if (sessionResult && Date.now() - sessionResult.timestamp < sessionResult.ttl) {
    const cachedGames = sessionResult.value;
    const missingIds = appIds.filter(id => !cachedGames[id]);
    if (missingIds.length === 0) {
      return cachedGames;
    }
  }
  
  // 2. 再查 localStorage（持久缓存）
  const localResult = await chrome.storage.local.get(appIds);
  const missingIds = appIds.filter(id => !localResult[id]);
  
  // 3. 最后查询 API
  if (missingIds.length > 0) {
    const apiResults = await fetchGamesFromApi(missingIds);
    // 合并结果并更新缓存
  }
  
  return { ...localResult, ...apiResults };
}
```

#### 2.3 DOM 操作优化

**增强 `content.js`**：

```javascript
// 使用 throttle 替代 debounce
const throttledScanPage = throttle(scanPageForGames, 500);

// 使用 Map 优化游戏查找
let gamesLookupMap = new Map();

// 初始化时构建查找表
async function initializeGamesLookup() {
  const allGames = await getAllGames();
  gamesLookupMap = createLookupMap(allGames, game => game.appId);
}

// 使用 waitForElement 处理异步加载的元素
async function waitForGameContainer() {
  try {
    const container = await waitForElement('.game_area_purchase_game', 3000);
    return container;
  } catch (error) {
    console.log('Game container not found, using fallback');
    return null;
  }
}

// SVG 内联优化（减少网络请求）
const EPIC_ICON_SVG = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>')}`;
```

### 三、发布自动化设计

#### 3.1 GitHub Actions 工作流

**新增 `.github/workflows/release.yml`**：

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build extension
        run: npm run build
      
      - name: Create Chrome package
        run: |
          cd dist
          zip -r ../steam-epic-badge-chrome.zip .
      
      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: steam-epic-badge-chrome.zip
          generate_release_notes: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

#### 3.2 版本管理自动化

**新增 `scripts/version.js`**：

```javascript
const fs = require('fs');
const path = require('path');

// 从 manifest.json 读取版本号
function getVersion() {
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  return manifest.version;
}

// 更新版本号
function bumpVersion(type = 'patch') {
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  const [major, minor, patch] = manifest.version.split('.').map(Number);
  
  let newVersion;
  switch (type) {
    case 'major':
      newVersion = `${major + 1}.0.0`;
      break;
    case 'minor':
      newVersion = `${major}.${minor + 1}.0`;
      break;
    case 'patch':
    default:
      newVersion = `${major}.${minor}.${patch + 1}`;
      break;
  }
  
  manifest.version = newVersion;
  fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 2));
  
  console.log(`Version bumped to ${newVersion}`);
  return newVersion;
}

// 生成 CHANGELOG 条目
function generateChangelog(version) {
  const date = new Date().toISOString().split('T')[0];
  const changelogPath = 'CHANGELOG.md';
  
  let changelog = '';
  if (fs.existsSync(changelogPath)) {
    changelog = fs.readFileSync(changelogPath, 'utf8');
  }
  
  const newEntry = `## [${version}] - ${date}\n\n### Added\n- \n\n### Changed\n- \n\n### Fixed\n- \n\n`;
  
  changelog = newEntry + changelog;
  fs.writeFileSync(changelogPath, changelog);
  
  console.log(`CHANGELOG updated for version ${version}`);
}
```

#### 3.3 Release 流程

**新增 `package.json` 脚本**：

```json
{
  "scripts": {
    "version:patch": "node scripts/version.js patch",
    "version:minor": "node scripts/version.js minor",
    "version:major": "node scripts/version.js major",
    "build": "node scripts/build.js",
    "release": "npm run build && git add . && git commit -m 'release: v'$(node -p \"require('./manifest.json').version\") && git tag v$(node -p \"require('./manifest.json').version\") && git push && git push --tags"
  }
}
```

**发布流程**：

```bash
# 1. 更新版本号
npm run version:patch

# 2. 编辑 CHANGELOG.md
# 手动添加本次更新的内容

# 3. 提交并发布
npm run release
```

### 四、代码架构改进设计（可选阶段）

#### 4.1 SCSS 迁移

**目录结构调整**：

```
steam-epic-badge/
├── src/
│   ├── styles/
│   │   ├── _variables.scss      # 变量定义
│   │   ├── _mixins.scss         # 混入
│   │   ├── _components.scss     # 组件样式
│   │   ├── content.scss         # 主样式文件
│   │   └── popup.scss           # 弹出窗口样式
│   ├── scripts/
│   │   ├── background.js
│   │   ├── content.js
│   │   └── popup.js
│   ├── utils/
│   │   ├── matcher.js
│   │   ├── storage.js
│   │   └── performance.js
│   ├── data/
│   │   └── epic_history.json
│   └── manifest.json
├── dist/                        # 构建输出
├── package.json
└── build.js
```

**SCSS 变量示例**：

```scss
// _variables.scss
$epic-blue: #0078f2;
$epic-green: #00c853;
$epic-red: #ff1744;
$badge-size: 24px;
$animation-duration: 0.3s;
$z-index-badge: 1000;
$z-index-tooltip: 1001;

// _mixins.scss
@mixin badge-base {
  position: absolute;
  width: $badge-size;
  height: $badge-size;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
  color: white;
  z-index: $z-index-badge;
}

@mixin tooltip {
  position: absolute;
  background: rgba(0, 0, 0, 0.9);
  color: white;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  z-index: $z-index-tooltip;
  pointer-events: none;
  opacity: 0;
  transition: opacity $animation-duration;
}

// _components.scss
.epic-badge {
  @include badge-base;
  background-color: $epic-blue;
  
  &.free {
    background-color: $epic-green;
    animation: pulse 2s infinite;
  }
  
  &:hover::after {
    @include tooltip;
    content: attr(data-tooltip);
    opacity: 1;
  }
}
```

#### 4.2 i18n 基础

**新增 `utils/i18n.js`**：

```javascript
const translations = {
  'zh-CN': {
    badge: {
      free: '免费',
      claimed: '已领取',
      history: '历史赠送',
      current: '当前免费'
    },
    popup: {
      title: 'Epic 免费游戏',
      status: '状态',
      running: '运行中',
      disabled: '已禁用',
      refresh: '刷新',
      settings: '设置'
    },
    detail: {
      title: 'Epic 赠送历史',
      times: '赠送次数',
      dates: '赠送日期',
      current: '当前免费',
      upcoming: '即将免费'
    }
  },
  'en-US': {
    badge: {
      free: 'Free',
      claimed: 'Claimed',
      history: 'History',
      current: 'Current Free'
    },
    popup: {
      title: 'Epic Free Games',
      status: 'Status',
      running: 'Running',
      disabled: 'Disabled',
      refresh: 'Refresh',
      settings: 'Settings'
    },
    detail: {
      title: 'Epic Giveaway History',
      times: 'Times Given',
      dates: 'Giveaway Dates',
      current: 'Current Free',
      upcoming: 'Coming Soon'
    }
  }
};

class I18n {
  constructor() {
    this.locale = navigator.language || 'zh-CN';
    this.translations = translations;
  }
  
  t(key, params = {}) {
    const keys = key.split('.');
    let value = this.translations[this.locale];
    
    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = value[k];
      } else {
        return key; // 返回原始 key 作为 fallback
      }
    }
    
    if (typeof value === 'string') {
      // 替换参数
      return value.replace(/\{\{(\w+)\}\}/g, (match, param) => {
        return params[param] || match;
      });
    }
    
    return key;
  }
  
  setLocale(locale) {
    if (this.translations[locale]) {
      this.locale = locale;
    }
  }
}

export const i18n = new I18n();
```

#### 4.3 模块化重构

**新增 `utils/modules.js`**：

```javascript
// 模块注册表
const modules = new Map();

// 注册模块
export function registerModule(name, module) {
  if (modules.has(name)) {
    console.warn(`Module ${name} already registered`);
    return;
  }
  modules.set(name, module);
}

// 获取模块
export function getModule(name) {
  return modules.get(name);
}

// 初始化所有模块
export async function initializeModules() {
  for (const [name, module] of modules) {
    if (typeof module.init === 'function') {
      try {
        await module.init();
        console.log(`Module ${name} initialized`);
      } catch (error) {
        console.error(`Failed to initialize module ${name}:`, error);
      }
    }
  }
}

// 模块示例：游戏检测模块
export const gameDetector = {
  name: 'gameDetector',
  
  async init() {
    // 初始化游戏检测逻辑
    await this.loadGamesDatabase();
    this.setupMutationObserver();
  },
  
  async loadGamesDatabase() {
    // 加载游戏数据库
  },
  
  setupMutationObserver() {
    // 设置 DOM 变化监听
  },
  
  detectGame(appId) {
    // 检测游戏逻辑
  }
};

// 注册模块
registerModule('gameDetector', gameDetector);
```

### 五、错误处理和测试策略

#### 5.1 错误处理策略

**统一错误处理机制**：

```javascript
// utils/errorHandler.js
class ErrorHandler {
  constructor() {
    this.errors = [];
    this.maxErrors = 100;
  }
  
  // 捕获并记录错误
  handle(error, context = {}) {
    const errorInfo = {
      timestamp: Date.now(),
      message: error.message,
      stack: error.stack,
      context,
      type: this.categorizeError(error)
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
  
  // 错误分类
  categorizeError(error) {
    if (error.message.includes('network') || error.message.includes('fetch')) {
      return 'NETWORK';
    }
    if (error.message.includes('storage') || error.message.includes('quota')) {
      return 'STORAGE';
    }
    if (error.message.includes('permission') || error.message.includes('access')) {
      return 'PERMISSION';
    }
    if (error.message.includes('timeout')) {
      return 'TIMEOUT';
    }
    return 'UNKNOWN';
  }
  
  // 根据错误类型处理
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
  
  // 网络错误处理
  handleNetworkError(errorInfo) {
    console.warn('Network error, will retry:', errorInfo.message);
    // 可以添加重试逻辑
  }
  
  // 存储错误处理
  handleStorageError(errorInfo) {
    console.warn('Storage error, clearing cache:', errorInfo.message);
    // 清理过期缓存
    this.clearExpiredCache();
  }
  
  // 权限错误处理
  handlePermissionError(errorInfo) {
    console.error('Permission error:', errorInfo.message);
    // 提示用户检查权限
  }
  
  // 超时错误处理
  handleTimeoutError(errorInfo) {
    console.warn('Timeout error, increasing timeout:', errorInfo.message);
    // 增加超时时间
  }
  
  // 未知错误处理
  handleUnknownError(errorInfo) {
    console.error('Unknown error:', errorInfo.message);
    // 记录详细信息用于调试
  }
  
  // 清理过期缓存
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
  
  // 获取错误统计
  getStats() {
    const stats = {
      total: this.errors.length,
      byType: {},
      recent: this.errors.slice(-10)
    };
    
    for (const error of this.errors) {
      stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;
    }
    
    return stats;
  }
}

export const errorHandler = new ErrorHandler();
```

#### 5.2 测试策略

**单元测试框架**（使用 Jest）：

```javascript
// tests/utils/performance.test.js
import { throttle, waitForElement, createLookupMap } from '../../utils/performance';

describe('Performance Utils', () => {
  describe('throttle', () => {
    test('should throttle function calls', async () => {
      let callCount = 0;
      const throttledFn = throttle(() => callCount++, 100);
      
      // 快速调用多次
      throttledFn();
      throttledFn();
      throttledFn();
      
      // 等待 throttle 时间
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // 应该只调用了一次
      expect(callCount).toBe(1);
    });
    
    test('should execute on trailing edge', async () => {
      let lastValue = null;
      const throttledFn = throttle((value) => { lastValue = value; }, 100);
      
      throttledFn('first');
      throttledFn('second');
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(lastValue).toBe('second');
    });
  });
  
  describe('waitForElement', () => {
    test('should resolve when element exists', async () => {
      // 创建测试元素
      const element = document.createElement('div');
      element.id = 'test-element';
      document.body.appendChild(element);
      
      const result = await waitForElement('#test-element');
      expect(result).toBe(element);
      
      // 清理
      document.body.removeChild(element);
    });
    
    test('should reject after timeout', async () => {
      await expect(waitForElement('#non-existent', 100))
        .rejects
        .toThrow('Element #non-existent not found within 100ms');
    });
  });
  
  describe('createLookupMap', () => {
    test('should create map with custom key function', () => {
      const items = [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
        { id: 3, name: 'Item 3' }
      ];
      
      const map = createLookupMap(items, item => item.id);
      
      expect(map.size).toBe(3);
      expect(map.get(1)).toEqual({ id: 1, name: 'Item 1' });
      expect(map.get(2)).toEqual({ id: 2, name: 'Item 2' });
      expect(map.get(3)).toEqual({ id: 3, name: 'Item 3' });
    });
  });
});
```

**集成测试**：

```javascript
// tests/integration/content.test.js
import { scanPageForGames } from '../../content';

describe('Content Script Integration', () => {
  beforeEach(() => {
    // 模拟 Steam 页面 DOM
    document.body.innerHTML = `
      <div class="game_area_purchase_game">
        <div class="apphub_AppName">Test Game</div>
      </div>
    `;
  });
  
  afterEach(() => {
    document.body.innerHTML = '';
  });
  
  test('should detect game on page', async () => {
    // 模拟 Chrome API
    global.chrome = {
      storage: {
        local: {
          get: jest.fn().mockResolvedValue({ '123': { name: 'Test Game' } })
        }
      }
    };
    
    await scanPageForGames();
    
    // 验证是否添加了 badge
    const badge = document.querySelector('.epic-badge');
    expect(badge).toBeTruthy();
  });
});
```

#### 5.3 监控和日志

**增强日志系统**：

```javascript
// utils/logger.js
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
  
  debug(message, data) {
    return this.log('DEBUG', message, data);
  }
  
  info(message, data) {
    return this.log('INFO', message, data);
  }
  
  warn(message, data) {
    return this.log('WARN', message, data);
  }
  
  error(message, data) {
    return this.log('ERROR', message, data);
  }
  
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
  
  getLogs(level = null, limit = 100) {
    let filteredLogs = this.logs;
    
    if (level) {
      filteredLogs = filteredLogs.filter(log => log.level === level);
    }
    
    return filteredLogs.slice(-limit);
  }
  
  clearLogs() {
    this.logs = [];
  }
  
  setLevel(level) {
    if (this.levels[level] !== undefined) {
      this.currentLevel = this.levels[level];
    }
  }
}

export const logger = new Logger();
```

## 实施计划

### 阶段 1：性能优化（1-2 周）

**第 1 周**：
- 新增 `utils/performance.js`
- 增强 `utils/storage.js`
- 优化 `content.js`

**第 2 周**：
- 测试性能改进效果
- 修复发现的问题
- 文档更新

### 阶段 2：发布自动化（1 周）

**第 1 周**：
- 新增 `.github/workflows/release.yml`
- 新增 `scripts/version.js`
- 新增 `package.json` 脚本
- 测试发布流程

### 阶段 3：代码架构改进（可选，2-3 周）

**第 1 周**：
- SCSS 迁移
- 目录结构调整

**第 2 周**：
- i18n 国际化
- 模块化重构

**第 3 周**：
- 测试和修复
- 文档更新

## 风险评估

### 技术风险

1. **兼容性问题**：新功能可能与现有代码冲突
   - **缓解措施**：充分测试，保持向后兼容

2. **性能影响**：新功能可能增加资源消耗
   - **缓解措施**：性能测试，优化关键路径

3. **发布流程**：自动化流程可能不稳定
   - **缓解措施**：手动备份，逐步迁移

### 时间风险

1. **阶段延期**：某个阶段可能比预期更复杂
   - **缓解措施**：预留缓冲时间，灵活调整

2. **依赖问题**：外部依赖可能更新导致问题
   - **缓解措施**：锁定依赖版本，定期更新

## 成功标准

### 性能指标

1. **页面加载时间**：减少 20% 以上
2. **内存使用**：减少 15% 以上
3. **API 调用次数**：减少 30% 以上

### 发布效率

1. **发布时间**：从手动 30 分钟减少到自动 5 分钟
2. **错误率**：发布错误率降低 50% 以上

### 代码质量

1. **测试覆盖率**：达到 80% 以上
2. **代码重复率**：降低 20% 以上
3. **文档完整性**：所有新增功能都有文档

## 总结

本设计方案采用渐进式优化策略，分三个阶段对 steam-epic-badge 进行改进：

1. **性能优化**：借鉴 SubscriptionInfo 的最佳实践，提升页面加载速度和用户体验
2. **发布自动化**：建立 GitHub Actions 工作流，简化发布流程
3. **代码架构改进**：引入 SCSS、i18n 和模块化设计，提高代码可维护性

通过这些优化，steam-epic-badge 将在保持现有功能的基础上，获得更好的性能、更高效的发布流程和更高质量的代码。