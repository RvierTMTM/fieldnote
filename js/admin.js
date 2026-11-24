/* admin.js — 관리자 기능(v0.30): 켠 폰에서만 더보기에 "실사정보 배포"가 보인다.
   공개: isAdmin(), unlockAdmin(pass) → Promise<boolean>, lockAdmin()
   · 서버가 없는 앱이라 진짜 잠금은 아니다. 실사자가 실수로 켜는 것을 막는 용도.
     켜도 할 수 있는 것은 "자기 폰에 있는 실사로 링크·QR 만들기"뿐이다.
   · 코드에는 암호 대신 SHA-256 값만 둔다. 켠 상태는 화면 설정(fn.settings)의 admin 에 남는다. */
import { getSettings, setSetting } from './settings.js';

const ADMIN_SHA256 = '96325e232e5f4113e61ffd84f976a06a43bd02221ec53abb6f2f36f06e802139';

export const isAdmin = () => !!getSettings().admin;

export async function unlockAdmin(pass) {
  const text = String(pass || '').trim();
  if (!text || !(crypto && crypto.subtle)) return false;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const hex = Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  if (hex !== ADMIN_SHA256) return false;
  setSetting('admin', true);
  return true;
}

export function lockAdmin() { setSetting('admin', false); }
