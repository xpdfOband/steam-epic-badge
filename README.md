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
