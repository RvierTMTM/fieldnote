/* screens/settings.js — 화면 설정(더보기 → 화면 설정)   라우트: #/settings
   공개: render(ctx)
   · 글자 크기 3단계(보통/크게/아주 크게) — 누르는 즉시 적용·저장
   · 바탕 자동(폰 설정 따름)/밝은/검은
   · 실사자 이름(입력 기록에 남는 이름)
   · 관리자 기능 켜기/끄기(v0.30, 암호 — js/admin.js) */
import { h, promptText, toast } from '../ui.js';
import { isAdmin, unlockAdmin, lockAdmin } from '../admin.js';
import { getSettings, setSetting } from '../settings.js';

const SIZES = [[1, '보통'], [2, '크게'], [3, '아주 크게']];
const THEMES = [['auto', '자동(폰 설정 따름)'], ['light', '밝은 바탕'], ['dark', '검은 바탕']];

export async function render(ctx) {
  const s = getSettings();
  const seg = (key, list) => h('div', { class: 'seg' }, list.map(([v, label]) => h('button', {
    type: 'button', class: s[key] === v ? 'on' : '', 'aria-pressed': String(s[key] === v),
    onclick: () => { setSetting(key, v); ctx.refresh(); },
  }, label)));

  const name = h('input', { class: 'inp', type: 'text', placeholder: '이름', autocomplete: 'off' });
  name.value = s.surveyor || '';
  name.addEventListener('change', () => setSetting('surveyor', name.value.trim()));
  name.addEventListener('input', () => setSetting('surveyor', name.value.trim()));

  const body = [
    h('p', { class: 'sec' }, '글자 크기'),
    h('div', { class: 'row' }, seg('fontSize', SIZES)),
    h('p', { class: 'hint' }, '누르면 바로 바뀝니다. 가나다 ABC 123'),
    h('p', { class: 'sec' }, '바탕'),
    h('div', { class: 'row' }, seg('theme', THEMES)),
    h('p', { class: 'sec' }, '실사자 이름'),
    h('label', { class: 'row' }, h('span', { class: 'l' }, '이름'), name),
    h('p', { class: 'hint' }, '입력한 값마다 이 이름이 함께 기록됩니다.'),
    h('p', { class: 'sec' }, '관리자 기능'),
    isAdmin()
      ? [h('p', { class: 'hint' }, '켜져 있습니다. 실사 선택 화면 더보기에 "실사정보 배포"가 보입니다.'),
         h('button', { type: 'button', class: 'btn sub', onclick: () => { lockAdmin(); toast('관리자 기능을 껐습니다.'); ctx.refresh(); } }, '관리자 기능 끄기')]
      : [h('p', { class: 'hint' }, '실사정보를 배포하는 사람만 켭니다. 암호가 필요합니다.'),
         h('button', { type: 'button', class: 'btn sub', onclick: async () => {
           const pass = await promptText({ title: '관리자 기능 켜기', label: '관리자 암호를 넣어 주세요.', placeholder: '암호', ok: '켜기' });
           if (pass == null || pass === '') return;
           if (await unlockAdmin(pass)) { toast('관리자 기능을 켰습니다.'); ctx.refresh(); }
           else toast('암호가 맞지 않습니다.');
         } }, '관리자 기능 켜기')],
  ];

  return {
    title: '화면 설정', sub: '',
    menu: null,
    crumbs: [{ label: '‹ 돌아가기', back: true }, { label: '화면 설정' }],
    body,
  };
}
