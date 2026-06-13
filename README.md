# Steam Epic Badge

Chrome 浏览器扩展，在 Steam 商店页面标记曾在 Epic Games 平台赠送过的游戏。

## 功能特性

- 🎮 自动检测 Steam 商店页面上的游戏
- 🏷️ 在游戏图标右上角显示蓝色 "E" 角标
- 💬 悬停显示赠送日期信息
- 📊 支持当前免费游戏实时获取
- 🔄 每小时自动更新 Epic 免费游戏数据

## 安装方法

### 开发者模式安装

1. 下载或克隆本项目到本地
2. 打开 Chrome 浏览器，访问 `chrome://extensions/`
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `steam-epic-badge` 文件夹
6. 扩展安装完成！

### 图标说明

扩展需要 PNG 格式的图标文件（16x16、48x48、128x128 像素）。

当前提供的 `icon.svg` 是矢量图，需要转换为 PNG：

**方法一：在线转换**
- 访问 https://convertio.co/svg-png/
- 上传 icon.svg，设置尺寸为 16/48/128，分别导出三个文件

**方法二：使用 Python**
```python
# 需要安装 cairosvg: pip install cairosvg
import cairosvg
for size in [16, 48, 128]:
    cairosvg.svg2png(url='icon.svg', write_to=f'icon{size}.png', output_width=size, output_height=size)
```

**方法三：使用 Inkscape**
```bash
inkscape icon.svg -w 16 -h 16 -o icon16.png
inkscape icon.svg -w 48 -h 48 -o icon48.png
inkscape icon.svg -w 128 -h 128 -o icon128.png
```

## 文件结构

```
steam-epic-badge/
├── manifest.json          # 扩展配置
├── background.js          # Service Worker（数据管理）
├── content.js             # 内容脚本（页面操作）
├── content.css            # 角标样式
├── popup.html             # 弹出窗口
├── popup.js               # 弹出窗口逻辑
├── popup.css              # 弹出窗口样式
├── data/
│   └── epic_history.json  # Epic 赠送历史数据库
├── icons/
│   ├── icon.svg           # 矢量图标
│   ├── icon16.png         # 16x16 图标（需生成）
│   ├── icon48.png         # 48x48 图标（需生成）
│   └── icon128.png        # 128x128 图标（需生成）
└── utils/
    ├── matcher.js         # 游戏名称匹配算法
    └── storage.js         # 本地存储管理
```

## 使用说明

1. 安装扩展后，访问任意 Steam 商店页面
2. 扩展会自动扫描页面上的游戏
3. 如果某个游戏曾在 Epic 赠送过，会在图标右上角显示蓝色 "E" 角标
4. 鼠标悬停在角标上可查看赠送日期
5. 点击扩展图标可查看当前免费游戏和设置

## 数据来源

- **当前免费游戏**: Epic Games 官方 API
- **历史赠送数据**: 内置 JSON 数据库（可手动更新）

### 更新历史数据

编辑 `data/epic_history.json` 文件，按照以下格式添加游戏：

```json
{
  "games": [
    {
      "title": "游戏名称",
      "epic_id": "epic-platform-id",
      "steam_appid": 123456,
      "free_dates": [
        {
          "start": "2024-01-01",
          "end": "2024-01-08",
          "type": "giveaway"
        }
      ]
    }
  ],
  "last_updated": "2025-01-01"
}
```

## 技术栈

- Chrome Extension Manifest V3
- Vanilla JavaScript（无框架依赖）
- Chrome Storage API
- MutationObserver（动态页面监听）

## 许可证

MIT License
