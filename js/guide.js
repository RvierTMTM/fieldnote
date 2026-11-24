/* guide.js — 첫 실행 안내 4장
   공개: showGuide() → Promise   (닫히면 끝. 처음 한 번은 app.js 가, 다시 보기는 더보기 → "사용 안내"가 부른다)
   장마다 "건너뛰기"가 있고, 닫으면 settings.guideSeen 이 true 가 된다.
   4장 "홈 화면에 추가하세요"는 이미 앱처럼(standalone) 열려 있거나 설치했으면 빼고 3장으로 끝낸다.
     크롬 설치 창이 있으면 [지금 홈 화면에 추가](install.askInstall), 없으면 그림·글로 "크롬 오른쪽 위 ⋮ → 홈 화면에 추가". */
import { h, openOverlay, closeOverlay, fill } from './ui.js';
import { setSetting } from './settings.js';
import { canShowInstall, hasInstallPrompt, askInstall } from './install.js';

const PAGES = [
  {
    title: '현장 → 장소를 고르세요',
    before: ['현장을 누르고, 지금 서 있는 장소를 누릅니다. 목록에 없으면 "+ 장소 추가".', '장소 사이 케이블 길은 "케이블 경로"에 기록합니다.'],
  },
  {
    title: '사진을 찍고, 정보도 넣으세요',
    before: ['사진만 찍고 끝내지 마세요.'],
    must: '! 현장에서 아는 만큼 꼭 입력\n· 장비 종류와 위치(U)\n· 모델명 · Hostname · IP · VLAN\n· 문제점과 NW공사',
    after: ['대부분 글자를 치지 않고 버튼을 눌러 고르면 됩니다. 모르면 "확인 못 함".'],
  },
  {
    title: '끝나면 저장 후 내보내기',
    before: ['입력은 자동 저장됩니다. 저장 버튼이 없습니다.'],
    must: '! 내보내기 전에는 기록이 이 폰에만 있습니다.\n실사가 끝나면 반드시 내보내세요.',
    after: ['실사 링크는 크롬(또는 홈 화면 앱)에서 여세요. 카톡 안에서 열면 기록이 따로 저장됩니다.'],
  },
];
const INSTALL_PAGE = {
  title: '홈 화면에 추가하세요',
  before: ['다음부터 아이콘으로 바로 열 수 있습니다.'],
  install: true,
};

/** 설치 창이 없을 때: 크롬 메뉴 그림 + 글 */
function howTo() {
  return [
    h('div', { class: 'gd-how', 'aria-hidden': 'true' },
      h('div', { class: 'gd-bar' }, h('span', { class: 'gd-url' }, '현장실사'), h('b', { class: 'gd-dots' }, '⋮')),
      h('div', { class: 'gd-menu' }, h('span', null, '새 탭'), h('span', null, '방문 기록'), h('span', { class: 'on' }, '홈 화면에 추가'))),
    h('p', { class: 'gd-step' }, '크롬 오른쪽 위 ⋮ → 홈 화면에 추가'),
  ];
}

function installPart() {
  if (!hasInstallPrompt()) return howTo();
  return h('button', { type: 'button', class: 'btn sub', 'data-install': '1', onclick: () => askInstall() }, '지금 홈 화면에 추가');
}

export function showGuide() {
  const pages = canShowInstall() ? PAGES.concat(INSTALL_PAGE) : PAGES;
  return new Promise((resolve) => {
    const box = h('div', { class: 'gd', role: 'dialog', 'aria-modal': 'true' });
    const draw = (i) => {
      const pg = pages[i];
      const last = i + 1 >= pages.length;
      fill(box,
        h('div', { style: 'text-align:right' },
          h('button', { type: 'button', class: 'more', onclick: () => closeOverlay() }, '건너뛰기')),
        h('span', { class: 'n' }, String(i + 1)),
        h('h3', null, pg.title),
        (pg.before || []).map((t) => h('p', null, t)),
        pg.must ? h('p', { class: 'must' }, pg.must) : null,
        (pg.after || []).map((t) => h('p', null, t)),
        pg.install ? installPart() : null,
        h('p', { class: 'dots', 'aria-label': (i + 1) + ' / ' + pages.length },
          pages.map((_, j) => (j === i ? h('b', null, '●') : '○'))),
        h('div', { class: 'sp' }),
        h('button', {
          type: 'button', class: 'btn pri',
          onclick: () => { if (!last) draw(i + 1); else closeOverlay(); },
        }, last ? '시작하기' : '다음'));
      box.scrollTop = 0;
    };
    draw(0);
    openOverlay(box, { kind: 'full', onClose: () => { setSetting('guideSeen', true); resolve(); } });
  });
}
