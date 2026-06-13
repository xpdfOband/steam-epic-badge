"""
合并 epic_history.json 中的重复条目：
1. 同 steam_appid + 同游戏 → 合并 free_dates
2. 同 steam_appid + 不同游戏（数据填错）→ 修正 appid
"""
import json, re, os

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
JSON_PATH = os.path.join(DATA_DIR, 'epic_history.json')

# 已知错误的 steam_appid 修正表：{(错误的appid, 游戏title): 正确的appid}
KNOWN_FIXES = {
    # 462780: Styx 错填了 Darksiders 的 appid
    462780: {'Styx: Shards of Darkness': 355790},
    # 236850: Warhammer 错填了 EU4 的 appid
    236850: {'Warhammer 40K Speed Freeks': 2078450},
    # 1538850: Cursed to Golf 错填
    1538850: {'Cursed to Golf': 1726120},
    # 1222670: LEGO Star Wars 错填了 Sims 4 的 appid
    1222670: {'LEGO Star Wars: The Skywalker Saga': 920210},
    # 1582540: Make Way 错填
    1582540: {'Make Way': 1872720},
    # 1945280: The Ouroboros King 错填
    1945280: {'The Ouroboros King': 1877980},
    # 1374840: Turbo Golf Racing 错填
    1374840: {'Turbo Golf Racing': 1324350},
}

def normalize(s):
    return re.sub(r'[^a-z0-9]', '', s.lower().strip())

def title_similar(a, b):
    """检查两个游戏名是否相似（同一游戏的不同写法）"""
    na, nb = normalize(a), normalize(b)
    if na == nb:
        return True
    # 包含关系
    if na in nb or nb in na:
        return True
    # 处理 "Civilization VI / Sid Meier's Civilization VI: Platinum Edition" 这类
    parts_a = set(re.split(r'[/:]', na))
    parts_b = set(re.split(r'[/:]', nb))
    common = parts_a & parts_b
    if common and len(common) >= max(len(parts_a), len(parts_b)) * 0.5:
        return True
    return False

def main():
    with open(JSON_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    games = data['games']
    print(f"原始记录数: {len(games)}")

    # === 第一步：修复已知错误 appid ===
    for entry in games:
        aid = entry.get('steam_appid')
        title = entry.get('title', '')
        if aid in KNOWN_FIXES and title in KNOWN_FIXES[aid]:
            old_aid = aid
            new_aid = KNOWN_FIXES[aid][title]
            entry['steam_appid'] = new_aid
            print(f"  [修正] {title}: {old_aid} → {new_aid}")

    # === 第二步：按 steam_appid 分组，合并同游戏 ===
    groups = {}
    for entry in games:
        aid = entry.get('steam_appid')
        if aid is None:
            continue
        groups.setdefault(aid, []).append(entry)

    merged_count = 0
    to_remove = set()

    for aid, group in groups.items():
        if len(group) <= 1:
            continue

        # 检查组内游戏名是否相似
        titles = [g['title'] for g in group]
        all_similar = all(title_similar(titles[0], t) for t in titles[1:])

        if all_similar:
            # 合并：保留第一条，合并所有 free_dates
            kept = group[0]
            merged_dates = []
            seen = set()
            for g in group:
                for d in g.get('free_dates', []):
                    key = (d.get('start', ''), d.get('end', ''))
                    if key not in seen:
                        seen.add(key)
                        merged_dates.append(d)
            # 按 start 排序
            merged_dates.sort(key=lambda x: x.get('start', ''))
            kept['free_dates'] = merged_dates
            # 标记其余删除
            for g in group[1:]:
                to_remove.add(id(g))
            merged_count += 1
            print(f"  [合并] {titles[0]} (appid {aid}): {len(group)} 条 → {len(merged_dates)} 次赠送")

    # 删除被合并的条目
    games = [g for g in games if id(g) not in to_remove]

    # === 第三步：清理 steam_appid = null 的条目（仍可用名称匹配） ===
    null_count = sum(1 for g in games if g.get('steam_appid') is None)
    print(f"  无 steam_appid 条目: {null_count}")

    data['games'] = games
    data['last_updated'] = data.get('last_updated', '') or '2026-06-13'

    with open(JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n完成！最终记录数: {len(games)}")

if __name__ == '__main__':
    main()
