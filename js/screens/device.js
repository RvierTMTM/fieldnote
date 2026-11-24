/* screens/device.js — 장비 화면   라우트: #/p/:pid/dv/:id
   공개: render(ctx)
   들어 있는 것: 종류와 빠른 값 / 위치(U·선반·랙 바닥)·높이 / 사진 / 공통 칸(접어 둠) / 연결(업링크) /
                FDF 선번장 줄(반복, 데이터 키 fdfLines) / UTP 선번장 줄(패치판넬, 데이터 키 utpLines) / 연결 단말 대수 / 메모 / 이 장비 삭제(trash.requestDelete)
   위 제목을 누르거나 더보기 → 이름 바꾸기 = Hostname 고치기(js/node-edit.js). 더보기 → 다른 곳으로 옮기기 = 다른 설치 지점으로. */
import { h } from '../ui.js';
import { val, deviceLabel, nameOf } from '../store.js';
import { renderForm } from '../form.js';
import { requestDelete } from '../trash.js';
import {
  DEVICE_KINDS, SWITCH_LAYERS, SWITCH_PORTS, SWITCH_PORTS_L2, CHASSIS, FDF_CORES, PATCH_PORTS, SERVER_U, UPS_U, DEFAULT_U,
  CARRIERS, NET_ZONES, DEVICE_STATES, MEDIA, FIBER_TYPES, CONNECTORS, VIA_CONVERTER, CONFIG_GOT, TERMINALS, DEVICE_POS,
  RACK_FORMS, YES_NO,
} from '../options.js';
import { load, hrefOf, crumbsOf, placeChoices, deviceChoices, savedTop } from './common.js';

function kindItems(dev) {
  const kind = val(dev, 'kind');
  if (kind === '스위치') {
    const l2 = val(dev, 'layer') === 'L2';
    return [
      { t: 'one', k: 'layer', label: '계층', opts: SWITCH_LAYERS, none: false, unknown: false, rerender: true },
      { t: 'one', k: 'ports', label: '포트', opts: l2 ? SWITCH_PORTS_L2 : SWITCH_PORTS, custom: true, none: false, rerender: true },
      val(dev, 'ports') === CHASSIS ? { t: 'num', k: 'slots', label: '슬롯 수', unit: '개' } : null,
      val(dev, 'ports') === CHASSIS ? { t: 'text', k: 'modules', label: '모듈', ph: '꽂힌 모듈 (아는 만큼)' } : null,
    ];
  }
  if (kind === 'FDF') return [{ t: 'num', k: 'cores', label: '코어 수', unit: '코어', quick: FDF_CORES }];
  if (kind === '패치판넬') return [{ t: 'one', k: 'ports', label: '포트', opts: PATCH_PORTS, custom: true, none: false }];
  if (kind === '통신사장비') {
    return [
      { t: 'one', k: 'carrier', label: '통신사', opts: CARRIERS, none: false },
      { t: 'text', k: 'carrierKind', label: '장비 종류', ph: '예: 모뎀, 전송 장비' },
      { t: 'text', k: 'lineUse', label: '회선 용도' },
      { t: 'text', k: 'lineNo', label: '회선 번호' },
    ];
  }
  return [];
}

function heightQuick(kind) {
  if (kind === '서버') return SERVER_U;
  if (kind === 'UPS') return UPS_U;
  return DEFAULT_U;
}

export async function render(ctx) {
  const { project, node: dev, chain } = await load(ctx.params.pid, ctx.params.id, 'device');
  const point = chain[chain.length - 1];
  const inRack = point && RACK_FORMS.includes(val(point, 'form'));
  const kind = val(dev, 'kind');
  const pos = val(dev, 'pos') || 'U 위치';

  const form = renderForm(dev, [
    { t: 'fold', label: '종류: ' + (kind || '고르기'), open: !kind, items: [
      { t: 'one', k: 'kind', opts: DEVICE_KINDS, none: false, rerender: true },
    ] },
    ...kindItems(dev),
    inRack ? { t: 'one', k: 'pos', label: '놓인 자리', opts: DEVICE_POS, none: false, unknown: false, rerender: true } : null,
    inRack && pos === 'U 위치' ? { t: 'num', k: 'u', label: 'U 위치 (맨 아래 칸 번호)', unit: 'U', unknown: false } : null,
    { t: 'num', k: 'h', label: '높이', unit: 'U', quick: heightQuick(kind), unknown: false },

    { t: 'photo', slot: 'closeup', label: '근접 사진' },
    { t: 'photo', slot: 'asset', label: '자산 스티커' },
    { t: 'photo', slot: 'ipscreen', label: '단말 IP 화면' },

    {
      t: 'fold', label: '공통 칸 (모델명 · Hostname · IP · VLAN 등, 아는 만큼)', items: [
        { t: 'text', k: 'model', label: '모델명' },
        { t: 'text', k: 'hostname', label: 'Hostname' },
        { t: 'text', k: 'mgmtIp', label: '관리 IP', inputmode: 'url' },
        { t: 'text', k: 'vlan', label: 'VLAN', ph: '예: 10, 11' },
        { t: 'one', k: 'zone', label: '망 구분', opts: NET_ZONES, custom: true },
        { t: 'one', k: 'state', label: '상태', opts: DEVICE_STATES, none: false },
        { t: 'text', k: 'ownerCo', label: '소유 법인' },
        { t: 'text', k: 'role', label: '역할 메모' },
        { t: 'num', k: 'usedPorts', label: '사용 포트 수', unit: '개', none: true },
        { t: 'seg', k: 'poe', label: 'PoE', opts: YES_NO, none: false },
        { t: 'seg', k: 'redundant', label: '이중화', opts: YES_NO, none: false },
        { t: 'seg', k: 'configGot', label: 'config', opts: CONFIG_GOT, none: false },
      ],
    },

    { t: 'sec', label: '연결' },
    {
      t: 'pick', k: 'uplink', label: '업링크 상대', customSub: '목록에 없거나 사업장 밖일 때',
      choices: () => deviceChoices(project.id, dev.id),
    },
    { t: 'one', k: 'media', label: '매체', opts: MEDIA },
    { t: 'num', k: 'linkCores', label: '코어 수', unit: '코어', none: true },
    { t: 'seg', k: 'viaConv', label: '컨버터', opts: VIA_CONVERTER, none: false },

    kind === 'FDF' ? {
      t: 'rows', k: 'fdfLines', label: 'FDF 선번장', rowTitle: '선번', addLabel: '+ 선번 추가', cols: [
        { t: 'pick', k: 'dest', label: '행선지', customSub: '목록에 없거나 사업장 밖일 때', choices: () => placeChoices(project.id) },
        { t: 'text', k: 'range', label: '코어 구간', ph: '예: 1~12' },
        { t: 'num', k: 'used', label: '사용 코어', unit: '코어', none: true },
        { t: 'one', k: 'fiber', label: '광 종류', opts: FIBER_TYPES, none: false },
        { t: 'one', k: 'conn', label: '커넥터', opts: CONNECTORS, none: false },
        { t: 'text', k: 'labelText', label: '라벨 원문', ph: '라벨에 적힌 그대로' },
        { t: 'flag', k: 'unused', label: '미사용' },
        { t: 'photo', slot: 'photo', label: '사진' },
      ],
    } : null,

    kind === '패치판넬' ? {
      t: 'rows', k: 'utpLines', label: 'UTP 선번장', rowTitle: '선번', addLabel: '+ 선번 추가', cols: [
        { t: 'text', k: 'range', label: '포트 구간', ph: '예: 1-24' },
        { t: 'pick', k: 'dest', label: '연결처', customSub: '목록에 없거나 사업장 밖일 때', choices: () => placeChoices(project.id) },
        { t: 'text', k: 'labelText', label: '라벨 원문', ph: '라벨에 적힌 그대로' },
        { t: 'flag', k: 'unused', label: '미사용' },
        { t: 'memo', k: 'memo', label: '메모', ph: '한 줄 메모 (안 써도 됨)' },
      ],
    } : null,

    {
      t: 'fold', label: '연결 단말 (대수)', items: TERMINALS.map(([k, label]) => ({ t: 'num', k, label, unit: '대', none: true })),
    },
    { t: 'memo', k: 'memo', label: '메모', ph: '특이사항 한 줄 (안 써도 됨)' },
  ], ctx);

  const scope = { project, node: dev, parentHref: point ? hrefOf(point) : null };
  const del = h('button', {
    type: 'button', class: 'btn sub', style: 'margin-top:2rem',
    onclick: async () => { if (await requestDelete(scope)) ctx.go(scope.parentHref, { replace: true }); },
  }, '이 장비 삭제');

  const where = [];
  if (point) where.push(nameOf(point));
  if (inRack && pos === 'U 위치' && typeof val(dev, 'u') === 'number') where.push(val(dev, 'u') + 'U');
  else if (inRack && pos !== 'U 위치') where.push(pos);

  return {
    title: deviceLabel(dev), sub: where.join(' · '),
    menu: 'home', projectId: project.id, scope,
    crumbs: crumbsOf(project, chain, dev),
    body: [savedTop(), form, del],
  };
}
