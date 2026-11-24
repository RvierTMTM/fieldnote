/* screens/place.js — 장소 화면   라우트: #/p/:pid/pl/:id
   공개: render(ctx)
   들어 있는 것: 장소 정보(종류·위치) / 전경 등 사진 칸 / 설치 지점 목록 / NW공사 / 자유 추가 /
                환경 / 문제·환경 표시 / VLAN 표 / 메모 / 완료 표시
   완료 표시가 바뀌면 js/notice.js 의 afterDoneChange(projectId) 를 부른다(SA-B: 완료 알림).
   설치 지점 카드: 배지(미작성 항목이 있으면 "! 미작성 항목 N" / 완료를 눌렀으면 "완료" / "완료 전", 빈 항목이면 배지 없음) + 오른쪽 [옮기기] [삭제].
   머리말 부제: 동·층 중 장소 이름에 이미 들어 있는 것은 뺀다(store.locParts). NW공사 카드 "입력 N"은 숨긴 항목(기존 트레이 없음의 폭·여유)을 세지 않는다. */
import { h, sheet, promptText } from '../ui.js';
import { children, addNode, setField, nameOf, val, photoKeys, photoCounter, missingItems, projectNodes, isBlankNode, usable, locParts, condHiddenKeys } from '../store.js';
import { renderForm } from '../form.js';
import { afterDoneChange } from '../notice.js';
import { PLACE_KINDS, PROBLEM_TAGS, ENV_TAGS, YES_NO, PLACE_ENV_ITEMS, POINT_FORMS, EXTRA_TAGS } from '../options.js';
import { P, load, hrefOf, crumbsOf, card, addButton, blankCard, doneBadge, savedTop, nodeDel } from './common.js';

async function addPointFlow(place, points, ctx) {
  const form = await sheet({ title: '어떻게 설치되어 있나요?', items: POINT_FORMS.map((f) => ({ label: f, value: f })) });
  if (form === undefined) return;
  const racks = points.filter((p) => val(p, 'form') === '랙').length;
  const suggest = form === '랙' ? 'R-' + String(racks + 1).padStart(2, '0') : form;
  const name = await promptText({ title: '이름', label: form === '랙' ? '랙 번호나 이름을 넣어 주세요. 문패·라벨에 적힌 대로 쓰면 좋습니다.' : '설치 지점 이름을 넣어 주세요.', value: suggest, ok: '추가' });
  if (!name) return;
  const point = await addNode(place, 'point', { name, form });
  ctx.go(hrefOf(point));
}

async function addExtraFlow(place, ctx) {
  let tag = await sheet({
    title: '무엇을 찍나요? (꼬리표)',
    items: EXTRA_TAGS.map((t) => ({ label: t, value: t })).concat({ label: '+ 직접 입력', value: '\u0000custom' }),
  });
  if (tag === undefined) return;
  if (tag === '\u0000custom') {
    tag = await promptText({ title: '꼬리표', placeholder: '직접 입력' });
    if (!tag) return;
  }
  const extra = await addNode(place, 'extra', { tag });
  ctx.go(hrefOf(extra));
}

export async function render(ctx) {
  const { project, node: place, chain } = await load(ctx.params.pid, ctx.params.id, 'place');
  const [points, extras, keys, nodes] = await Promise.all([
    children(place.id, 'point'), children(place.id, 'extra'), photoKeys(project.id), projectNodes(project.id),
  ]);
  const count = photoCounter(keys);
  const miss = await missingItems(project.id, { nodes, keys });
  const done = val(place, 'done') === true;

  const pointCards = points.map((p) => {
    if (isBlankNode(p, nodes, keys)) return blankCard({ href: hrefOf(p), title: nameOf(p), node: p, ctx });
    const form = val(p, 'form') || '';
    const devices = nodes.filter((n) => n.type === 'device' && n.parentId === p.id).length;
    const lacks = miss.filter((m) => m.node.id === p.id).map((m) => m.text);
    const bits = [form];
    if (usable(val(p, 'system'))) bits.push(usable(val(p, 'system')) + '계통');   // "확인 못 함"이면 이 조각을 뺀다
    bits.push('장비 ' + devices, '사진 ' + count(p.path));
    const right = doneBadge(lacks.length ? '미작성 항목 ' + lacks.length : null, val(p, 'done') === true);
    return card({ href: hrefOf(p), title: nameOf(p), sub: bits.filter(Boolean).join(' · '), right, del: nodeDel(p, nameOf(p), ctx) });
  });

  const hiddenCond = condHiddenKeys(place);
  const condCount = Object.keys(place.data).filter((k) => k.startsWith('cond_') && !hiddenCond.includes(k) && place.data[k].v != null).length;
  const condPhotos = keys.filter((k) => k.ownerPath === place.path && k.slot === 'cond').length;

  const extraCards = extras.map((e) => card({
    href: hrefOf(e),
    title: nameOf(e),
    sub: ['사진 ' + count(e.path), val(e, 'memo')].filter(Boolean).join(' · '),
  }));

  const top = renderForm(place, [
    {
      t: 'fold', label: '장소 정보 (종류 · 위치)', open: !val(place, 'kind'), items: [
        { t: 'text', k: 'name', label: '장소 이름', rerender: true },
        { t: 'one', k: 'kind', label: '종류', opts: PLACE_KINDS, custom: true, none: false, unknown: false },
        { t: 'text', k: 'bldg', label: '동', ph: '예: A동' },
        { t: 'text', k: 'floor', label: '층', ph: '예: 2층' },
        { t: 'text', k: 'room', label: '실 이름', ph: '문패에 적힌 이름' },
        { t: 'text', k: 'where', label: '위치 설명', ph: '예: 동쪽 끝, 계단 옆' },
      ],
    },
    { t: 'photo', slot: 'overview', label: '전경 (출입구에서 본 전체, 반대편, 필요하면 천장·바닥)' },
    { t: 'photo', slot: 'nameplate', label: '문패·명판' },
    { t: 'photo', slot: 'handnote', label: '손글씨 대응표' },
  ], ctx);

  const bottom = renderForm(place, [
    {
      t: 'fold', label: '환경', items: PLACE_ENV_ITEMS.map(([k, label]) => ({ t: 'seg', k, label, opts: YES_NO, none: false })),
    },
    { t: 'sec', label: '문제 표시' },
    { t: 'multi', k: 'problems', opts: PROBLEM_TAGS, custom: true },
    { t: 'sec', label: '환경 표시' },
    { t: 'multi', k: 'envTags', opts: ENV_TAGS, custom: true },
    {
      t: 'fold', label: 'VLAN 표', items: [
        {
          t: 'rows', k: 'vlans', rowTitle: 'VLAN', addLabel: '+ VLAN 줄 추가', cols: [
            { t: 'text', k: 'no', label: 'VLAN 번호', inputmode: 'numeric' },
            { t: 'text', k: 'name', label: '이름' },
            { t: 'text', k: 'cidr', label: 'IP 대역', ph: '예: 10.0.0.0/24', inputmode: 'url' },
            { t: 'text', k: 'gw', label: '게이트웨이', inputmode: 'url' },
          ],
        },
      ],
    },
    { t: 'memo', k: 'memo', label: '메모', ph: '출입 조건·특이사항 (안 써도 됨)' },
  ], ctx);

  const doneBtn = h('button', {
    type: 'button', class: 'btn ' + (done ? 'done-on' : 'pri'), 'aria-pressed': String(done),
    onclick: async () => {
      await setField(place.id, 'done', done ? null : true);
      await ctx.refresh();
      afterDoneChange(project.id).catch((e) => console.error(e));
    },
  }, done ? '✓ 완료로 표시함 (누르면 풀림)' : '이 장소 완료');

  const body = [
    savedTop(),
    top,
    h('p', { class: 'sec' }, '설치 지점 (랙 · 함체 · 벽부 등)'),
    pointCards,
    addButton('+ 설치 지점 추가', () => addPointFlow(place, points, ctx)),
    h('p', { class: 'sec' }, 'NW공사'),
    card({
      href: P(project.id) + '/cd/' + place.id,
      title: 'NW공사',
      sub: '천장 · 트레이 · 전원 · 작업 조건 · 입력 ' + condCount + ' · 사진 ' + condPhotos,
      right: h('span', { class: 'go' }, '입력'),
    }),
    h('p', { class: 'sec' }, '자유 추가'),
    extraCards,
    addButton('+ 자유 추가 (사진 + 꼬리표 + 메모)', () => addExtraFlow(place, ctx)),
    bottom,
    doneBtn,
  ];

  const where = locParts(place).join(' · ');
  return {
    title: nameOf(place), sub: where || nameOf(chain[0]),
    menu: 'home', projectId: project.id,
    scope: { project, node: place, parentHref: chain[0] ? hrefOf(chain[0]) : P(project.id) },
    crumbs: crumbsOf(project, chain, place),
    body,
  };
}
