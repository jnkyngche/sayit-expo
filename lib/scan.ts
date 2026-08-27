import { Image } from 'react-native';
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { PhotoRecognizer } from 'react-native-vision-camera-ocr-plus';
import type { Line } from '../bridge/webMessages';

export type CaptureResult =
  | { status: 'ok'; uri: string }
  | { status: 'cancelled' }
  | { status: 'denied' };

/**
 * 촬영은 네이티브 스택의 별도 화면(CameraScreen)에서 일어나므로 함수 호출로 결과를 되받을 수
 * 없다. SCAN_START 핸들러가 await할 수 있도록 promise의 resolve를 여기 붙잡아둔다.
 *
 * 예전에는 react-native-document-scanner-plugin을 썼는데, iOS에서는 maxNumDocuments가
 * 무시된다(Android 모듈에만 구현되어 있다). VisionKit의 다중 페이지 스캐너가 그대로 떠서
 * "스캔 유지"를 누르면 결과가 아니라 카메라로 되돌아가고, "저장"을 누르기 전에는 콜백이
 * 오지 않는다 — 사용자 눈에는 사진만 계속 찍히고 결과 화면이 안 뜨는 것으로 보인다.
 */
let pendingCapture: ((result: CaptureResult) => void) | null = null;

export function requestCapture(openCameraScreen: () => void): Promise<CaptureResult> {
  settleCapture({ status: 'cancelled' }); // 화면 전환 중 중복 탭으로 남은 요청을 정리한다
  return new Promise((resolve) => {
    pendingCapture = resolve;
    openCameraScreen();
  });
}

/** CameraScreen이 촬영·취소·거부 중 무엇으로 끝났든 반드시 한 번 호출한다. */
export function settleCapture(result: CaptureResult) {
  const resolve = pendingCapture;
  pendingCapture = null;
  resolve?.(result);
}

/**
 * 촬영 직후 원본을 인식용으로 정규화한다.
 *
 * 두 가지를 한 번에 해결한다. (1) 카메라가 남기는 EXIF 회전 정보를 픽셀에 구워 넣는다 —
 * Image.getSize와 ML Kit이 회전을 다르게 해석하면 인식 자체는 되는데 줄 좌표만 90도 어긋난다.
 * (2) 12MP 원본은 디코딩할 때마다 약 48MB를 먹는데, 활자 인식에 그 해상도가 필요하지 않다.
 */
const OCR_MAX_LONG_SIDE = 2560;

export async function normalizeCapture(uri: string): Promise<string> {
  const { width, height } = await getImageSize(uri);
  const scale = Math.min(1, OCR_MAX_LONG_SIDE / Math.max(width, height));
  const resize =
    scale < 1
      ? width >= height
        ? { width: Math.round(width * scale) }
        : { height: Math.round(height * scale) }
      : undefined;

  const result = await ImageManipulator.manipulateAsync(uri, resize ? [{ resize }] : [], {
    compress: 1, // 재압축 아티팩트가 얇은 활자 인식률을 깎는다 — 낮추지 않는다
    format: ImageManipulator.SaveFormat.JPEG,
  });

  deleteQuietly(uri); // 정규화본만 세션에 남기고 원본은 즉시 버린다
  return result.uri;
}

/** ML Kit(iOS/Android 공통) 반환 구조를 하나의 Line[]으로 눌러 담는다. */
export async function recognize(uri: string): Promise<Line[]> {
  const { width: iw, height: ih } = await getImageSize(uri);

  // 이미지 전처리(흑백화·이진화 등)는 하지 않는다 — 두 엔진 다 컬러 원본을 전제로
  // 학습된 신경망이라 직접 손대면 대부분 인식률이 떨어진다.
  const result = await PhotoRecognizer({ uri, orientation: 'portrait' });

  return result.blocks
    .flatMap((block) => block.lines)
    .map((line) => {
      // lineFrame.x/y는 쓰면 안 된다. 라이브러리의 boundingFrame()이 원점 대신
      // x = left/2 + width/4, y = 1.5*top - height/4 을 돌려준다(iOS·Android 동일 버그,
      // HybridTextRecognizer의 boundingFrame 참고). y가 1.5배로 부풀어서 페이지 아래쪽
      // 줄은 정규화 값이 1을 넘고, 하이라이트 박스가 썸네일 밖으로 나가버린다.
      // 같은 struct의 boundingCenterX/Y는 양쪽 다 정상이라 거기서 원점을 되계산한다.
      const frame = line.lineFrame;
      return {
        text: line.lineText.replace(/\s+/g, ' ').trim(),
        x: (frame.boundingCenterX - frame.width / 2) / iw,
        y: (frame.boundingCenterY - frame.height / 2) / ih,
        w: frame.width / iw,
        h: frame.height / ih,
      };
    })
    .filter((line) => line.text.length > 0);
}

type ScanSession = { uri: string };

// 세션은 한 번에 하나만 살려둔다 — 연속 촬영마다 이전 이미지를 즉시 해제해야
// 저사양 기기에서 캐시와 디코딩 메모리가 누적되지 않는다.
let currentSession: { id: string; session: ScanSession } | null = null;

export function saveSession(sessionId: string, uri: string) {
  if (currentSession) deleteQuietly(currentSession.session.uri);
  currentSession = { id: sessionId, session: { uri } };
}

export function getSessionUri(sessionId: string): string | null {
  return currentSession?.id === sessionId ? currentSession.session.uri : null;
}

function deleteQuietly(uri: string) {
  if (!uri.startsWith('file://')) return; // 우리가 만든 파일이 아니면 손대지 않는다
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // OS가 이미 회수한 캐시 파일일 수 있다 — 무시한다.
  }
}

/** 웹이 썸네일을 그릴 때 쓰는 표시용 축소본. 긴 변 기준 리사이즈 + 재압축. */
export async function thumbDataUrl(uri: string, longSide = 800, quality = 70): Promise<string> {
  const { width, height } = await getImageSize(uri);
  const scale = Math.min(1, longSide / Math.max(width, height));
  const resize = scale < 1 ? (width >= height ? { width: Math.round(width * scale) } : { height: Math.round(height * scale) }) : undefined;

  const result = await ImageManipulator.manipulateAsync(uri, resize ? [{ resize }] : [], {
    compress: quality / 100,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  return `data:image/jpeg;base64,${result.base64}`;
}

/** 확대 보기 요청(scan:fullImage)에 응답할 때만 원본 해상도를 base64로 인코딩한다. */
export async function fullImageDataUrl(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(uri, [], {
    base64: true,
    format: ImageManipulator.SaveFormat.JPEG,
    compress: 1,
  });
  return `data:image/jpeg;base64,${result.base64}`;
}

export function createSessionId(): string {
  return Crypto.randomUUID();
}

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}
