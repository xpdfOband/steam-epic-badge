"""
Epic 免费游戏自动追新脚本
============================
由 GitHub Actions 定时运行，从 Epic API 拉取当前免费游戏，
自动补充到 epic_history.json。

纯标准库实现，零外部依赖。

逻辑：
1. 请求 freeGamesPromotions API
2. 加载现有 epic_history.json
3. 匹配新游戏（名称 + epic_id 双重检查）
4. 新游戏追加，已有游戏的新赠送日期合并
5. 写回 JSON
"""

import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone

# ============================================================
# 配置
# ============================================================
EPIC_API_URL = (
    "https://store-site-backend-static-ipv4.ak.epicgames.com/"
    "freeGamesPromotions?locale=en-US&country=US&allowCountries=US"
)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(PROJECT_DIR, "data")
HISTORY_PATH = os.path.join(DATA_DIR, "epic_history.json")

# ============================================================
# 工具函数
# ============================================================
def log(msg):
    """带时间戳的日志"""
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}")


def normalize(s):
    """标准化游戏名"""
    if not s:
        return ""
    s = s.lower().strip()
    s = s.replace("™", "").replace("®", "").replace("©", "")
    s = re.sub(r"[^\w\s]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def make_epic_id(title):
    """从标题生成 epic_id"""
    return (
        title.lower()
        .replace(" ", "-")
        .replace("'", "")
        .replace(":", "")
        .replace(".", "")
        .replace(",", "")
    )


# ============================================================
# API 请求
# ============================================================
def fetch_free_games():
    """从 Epic API 获取当前免费游戏"""
    log("请求 Epic API...")
    req = urllib.request.Request(
        EPIC_API_URL,
        headers={"Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        log(f"API 请求失败: {e}")
        sys.exit(1)

    elements = data.get("data", {}).get("Catalog", {}).get("searchStore", {}).get("elements", [])
    log(f"API 返回 {len(elements)} 个条目")

    free_games = []
    now = datetime.now(timezone.utc)

    for elem in elements:
        title = elem.get("title", "")
        if not title:
            continue

        promotions = elem.get("promotions")
        if not promotions:
            continue

        # 收集免费促销日期
        free_dates = []
        for promo_group in promotions.get("promotionalOffers", []):
            for offer in promo_group.get("promotionalOffers", []):
                if offer.get("discountSetting", {}).get("discountPercentage") == 0:
                    free_dates.append({
                        "start": offer["startDate"][:10],
                        "end": offer["endDate"][:10],
                        "type": "giveaway",
                    })

        for promo_group in promotions.get("upcomingPromotionalOffers", []):
            for offer in promo_group.get("promotionalOffers", []):
                if offer.get("discountSetting", {}).get("discountPercentage") == 0:
                    free_dates.append({
                        "start": offer["startDate"][:10],
                        "end": offer["endDate"][:10],
                        "type": "giveaway",
                    })

        if not free_dates:
            continue

        # 提取图片
        image = None
        for img in elem.get("keyImages", []):
            if img.get("type") in ("DieselStoreFrontWide", "OfferImageWide"):
                image = img.get("url")
                break
        if not image and elem.get("keyImages"):
            image = elem["keyImages"][0].get("url")

        product_slug = elem.get("productSlug", "") or elem.get("offerId", "")

        free_games.append({
            "title": title,
            "epic_id": product_slug,
            "free_dates": free_dates,
            "image": image,
        })

    log(f"筛选出 {len(free_games)} 款当前/即将免费的游戏")
    return free_games


# ============================================================
# 数据合并
# ============================================================
def load_history():
    """加载现有历史数据"""
    if not os.path.exists(HISTORY_PATH):
        log(f"历史文件不存在: {HISTORY_PATH}，将创建新文件")
        return {"games": [], "last_updated": None}

    with open(HISTORY_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    log(f"加载历史数据: {len(data.get('games', []))} 条记录")
    return data


def find_game(history_games, title, epic_id):
    """在历史记录中查找匹配的游戏，返回 (index, game) 或 (None, None)"""
    norm_title = normalize(title)
    norm_epic_id = normalize(epic_id)

    for i, game in enumerate(history_games):
        # 1. epic_id 精确匹配
        if epic_id and normalize(game.get("epic_id", "")) == norm_epic_id:
            return i, game

        # 2. 标题标准化后精确匹配
        if normalize(game.get("title", "")) == norm_title:
            return i, game

        # 3. 标题包含匹配（防止细微差异）
        game_norm = normalize(game.get("title", ""))
        if game_norm and norm_title:
            if game_norm in norm_title or norm_title in game_norm:
                return i, game

    return None, None


def merge_free_games(history, api_games):
    """将 API 游戏合并到历史记录"""
    games = history.get("games", [])
    added = 0
    updated = 0

    for api_game in api_games:
        idx, existing = find_game(games, api_game["title"], api_game["epic_id"])

        if existing is None:
            # 新游戏，直接追加
            games.append({
                "title": api_game["title"],
                "epic_id": api_game["epic_id"],
                "steam_appid": None,
                "free_dates": api_game["free_dates"],
                "image": api_game["image"],
            })
            added += 1
            log(f"  + 新增: {api_game['title']} ({api_game['free_dates'][0]['start']} ~ {api_game['free_dates'][0]['end']})")
        else:
            # 已有游戏，检查是否有新的赠送日期
            existing_dates = {
                (d.get("start", ""), d.get("end", ""))
                for d in existing.get("free_dates", [])
            }
            new_dates_added = False
            for fd in api_game["free_dates"]:
                key = (fd["start"], fd["end"])
                if key not in existing_dates:
                    existing.setdefault("free_dates", []).append(fd)
                    existing_dates.add(key)
                    new_dates_added = True

            if new_dates_added:
                updated += 1
                log(f"  ~ 更新: {api_game['title']} 新增赠送日期")

    history["games"] = games
    history["last_updated"] = datetime.now().strftime("%Y-%m-%d")

    return added, updated


# ============================================================
# 主流程
# ============================================================
def main():
    log("=== Epic 免费游戏自动追新 ===")

    # 1. 拉取 API
    api_games = fetch_free_games()
    if not api_games:
        log("没有发现免费游戏，退出")
        return

    # 2. 加载历史
    history = load_history()

    # 3. 合并
    added, updated = merge_free_games(history, api_games)

    # 4. 保存
    with open(HISTORY_PATH, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2, ensure_ascii=False)

    # 5. 输出摘要（GitHub Actions 日志用）
    log(f"=== 完成 ===")
    log(f"新增游戏: {added} 款")
    log(f"更新赠送日期: {updated} 款")
    log(f"历史总记录: {len(history['games'])} 款")

    # 设为输出变量供 workflow 判断是否有变更
    if added > 0 or updated > 0:
        env_file = os.environ.get("GITHUB_OUTPUT")
        if env_file:
            with open(env_file, "a") as f:
                f.write(f"has_changes=true\n")
                f.write(f"added={added}\n")
                f.write(f"updated={updated}\n")
        print(f"\n::notice:: 发现 {added} 款新游戏，{updated} 款更新")
    else:
        env_file = os.environ.get("GITHUB_OUTPUT")
        if env_file:
            with open(env_file, "a") as f:
                f.write("has_changes=false\n")
        print("\n无新游戏~")


if __name__ == "__main__":
    main()
