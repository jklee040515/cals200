"""
[2 계산] make_routes.py — 200동의 모든 목적지까지 경로를 미리 계산해 routes.json 으로 저장

방법
  1) building.json 의 칸 격자를 그래프로 바꾼다.  칸 = 점(node), 걸어서 갈 수 있는 이웃 칸 = 선(edge)
  2) 공개 그래프 라이브러리 NetworkX 의 다익스트라(Dijkstra)로 출입구마다 모든 칸까지 최단 거리를 구한다.
  3) 목적지마다 출입구 3곳의 경로와 거리를 routes.json 에 적는다. 앱은 이 파일을 읽어 보여 주기만 한다.
  4) 만든 경로를 스스로 점검한다: 방을 지나가는 길, 계단·엘리베이터를 옆으로 지나가는 길, 못 가는 곳이 0인지.

설치(한 번):  pip install networkx
실행:         python make_routes.py                 → routes.json + 점검 결과
              python make_routes.py --floor-check   → 층 이동 비용(1~5칸)별 '내려갔다 다시 올라가는' 경로 수
building.json 을 고치면 이 파일을 다시 실행해 routes.json 도 함께 올린다.
"""
import argparse
import json
import math
from pathlib import Path

import networkx as nx

ROOT = Path(__file__).resolve().parent

# ---- 거리 규칙 ----
FLOOR_COST = 4  # 한 층 오르내리기 = 걷기 4칸 (너무 작으면 '내려갔다 다시 올라가는' 길이 생김 → --floor-check)
STAIR_EXTRA = 0.001  # 계단에 아주 작은 값을 더함 → 거리가 같으면 엘리베이터를 고름
SIDE_EXTRA = 0.005  # 탑에서 복도가 아닌 빈칸에 아주 작은 값을 더함 → 거리가 같으면 복도로 걸음
# (작은 값들은 다 더해도 1이 안 되므로 '몇 칸'인지는 바꾸지 않고, 같은 거리일 때 고르는 데만 쓰임)

# ---- 구역 모양 (남 → 북 순서) ----
# cols·rows: 격자 열·행 수, floors: 층 수, depth·z0: 동서 길이와 서쪽 끝 위치(구역 사이를 건널 때 씀)
# 앱의 grid.js(BLD)와 같은 값
ZONES = {
    "green": dict(cols=6, rows=22, floors=9, depth=14, z0=-7),
    "main": dict(cols=8, rows=7, floors=3, depth=14 * 7 / 11, z0=14 * 4 / 22 - 14 * 7 / 22),
    "bio": dict(cols=6, rows=22, floors=8, depth=14, z0=-7),
}
ORDER = ["green", "main", "bio"]


def key(b, f, c, r):
    return f"{b}:{f}:{c}:{r}"


def inside(b, f, c, r):
    """빈칸이 건물 안인지. 탑은 행 0·1이 밖이고 4층부터 행 20·21이 없음, 중앙관은 행 0이 1층에만 있음"""
    if b == "main":
        return not (r == 0 and f > 1)
    return r >= 2 and not (r > 19 and f > 3)


def load():
    """building.json, site.json 읽기 → (칸 사전, site)"""
    bld = json.loads((ROOT / "building.json").read_text(encoding="utf-8"))
    site = json.loads((ROOT / "site.json").read_text(encoding="utf-8"))
    cells = {}
    for b, f, c, r, cat, name, sign in bld["cells"]:
        cells[key(b, f, c, r)] = dict(b=b, f=f, c=c, r=r, cat=cat, name=name or "")
    return bld, cells, site


def kind(cells, b, f, c, r, use_stairs):
    """칸의 쓰임: 'walk' 걷는 칸 / 'vert' 계단·엘리베이터 / 'room' 방 / None 못 감"""
    v = cells.get(key(b, f, c, r))
    if v is None:
        return "walk" if inside(b, f, c, r) else None
    if v["cat"] in ("hall", "door"):
        return "walk"
    if v["cat"] == "elevator":
        return None if "화물" in v["name"] else "vert"  # 화물 엘리베이터는 쓰지 않음
    if v["cat"] == "stairs":
        return "vert" if use_stairs else None
    return "room"  # room, other


def walk_cost(cells, b, f, c, r):
    """걷는 칸에 들어가는 비용: 1칸 (탑의 복도 아닌 빈칸은 아주 조금 더)"""
    if key(b, f, c, r) not in cells and b != "main" and c in (0, 2, 3, 5):
        return 1 + SIDE_EXTRA
    return 1


def neighbors(b, f, c, r):
    """같은 층 상하좌우 칸 + 옆 구역으로 건너가는 칸"""
    z = ZONES[b]
    for dc, dr in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        if 0 <= c + dc < z["cols"] and 0 <= r + dr < z["rows"]:
            yield b, f, c + dc, r + dr
    # 구역 경계: 남쪽 구역의 북쪽 끝 열 ↔ 북쪽 구역의 남쪽 끝 열. 행 수가 달라서 실제 위치(z)로 맞은편 행을 찾음
    i = ORDER.index(b)
    for j, my_col, other_col in ((i + 1, z["cols"] - 1, 0), (i - 1, 0, None)):
        if c != my_col or not 0 <= j < len(ORDER):
            continue
        o = ORDER[j]
        oz = ZONES[o]
        if f > oz["floors"]:
            continue
        zpos = z["z0"] + (r + 0.5) * z["depth"] / z["rows"]
        r2 = math.floor((zpos - oz["z0"]) / (oz["depth"] / oz["rows"]) + 1e-6)
        if 0 <= r2 < oz["rows"]:
            yield o, f, (oz["cols"] - 1 if other_col is None else other_col), r2


def build_graph(cells, use_stairs=True, floor_cost=FLOOR_COST):
    """칸 격자 → 방향 그래프

    점의 종류
      "구역:층:열:행"        걷는 칸, 방, 계단·엘리베이터에서 '내린' 곳
      ("탐", "구역:층:열:행")  계단·엘리베이터를 '타는' 곳
    계단 칸을 둘로 나눈 까닭: 같은 층에서 계단에 들어가면(탐) 다른 층으로만 갈 수 있게 해서
    계단 칸을 복도처럼 옆으로 지나가는 길이 생기지 않게 함
    """
    G = nx.DiGraph()
    lifts = set()  # 위아래로 이어진 계단·엘리베이터 칸 짝
    for b, z in ZONES.items():
        for f in range(1, z["floors"] + 1):
            for c in range(z["cols"]):
                for r in range(z["rows"]):
                    here = kind(cells, b, f, c, r, use_stairs)
                    if here not in ("walk", "vert"):
                        continue  # 방·못 가는 칸에서는 나가는 선이 없음
                    k = key(b, f, c, r)
                    # 같은 층에서 이웃 칸으로 (계단에서는 '내린' 곳에서만 걸어 나감)
                    for nb in neighbors(b, f, c, r):
                        there = kind(cells, *nb, use_stairs)
                        k2 = key(*nb)
                        if there == "walk":
                            G.add_edge(k, k2, weight=walk_cost(cells, *nb))
                        elif there == "room":
                            G.add_edge(k, k2, weight=1)  # 방은 들어가기만 (목적지일 때만 쓰임)
                        elif there == "vert":
                            G.add_edge(k, ("탐", k2), weight=1)  # 계단·엘리베이터를 '타는' 곳
                    if here == "vert":
                        for k2, df in vertical(cells, b, f, c, r):
                            lifts.add((k, k2, df))
                            lifts.add((k2, k, df))  # 위로 갈 수 있으면 아래로도
    # 층 이동 선: 타서 다른 층에 내리기, 내린 칸에서 계속 오르내리기
    for k, k2, df in lifts:
        w = floor_cost * df + (STAIR_EXTRA * df if cells[k]["cat"] == "stairs" else 0)
        G.add_edge(("탐", k), k2, weight=w)
        G.add_edge(k, k2, weight=w)
    return G


def vertical(cells, b, f, c, r):
    """계단·엘리베이터 칸이 이어지는 다른 층 칸들: [(칸, 층 차이), ...]

    이름에 '3층'처럼 도착 층이 있으면 그 층만, 없으면 바로 위·아래 층.
    층마다 칸 위치가 한 칸쯤 어긋나도 이어지게 주변 3×3 칸에서 같은 종류를 찾음(중앙관 원형 계단).
    후보가 여럿이면 이쪽 층을 가리키는 표지의 칸을 먼저 고름.
    예: 중앙관 3층 계단(to 2층)은 2층의 'to 3층' 칸과 이어짐 ('to 1층' 칸은 1층으로만)
    """
    v = cells[key(b, f, c, r)]
    targets = sign_floor(v["name"], f) or [f - 1, f + 1]
    out = []
    for f2 in targets:
        if not 1 <= f2 <= ZONES[b]["floors"]:
            continue
        near = []
        for dc in (-1, 0, 1):
            for dr in (-1, 0, 1):
                w = cells.get(key(b, f2, c + dc, r + dr))
                if not w or w["cat"] != v["cat"] or "화물" in w["name"]:
                    continue
                points_away = sign_floor(w["name"], f2) not in ([], [f])  # 다른 층을 가리키는 표지
                near.append((points_away, abs(dc) + abs(dr), dc, dr))
        if near:
            *_, dc, dr = min(near)  # 이쪽을 가리키는 칸 → 가장 덜 어긋난 칸
            out.append((key(b, f2, c + dc, r + dr), abs(f2 - f)))
    return out


def sign_floor(name, f):
    """칸 이름에 적힌 도착 층. 'to 3층' → [3], 적힌 층이 없으면 []"""
    return [int(w[:-1]) for w in name.split() if w.endswith("층") and w[:-1].isdigit() and int(w[:-1]) != f][:1]


def places(cells):
    """목적지 목록. 같은 구역·층에 같은 종류·이름으로 적힌 칸들은 한 곳(예: 학습공간 14칸)"""
    groups = {}
    for k, v in cells.items():
        if v["cat"] in ("room", "other") and v["name"]:
            groups.setdefault((v["b"], v["f"], v["cat"], v["name"]), []).append(k)
        elif v["cat"] in ("room", "other"):
            groups[(k,)] = [k]
    return list(groups.values())


def summary(cells, path):
    """경로 요약: 걷기 칸 수, 오르내린 층 수, 엘리베이터로 오르내린 층 수"""
    walk = floors = lifts = 0
    for a, b in zip(path, path[1:]):
        fa, fb = cells_floor(a), cells_floor(b)
        if fa == fb:
            walk += 1
        else:
            floors += abs(fb - fa)
            if cells.get(a, {}).get("cat") == "elevator":
                lifts += abs(fb - fa)
    return walk, floors, lifts


def cells_floor(k):
    return int(k.split(":")[1])


def outdoor_cells(pts):
    """정류장 → 출입구 실외 꺾은선 길이를 칸 수로 (탑 격자 한 칸 크기 기준)"""
    cx, cz = 11.5 / 6, 14 / 22  # 칸 하나의 남북·동서 길이 (3D 모형 단위)
    total = sum(math.hypot((x1 - x0) / cx, (z1 - z0) / cz) for (x0, z0), (x1, z1) in zip(pts, pts[1:]))
    return math.floor(total + 0.5)  # 반올림


def all_routes(cells, site, use_stairs=True, floor_cost=FLOOR_COST):
    """목적지마다 출입구별 경로 → {대표 칸: {"cells": [...], "routes": [...]}}"""
    G = build_graph(cells, use_stairs, floor_cost)
    # 출입구마다 다익스트라 한 번: 그 출입구에서 모든 칸까지의 거리와 경로
    from_entrance = []
    for E in site["entrances"]:
        src = key(E["cell"]["b"], E["floor"], E["cell"]["c"], E["cell"]["r"])
        dist, path = nx.single_source_dijkstra(G, src, weight="weight")
        from_entrance.append((E, dist, path))
    result = {}
    for group in places(cells):
        routes = []
        for E, dist, path in from_entrance:
            reach = [k for k in group if k in dist]
            if not reach:
                continue  # 이 출입구에서는 못 감
            end = min(reach, key=lambda k: (dist[k], k))  # 공간에서 가장 가까운 칸
            p = [n[1] if isinstance(n, tuple) else n for n in path[end]]  # '타는 곳' 표시를 떼고 칸 이름만
            walk, floors, lifts = summary(cells, p)
            out = outdoor_cells(E["outdoor"]["pts"])
            routes.append(dict(e=E["id"], total=out + walk + floor_cost * floors, out=out, walk=walk,
                               floors=floors, lifts=lifts, path=" ".join(p)))
        routes.sort(key=lambda x: (x["total"], x["floors"]))  # 총 거리 → 층 이동 적은 순
        result[group[0]] = dict(cells=group, routes=routes)
    return result


def floor_check(cells, site):
    """층 이동 비용을 1~5칸으로 바꿔 가며 '내려갔다 다시 올라가는' 경로 수를 셈 (FLOOR_COST 를 정한 근거)"""
    def turns(path):
        fl = [cells_floor(k) for k in path.split()]
        steps = [b - a for a, b in zip(fl, fl[1:]) if b != a]
        return sum(1 for s, t in zip(steps, steps[1:]) if (s > 0) != (t > 0))

    print("층 이동 비용 | 계단·엘리베이터 모두 | 엘리베이터만")
    for fc in range(1, 6):
        n = [sum(1 for p in all_routes(cells, site, us, fc).values() for r in p["routes"] if turns(r["path"]))
             for us in (True, False)]
        print(f"  {fc}칸        | {n[0]:>6}건           | {n[1]:>4}건")


def check(cells, results):
    """만든 경로 점검: 방을 지나가는 길 / 계단·엘리베이터를 같은 층에서 옆으로 지나가는 길 / 못 가는 곳"""
    n = through_room = through_lift = unreachable = 0
    for result in results:
        for p in result.values():
            unreachable += not p["routes"]
            for r in p["routes"]:
                n += 1
                path = r["path"].split()
                for a, k, z in zip(path, path[1:], path[2:]):  # 앞뒤 칸과 함께 가운데 칸 k 를 봄
                    cat = cells.get(k, {}).get("cat")
                    through_room += cat in ("room", "other")
                    through_lift += cat in ("stairs", "elevator") and cells_floor(a) == cells_floor(k) == cells_floor(z)
    print(f"점검: 경로 {n:,}개 · 방을 지나감 {through_room} · 계단·엘리베이터를 옆으로 지나감 {through_lift} · 못 가는 곳 {unreachable}")


def main():
    ap = argparse.ArgumentParser(description="200동 경로를 미리 계산해 routes.json 만들기 (NetworkX)")
    ap.add_argument("--floor-check", action="store_true", help="층 이동 비용별 '내려갔다 다시 올라가는' 경로 수")
    args = ap.parse_args()
    bld, cells, site = load()
    if args.floor_check:
        floor_check(cells, site)
        return
    both = {"all": all_routes(cells, site, True), "lift": all_routes(cells, site, False)}
    data = {
        "asof": bld["asof"],
        "made_by": f"make_routes.py · NetworkX {nx.__version__} 다익스트라",
        "floor_cost": FLOOR_COST,
        "places": [dict(id=k, cells=v["cells"], all=v["routes"], lift=both["lift"][k]["routes"])
                   for k, v in both["all"].items()],
    }
    out = ROOT / "routes.json"
    out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    n_dest = sum(1 for p in data["places"] if cells[p["id"]]["cat"] == "room")
    print(f"경로를 만든 곳 {len(data['places'])}곳(목적지 {n_dest} · 화장실 등 {len(data['places']) - n_dest}) → {out.name} ({out.stat().st_size // 1024} KB)")
    check(cells, both.values())


if __name__ == "__main__":
    main()
