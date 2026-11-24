/* preview-status.js — 미리보기 A "입력 현황" (내보내기 화면 맨 위 묶음)
   공개: statusSection({ sum, miss }) → Node[]
     sum  = store.projectSummary(pid)    miss = store.missingItems(pid, sum)
   · 요약 한 줄: 장소 N · 완료 N · 사진 N장 · 미작성 항목 N건 (장소 + 설치 지점 + 경로 전부 세므로 단위는 "건" 하나. 홈 현장 카드 배지(home.js)와 같은 기준 — store.lackItems)
     "완료"는 아래 장소 카드 배지가 "완료"인 장소 수(미작성 항목이 없고 완료를 누른 것만. 완료를 눌렀어도 미작성 항목이 있으면 노란 배지라 세지 않는다)
   · 현장별 장소 카드: 이름·종류, 배지(미작성 항목이 있으면 노란 "! 미작성 항목 N" > 완료 > 완료 전), 사진·설치 지점·장비 수, NW공사 입력됨/없음
     (NW공사 입력 여부는 숨긴 항목 — 기존 트레이 "없음"일 때의 폭·여유 — 을 세지 않는다)
   · 미작성 항목 노란 줄: 누르면 그 노드 화면으로 이동(hrefOf). '완료 표시 전'은 배지로만 보여 주고 줄에서는 뺀다(home.js 와 같은 규칙).
   · 케이블 경로 카드: 출발 → 도착, 케이블 종류(store.cableText), 거리(store.distText: "약 12m" / "거리 확인 못 함" / 비면 생략), 사진 수, 완료/완료 전 */
import { h, nwText, fitText } from './ui.js';
import { val, nameOf, photoCounter, cableText, distText, condHiddenKeys, lackItems } from './store.js';
import { hrefOf, badge } from './screens/common.js';

const filled = (v) => v != null && v !== '' && !(Array.isArray(v) && !v.length);

function condFilled(place, keys) {
  if (keys.some((k) => k.ownerPath === place.path && k.slot === 'cond')) return true;
  const hidden = condHiddenKeys(place);
  return Object.entries(place.data || {}).some(([k, f]) => k.startsWith('cond_') && !hidden.includes(k) && f && filled(f.v));
}

function lackLine(m, text) {
  return h('a', { class: 'pv-lk', href: hrefOf(m.node) }, h('span', null, '! ' + text), h('b', { class: 'ar', 'aria-hidden': 'true' }, '›'));
}

const doneBadge = (node) => (val(node, 'done') === true ? badge('ok', '완료') : badge('plain', '완료 전'));

export function statusSection({ sum, miss }) {
  const count = photoCounter(sum.keys);
  const nodes = sum.nodes.slice().sort((a, b) => a.order - b.order);
  const sites = nodes.filter((n) => n.type === 'site');
  const places = nodes.filter((n) => n.type === 'place');
  const lacks = lackItems(miss);

  // 노란 줄을 붙일 곳: 경로는 그 경로 카드, 나머지는 그 아래에 있는 장소 카드
  const held = new Map();
  const rest = [];
  const hold = (id, m) => { if (!held.has(id)) held.set(id, []); held.get(id).push(m); };
  for (const m of lacks) {
    if (m.node.type === 'route') { hold(m.node.id, m); continue; }
    const pl = places.find((p) => p.id === m.placeId) || places.find((p) => m.node.path === p.path || m.node.path.startsWith(p.path + '/'));
    if (pl) hold(pl.id, m); else rest.push(m);
  }
  const placeLine = (m) => lackLine(m, m.node.type === 'place' ? m.text : nameOf(m.node) + ' ' + m.text);

  // 완료 = 장소 카드 배지가 "완료"인 장소: 미작성 항목(그 장소 + 아래 설치 지점)이 없고 완료를 누른 것만(배지 우선순위 미작성 항목 > 완료 > 완료 전)
  const done = places.filter((p) => val(p, 'done') === true && !(held.get(p.id) || []).length).length;
  const out = [
    h('p', { class: 'sec' }, '입력 현황'),
    h('div', { class: 'pv-total' },
      h('span', null, '장소 ' + places.length), h('span', { class: 'dot' }, '·'),
      h('span', null, '완료 ' + done), h('span', { class: 'dot' }, '·'),
      h('span', null, '사진 ' + sum.photos + '장'), h('span', { class: 'dot' }, '·'),
      h('span', { class: lacks.length ? 'lack' : null }, '미작성 항목 ' + lacks.length + '건')),
  ];

  for (const s of sites) {
    const list = places.filter((p) => p.parentId === s.id);
    out.push(h('p', { class: 'sec' }, nameOf(s)));
    if (!list.length) { out.push(h('p', { class: 'hint' }, '장소가 없습니다.')); continue; }
    for (const p of list) {
      const points = nodes.filter((n) => n.type === 'point' && n.parentId === p.id).length;
      const devices = nodes.filter((n) => n.type === 'device' && n.path.startsWith(p.path + '/')).length;
      const kind = val(p, 'kind');
      out.push(h('div', { class: 'pv-pc' },
        h('div', { class: 'pv-pc-h' },
          h('div', { class: 'tt' }, fitText(h('b', null, nwText(nameOf(p)))), filled(kind) && kind !== nameOf(p) ? h('i', null, String(kind)) : null),
          (held.get(p.id) || []).length ? badge('no', '! 미작성 항목 ' + held.get(p.id).length) : doneBadge(p)),
        h('div', { class: 'pv-meta' },
          nwText('사진 ' + count(p.path) + ' · 설치 지점 ' + points + ' · 장비 ' + devices + ' · NW공사 '),
          condFilled(p, sum.keys) ? h('em', null, '입력됨') : h('em', { class: 'none' }, '없음')),
        (held.get(p.id) || []).map(placeLine)));
    }
  }

  const routes = sites.flatMap((s) => nodes.filter((n) => n.type === 'route' && n.parentId === s.id));
  if (routes.length) {
    out.push(h('p', { class: 'sec' }, '케이블 경로'));
    for (const r of routes) {
      const bits = [];
      if (distText(val(r, 'dist'))) bits.push(distText(val(r, 'dist')));
      bits.push('사진 ' + count(r.path));
      const cable = cableText(r);
      out.push(h('div', { class: 'pv-pc' },
        h('div', { class: 'pv-pc-h pv-rt' },
          h('div', { class: 'tt' }, fitText(h('b', null, nameOf(r))), cable ? h('i', null, nwText(cable)) : null, h('i', null, nwText(bits.join(' · ')))),
          (held.get(r.id) || []).length ? badge('no', '! ' + held.get(r.id)[0].text) : doneBadge(r)),
        (held.get(r.id) || []).map((m) => lackLine(m, m.text))));
    }
  }

  if (rest.length) {
    out.push(h('p', { class: 'sec' }, '그 밖의 미작성 항목'));
    out.push(h('div', { class: 'pv-pc' }, rest.map((m) => lackLine(m, nameOf(m.node) + ' ' + m.text))));
  }
  return out;
}
