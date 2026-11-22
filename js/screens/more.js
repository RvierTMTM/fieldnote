/* screens/more.js — "더보기" 메뉴(모든 화면 오른쪽 위)
   공개: openMore(screen, ctx)     screen = 지금 화면 객체, ctx = { go }
   항목: 화면 설정 / 사용 안내 / 홈 화면에 추가(앱처럼 열려 있으면 숨김)
         + 사업 안에서는 js/trash.js 의 moreItems(scope) (입력 초기화·휴지통·삭제 — SA-B) */
import { sheet } from '../ui.js';
import { showGuide } from '../guide.js';
import { canShowInstall, askInstall } from '../install.js';
import { moreItems, runMoreItem } from '../trash.js';
import { APP_VERSION } from '../version.js';
import { openImport } from '../export.js';

export async function openMore(screen, ctx) {
  const scope = screen && screen.scope;
  const items = [
    { label: '화면 설정', sub: '글자 크기 · 바탕 · 실사자 이름', value: 'settings' },
    { label: '사용 안내', sub: '처음에 본 안내 다시 보기', value: 'guide' },
    { label: '자료복구', sub: '내보낸 zip 파일로 실사 기록 되살리기', value: 'restore' },
  ];
  if (canShowInstall()) items.push({ label: '홈 화면에 추가', sub: '아이콘으로 바로 열기', value: 'install' });
  if (scope && scope.project) items.push(...moreItems(scope));

  const pick = await sheet({ title: '더보기 · 앱 ' + APP_VERSION, items });
  if (pick === undefined) return;
  if (pick === 'settings') ctx.go('#/settings');
  else if (pick === 'guide') showGuide();
  else if (pick === 'install') askInstall();
  else if (pick === 'restore') openImport(ctx);
  else if (scope) await runMoreItem(pick, scope, ctx);
}
