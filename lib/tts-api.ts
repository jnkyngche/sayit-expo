import { WEBVIEW_URL } from '../config';

export type SpeakParams = { text: string; voice: string; speed: number };

// sayIt-web의 /api/speak를 그대로 호출한다. API_KEY는 그 라우트가 서버 사이드에서만
// 들고 있고 네이티브에는 노출되지 않으므로, 반드시 이 경로(Next 배포 URL)를 거쳐야 한다.
// kokoro-tts를 직접 호출하면 안 된다.
export async function fetchSpeechBase64({ text, voice, speed }: SpeakParams): Promise<string> {
  const response = await fetch(new URL('api/speak', WEBVIEW_URL).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice, speed }),
  });

  if (!response.ok) {
    throw new Error(`speak request failed (${response.status})`);
  }

  const data = (await response.json()) as { audio: string };
  return data.audio;
}
