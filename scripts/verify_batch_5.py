import json
import requests
import time
import re

def normalize_name(name):
    """标准化游戏名称，忽略大小写、标点、商标符号等差异"""
    # 转小写
    name = name.lower()
    # 移除商标符号和特殊字符
    name = re.sub(r'[®™©]', '', name)
    # 移除多余空格
    name = re.sub(r'\s+', ' ', name).strip()
    return name

def check_game(game_name, appid):
    """检查单个游戏的 appid 是否正确"""
    url = f"https://store.steampowered.com/api/appdetails?appids={appid}"
    try:
        response = requests.get(url, timeout=10)
        data = response.json()

        appid_str = str(appid)
        if appid_str in data and data[appid_str].get('success'):
            steam_name = data[appid_str]['data']['name']
            # 标准化后比较
            if normalize_name(game_name) == normalize_name(steam_name):
                return None  # 匹配
            else:
                return steam_name  # 不匹配，返回实际名称
        else:
            return "API返回失败"
    except Exception as e:
        return f"请求错误: {e}"

# 读取 batch_5.json
with open(r'E:\MyProject\steam-epic-badge\scripts\batch_5.json', 'r', encoding='utf-8') as f:
    games = json.load(f)

errors = []

print(f"开始校验 {len(games)} 个游戏...")
for i, (game_name, appid) in enumerate(games):
    result = check_game(game_name, appid)
    if result:
        errors.append((game_name, appid, result))
        print(f"[{i+1}/{len(games)}] ❌ {game_name} (appid: {appid}) -> 实际是: {result}")
    else:
        print(f"[{i+1}/{len(games)}] ✓ {game_name}")

    # 每次请求间隔1秒
    if i < len(games) - 1:
        time.sleep(1)

print("\n" + "="*50)
if errors:
    print("错误列表：")
    for game_name, appid, actual_name in errors:
        print(f"- {game_name} (当前appid: {appid}): 实际是 {actual_name}")
else:
    print("批次5: 全部正确")
