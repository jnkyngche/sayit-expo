import type WebView from 'react-native-webview';
import type { NativeToWebMessage } from '../bridge/webMessages';

// 큐/다운로드처럼 화면 밖에서 도는 로직이 웹으로 상태를 밀어 넣을 수 있는 통로.
// 스택에 여러 WebScreen이 동시에 떠 있을 수 있어(NAVIGATE_PUSH), 등록된 모든 웹뷰에
// 뿌리고 무시할지 반영할지는 각 화면의 웹 코드가 key로 판단한다.
const webViews = new Set<WebView>();

export function registerWebView(webView: WebView) {
  webViews.add(webView);
  return () => {
    webViews.delete(webView);
  };
}

export function pushToWeb(message: NativeToWebMessage) {
  const body = JSON.stringify(message);
  webViews.forEach((webView) => webView.postMessage(body));
}
