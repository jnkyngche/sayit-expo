// 화면마다 새 WebView가 뜨는 구조라, 로딩 중에 보이는 건 "지금 무엇을 여는 중인지"에 대한
// 유일한 단서다. sayIt-web의 라우트(src/app/**)와 1:1로 맞춰 문구를 붙인다.
//
// 라우트가 늘어나면 여기도 같이 늘리되, 못 찾으면 기본 문구로 떨어지므로 빠뜨려도 화면이
// 깨지지는 않는다.
export type ScreenCopy = {
  loadingLabel: string;
  // "네트워크가 느려요" 안내를 띄우기까지의 시간. 원래 오래 걸리는 화면에서 정상 대기를
  // 느린 것으로 오해하게 만들면 안 된다.
  slowAfterMs: number;
};

const DEFAULT_SLOW_MS = 6000;

const SCREENS: { match: RegExp; copy: ScreenCopy }[] = [
  { match: /^\/input\/?$/, copy: { loadingLabel: '말할 거리 생각하는 중…', slowAfterMs: DEFAULT_SLOW_MS } },
  // 저장된 문장이 아니라 방금 입력한 문장 — 서버가 TTS를 만들어서 내려주므로(글자 수에
  // 비례해 최대 5초대) 다른 화면과 같은 기준으로 재면 매번 느리다고 말하게 된다.
  { match: /^\/sentence\/direct\/?$/, copy: { loadingLabel: '발음 만드는 중…', slowAfterMs: 12000 } },
  { match: /^\/sentence\//, copy: { loadingLabel: '문장 펼치는 중…', slowAfterMs: DEFAULT_SLOW_MS } },
  { match: /^\/scan\/results\/?$/, copy: { loadingLabel: '찍은 문장 읽는 중…', slowAfterMs: DEFAULT_SLOW_MS } },
  { match: /^\/storage\/[^/]+/, copy: { loadingLabel: '폴더 여는 중…', slowAfterMs: DEFAULT_SLOW_MS } },
  { match: /^\/storage\/?$/, copy: { loadingLabel: '보관함 살펴보는 중…', slowAfterMs: DEFAULT_SLOW_MS } },
  { match: /^\/$/, copy: { loadingLabel: '오늘의 한마디 꺼내는 중…', slowAfterMs: DEFAULT_SLOW_MS } },
];

const FALLBACK: ScreenCopy = { loadingLabel: '화면 불러오는 중…', slowAfterMs: DEFAULT_SLOW_MS };

export function screenCopy(url: string): ScreenCopy {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return FALLBACK;
  }
  return SCREENS.find(({ match }) => match.test(pathname))?.copy ?? FALLBACK;
}
