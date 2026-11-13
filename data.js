/* =====================================================================
   [5 화면] data.js — 자료 읽기 ([1 자료와 형식]의 세 파일을 앱으로 가져옴)
   - building.json : 칸 자료. 한 줄 = [구역, 층, 열, 행, 종류, 이름, 안내도 기준 여부]
   - site.json     : 정류장, 출입구, 정류장→출입구 실외 길
   - routes.json   : make_routes.py 가 미리 계산한 경로 (목적지마다 출입구 3곳, 두 조건)
   ===================================================================== */
import { K } from "./grid.js";

export const cells = {}; // "구역:층:열:행" → { b, f, c, r, cat, name, sign }
export const site = { asof: "", stop: null, entrances: [] };
const placeOf = {}; // 칸 → 그 칸이 속한 목적지 (학습공간처럼 여러 칸인 곳도 목적지는 하나)

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} (${res.status})`);
  return res.json();
}

/** 세 자료 파일을 읽어 둠 (앱을 열 때 한 번) */
export async function loadData() {
  const [bld, st, rt] = await Promise.all([getJSON("building.json"), getJSON("site.json"), getJSON("routes.json")]);
  for (const [b, f, c, r, cat, name, sign] of bld.cells) {
    cells[K(b, f, c, r)] = { b, f, c, r, cat, name: name || "", sign: !!sign };
  }
  site.asof = bld.asof;
  site.stop = st.stop;
  site.entrances = st.entrances;
  for (const p of rt.places) for (const k of p.cells) placeOf[k] = p;
}

/**
 * 목적지까지의 경로들 (총 거리가 짧은 순, 맨 앞이 추천)
 * @param dest     목적지 칸 (여러 칸짜리 공간이면 그 가운데 아무 칸)
 * @param noStairs true면 엘리베이터만 쓰는 경로
 */
export function routesFor(dest, noStairs) {
  const p = placeOf[dest];
  if (!p) return [];
  return (noStairs ? p.lift : p.all).map((r) => ({
    ...r,
    E: site.entrances.find((E) => E.id === r.e), // 출입구 정보 (이름·설명·실외 길)
    path: r.path.split(" "), // "칸 칸 칸" → [칸, 칸, 칸]
  }));
}

/** 목적지와 한 공간인 칸들 (평면도에서 테두리를 그릴 때) */
export const spaceCells = (dest) => (placeOf[dest] ? placeOf[dest].cells : [dest]);

// ---- 칸 이름 ----
const CATNAME = { door: "출입구", elevator: "엘리베이터", stairs: "계단", hall: "통로", room: "목적지", other: "기타" };

/** 칸의 화면용 이름. 계단 이름이 'to 3층'처럼 연결 정보뿐이면 그냥 '계단' */
export function label(v) {
  if (!v) return "";
  const n = v.name || CATNAME[v.cat] || "";
  if (v.cat === "stairs" && /^(to|from)\b/i.test(n)) return "계단";
  return n;
}

/** 짧은 이름: 방 번호(6208) 또는 첫 단어(학습공간). 한 칸에 두 방이면 "6122·6123" */
export function short(v) {
  const n = label(v);
  const nums = n.match(/\d{4}[A-Z]?/g);
  if (n.includes("·") && nums && nums.length >= 2) return nums[0] + "·" + nums[1];
  const m = n.match(/^\d{3,4}[A-Z]?/);
  return m ? m[0] : n.split(/\s+/)[0];
}
