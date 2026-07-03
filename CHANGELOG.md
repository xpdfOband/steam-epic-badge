# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2026-07-03

### Fixed
- 修复启动时 Service Worker 数据未就绪导致角标不显示的问题
- background.js: 无论缓存是否过期，启动时都重建内存索引
- content.js: 增加空结果重试机制，首次查询全空时延迟 3 秒重试

## [1.0.1] - 2026-06-14

### Added
-

### Changed
-

### Fixed
-