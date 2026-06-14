"""
批量修正 epic_history.json 和 epic_history_full.json 中的 steam_appid
基于 Steam 搜索 API 的验证结果
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

def fix_file(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    fixed = 0
    skipped = 0

    for g in data["games"]:
        title = g["title"]
        current_id = g.get("steam_appid")
        if not current_id:
            continue

        result = search_steam_appid(title)
        time.sleep(0.3)

        if result and result != current_id:
            print(f"修正 {title}: {current_id} -> {result}")
            g["steam_appid"] = result
            # 同步修正 image URL（如果包含旧 AppID）
            if "image" in g and str(current_id) in g["image"]:
                g["image"] = g["image"].replace(str(current_id), str(result))
            fixed += 1
        elif result:
            skipped += 1

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n{filepath}: 修正 {fixed} 个, 保持 {skipped} 个")
    return fixed

def main():
    total = 0
    for f in ["data/epic_history.json", "data/epic_history_full.json"]:
        print(f"\n=== 处理 {f} ===")
        total += fix_file(f)
    print(f"\n总计修正: {total} 个")

if __name__ == "__main__":
    main()
