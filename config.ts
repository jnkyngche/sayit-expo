// 웹뷰가 여는 sayIt-web 배포 주소. 로컬은 .env.local, 빌드 서버는 EAS 환경 변수에서 온다.
//
// 이건 비밀이 아니다. EXPO_PUBLIC_ 변수는 빌드할 때 번들에 문자열로 박히므로 앱을 뜯으면
// 그대로 보이고, 프록시를 걸거나 TLS SNI만 봐도 도메인이 드러난다. env로 뺀 이유는 공개
// 저장소 소스에 주소를 남기지 않고 환경별로 값을 갈아끼우기 위해서지, 접근을 막기 위해서가
// 아니다 — 실제 방어선은 이 주소가 가리키는 서버 쪽에 있어야 한다.
//
// process.env.X 형태로 정적으로 써야 인라인된다. 대괄호 표기나 구조 분해는 치환되지 않는다.
const rawWebViewUrl = process.env.EXPO_PUBLIC_WEBVIEW_URL;

if (!rawWebViewUrl) {
  throw new Error(
    'EXPO_PUBLIC_WEBVIEW_URL이 비어 있습니다. .env.example을 .env.local로 복사해 값을 채우고 번들러를 다시 시작하세요.'
  );
}

// 여기서 한 번 파싱해 둔다. 값이 잘못되면 WebScreen이 오리진을 계산하다 죽는데, 그쪽
// 스택만 보고는 원인이 환경 변수라는 걸 알기 어렵다.
try {
  new URL(rawWebViewUrl);
} catch {
  throw new Error(`EXPO_PUBLIC_WEBVIEW_URL이 올바른 주소가 아닙니다: ${rawWebViewUrl}`);
}

export const WEBVIEW_URL = rawWebViewUrl;

// 아래 색은 sayIt-web globals.css의 팔레트와 같은 값이다. 네이티브 로딩/오류 화면과
// 웹 화면이 교대로 보이는 구조라, 값이 어긋나면 전환할 때마다 색이 튄다.
export const WEBVIEW_BACKGROUND_COLOR = '#faf8ef'; // --paper
export const WEBVIEW_SURFACE_COLOR = '#efece0'; // --surface
export const WEBVIEW_INK_COLOR = '#14140d'; // --ink
export const WEBVIEW_MUTED_COLOR = 'rgba(20, 20, 13, 0.56)'; // --muted
export const WEBVIEW_LINE_COLOR = 'rgba(20, 20, 13, 0.14)'; // --line
export const WEBVIEW_ACCENT_COLOR = '#e4e724'; // --accent
