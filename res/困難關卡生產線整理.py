import json

path = "stage_ai.json"
with open(path, 'r', encoding='utf-8') as file:
    stage_ai = json.load(file)["stage_ai"]

path = "stage_productline.json"
with open(path, 'r', encoding='utf-8') as file:
    raw = json.load(file)["stage_productline"]
stage_productline = {}
for r in raw:
    code = r["productionLine"]
    if code in stage_productline:
        stage_productline[code].append(r)
    else:
        stage_productline[code] = [r]

path = "unit_reinforce_rate.json"
with open(path, 'r', encoding='utf-8') as file:
    raw = json.load(file)["unit_reinforce_rate"]
reinforce_rate = {}
for r in raw:
    code = r["unitCode"]
    reinforce_rate[code] = r

path = "unit.json"
with open(path, 'r', encoding='utf-8') as file:
    raw = json.load(file)["unit"]
unit = {}
for r in raw:
    code = r["unitCode"]
    unit[code] = r

zh_condition = {
    "START": "遊戲開始後%d秒",
    "FRONT": "我方前線位置超過%d%",
    "ENEMY_HP": "敵方塔城血量低於%d%",
    "TIME": "戰鬥時間超過%d秒",
    "SPECIAL": "特殊"
    }

def shorter_num(x):
    if x >= 10**9:
        return f"{round(x / 10**9, 2)}G"
    if x >= 10**6:
        return f"{round(x / 10**6, 2)}M"
    return x

output = {}
for stage in stage_ai:
    lv = stage["stageCode"]
    if not lv.startswith("hs"):
        continue

    condTy = stage["conditionType"]
    condVal = stage["conditionValue"]
    prodLineNum = stage["productionLine"]
    delay = stage["delay"]

    if condTy == "START":
        cond_nm = zh_condition[condTy].replace("%d",str(delay))
    else:
        cond_nm = zh_condition[condTy].replace("%d",str(condVal))

    prodLine = stage_productline[prodLineNum]
    temp = []
    for slot in prodLine:
        unitCode = slot["unitCode"]
        level = slot["enemyLevel"]
        initDelay = slot["initDelay"]
        maxCount = slot["maxCount"]
        minSec = slot["minSec"]
        maxSec = slot["maxSec"]
        enemy = unit[unitCode]
        delta = reinforce_rate[unitCode]
        detail = {
            "物理攻擊力": shorter_num(enemy["initialAttack"]+level*delta["attackIncreaseAmount"]),
            "魔法攻擊力": shorter_num(enemy["specialAttack"]+level*delta["specialAttackDelta"]),
            "體力": shorter_num(enemy["initialHp"]+level*delta["hpIncreaseAmount"])
        }
        temp2 = {
            "敵人id": unitCode,
            "初登場時間": f"{initDelay}秒",
            "再生產間距": f"{minSec}秒~{maxSec}秒",
            "生產上限": f"{maxCount}隻",
            "詳細資訊": detail
            }
        temp.append(temp2)

    lv = lv.replace("hs0","").replace("hs","")
    lv_nm = "困難關卡%d關".replace("%d",lv)
    if lv_nm in output:
        output[lv_nm][cond_nm] = temp
    else:
        output[lv_nm] = {cond_nm: temp}

file_path = "困難關卡生產線.json"
with open(file_path, 'w', encoding='utf-8') as file:
    json.dump(output, file, ensure_ascii=False, indent=4)








        
    
    
