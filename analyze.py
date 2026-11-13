"""
[2 계산] analyze.py — routes.json 으로 추천 출입구 집계 (포스터 '결과' 수치, 기술통계만, pandas)

설치(한 번):  pip install pandas
실행:         python analyze.py      (먼저 python make_routes.py 로 routes.json 을 만들어 둠)
결과:         recommendations.csv  (방마다 추천 출입구와 출입구별 총 거리, R·엑셀로 열 수 있음)
              dataset.svg          (데이터셋 그림: building.json 의 20개 층 칸 지도, README 맨 위에 씀)
              화면 출력: 구역 × 추천 출입구 표, 3층 출입구 비율, 총 거리 중앙값·범위·평균
"""
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent
ZONE_NAME = {"green": "상록관", "main": "중앙관", "bio": "생명관"}
ENT_FLOOR = {"e1": 1, "e2": 2, "e3": 3}  # 출입구 → 층 (site.json 과 같음)


def table(places, cells, cond):
    """목적지(room)마다 한 줄: 추천 출입구와 출입구별 총 거리"""
    rows = []
    for p in places:
        v = cells[p["id"]]
        if v["cat"] != "room":  # 화장실 같은 '기타'는 집계에서 뺌
            continue
        routes = p[cond]
        best = routes[0]  # routes.json 은 총 거리가 짧은 순 → 맨 앞이 추천
        row = {"place": p["id"], "zone": ZONE_NAME[v["b"]], "floor": v["f"], "room": v["name"],
               "best_entrance_floor": ENT_FLOOR[best["e"]], "total": best["total"], "outdoor": best["out"],
               "walk": best["walk"], "floors": best["floors"]}
        by_e = {r["e"]: r["total"] for r in routes}
        for e in ENT_FLOOR:  # 출입구별 총 거리 (비교 분석용)
            row[f"total_{e}"] = by_e.get(e)
        rows.append(row)
    df = pd.DataFrame(rows)
    df["zone"] = pd.Categorical(df["zone"], ["상록관", "중앙관", "생명관"])  # 표를 남 → 북 순서로
    return df


def report(df, title):
    print(f"[{title}] 목적지 {len(df)}곳 (화장실 등 기타 제외, 여러 칸짜리 공간은 한 곳)")
    print(pd.crosstab(df["zone"], df["best_entrance_floor"], margins=True, margins_name="합계"))
    n3 = (df["best_entrance_floor"] == 3).sum()
    print(f"3층 출입구 추천 {n3}/{len(df)} = {n3 / len(df):.0%}")
    t = df["total"]
    print(f"총 거리(칸): 중앙값 {t.median():g}, 범위 {t.min()}–{t.max()}, 평균 {t.mean():.1f}\n")


# 데이터셋 그림(dataset.svg): building.json 칸을 층마다 그대로 칠함. 방향·범위는 앱 평면도(plan.js)와 같게
#   열 → 가로, 행 → 세로 / 탑(상록관·생명관)은 행 2부터, 1~3층 행 21까지, 4층부터 행 19까지(그보다 아래 행에 칸이 있으면 그 행까지)
ZONES = [("green", "상록관", 9, 6), ("main", "중앙관", 3, 8), ("bio", "생명관", 8, 6)]  # 구역, 이름, 층 수, 열 수
COLOR = {"room": "#FFD43B", "stairs": "#2F6FED", "elevator": "#16336E", "door": "#1FA463", "other": "#B7BFC7", "hall": "#EEF1F4"}
LEGEND = [("목적지", "room"), ("계단", "stairs"), ("엘리베이터", "elevator"), ("출입구", "door"), ("화장실 등", "other")]


def draw_dataset(bld, path, cs=12):
    by = {}
    for b, f, c, r, cat, name, _ in bld["cells"]:
        by.setdefault((b, f), []).append((c, r, cat))
    font = "font-family=\"'Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo',sans-serif\""
    out, x, top, drawn = [], 20, 56, 0
    hmax = 20 * cs  # 가장 긴 층(탑 1~3층, 행 2~21) 높이에 맞춰 아래를 가지런히
    for zid, zname, nf, ncol in ZONES:
        n = sum(len(by.get((zid, f), [])) for f in range(1, nf + 1))
        out.append(f'<text x="{x}" y="34" {font} font-size="22" font-weight="700" fill="#191919">{zname}'
                   f'<tspan font-size="15" fill="#5B6670" dx="8">{nf}개 층 · {n}칸</tspan></text>')
        for f in range(1, nf + 1):
            cs_ = by.get((zid, f), [])
            last = max(r for _, r, _ in cs_)
            r0, r1 = (1 if f > 1 else 0, 6) if zid == "main" else (2, max(21 if f <= 3 else 19, last))
            w, h = ncol * cs, (r1 - r0 + 1) * cs
            y0 = top + hmax - h
            out.append(f'<rect x="{x + 0.5}" y="{y0 + 0.5}" width="{w - 1}" height="{h - 1}" fill="#fff" stroke="#C3CAD2"/>')
            for c, r, cat in cs_:
                out.append(f'<rect x="{x + c * cs + 1}" y="{y0 + (r - r0) * cs + 1}" width="{cs - 2}" height="{cs - 2}" rx="2" fill="{COLOR[cat]}"/>')
                drawn += 1
            out.append(f'<text x="{x + w / 2}" y="{top + hmax + 20}" text-anchor="middle" {font} font-size="14" font-weight="700" fill="#5B6670">{f}F</text>')
            x += w + 8
        x += 32
    lx, ly = 20, top + hmax + 56
    for t, k in LEGEND + [("빈칸 = 통로", None)]:
        fill = COLOR[k] if k else "#fff"
        out.append(f'<rect x="{lx}" y="{ly - 13}" width="16" height="16" rx="3" fill="{fill}" stroke="#C3CAD2"/>'
                   f'<text x="{lx + 22}" y="{ly}" {font} font-size="15" font-weight="700" fill="#191919">{t}</text>')
        lx += 30 + 16 * len(t)
    W, H = x - 32 + 12, ly + 14
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
           f'<rect width="{W}" height="{H}" fill="#ffffff"/>' + "".join(out) + "</svg>\n")
    path.write_text(svg, encoding="utf-8")
    assert drawn == len(bld["cells"]), (drawn, len(bld["cells"]))  # 칸을 하나도 빠뜨리지 않음
    return drawn


def main():
    routes = json.loads((ROOT / "routes.json").read_text(encoding="utf-8"))
    bld = json.loads((ROOT / "building.json").read_text(encoding="utf-8"))
    cells = {f"{b}:{f}:{c}:{r}": dict(b=b, f=f, cat=cat, name=name) for b, f, c, r, cat, name, _ in bld["cells"]}

    print(f"자료 기준일 {routes['asof']} · {routes['made_by']}\n")
    df = table(routes["places"], cells, "all")
    report(df, "계단·엘리베이터 모두")
    report(table(routes["places"], cells, "lift"), "엘리베이터만")

    df.to_csv(ROOT / "recommendations.csv", index=False, encoding="utf-8-sig")  # 엑셀에서 한글이 안 깨지게
    print("CSV 저장: recommendations.csv")
    n = draw_dataset(bld, ROOT / "dataset.svg")
    print(f"그림 저장: dataset.svg (칸 {n}개)")


if __name__ == "__main__":
    main()
