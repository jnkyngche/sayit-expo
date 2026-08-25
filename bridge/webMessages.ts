// 웹(Next.js) <-> 네이티브 postMessage 브릿지 계약.
// 웹 쪽은 window.ReactNativeWebView.postMessage(JSON.stringify(...))로 아래 타입의 메시지를 보낸다.
export type WebToNativeMessage =
  | { type: 'OPEN_CAMERA' }
  | { type: 'NAVIGATE_PUSH'; url: string; title?: string }
  | { type: 'NAVIGATE_POP' };

// 네이티브가 webviewRef.postMessage(JSON.stringify(...))로 웹에 보내는 메시지.
export type NativeToWebMessage = { type: 'PHOTO_CAPTURED'; base64: string };
