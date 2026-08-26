import { ensureAudio } from './audio-store';
import { pushToWeb } from './bridge';
import { db } from './db';
import type { SpeakParams } from './tts-api';
import type { AudioState } from '../bridge/webMessages';

const MAX_CONCURRENT = 3;
const pending = new Map<string, SpeakParams>();
let running = 0;

/** "폴더에 저장" 시 호출한다. 같은 키를 중복 호출해도 한 번만 받는다. */
export function enqueue(key: string, params: SpeakParams) {
  if (pending.has(key)) return; // 같은 문장 연타 방어
  pending.set(key, params);
  pump();
}

async function pump() {
  while (running < MAX_CONCURRENT && pending.size > 0) {
    const [key, params] = pending.entries().next().value!;
    pending.delete(key);
    running++;

    setAudioState(key, 'downloading');
    try {
      await ensureAudio(key, params);
      setAudioState(key, 'ready');
    } catch {
      // 자동 재시도하지 않는다. 오프라인에서 반복 재시도는
      // 배터리와 TTS 과금을 동시에 태운다 — UI가 재시도 버튼을 준다.
      setAudioState(key, 'none');
    } finally {
      running--;
    }
  }
}

/** DB 상태를 바꾸고 웹에 push한다 — 목록의 아이콘이 실시간으로 바뀐다 */
function setAudioState(key: string, state: AudioState) {
  db.runSync('UPDATE saved_sentence SET audio_state = ? WHERE audio_key = ?', [state, key]);
  pushToWeb({ type: 'AUDIO_STATE', key, state });
}
