# 增强 Popup — 当前游戏赠送信息

## 概述

在 popup 顶部增加"当前页面游戏"卡片区域，当用户在 Steam 游戏详情页时，自动展示该游戏的 Epic 赠送历史和当前状态。

## 用户体验

### 游戏详情页（`/app/{id}`）

打开 popup 后，顶部显示游戏信息卡片：
- 游戏封面图（从 Steam CDN 获取）
- 游戏名称
- Epic 赠送次数
- 最近赠送日期范围
- 当前免费状态（正在免费 / 即将免费 / 仅历史记录）
- Epic 商店链接（仅在正在免费或即将免费时显示）

### 非游戏页面

顶部显示一行提示文字："当前页面不是游戏详情页"，下方照常显示原有内容。

## 技术方案

### 1. 获取当前页面信息

在 `popup.js` 的 `init()` 中，通过 `chrome.tabs.query` 获取当前活动标签页：

```js
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
```

用正则提取 AppID：

```js
const match = tab.url.match(/\/app\/(\d+)/);
const appId = match ? match[1] : null;
```

### 2. 查询赠送数据

复用 background.js 已有的 `queryBatchByIds` 接口：

```js
const response = await sendMessage({
  action: 'queryBatchByIds',
  payload: { appIds: [appId] }
});
const gameData = response.data[appId];
```

### 3. 判断免费状态

与 content.js 逻辑一致，从 `freeDates` 日期范围判断：

```js
const today = new Date().toISOString().split('T')[0];
const isCurrentlyFree = gameData.details?.isCurrentlyFree
  || gameData.freeDates.some(d => d.start <= today && today <= d.end);
const upcomingFree = gameData.freeDates.find(d => d.start > today);
```

### 4. 获取游戏名称和图片

- 名称：优先使用 `gameData.details.title`，回退到从页面 DOM 提取（通过 `chrome.scripting.executeScript`），最终回退到 "未知游戏"
- 图片：优先使用 `gameData.details.image`，回退到 Steam CDN `https://cdn.akamai.steamstatic.com/steam/apps/{appId}/header.jpg`

### 5. 渲染卡片

新增 `renderCurrentGameCard(appId, gameData, tab)` 函数，构建卡片 DOM 并插入到 header 之后。

## 文件改动

### popup.html

在 `<header>` 后面增加游戏卡片占位：

```html
<section id="currentGameSection" class="section current-game-section">
  <!-- 动态填充：当前页面游戏信息卡片 -->
</section>
```

### popup.js

新增函数：
- `getCurrentTabUrl()` — 获取当前标签页 URL
- `extractAppId(url)` — 从 URL 提取 AppID
- `queryGameData(appId)` — 查询 background 获取赠送数据
- `renderCurrentGameCard(appId, gameData)` — 渲染游戏卡片
- `renderNotGamePage()` — 渲染"非游戏页"提示
- `loadCurrentGame()` — 主流程，串联以上函数

修改 `init()`：在加载设置之后、加载数据之前，调用 `loadCurrentGame()`。

复用逻辑：
- `formatFreeDates()` 已存在于 popup.js
- `formatDate()` 已存在于 popup.js
- `escapeHtml()` 已存在于 popup.js

### popup.css

新增样式：
- `.current-game-section` — 卡片容器
- `.current-game-card` — 卡片主体（flex 布局，左图右信息）
- `.current-game-img` — 游戏封面图（80px 宽，圆角）
- `.current-game-info` — 信息区域
- `.current-game-title` — 游戏名称（粗体）
- `.current-game-dates` — 赠送日期
- `.current-game-status` — 免费状态标签（绿色/蓝色）
- `.current-game-link` — Epic 商店链接按钮
- `.current-game-empty` — 非游戏页提示文字

## 边界情况

1. **AppID 在数据中不存在**：显示"暂无 Epic 赠送记录"
2. **网络错误**：显示"无法获取游戏信息"，3 秒后自动重试
3. **页面还在加载中**：显示 loading 占位，等待 tab URL 可用
4. **非 Steam 页面**：显示"当前页面不是游戏详情页"

## 不做的事

- 不在 popup 中显示搜索结果列表（后续任务）
- 不复用 content.js 的面板渲染（popup 布局独立设计）
- 不缓存 popup 查询结果（每次打开重新查询，数据量小）
