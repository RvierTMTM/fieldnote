/* warp-worker.js — 보정 계산을 화면과 따로 돌리는 워커(모듈 워커). corrector.js 만 쓴다.
   받는 것:
     { id, type:'warp', src:{data,width,height}, Hinv:[9], outW, outH }   → 진행 { id, type:'progress', p } … 끝 { id, type:'done', data, width, height }
     { id, type:'detect', img:{data,width,height} }                       → { id, type:'done', result }
   오류는 { id, type:'error', message }. 시작하면 { type:'ready' } 를 한 번 보낸다(모듈 워커를 못 쓰는 폰 가려내기). */
import { warpRGBA } from './warp.js';
import { detectQuad } from './corner-detect.js';

self.onmessage = (e) => {
  const m = e.data || {};
  try {
    if (m.type === 'warp') {
      const out = { width: m.outW, height: m.outH, data: new Uint8ClampedArray(m.outW * m.outH * 4) };
      const step = Math.max(32, Math.ceil(m.outH / 25));
      for (let y = 0; y < m.outH; y += step) {
        warpRGBA(m.src, out, m.Hinv, y, Math.min(m.outH, y + step));
        self.postMessage({ id: m.id, type: 'progress', p: Math.min(1, (y + step) / m.outH) });
      }
      self.postMessage({ id: m.id, type: 'done', data: out.data, width: out.width, height: out.height }, [out.data.buffer]);
    } else if (m.type === 'detect') {
      self.postMessage({ id: m.id, type: 'done', result: detectQuad(m.img) });
    }
  } catch (err) {
    self.postMessage({ id: m.id, type: 'error', message: String((err && err.message) || err) });
  }
};
self.postMessage({ type: 'ready' });
