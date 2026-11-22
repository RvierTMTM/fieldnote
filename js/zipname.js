/* zipname.js — 내보내기 순서(뼈대)와 파일 이름 규칙 (저장소를 건드리지 않는 순수 함수. node 에서도 돈다)
   공개:
     cleanPart(text, max) → string           파일 이름 한 조각 정리(금지 문자 빼기, 띄어쓰기·밑줄 → '-')
     yymmdd(ms) → '261122'
     zipBaseName(projectName, surveyor, ms) → '실사명_실사자_261122'  (실사자가 없으면 '실사명_261122'. 실사명 = project.name)
     buildOutline(model) → outline            PPT 장표 순서와 같은 뼈대
     assignNames(outline) → Map(photoId → { dir, base, file, correctedFile, caption })
     SLOT_SHORT                               사진 칸 → 파일 이름에 쓰는 짧은 말
   이름 규칙(docs/ARCH.md 7절):
     사진/<현장>/<장소>_<종류>_<순번>                       장소에 달린 사진(전경·문패·손글씨·공사조건)
     사진/<현장>/<장소>_<설치 지점>_<종류>_<순번>           랙·함체 등 설치 지점 사진(랙이면 랙 이름)
     사진/<현장>/<장소>_<설치 지점>_<위치-장비>-<종류>_<순번>  장비 사진(예: 39U-스위치-근접)
     사진/<현장>/<장소>_<꼬리표>_<순번>                     자유 추가
     사진/<현장>/경로<번호>_<출발>-<도착>_<순번>            경로(지나는 순서)
     보정본은 같은 이름 + '_보정'. 순번은 같은 앞부분끼리 01부터(PPT 장표 순서와 같음). */
import { val, nameOf, pickLabel } from './store.js';
import { RACK_FORMS } from './options.js';

export const SLOT_SHORT = {
  overview: '전경', nameplate: '문패', handnote: '손글씨', cond: '공사조건',
  front: '전면', rear: '후면', closeup: '근접', label: '라벨', outer: '함체외관', inner: '함체내부',
  asset: '자산스티커', ipscreen: 'IP화면', photo: '사진', path: '경로',
};
const PLACE_SLOTS = ['overview', 'nameplate', 'handnote', 'cond'];
const POINT_SLOTS = ['front', 'rear', 'outer', 'inner', 'closeup', 'label'];
const DEVICE_SLOTS = ['closeup', 'asset', 'ipscreen'];
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

export function cleanPart(text, max = 40) {
  let t = String(text == null ? '' : text).normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  if (t.length > max) t = t.slice(0, max).replace(/[-.]+$/, '');
  if (RESERVED.test(t)) t += '-';
  return t;
}

export function yymmdd(ms) {
  const d = new Date(ms);
  const z = (n) => String(n).padStart(2, '0');
  return z(d.getFullYear() % 100) + z(d.getMonth() + 1) + z(d.getDate());
}

export function zipBaseName(projectName, surveyor, ms) {
  return [cleanPart(projectName, 60) || '현장실사', cleanPart(surveyor, 20), yymmdd(ms)].filter(Boolean).join('_');
}

function extOf(type) {
  const t = String(type || '').toLowerCase();
  if (!t || t === 'image/jpeg' || t === 'image/jpg') return '.jpg';
  const m = /^image\/([a-z0-9.+-]+)$/.exec(t);
  if (!m) return '.bin';
  return '.' + ({ 'svg+xml': 'svg', 'x-icon': 'ico' }[m[1]] || m[1]);
}

/** 장비가 랙에서 차지하는 자리 글자(이름·표에 같이 쓴다) */
export function devicePos(d, inRack) {
  if (!inRack) return '';
  const pos = val(d, 'pos') || 'U 위치';
  if (pos === '선반') return '선반';
  if (pos === '랙 바닥') return '바닥';
  const u = val(d, 'u');
  return typeof u === 'number' ? u + 'U' : '';
}

function deviceSort(inRack) {
  const rank = (d) => {
    if (!inRack) return [0, 0];
    const pos = val(d, 'pos') || 'U 위치';
    if (pos === '선반') return [1, 0];
    if (pos === '랙 바닥') return [2, 0];
    const u = val(d, 'u');
    return typeof u === 'number' ? [0, -u] : [3, 0];
  };
  return (a, b) => {
    const ra = rank(a); const rb = rank(b);
    return ra[0] - rb[0] || ra[1] - rb[1] || a.order - b.order;
  };
}

/** model(exportModel 결과) → 장표 순서의 뼈대
    { project, sites:[{ node, places:[{ node, slots, points:[{ node, isRack, slots, devices:[{ node, slots, fdf:[{ row, photos }] }] }],
      extras:[{ node, photos }] }], routes:[{ node, no, photos }] }], orphans:[photo] } */
export function buildOutline(model) {
  const nodes = model.nodes.slice().sort((a, b) => a.order - b.order);
  const kids = new Map();
  for (const n of nodes) {
    if (!kids.has(n.parentId)) kids.set(n.parentId, []);
    kids.get(n.parentId).push(n);
  }
  const of = (id, type) => (kids.get(id) || []).filter((n) => n.type === type);
  const bySlot = new Map();
  for (const p of model.photos) {
    const k = p.ownerPath + '|' + p.slot;
    if (!bySlot.has(k)) bySlot.set(k, []);
    bySlot.get(k).push(p);
  }
  for (const list of bySlot.values()) list.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  const used = new Set();
  const take = (path, slot) => {
    const list = bySlot.get(path + '|' + slot) || [];
    list.forEach((p) => used.add(p.id));
    return list;
  };
  const slotsOf = (node, names) => Object.fromEntries(names.map((s) => [s, take(node.path, s)]));

  let routeNo = 0;
  const sites = of(model.project.id, 'site').map((site) => ({
    node: site,
    places: of(site.id, 'place').map((place) => ({
      node: place,
      slots: slotsOf(place, PLACE_SLOTS),
      points: of(place.id, 'point').map((point) => {
        const isRack = RACK_FORMS.includes(val(point, 'form'));
        return {
          node: point,
          isRack,
          slots: slotsOf(point, POINT_SLOTS),
          devices: of(point.id, 'device').sort(deviceSort(isRack)).map((d) => {
            const rows = Array.isArray(val(d, 'fdfLines')) ? val(d, 'fdfLines') : [];
            return {
              node: d,
              slots: slotsOf(d, DEVICE_SLOTS),
              fdf: rows.map((row) => ({ row, photos: take(d.path, 'fdfLines:' + row.id + ':photo') })),
            };
          }),
        };
      }),
      extras: of(place.id, 'extra').map((e) => ({ node: e, photos: take(e.path, 'photo') })),
    })),
    routes: of(site.id, 'route').map((r) => ({ node: r, no: ++routeNo, photos: take(r.path, 'path') })),
  }));
  const orphans = model.photos.filter((p) => !used.has(p.id));
  return { project: model.project, model, sites, orphans };
}

function uniqueLabel(seen, label) {
  let out = label;
  let i = 2;
  while (seen.has(out)) out = label + '-' + i++;
  seen.add(out);
  return out;
}

export function deviceKindShort(d) {
  return cleanPart(val(d, 'kind') || '장비', 16);
}

/** 사진마다 zip 안 이름을 정한다. caption 은 PPT 사진 밑 글자(확장자 없는 이름). */
export function assignNames(outline) {
  const out = new Map();
  const counters = new Map();
  const siteSeen = new Set();
  const put = (dir, prefix, photo) => {
    const n = (counters.get(dir + '/' + prefix) || 0) + 1;
    counters.set(dir + '/' + prefix, n);
    const base = prefix + '_' + String(n).padStart(2, '0');
    const ext = extOf(photo.type);
    out.set(photo.id, {
      dir, base, caption: base,
      file: dir + '/' + base + ext,
      correctedFile: photo.hasCorrected ? dir + '/' + base + '_보정' + extOf(photo.correctedType || 'image/jpeg') : null,
    });
  };
  const ss = (slot) => SLOT_SHORT[slot] || cleanPart(slot, 12);

  for (const s of outline.sites) {
    const dir = '사진/' + uniqueLabel(siteSeen, cleanPart(nameOf(s.node), 30) || '현장');
    const placeSeen = new Set();
    for (const pl of s.places) {
      const P = uniqueLabel(placeSeen, cleanPart(nameOf(pl.node), 30) || '장소');
      for (const [slot, list] of Object.entries(pl.slots)) list.forEach((p) => put(dir, P + '_' + ss(slot), p));
      const pointSeen = new Set();
      for (const pt of pl.points) {
        const R = uniqueLabel(pointSeen, cleanPart(nameOf(pt.node), 24) || '설치지점');
        for (const [slot, list] of Object.entries(pt.slots)) list.forEach((p) => put(dir, P + '_' + R + '_' + ss(slot), p));
        const devSeen = new Set();
        for (const dv of pt.devices) {
          const pos = devicePos(dv.node, pt.isRack);
          const D = uniqueLabel(devSeen, (pos ? pos + '-' : '') + deviceKindShort(dv.node));
          for (const [slot, list] of Object.entries(dv.slots)) list.forEach((p) => put(dir, P + '_' + R + '_' + D + '-' + ss(slot), p));
          for (const f of dv.fdf) {
            const dest = cleanPart(pickLabel(f.row.dest), 16);
            f.photos.forEach((p) => put(dir, P + '_' + R + '_' + D + '-행선지' + (dest ? '-' + dest : ''), p));
          }
        }
      }
      for (const ex of pl.extras) {
        const tag = cleanPart(val(ex.node, 'tag'), 16) || '자유추가';
        ex.photos.forEach((p) => put(dir, P + '_' + tag, p));
      }
    }
    for (const r of s.routes) {
      const from = cleanPart(pickLabel(val(r.node, 'from')), 16) || '출발';
      const to = cleanPart(pickLabel(val(r.node, 'to')), 16) || '도착';
      r.photos.forEach((p) => put(dir, '경로' + String(r.no).padStart(2, '0') + '_' + from + '-' + to, p));
    }
  }
  for (const p of outline.orphans) put('사진/기타', '기타_' + ss(p.slot.split(':')[0]), p);
  return out;
}
