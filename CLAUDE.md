# CLAUDE.md - Steam Epic Badge 项目指南

## 核心规则
- **永远不要修改 content.js、background.js、content.css 的核心逻辑**，除非用户明确要求
- 修改前必须先 `node -c <file>` 验证语法
- 提交前必须 `npm test` 验证测试通过
- 不要在文件开头添加 BOM 头（会导致 Chrome 解析失败）

## 数据管理
- `data/epic_history.json` 是唯一数据源，包含所有游戏（历史+当前免费+即将免费）
- `data/steam_epic_games.db` 是 SQLite 数据库，存储 steam_appid 映射
- 数据来源：`E:\MyProject\github_project\epic-free-games-scraper\output\epic_games.db`
- **不要用 Steam API 自动查询 steam_appid**，搜索结果不准确，需人工校验
- 同步数据时必须去重（按 epic_id 或 title 匹配）

## 架构
- Manifest V3 Chrome 扩展
- background.js: Service Worker，负责数据获取和内存索引
- content.js: IIFE 格式（不是 ES module），负责页面角标注入
- 无 popup，只有 content script 功能

## 发布
- `git tag -d v1.0.1 && git push origin :refs/tags/v1.0.1 && git tag v1.0.1 && git push origin v1.0.1`

## 常见坑
- background.js 语法错误会导致 Service Worker 显示"无效"
- content.js 的 BOM 头会导致扩展不工作
- `queryBatchByAppIds` 返回的 `isFree` 依赖 `status` 字段（current/upcoming/history）
