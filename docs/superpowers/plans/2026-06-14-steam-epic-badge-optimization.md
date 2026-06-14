# Steam Epic Badge 优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 参考 SubscriptionInfo 项目，对 steam-epic-badge 进行渐进式优化，提升性能、自动化发布流程、改进代码架构

**Architecture:** 采用三阶段渐进式优化策略：性能优化 → 发布自动化 → 代码架构改进。每个阶段独立可测试，保持向后兼容

**Tech Stack:** Manifest V3、原生 JavaScript、GitHub Actions、Jest（测试）、SCSS（可选）

---

## 阶段 1：性能优化

### Task 1: 创建性能工具函数库

**Files:**
- Create: `steam-epic-badge/utils/performance.js`
- Test: `steam-epic-badge/tests/utils/performance.test.js`

- [ ] **Step 1: 创建测试文件目录结构**

```bash
mkdir -p steam-epic-badge/tests/utils
```

- [ ] **Step 2: 编写 throttle 函数的失败测试**

```javascript
// tests/utils/performance.test.js
import { throttle, waitForElement, createLookupMap, createLookupSet } from '../../utils/performance';

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

    test('should pass arguments correctly', async () => {
      let result = null;
      const throttledFn = throttle((a, b) => { result = a + b; }, 100);

      throttledFn(1, 2);

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(result).toBe(3);
    });
  });
});
```

- [ ] **Step 3: 运行测试验证失败**

```bash
cd steam-epic-badge && npm test -- tests/utils/performance.test.js
```

预期结果：FAIL - "Cannot find module '../../utils/performance'"

- [ ] **Step 4: 实现 throttle 函数**

```javascript
// utils/performance.js
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
```

- [ ] **Step 5: 运行测试验证通过**

```bash
cd steam-epic-badge && npm test -- tests/utils/performance.test.js
```

预期结果：PASS - throttle 测试全部通过

- [ ] **Step 6: 编写 waitForElement 函数的失败测试**

```javascript
// 在 tests/utils/performance.test.js 中添加
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

  test('should resolve when element is added later', async () => {
    const element = document.createElement('div');
    element.id = 'delayed-element';

    // 延迟添加元素
    setTimeout(() => {
      document.body.appendChild(element);
    }, 50);

    const result = await waitForElement('#delayed-element', 1000);
    expect(result).toBe(element);

    // 清理
    document.body.removeChild(element);
  });
});
```

- [ ] **Step 7: 运行测试验证失败**

```bash
cd steam-epic-badge && npm test -- tests/utils/performance.test.js
```

预期结果：FAIL - "waitForElement is not a function"

- [ ] **Step 8: 实现 waitForElement 函数**

```javascript
// 在 utils/performance.js 中添加
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
```

- [ ] **Step 9: 运行测试验证通过**

```bash
cd steam-epic-badge && npm test -- tests/utils/performance.test.js
```

预期结果：PASS - waitForElement 测试全部通过

- [ ] **Step 10: 编写 createLookupMap 函数的失败测试**

```javascript
// 在 tests/utils/performance.test.js 中添加
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

  test('should handle empty array', () => {
    const map = createLookupMap([], item => item.id);
    expect(map.size).toBe(0);
  });
});

describe('createLookupSet', () => {
  test('should create set with custom key function', () => {
    const items = [
      { id: 1, name: 'Item 1' },
      { id: 2, name: 'Item 2' },
      { id: 3, name: 'Item 3' }
    ];

    const set = createLookupSet(items, item => item.id);

    expect(set.size).toBe(3);
    expect(set.has(1)).toBe(true);
    expect(set.has(2)).toBe(true);
    expect(set.has(3)).toBe(true);
    expect(set.has(4)).toBe(false);
  });
});
```

- [ ] **Step 11: 运行测试验证失败**

```bash
cd steam-epic-badge && npm test -- tests/utils/performance.test.js
```

预期结果：FAIL - "createLookupMap is not a function"

- [ ] **Step 12: 实现 createLookupMap 和 createLookupSet 函数**

```javascript
// 在 utils/performance.js 中添加
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
```

- [ ] **Step 13: 运行测试验证通过**

```bash
cd steam-epic-badge && npm test -- tests/utils/performance.test.js
```

预期结果：PASS - 所有性能工具函数测试通过

- [ ] **Step 14: 提交性能工具函数库**

```bash
git add steam-epic-badge/utils/performance.js steam-epic-badge/tests/utils/performance.test.js
git commit -m "feat: add performance utility functions (throttle, waitForElement, Map/Set)"
```

---

### Task 2: 增强存储工具函数

**Files:**
- Modify: `steam-epic-badge/utils/storage.js`
- Test: `steam-epic-badge/tests/utils/storage.test.js`

- [ ] **Step 1: 编写 sessionStorage 支持的失败测试**

```javascript
// tests/utils/storage.test.js
import { getSessionData, setSessionData, queryBatchByAppIds } from '../../utils/storage';

describe('Storage Utils', () => {
  describe('sessionStorage', () => {
    test('should get and set session data', async () => {
      const testData = { value: 'test', timestamp: Date.now() };

      await setSessionData('testKey', testData.value, 15);
      const result = await getSessionData('testKey');

      expect(result).toBeDefined();
      expect(result.value).toBe(testData.value);
      expect(result.timestamp).toBeDefined();
      expect(result.ttl).toBe(15 * 60 * 1000);
    });

    test('should return null for non-existent key', async () => {
      const result = await getSessionData('nonExistentKey');
      expect(result).toBeNull();
    });

    test('should handle expired data', async () => {
      // 设置一个 0 分钟 TTL 的数据
      await setSessionData('expiredKey', 'expired', 0);

      // 等待一小段时间确保过期
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await getSessionData('expiredKey');
      expect(result).toBeNull();
    });
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd steam-epic-badge && npm test -- tests/utils/storage.test.js
```

预期结果：FAIL - "Cannot find module '../../utils/storage'" 或函数未定义

- [ ] **Step 3: 读取现有 storage.js 文件**

```bash
cat steam-epic-badge/utils/storage.js
```

- [ ] **Step 4: 在现有 storage.js 中添加 sessionStorage 支持**

```javascript
// 在 utils/storage.js 文件末尾添加

/**
 * 获取 sessionStorage 数据
 * @param {string} key - 存储键
 * @returns {Promise<Object|null>} 存储的数据
 */
export async function getSessionData(key) {
  return new Promise((resolve) => {
    chrome.storage.session.get(key, (result) => {
      resolve(result[key] || null);
    });
  });
}

/**
 * 设置 sessionStorage 数据
 * @param {string} key - 存储键
 * @param {*} value - 存储的值
 * @param {number} ttlMinutes - 过期时间（分钟）
 * @returns {Promise<void>}
 */
export async function setSessionData(key, value, ttlMinutes = 15) {
  const data = {
    value,
    timestamp: Date.now(),
    ttl: ttlMinutes * 60 * 1000
  };

  return new Promise((resolve) => {
    chrome.storage.session.set({ [key]: data }, resolve);
  });
}
```

- [ ] **Step 5: 运行测试验证通过**

```bash
cd steam-epic-badge && npm test -- tests/utils/storage.test.js
```

预期结果：PASS - sessionStorage 测试通过

- [ ] **Step 6: 编写批量查询优化的失败测试**

```javascript
// 在 tests/utils/storage.test.js 中添加
describe('queryBatchByAppIds', () => {
  test('should batch query by app IDs', async () => {
    const appIds = ['123', '456', '789'];
    const mockData = {
      '123': { name: 'Game 1' },
      '456': { name: 'Game 2' }
    };

    // 模拟 chrome.storage.local.get
    chrome.storage.local.get = jest.fn((keys, callback) => {
      callback(mockData);
    });

    const result = await queryBatchByAppIds(appIds);

    expect(result).toBeDefined();
    expect(chrome.storage.local.get).toHaveBeenCalledWith(appIds, expect.any(Function));
  });

  test('should handle empty array', async () => {
    const result = await queryBatchByAppIds([]);
    expect(result).toEqual({});
  });
});
```

- [ ] **Step 7: 运行测试验证失败**

```bash
cd steam-epic-badge && npm test -- tests/utils/storage.test.js
```

预期结果：FAIL - "queryBatchByAppIds is not a function"

- [ ] **Step 8: 实现批量查询优化函数**

```javascript
// 在 utils/storage.js 中添加

/**
 * 批量查询优化 - 减少 storage I/O
 * @param {Array<string>} appIds - 应用 ID 数组
 * @returns {Promise<Object>} 查询结果
 */
export async function queryBatchByAppIds(appIds) {
  if (appIds.length === 0) return {};

  return new Promise((resolve, reject) => {
    chrome.storage.local.get(appIds, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}
```

- [ ] **Step 9: 运行测试验证通过**

```bash
cd steam-epic-badge && npm test -- tests/utils/storage.test.js
```

预期结果：PASS - 批量查询测试通过

- [ ] **Step 10: 提交存储工具增强**

```bash
git add steam-epic-badge/utils/storage.js steam-epic-badge/tests/utils/storage.test.js
git commit -m "feat: enhance storage utils with sessionStorage and batch query"
```

---

### Task 3: 优化 content.js DOM 操作

**Files:**
- Modify: `steam-epic-badge/content.js`
- Test: `steam-epic-badge/tests/content.test.js`

- [ ] **Step 1: 编写 content.js 集成测试**

```javascript
// tests/content.test.js
import { scanPageForGames, initializeGamesLookup } from '../content';

describe('Content Script Integration', () => {
  beforeEach(() => {
    // 模拟 Steam 页面 DOM
    document.body.innerHTML = `
      <div class="game_area_purchase_game">
        <div class="apphub_AppName">Test Game</div>
      </div>
    `;

    // 模拟 Chrome API
    global.chrome = {
      storage: {
        local: {
          get: jest.fn().mockResolvedValue({ '123': { name: 'Test Game' } })
        }
      }
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  test('should detect game on page', async () => {
    await scanPageForGames();

    // 验证是否添加了 badge
    const badge = document.querySelector('.epic-badge');
    expect(badge).toBeTruthy();
  });

  test('should initialize games lookup map', async () => {
    await initializeGamesLookup();

    // 验证查找表已初始化
    expect(chrome.storage.local.get).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd steam-epic-badge && npm test -- tests/content.test.js
```

预期结果：FAIL - 函数未正确导入或实现

- [ ] **Step 3: 读取现有 content.js 文件**

```bash
cat steam-epic-badge/content.js
```

- [ ] **Step 4: 在 content.js 中导入性能工具**

```javascript
// 在 content.js 文件顶部添加
import { throttle, waitForElement, createLookupMap } from './utils/performance.js';
```

- [ ] **Step 5: 替换 debounce 为 throttle**

```javascript
// 在 content.js 中找到类似以下的代码：
// const debouncedScanPage = debounce(scanPageForGames, 300);

// 替换为：
const throttledScanPage = throttle(scanPageForGames, 500);
```

- [ ] **Step 6: 添加游戏查找 Map**

```javascript
// 在 content.js 中添加
let gamesLookupMap = new Map();

/**
 * 初始化游戏查找表
 */
export async function initializeGamesLookup() {
  const allGames = await getAllGames();
  gamesLookupMap = createLookupMap(allGames, game => game.appId);
}
```

- [ ] **Step 7: 使用 waitForElement 处理异步加载元素**

```javascript
// 在 content.js 中添加
/**
 * 等待游戏容器加载
 */
async function waitForGameContainer() {
  try {
    const container = await waitForElement('.game_area_purchase_game', 3000);
    return container;
  } catch (error) {
    console.log('Game container not found, using fallback');
    return null;
  }
}
```

- [ ] **Step 8: 运行测试验证通过**

```bash
cd steam-epic-badge && npm test -- tests/content.test.js
```

预期结果：PASS - content.js 集成测试通过

- [ ] **Step 9: 提交 content.js 优化**

```bash
git add steam-epic-badge/content.js steam-epic-badge/tests/content.test.js
git commit -m "perf: optimize content.js with throttle, Map lookup, and waitForElement"
```

---

## 阶段 2：发布自动化

### Task 4: 创建 GitHub Actions 发布工作流

**Files:**
- Create: `steam-epic-badge/.github/workflows/release.yml`
- Create: `steam-epic-badge/.github/workflows/test.yml`

- [ ] **Step 1: 创建 GitHub Actions 目录**

```bash
mkdir -p steam-epic-badge/.github/workflows
```

- [ ] **Step 2: 创建测试工作流**

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Run linting
        run: npm run lint
```

- [ ] **Step 3: 创建发布工作流**

```yaml
# .github/workflows/release.yml
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
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

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

- [ ] **Step 4: 提交 GitHub Actions 工作流**

```bash
git add steam-epic-badge/.github/workflows/
git commit -m "ci: add GitHub Actions workflows for testing and release"
```

---

### Task 5: 创建版本管理脚本

**Files:**
- Create: `steam-epic-badge/scripts/version.js`
- Create: `steam-epic-badge/CHANGELOG.md`

- [ ] **Step 1: 创建 scripts 目录**

```bash
mkdir -p steam-epic-badge/scripts
```

- [ ] **Step 2: 创建版本管理脚本**

```javascript
// scripts/version.js
const fs = require('fs');
const path = require('path');

/**
 * 从 manifest.json 读取版本号
 * @returns {string} 当前版本号
 */
function getVersion() {
  const manifestPath = path.join(__dirname, '..', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return manifest.version;
}

/**
 * 更新版本号
 * @param {string} type - 版本类型：major, minor, patch
 * @returns {string} 新版本号
 */
function bumpVersion(type = 'patch') {
  const manifestPath = path.join(__dirname, '..', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
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
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`Version bumped to ${newVersion}`);
  return newVersion;
}

/**
 * 生成 CHANGELOG 条目
 * @param {string} version - 版本号
 */
function generateChangelog(version) {
  const date = new Date().toISOString().split('T')[0];
  const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');

  let changelog = '';
  if (fs.existsSync(changelogPath)) {
    changelog = fs.readFileSync(changelogPath, 'utf8');
  }

  const newEntry = `## [${version}] - ${date}

### Added
-

### Changed
-

### Fixed
-

`;

  changelog = newEntry + changelog;
  fs.writeFileSync(changelogPath, changelog);

  console.log(`CHANGELOG updated for version ${version}`);
}

// 命令行接口
const command = process.argv[2];
const versionType = process.argv[3] || 'patch';

switch (command) {
  case 'get':
    console.log(getVersion());
    break;
  case 'bump':
    const newVersion = bumpVersion(versionType);
    generateChangelog(newVersion);
    break;
  default:
    console.log('Usage:');
    console.log('  node scripts/version.js get');
    console.log('  node scripts/version.js bump [major|minor|patch]');
}
```

- [ ] **Step 3: 创建 CHANGELOG.md 模板**

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
-

### Changed
-

### Fixed
-
```

- [ ] **Step 4: 测试版本管理脚本**

```bash
cd steam-epic-badge && node scripts/version.js get
```

预期结果：输出当前版本号 "1.0.0"

- [ ] **Step 5: 提交版本管理脚本**

```bash
git add steam-epic-badge/scripts/version.js steam-epic-badge/CHANGELOG.md
git commit -m "feat: add version management script and CHANGELOG"
```

---

### Task 6: 更新 package.json 添加发布脚本

**Files:**
- Modify: `steam-epic-badge/package.json`

- [ ] **Step 1: 读取现有 package.json**

```bash
cat steam-epic-badge/package.json
```

- [ ] **Step 2: 添加发布相关脚本**

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "build": "node scripts/build.js",
    "version:get": "node scripts/version.js get",
    "version:patch": "node scripts/version.js bump patch",
    "version:minor": "node scripts/version.js bump minor",
    "version:major": "node scripts/version.js bump major",
    "release": "npm run build && git add . && git commit -m 'release: v'$(node -p \"require('./manifest.json').version\") && git tag v$(node -p \"require('./manifest.json').version\") && git push && git push --tags"
  }
}
```

- [ ] **Step 3: 测试发布脚本**

```bash
cd steam-epic-badge && npm run version:get
```

预期结果：输出当前版本号

- [ ] **Step 4: 提交 package.json 更新**

```bash
git add steam-epic-badge/package.json
git commit -m "feat: add release scripts to package.json"
```

---

## 阶段 3：代码架构改进（可选）

### Task 7: 创建构建脚本

**Files:**
- Create: `steam-epic-badge/scripts/build.js`

- [ ] **Step 1: 创建构建脚本**

```javascript
// scripts/build.js
const fs = require('fs');
const path = require('path');

/**
 * 复制文件到构建目录
 * @param {string} src - 源路径
 * @param {string} dest - 目标路径
 */
function copyFile(src, dest) {
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
}

/**
 * 复制目录到构建目录
 * @param {string} srcDir - 源目录
 * @param {string} destDir - 目标目录
 */
function copyDirectory(srcDir, destDir) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
}

/**
 * 主构建函数
 */
function build() {
  const rootDir = path.join(__dirname, '..');
  const distDir = path.join(rootDir, 'dist');

  console.log('Starting build...');

  // 清理 dist 目录
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true });
  }
  fs.mkdirSync(distDir, { recursive: true });

  // 需要复制的文件和目录
  const filesToCopy = [
    'manifest.json',
    'background.js',
    'content.js',
    'content.css',
    'popup.html',
    'popup.js',
    'popup.css'
  ];

  const dirsToCopy = [
    'utils',
    'data',
    'icons'
  ];

  // 复制文件
  for (const file of filesToCopy) {
    const srcPath = path.join(rootDir, file);
    if (fs.existsSync(srcPath)) {
      copyFile(srcPath, path.join(distDir, file));
      console.log(`Copied: ${file}`);
    }
  }

  // 复制目录
  for (const dir of dirsToCopy) {
    const srcPath = path.join(rootDir, dir);
    if (fs.existsSync(srcPath)) {
      copyDirectory(srcPath, path.join(distDir, dir));
      console.log(`Copied directory: ${dir}`);
    }
  }

  console.log('Build completed successfully!');
}

// 执行构建
build();
```

- [ ] **Step 2: 测试构建脚本**

```bash
cd steam-epic-badge && node scripts/build.js
```

预期结果：构建成功，dist 目录创建完成

- [ ] **Step 3: 提交构建脚本**

```bash
git add steam-epic-badge/scripts/build.js
git commit -m "feat: add build script for extension packaging"
```

---

### Task 8: 创建错误处理工具

**Files:**
- Create: `steam-epic-badge/utils/errorHandler.js`
- Test: `steam-epic-badge/tests/utils/errorHandler.test.js`

- [ ] **Step 1: 编写错误处理器的失败测试**

```javascript
// tests/utils/errorHandler.test.js
import { errorHandler } from '../../utils/errorHandler';

describe('ErrorHandler', () => {
  beforeEach(() => {
    // 清空错误记录
    errorHandler.errors = [];
  });

  test('should categorize network errors', () => {
    const error = new Error('network request failed');
    const result = errorHandler.handle(error);

    expect(result.type).toBe('NETWORK');
  });

  test('should categorize storage errors', () => {
    const error = new Error('storage quota exceeded');
    const result = errorHandler.handle(error);

    expect(result.type).toBe('STORAGE');
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

  test('should limit error history', () => {
    // 添加超过限制的错误
    for (let i = 0; i < 150; i++) {
      errorHandler.handle(new Error(`Error ${i}`));
    }

    expect(errorHandler.errors.length).toBeLessThanOrEqual(100);
  });

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
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd steam-epic-badge && npm test -- tests/utils/errorHandler.test.js
```

预期结果：FAIL - "Cannot find module '../../utils/errorHandler'"

- [ ] **Step 3: 实现错误处理器**

```javascript
// utils/errorHandler.js
/**
 * 统一错误处理器
 * 借鉴 SubscriptionInfo 的错误处理策略
 */
class ErrorHandler {
  constructor() {
    this.errors = [];
    this.maxErrors = 100;
  }

  /**
   * 捕获并记录错误
   * @param {Error} error - 错误对象
   * @param {Object} context - 上下文信息
   * @returns {Object} 错误信息
   */
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

  /**
   * 错误分类
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
   * @param {Object} errorInfo - 错误信息
   */
  handleNetworkError(errorInfo) {
    console.warn('Network error, will retry:', errorInfo.message);
  }

  /**
   * 存储错误处理
   * @param {Object} errorInfo - 错误信息
   */
  handleStorageError(errorInfo) {
    console.warn('Storage error, clearing cache:', errorInfo.message);
    this.clearExpiredCache();
  }

  /**
   * 权限错误处理
   * @param {Object} errorInfo - 错误信息
   */
  handlePermissionError(errorInfo) {
    console.error('Permission error:', errorInfo.message);
  }

  /**
   * 超时错误处理
   * @param {Object} errorInfo - 错误信息
   */
  handleTimeoutError(errorInfo) {
    console.warn('Timeout error, increasing timeout:', errorInfo.message);
  }

  /**
   * 未知错误处理
   * @param {Object} errorInfo - 错误信息
   */
  handleUnknownError(errorInfo) {
    console.error('Unknown error:', errorInfo.message);
  }

  /**
   * 清理过期缓存
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
   * @returns {Object} 错误统计信息
   */
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

// 导出单例
export const errorHandler = new ErrorHandler();
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd steam-epic-badge && npm test -- tests/utils/errorHandler.test.js
```

预期结果：PASS - 错误处理器测试通过

- [ ] **Step 5: 提交错误处理器**

```bash
git add steam-epic-badge/utils/errorHandler.js steam-epic-badge/tests/utils/errorHandler.test.js
git commit -m "feat: add unified error handler with categorization and stats"
```

---

### Task 9: 创建日志工具

**Files:**
- Create: `steam-epic-badge/utils/logger.js`
- Test: `steam-epic-badge/tests/utils/logger.test.js`

- [ ] **Step 1: 编写日志工具的失败测试**

```javascript
// tests/utils/logger.test.js
import { logger } from '../../utils/logger';

describe('Logger', () => {
  beforeEach(() => {
    logger.clearLogs();
    logger.setLevel('DEBUG');
  });

  test('should log messages at different levels', () => {
    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warn message');
    logger.error('Error message');

    const logs = logger.getLogs();
    expect(logs.length).toBe(4);
  });

  test('should filter logs by level', () => {
    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warn message');
    logger.error('Error message');

    const warnLogs = logger.getLogs('WARN');
    expect(warnLogs.length).toBe(1);
    expect(warnLogs[0].level).toBe('WARN');
  });

  test('should respect log level setting', () => {
    logger.setLevel('WARN');

    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warn message');
    logger.error('Error message');

    const logs = logger.getLogs();
    expect(logs.length).toBe(2); // 只有 WARN 和 ERROR
  });

  test('should limit log history', () => {
    // 添加超过限制的日志
    for (let i = 0; i < 1500; i++) {
      logger.info(`Log message ${i}`);
    }

    expect(logger.getLogs().length).toBeLessThanOrEqual(1000);
  });

  test('should include timestamp and source', () => {
    logger.info('Test message');

    const logs = logger.getLogs();
    expect(logs[0].timestamp).toBeDefined();
    expect(logs[0].level).toBe('INFO');
    expect(logs[0].message).toBe('Test message');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd steam-epic-badge && npm test -- tests/utils/logger.test.js
```

预期结果：FAIL - "Cannot find module '../../utils/logger'"

- [ ] **Step 3: 实现日志工具**

```javascript
// utils/logger.js
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
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd steam-epic-badge && npm test -- tests/utils/logger.test.js
```

预期结果：PASS - 日志工具测试通过

- [ ] **Step 5: 提交日志工具**

```bash
git add steam-epic-badge/utils/logger.js steam-epic-badge/tests/utils/logger.test.js
git commit -m "feat: add enhanced logger with multi-level logging and persistence"
```

---

## 最终验证

### Task 10: 集成测试和文档更新

**Files:**
- Modify: `steam-epic-badge/README.md`
- Test: `steam-epic-badge/tests/integration.test.js`

- [ ] **Step 1: 创建集成测试**

```javascript
// tests/integration.test.js
import { throttle, waitForElement, createLookupMap } from '../utils/performance';
import { errorHandler } from '../utils/errorHandler';
import { logger } from '../utils/logger';

describe('Integration Tests', () => {
  test('should work together', async () => {
    // 测试性能工具
    let callCount = 0;
    const throttledFn = throttle(() => callCount++, 100);
    throttledFn();
    throttledFn();
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(callCount).toBe(1);

    // 测试错误处理器
    errorHandler.handle(new Error('test error'));
    const stats = errorHandler.getStats();
    expect(stats.total).toBe(1);

    // 测试日志工具
    logger.info('Integration test');
    const logs = logger.getLogs();
    expect(logs.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 运行所有测试**

```bash
cd steam-epic-badge && npm test
```

预期结果：所有测试通过

- [ ] **Step 3: 更新 README.md**

```markdown
# Steam Epic Badge

在 Steam 商店页面标记曾在 Epic Games 平台免费赠送过的游戏。

## 功能特性

- 在 Steam 商店页面显示 Epic 免费游戏角标
- 支持游戏详情页、搜索结果页、首页推荐
- 实时显示当前免费游戏
- 历史赠送记录查看
- 自动数据更新和通知

## 安装

### Chrome 扩展商店（推荐）

1. 访问 [Chrome 网上应用店](https://chrome.google.com/webstore/detail/steam-epic-badge/xxxxx)
2. 点击"添加到 Chrome"

### 手动安装

1. 下载最新版本的 `steam-epic-badge-chrome.zip`
2. 解压到本地文件夹
3. 打开 Chrome，访问 `chrome://extensions/`
4. 开启"开发者模式"
5. 点击"加载已解压的扩展程序"
6. 选择解压后的文件夹

## 开发

### 环境要求

- Node.js 18+
- npm 或 yarn

### 安装依赖

```bash
npm install
```

### 运行测试

```bash
npm test
```

### 构建扩展

```bash
npm run build
```

### 发布流程

1. 更新版本号：
   ```bash
   npm run version:patch  # 或 version:minor, version:major
   ```

2. 编辑 CHANGELOG.md，添加本次更新的内容

3. 提交并发布：
   ```bash
   npm run release
   ```

## 项目结构

```
steam-epic-badge/
├── manifest.json           # Chrome 扩展配置
├── background.js           # Service Worker
├── content.js              # 内容脚本
├── content.css             # 角标样式
├── popup.html/js/css       # 弹出窗口
├── utils/
│   ├── matcher.js          # 游戏匹配算法
│   ├── storage.js          # 存储工具
│   ├── performance.js      # 性能工具
│   ├── errorHandler.js     # 错误处理
│   └── logger.js           # 日志工具
├── data/
│   └── epic_history.json   # 历史赠送数据
├── scripts/
│   ├── version.js          # 版本管理
│   └── build.js            # 构建脚本
├── tests/                  # 测试文件
└── docs/
    └── superpowers/        # 设计和计划文档
```

## 技术栈

- Manifest V3
- 原生 JavaScript
- GitHub Actions (CI/CD)
- Jest (测试)
- Chrome Storage API

## 许可证

MIT License
```

- [ ] **Step 4: 运行最终测试**

```bash
cd steam-epic-badge && npm test
```

预期结果：所有测试通过

- [ ] **Step 5: 提交最终更改**

```bash
git add steam-epic-badge/tests/integration.test.js steam-epic-badge/README.md
git commit -m "docs: update README with development guide and project structure"
```

- [ ] **Step 6: 创建版本标签**

```bash
cd steam-epic-badge && npm run version:patch
git add .
git commit -m "release: v1.1.0"
git tag v1.1.0
```

---

## 完成

所有任务已完成！现在可以：

1. **推送到 GitHub**：
   ```bash
   git push && git push --tags
   ```

2. **创建 GitHub Release**：
   - 访问 GitHub 仓库页面
   - 点击 "Releases" -> "Create a new release"
   - 选择刚创建的标签
   - 填写发布说明
   - 上传 `steam-epic-badge-chrome.zip`

3. **验证发布流程**：
   - 检查 GitHub Actions 是否自动运行
   - 确认 Release 是否创建成功
   - 测试下载的扩展是否正常工作

**恭喜！** steam-epic-badge 优化完成，现在具备：
- ✅ 性能优化（throttle、Map/Set、sessionStorage）
- ✅ 自动化发布流程（GitHub Actions）
- ✅ 完善的错误处理和日志系统
- ✅ 完整的测试覆盖
- ✅ 规范的版本管理
