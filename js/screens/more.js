/* screens/more.js — "더보기" 메뉴(모든 화면 오른쪽 위)
   공개: openMore(screen, ctx)     screen = 지금 화면 객체, ctx = { go, refresh }
   항목: 화면 설정 / 사용 안내 / 자료복구 / 실사샘플 받기 / 홈 화면에 추가(앱처럼 열려 있으면 숨김)
         + 관리자 기능을 켠 폰의 실사 안에서는 맨 위에 "실사정보 배포"(js/screens/distribute.js)
         + 현장·장소·설치 지점·장비 화면에서는 js/node-edit.js 의 editItems(scope) (이름 바꾸기·다른 곳으로 옮기기)
         + 실사 안에서는 js/trash.js 의 moreItems(scope) (입력 초기화·휴지통·삭제 — SA-B)
         + 실사 밖(실사 목록 등)에서는 "휴지통"(#/trash, 삭제한 실사 되살리기) */
import { sheet } from '../ui.js';
import { showGuide } from '../guide.js';
import { canShowInstall, askInstall } from '../install.js';
import { moreItems, runMoreItem } from '../trash.js';
import { editItems, runEditItem } from '../node-edit.js';
import { APP_VERSION } from '../version.js';
import { openImport, openSamples } from '../export.js';
import { isAdmin } from '../admin.js';
import { P } from './common.js';

export async function openMore(screen, ctx) {
  const scope = screen && screen.scope;
  const items = [
    { label: '화면 설정', sub: '글자 크기 · 바탕 · 실사자 이름', value: 'settings' },
    { label: '사용 안내', sub: '처음에 본 안내 다시 보기', value: 'guide' },
    { label: '자료복구', sub: '내보낸 zip 파일로 실사 기록 되살리기', value: 'restore' },
    { label: '실사샘플 받기', sub: '예시 실사 zip을 드라이브에서 내려받기', value: 'samples' },
  ];
  if (scope && scope.project && isAdmin()) items.unshift({ label: '실사정보 배포', sub: '이 실사를 링크·QR로 실사자에게 보내기 (관리자)', value: 'distribute' });
  if (canShowInstall()) items.push({ label: '홈 화면에 추가', sub: '아이콘으로 바로 열기', value: 'install' });
  if (scope && scope.project) items.push(...editItems(scope), ...moreItems(scope));
  else items.push({ label: '휴지통', sub: '삭제한 실사 되살리기', value: 'trashAll' });

  const pick = await sheet({ title: '더보기 · 앱 ' + APP_VERSION, items });
  if (pick === undefined) return;
  if (pick === 'settings') ctx.go('#/settings');
  else if (pick === 'guide') showGuide();
  else if (pick === 'install') askInstall();
  else if (pick === 'restore') openImport(ctx);
  else if (pick === 'samples') await openSamples();
  else if (pick === 'distribute') ctx.go(P(scope.project.id) + '/distribute');
  else if (pick === 'trashAll') ctx.go('#/trash');
  else if (scope && String(pick).startsWith('edit:')) await runEditItem(pick, scope, ctx);
  else if (scope) await runMoreItem(pick, scope, ctx);
}
