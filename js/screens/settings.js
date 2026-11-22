/* screens/settings.js — 화면 설정(더보기 → 화면 설정)   라우트: #/settings
   공개: render(ctx)
   · 글자 크기 3단계(보통/크게/아주 크게) — 누르는 즉시 적용·저장
   · 바탕 밝은/검은
   · 실사자 이름(입력 기록에 남는 이름) */
import { h } from '../ui.js';
import { getSettings, setSetting } from '../settings.js';

const SIZES = [[1, '보통'], [2, '크게'], [3, '아주 크게']];
const THEMES = [['light', '밝은 바탕'], ['dark', '검은 바탕']];

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
  ];

  return {
    title: '화면 설정', sub: '',
    menu: null,
    crumbs: [{ label: '‹ 돌아가기', back: true }, { label: '화면 설정' }],
    body,
  };
}
