import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { fetchSpeechBase64, type SpeakParams } from './tts-api';

export const TTS_DIR = new Directory(Paths.document, 'tts');

// TODO: iOS 백업 제외 플래그. 로컬 Swift 모듈(modules/backup-flag)이 필요하며
// dev client 빌드로 전환한 뒤 여기서 excludeFromBackup(TTS_DIR.uri)를 호출한다.
export function bootstrapAudioStore() {
  if (!TTS_DIR.exists) TTS_DIR.create({ intermediates: true });
}

export async function audioKey({ text, voice, speed }: SpeakParams): Promise<string> {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${text}|${voice}|${speed}`
  );
  return hash.slice(0, 16);
}

export const audioFile = (key: string) => new File(TTS_DIR, `${key}.mp3`);

/**
 * 있으면 그대로, 없으면 TTS를 다시 받아서 돌려준다. 호출부는 어느 쪽인지 몰라도 된다.
 * params는 파일이 없을 때만 쓰인다 — 이 호출 자체가 kokoro-tts 과금이 발생하는 지점이다.
 */
export async function ensureAudio(key: string, params: SpeakParams): Promise<File> {
  const file = audioFile(key);

  // size 0 = 이전 다운로드가 중간에 끊긴 흔적. exists만 보면 빈 파일을 재생한다.
  if (file.exists && file.size > 0) return file;
  if (file.exists) file.delete();

  const base64 = await fetchSpeechBase64(params);
  file.create();
  file.write(base64, { encoding: 'base64' });
  return file;
}
