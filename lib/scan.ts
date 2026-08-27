import { Image } from 'react-native';
import { Camera } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import DocumentScanner, { ScanDocumentResponseStatus } from 'react-native-document-scanner-plugin';
import { PhotoRecognizer } from 'react-native-vision-camera-ocr-plus';
import type { Line } from '../bridge/webMessages';

export type CaptureResult =
  | { status: 'ok'; uri: string }
  | { status: 'cancelled' }
  | { status: 'denied' };

/** 문서 스캐너를 띄운다. OS 팝업은 한 번 거부되면 다시 뜨지 않으므로 앱 레벨 권한을 먼저 확인한다. */
export async function capture(): Promise<CaptureResult> {
  const granted = await ensureCameraPermission();
  if (!granted) return { status: 'denied' };

  const { status, scannedImages } = await DocumentScanner.scanDocument({
    maxNumDocuments: 1,
    croppedImageQuality: 100, // 재압축 아티팩트가 얇은 활자 인식률을 깎는다 — 낮추지 않는다
  });

  return status === ScanDocumentResponseStatus.Success && scannedImages?.[0]
    ? { status: 'ok', uri: adoptIntoCache(scannedImages[0]) }
    : { status: 'cancelled' };
}

/**
 * 스캐너가 저장한 원본을 캐시 디렉터리로 옮긴다.
 *
 * iOS 플러그인은 Documents/에 저장하는데(react-native-document-scanner-plugin의
 * FileUtil.createImageFile), 거기 있는 파일은 iCloud 백업 대상이고 OS가 회수하지도 않는다.
 * 앱이 다음 촬영 전에 종료되면 discardSession이 못 돌아 12MP JPEG가 그대로 남는다 —
 * 실행할 때마다 한 장씩 사용자 백업 용량을 먹는 셈이다. 재촬영하면 다시 만들 수 있는
 * 임시 이미지이므로 캐시가 맞는 자리다.
 *
 * Android의 content:// URI는 우리가 만든 파일이 아니라 손대지 않고 그대로 쓴다.
 */
function adoptIntoCache(uri: string): string {
  if (!uri.startsWith('file://')) return uri;
  try {
    const source = new File(uri);
    if (!source.exists) return uri;
    source.moveSync(new File(Paths.cache, `scan-${Date.now()}.jpg`));
    return source.uri; // moveSync는 uri를 새 위치로 갱신한다
  } catch {
    // 옮기지 못해도 인식 자체는 원래 경로로 계속 진행할 수 있다 — 촬영을 실패시키지 않는다.
    return uri;
  }
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
// 저사양 Android에서 12MP 디코딩(장당 약 48MB)이 누적되어 죽는 걸 막을 수 있다.
let currentSession: { id: string; session: ScanSession } | null = null;

export function saveSession(sessionId: string, uri: string) {
  if (currentSession) discardSession(currentSession.session);
  currentSession = { id: sessionId, session: { uri } };
}

export function getSessionUri(sessionId: string): string | null {
  return currentSession?.id === sessionId ? currentSession.session.uri : null;
}

function discardSession(session: ScanSession) {
  try {
    const file = new File(session.uri);
    if (file.exists) file.delete();
  } catch {
    // 스캐너가 이미 정리한 임시 파일일 수 있다 — 무시한다.
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

async function ensureCameraPermission(): Promise<boolean> {
  const current = await Camera.getCameraPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const result = await Camera.requestCameraPermissionsAsync();
  return result.granted;
}

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}
