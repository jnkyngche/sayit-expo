import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import type WebView from 'react-native-webview';
import { screenCopy } from './webview-screen-copy';

type WebViewProps = ComponentProps<typeof WebView>;
// WebView가 핸들러별 이벤트 타입을 루트에서 내보내지 않아, props 쪽에서 되짚어 꺼낸다.
type EventOf<K extends keyof WebViewProps> = NonNullable<WebViewProps[K]> extends (event: infer E) => unknown ? E : never;

type Phase = 'loading' | 'ready' | 'error';

export type WebViewLoadErrorKind = 'offline' | 'server' | 'unknown';
export type WebViewLoadError = { kind: WebViewLoadErrorKind; detail: string };

// 캐시가 살아 있으면 첫 페인트는 대개 이 안에 끝난다. 그전엔 아무것도 띄우지 않아서
// 빠른 이동에서 로더가 번쩍이지 않게 한다(웹뷰 배경색이 이미 웹의 종이색이라 빈 화면도 튀지 않는다).
const LOADER_GRACE_MS = 260;
// 응답도 오류도 없이 매달려 있는 경우(터널·캡티브 포털 등) 무한 로딩 대신 오류 화면으로 보낸다.
// 느린 회선에서 멀쩡히 오는 중인 응답을 끊어 버리면 안 되니 넉넉하게 잡는다 —
// 그전에 "다시 시도"는 이미 느림 안내와 함께 나와 있다.
const LOAD_TIMEOUT_MS = 60000;
// 주입 스크립트가 죽었거나 paint 신호를 못 받은 경우의 안전망.
const FIRST_PAINT_FALLBACK_MS = 700;
// 진행률이 멈춰 보이지 않도록 90%까지 조금씩 채운다(실제 값이 오면 그쪽이 이긴다).
const TRICKLE_INTERVAL_MS = 350;

// iOS는 NSURLError, Android는 WebViewClient 오류 코드를 준다. 둘 다 음수라 값이 겹치지만
// 여기 모인 코드는 어느 쪽이든 "서버까지 못 갔다"는 뜻이라 같이 묶어도 안전하다.
const OFFLINE_CODES = new Set([
  -1009, // iOS: 인터넷 연결 없음
  -1005, // iOS: 연결이 끊김
  -1004, // iOS: 호스트에 연결 실패
  -1003, // iOS: 호스트를 찾을 수 없음
  -1001, // iOS: 타임아웃
  -2, // Android: ERROR_HOST_LOOKUP
  -6, // Android: ERROR_CONNECT
  -7, // Android: ERROR_IO
  -8, // Android: ERROR_TIMEOUT
]);

const OFFLINE_DESCRIPTION = /ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|CONNECTION_[A-Z_]+|ADDRESS_UNREACHABLE|NETWORK_CHANGED|TIMED_OUT)/;

function classifyError(code: number, description: string): WebViewLoadError | null {
  // -999는 "취소" — 새 요청이 이전 요청을 밀어냈을 때도 뜨므로 오류로 다루면 멀쩡한 화면이 죽는다.
  if (code === -999) return null;
  const detail = `${description || '알 수 없는 오류'} (${code})`;
  if (OFFLINE_CODES.has(code) || OFFLINE_DESCRIPTION.test(description ?? '')) {
    return { kind: 'offline', detail };
  }
  return { kind: 'unknown', detail };
}

function sameDocument(a: string, b: string) {
  const normalize = (url: string) => url.split('#')[0].replace(/\/$/, '');
  return normalize(a) === normalize(b);
}

/**
 * WebView 한 장의 로딩 상태 기계.
 *
 * 화면마다 새 WebView가 뜨는 구조(NAVIGATE_PUSH)라 사용자는 이동할 때마다 이 과정을 본다.
 * 그래서 (1) 빠르면 아무것도 안 보이고, (2) 느리면 진행률이 계속 움직이고, (3) 실패하면
 * 네이티브 오류 화면에서 다시 시도할 수 있어야 한다.
 */
export function useWebViewLoad(sourceUrl: string) {
  const copy = screenCopy(sourceUrl);
  const [reloadKey, setReloadKey] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<WebViewLoadError | null>(null);
  const [progress, setProgress] = useState(0);
  const [loaderVisible, setLoaderVisible] = useState(false);
  const [slow, setSlow] = useState(false);

  const phaseRef = useRef<Phase>('loading');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // 로더는 따로 잡아 둔다 — 진행률이 다 차면 아직 안 뜬 로더만 골라 취소한다.
  const loaderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mainUrl = useRef(sourceUrl);
  const crashes = useRef(0);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    loaderTimer.current = null;
  }, []);

  const enterPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const markReady = useCallback(() => {
    if (phaseRef.current !== 'loading') return;
    clearTimers();
    enterPhase('ready');
    setProgress(1);
    setLoaderVisible(false);
    setSlow(false);
  }, [clearTimers, enterPhase]);

  const fail = useCallback(
    (next: WebViewLoadError) => {
      if (phaseRef.current === 'error') return;
      clearTimers();
      enterPhase('error');
      setError(next);
      setLoaderVisible(false);
      setSlow(false);
    },
    [clearTimers, enterPhase]
  );

  const beginLoad = useCallback(() => {
    const restarting = phaseRef.current !== 'loading';
    clearTimers();
    enterPhase('loading');
    setError(null);
    // 리다이렉트로 onLoadStart가 두 번 불릴 때 진행률과 로더를 되돌리면 깜빡인다 —
    // 이미 로딩 중이었다면 지금까지 쌓인 상태를 그대로 이어 간다.
    if (restarting) {
      setProgress(0);
      setLoaderVisible(false);
      setSlow(false);
    }
    loaderTimer.current = setTimeout(() => setLoaderVisible(true), LOADER_GRACE_MS);
    timers.current.push(
      loaderTimer.current,
      setTimeout(() => setSlow(true), copy.slowAfterMs),
      setTimeout(() => fail({ kind: 'unknown', detail: `응답 없음 (${LOAD_TIMEOUT_MS / 1000}s timeout)` }), LOAD_TIMEOUT_MS)
    );
  }, [clearTimers, copy.slowAfterMs, enterPhase, fail]);

  const retry = useCallback(() => {
    // reload()는 로드가 실패한 뒤엔 플랫폼에 따라 먹지 않는다. key를 바꿔 웹뷰를 새로 띄우면
    // 어떤 상태에서든 확실하게 처음부터 다시 시작한다.
    crashes.current = 0;
    setReloadKey((key) => key + 1);
    // 로딩 중에 누른 "다시 시도"도 처음부터 다시 시작하는 것처럼 보여야 한다
    // (진행률과 느림 안내가 그대로 남아 있으면 눌러도 아무 일 없는 것처럼 느껴진다).
    setProgress(0);
    setSlow(false);
    beginLoad();
  }, [beginLoad]);

  // 마운트 직후 한 번 무장한다 — onLoadStart가 끝내 안 오는 경우에도 타임아웃이 걸리도록.
  useEffect(() => {
    beginLoad();
    return clearTimers;
  }, [beginLoad, clearTimers]);

  useEffect(() => {
    if (phase !== 'loading') return;
    const id = setInterval(() => setProgress((value) => (value < 0.9 ? value + (0.9 - value) * 0.1 : value)), TRICKLE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [phase]);

  const onLoadStart = useCallback(
    (event: EventOf<'onLoadStart'>) => {
      mainUrl.current = event.nativeEvent.url;
      beginLoad();
    },
    [beginLoad]
  );

  const onLoadProgress = useCallback(
    (event: EventOf<'onLoadProgress'>) => {
      if (phaseRef.current !== 'loading') return;
      const next = event.nativeEvent.progress;
      setProgress((value) => (next > value ? next : value));
      // Android는 웹의 history 변경(Next.js 같은 SPA 라우팅의 pushState)에서도 로딩을
      // 시작한 것처럼 알린다 — RNCWebViewClient.doUpdateVisitedHistory가 onLoadStart를
      // 그대로 발사한다. 그런데 문서를 새로 받는 게 아니라서 onLoadEnd는 끝내 오지 않고,
      // 진행률만 1까지 올라간 채 멈춘다. markReady를 부르는 게 onLoadEnd뿐이면 그 화면은
      // 로딩에 갇혀 타임아웃 오류로 끝난다(보관함 탭이 이 경로였다).
      //
      // 진행률이 다 찼다는 건 더 받을 게 없다는 뜻이니 여기서도 완료로 친다. 실제 문서
      // 로드에서는 onLoadEnd가 거의 같은 시점에 오므로 둘 중 먼저 온 쪽이 이긴다.
      if (next >= 1) {
        // 받을 게 남지 않았으면 화면은 곧 뜬다. 아직 안 뜬 로더는 여기서 취소한다 —
        // 안 그러면 이미 그려져 있는 화면 위로 로더가 잠깐 떴다 사라진다.
        if (loaderTimer.current) {
          clearTimeout(loaderTimer.current);
          loaderTimer.current = null;
        }
        timers.current.push(setTimeout(markReady, FIRST_PAINT_FALLBACK_MS));
      }
    },
    [markReady]
  );

  const onLoadEnd = useCallback(() => {
    if (phaseRef.current !== 'loading') return;
    timers.current.push(setTimeout(markReady, FIRST_PAINT_FALLBACK_MS));
  }, [markReady]);

  const onError = useCallback(
    (event: EventOf<'onError'>) => {
      const { code, description } = event.nativeEvent;
      const next = classifyError(code, description);
      if (next) fail(next);
    },
    [fail]
  );

  const onHttpError = useCallback(
    (event: EventOf<'onHttpError'>) => {
      const { statusCode, url } = event.nativeEvent;
      // 이미지·폰트 같은 하위 요청의 404까지 화면을 덮어 버리면 안 된다. 지금 문서일 때만.
      if (!sameDocument(url, mainUrl.current)) return;
      if (statusCode < 400) return;
      fail({ kind: 'server', detail: `HTTP ${statusCode}` });
    },
    [fail]
  );

  // 웹뷰 렌더 프로세스가 죽은 경우(메모리 압박 — 이 앱은 12MP 이미지를 다룬다).
  // 그대로 두면 하얀 화면만 남으므로 한 번은 조용히 되살리고, 반복되면 오류 화면을 보여 준다.
  const onProcessGone = useCallback(() => {
    if (crashes.current > 0) {
      fail({ kind: 'unknown', detail: '웹뷰 프로세스가 반복해서 종료됨' });
      return;
    }
    crashes.current += 1;
    setReloadKey((key) => key + 1);
    beginLoad();
  }, [beginLoad, fail]);

  return {
    reloadKey,
    label: copy.loadingLabel,
    phase,
    error,
    progress,
    loaderVisible,
    slow,
    retry,
    markFirstPaint: markReady,
    handlers: {
      onLoadStart,
      onLoadProgress,
      onLoadEnd,
      onError,
      onHttpError,
      onContentProcessDidTerminate: onProcessGone,
      onRenderProcessGone: onProcessGone,
    },
  };
}
