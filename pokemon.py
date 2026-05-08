import math
import random
import json

class Move:
    def __init__(self, data):
        self.name = data['name']
        self.type = data['type']
        self.category = data['category'] # Physical, Special, Status
        self.power = data['power']
        self.accuracy = data['accuracy']
        self.pp = data['pp']
        self.effect = data.get('effect', "")

class Pokemon:
    def __init__(self, data):
        self.name = data['name']
        self.types = data['type']
        self.level = data['level']
        self.stats = data['stats']
        self.current_hp = self.stats['hp']
        self.max_hp = self.stats['hp']
        self.moves = [Move(m) for m in data['moves']]
        
        # 랭크 보정 (-6 ~ +6)
        self.stages = {
            "attack": 0,
            "defense": 0,
            "special_attack": 0,
            "special_defense": 0,
            "speed": 0
        }

    def get_stat(self, stat_name):
        """랭크 보정이 적용된 능력치를 반환합니다."""
        base_stat = self.stats.get(stat_name, 0)
        stage = self.stages.get(stat_name, 0)
        
        if stage >= 0:
            multiplier = (2 + stage) / 2
        else:
            multiplier = 2 / (2 + abs(stage))
            
        return math.floor(base_stat * multiplier)

    def take_damage(self, damage):
        self.current_hp = max(0, self.current_hp - damage)
        return self.current_hp == 0

    def is_fainted(self):
        return self.current_hp <= 0

    def apply_stat_change(self, stat_name, amount):
        """능력치 랭크를 변화시킵니다 (-6 ~ +6). 실제 변화 여부를 반환합니다."""
        if stat_name not in self.stages:
            return False
            
        current = self.stages[stat_name]
        if (amount > 0 and current == 6) or (amount < 0 and current == -6):
            return False # 이미 최댓값/최솟값임
            
        self.stages[stat_name] = max(-6, min(6, current + amount))
        return True

    def reset_stages(self):
        for stat in self.stages:
            self.stages[stat] = 0

# 2세대 타입 상성표 (공격 타입: {방어 타입: 배율})
TYPE_CHART = {
    "Normal": {"Rock": 0.5, "Steel": 0.5, "Ghost": 0},
    "Fire": {"Fire": 0.5, "Water": 0.5, "Grass": 2, "Ice": 2, "Bug": 2, "Rock": 0.5, "Dragon": 0.5, "Steel": 2},
    "Water": {"Fire": 2, "Water": 0.5, "Grass": 0.5, "Ground": 2, "Rock": 2, "Dragon": 0.5},
    "Grass": {"Fire": 0.5, "Water": 2, "Grass": 0.5, "Poison": 0.5, "Ground": 2, "Flying": 0.5, "Bug": 0.5, "Rock": 2, "Dragon": 0.5, "Steel": 0.5},
    "Electric": {"Water": 2, "Grass": 0.5, "Electric": 0.5, "Ground": 0, "Flying": 2, "Dragon": 0.5},
    "Ice": {"Fire": 0.5, "Water": 0.5, "Grass": 2, "Ice": 0.5, "Ground": 2, "Flying": 2, "Dragon": 2, "Steel": 0.5},
    "Fighting": {"Normal": 2, "Ice": 2, "Poison": 0.5, "Flying": 0.5, "Psychic": 0.5, "Bug": 0.5, "Rock": 2, "Ghost": 0, "Dark": 2, "Steel": 2},
    "Poison": {"Grass": 2, "Poison": 0.5, "Ground": 0.5, "Rock": 0.5, "Ghost": 0.5, "Steel": 0},
    "Ground": {"Fire": 2, "Electric": 2, "Grass": 0.5, "Poison": 2, "Flying": 0, "Bug": 0.5, "Rock": 2, "Steel": 2},
    "Flying": {"Grass": 2, "Electric": 0.5, "Fighting": 2, "Bug": 2, "Rock": 0.5, "Steel": 0.5},
    "Psychic": {"Fighting": 2, "Poison": 2, "Psychic": 0.5, "Dark": 0, "Steel": 0.5},
    "Bug": {"Fire": 0.5, "Grass": 2, "Fighting": 0.5, "Poison": 0.5, "Flying": 0.5, "Psychic": 2, "Ghost": 0.5, "Dark": 2, "Steel": 0.5},
    "Rock": {"Fire": 2, "Ice": 2, "Fighting": 0.5, "Ground": 0.5, "Flying": 2, "Bug": 2, "Steel": 0.5},
    "Ghost": {"Normal": 0, "Psychic": 2, "Ghost": 2, "Dark": 0.5, "Steel": 0.5},
    "Dragon": {"Dragon": 2, "Steel": 0.5},
    "Dark": {"Fighting": 0.5, "Psychic": 2, "Ghost": 2, "Dark": 0.5, "Steel": 0.5},
    "Steel": {"Fire": 0.5, "Water": 0.5, "Electric": 0.5, "Ice": 2, "Rock": 2, "Steel": 0.5}
}

def get_type_effectiveness(move_type, target_types):
    effectiveness = 1.0
    for t_type in target_types:
        mod = TYPE_CHART.get(move_type, {}).get(t_type, 1.0)
        effectiveness *= mod
    return effectiveness

def calculate_damage(attacker, defender, move):
    if move.category == "Status":
        # 변화기는 별도 명중률 체크가 필요할 수 있으나 여기서는 기본 데미지 0 반환
        return 0, 1.0
    
    # 1. 명중률 체크 (난수 적용)
    if random.randint(1, 100) > move.accuracy:
        return 0, -1.0 # -1.0은 '빗나감'을 의미하는 커스텀 식별자
    
    # 2. 기초 공격력/방어력 결정
    if move.category == "Physical":
        atk = attacker.get_stat("attack")
        dfn = defender.get_stat("defense")
    else:
        atk = attacker.get_stat("special_attack")
        dfn = defender.get_stat("special_defense")
        
    # 3. 기본 데미지 공식
    level_factor = (2 * attacker.level / 5) + 2
    base_damage = (level_factor * move.power * atk / dfn) / 50 + 2
    
    # 4. 보정치 (Modifier)
    # 자속 보정 (STAB)
    stab = 1.5 if move.type in attacker.types else 1.0
    
    # 상성 보정 (Type Effectiveness)
    type_mod = get_type_effectiveness(move_type=move.type, target_types=defender.types)
    
    # 급소 보정 (Critical Hit, 약 6.25% 확률)
    crit_mod = 1.5 if random.random() < 0.0625 else 1.0
    
    # 난수 보정 (0.85 ~ 1.0)
    random_factor = random.randint(217, 255) / 255
    
    final_damage = math.floor(base_damage * stab * type_mod * crit_mod * random_factor)
    
    # 급소인 경우 식별을 위해 mod 값에 10을 곱하는 등의 처리 가능하나, 
    # 여기서는 결과 반환 시 type_mod만 일단 반환 (main.py에서 crit 여부 판단 필요시 로직 확장)
    return final_damage, type_mod

def load_starters(file_path="starters.json"):
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return {p['name']: Pokemon(p) for p in data['starters']}

if __name__ == "__main__":
    # 테스트 코드
    starters = load_starters()
    cyndaquil = starters["브케인"]
    chikorita = starters["치코리타"]
    
    move = cyndaquil.moves[2] # 불꽃세례
    dmg, mod = calculate_damage(cyndaquil, chikorita, move)
    print(f"{cyndaquil.name}의 {move.name}! {chikorita.name}에게 {dmg}의 데미지!")
