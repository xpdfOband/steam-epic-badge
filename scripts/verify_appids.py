"""
批量验证 epic_history.json 中的 steam_appid 是否正确
通过 Steam 搜索 API 按游戏名查找正确 AppID
"""
import json
import time
import requests

def search_steam_appid(title):
    """通过 Steam 搜索 API 查找游戏的 AppID"""
    try:
        resp = requests.get(
            "https://store.steampowered.com/api/storesearch/",
            params={"term": title, "l": "english", "cc": "US"},
            timeout=10
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        items = data.get("items", [])
        if not items:
            return None
        # 精确匹配优先
        for item in items:
            if item["name"].lower() == title.lower():
                return item["id"]
        # 否则返回第一个结果
        return items[0]["id"]
    except Exception as e:
        print(f"  查询失败: {e}")
        return None

def main():
    with open("data/epic_history.json", "r", encoding="utf-8") as f:
        data = json.load(f)

    games = data["games"]
    wrong = []
    checked = 0

    for g in games:
        title = g["title"]
        current_id = g.get("steam_appid")
        if not current_id:
            continue

        checked += 1
        result = search_steam_appid(title)
        time.sleep(0.3)  # 限速

        if result and result != current_id:
            wrong.append({
                "title": title,
                "current_id": current_id,
                "correct_id": result
            })
            print(f"❌ {title}: {current_id} -> {result}")
        elif result:
            print(f"✅ {title}: {current_id}")
        else:
            print(f"⚠️ {title}: 未找到匹配")

    print(f"\n检查完毕: {checked} 个游戏, {len(wrong)} 个 AppID 有误")

    if wrong:
        print("\n需要修正:")
        for w in wrong:
            print(f"  {w['title']}: {w['current_id']} -> {w['correct_id']}")

if __name__ == "__main__":
    main()
