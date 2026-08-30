import { useCallback, useEffect, useRef } from 'react';
import { BackHandler, Linking, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView, { WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';
import type { RootStackParamList } from '../navigation/types';
import type { NativeToWebMessage, WebToNativeMessage } from '../bridge/webMessages';
import { registerWebView } from '../lib/bridge';
import { audioKey, ensureAudio } from '../lib/audio-store';
import { getAppSettings, setReminder } from '../lib/app-settings';
import {
  createFolder,
  deleteSentence,
  getSentenceById,
  getSentenceSpeakParams,
  insertSentence,
  listFolders,
  listSentences,
  renameFolder,
} from '../lib/db';
import { enqueue } from '../lib/download-queue';
import { createSessionId, fullImageDataUrl, getSessionUri, recognize, requestCapture, saveSession, thumbDataUrl } from '../lib/scan';
import { WEBVIEW_BACKGROUND_COLOR, WEBVIEW_URL } from '../config';
import { LOADING_PROBE_SCRIPT, WEBVIEW_FIRST_PAINT, type LoadingProbeMessage } from '../bridge/loadingProbe';
import { useWebViewLoad } from '../lib/webview-load';
import WebViewLoadingOverlay from '../components/WebViewLoadingOverlay';
import WebViewErrorView from '../components/WebViewErrorView';

type Props = NativeStackScreenProps<RootStackParamList, 'WebScreen'>;

function resolveWebViewUrl(possiblyRelativeUrl: string): string {
  return new URL(possiblyRelativeUrl, WEBVIEW_URL).toString();
}

export default function WebScreen({ route, navigation }: Props) {
  const { url } = route.params;
  const insets = useSafeAreaInsets();

  const webviewRef = useRef<WebView>(null);
  const canGoBackRef = useRef(false);
  const load = useWebViewLoad(url);

  // reloadKey가 바뀌면 WebView가 통째로 새로 마운트되므로 ref도 새것이다 —
  // 다시 등록하지 않으면 브릿지가 죽은 웹뷰에 메시지를 밀어 넣게 된다.
  useEffect(() => {
    if (!webviewRef.current) return;
    return registerWebView(webviewRef.current);
  }, [load.reloadKey]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (canGoBackRef.current) {
          webviewRef.current?.goBack();
          return true;
        }
        if (navigation.canGoBack()) {
          navigation.goBack();
          return true;
        }
        return false;
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [navigation])
  );

  const handleShouldStartLoad = (request: WebViewNavigation) => {
    if (request.url.startsWith('http://') || request.url.startsWith('https://')) return true;

    Linking.openURL(request.url).catch(() => {
      // 메일 앱이 없는 기기 등. 열지 못해도 웹뷰가 엉뚱한 주소로 가버리는 것보다는 낫다.
    });
    return false;
  };

  const postToWeb = (message: NativeToWebMessage) => {
    webviewRef.current?.postMessage(JSON.stringify(message));
  };

  const handleWebMessage = async (event: WebViewMessageEvent) => {
    const data = JSON.parse(event.nativeEvent.data) as WebToNativeMessage | LoadingProbeMessage;
    // 웹 계약이 아니라 네이티브가 주입한 스크립트가 보내는 신호다(bridge/loadingProbe.ts).
    if (data.type === WEBVIEW_FIRST_PAINT) {
      load.markFirstPaint();
      return;
    }
    switch (data.type) {
      case 'SCAN_START': {
        // 촬영이 던지면(카메라 하드웨어 오류 등) 웹의 버튼이 'scanning'으로 잠긴 채 남는다.
        // 어떤 경로로든 반드시 답을 보낸다.
        try {
          const shot = await requestCapture(() => navigation.navigate('CameraScreen'));
          if (shot.status === 'denied') {
            postToWeb({ type: 'SCAN_DENIED' });
            return;
          }
          if (shot.status !== 'ok') {
            postToWeb({ type: 'SCAN_CANCELLED' });
            return;
          }

          const sessionId = createSessionId();
          saveSession(sessionId, shot.uri);
          postToWeb({ type: 'SCAN_RESULT', sessionId });
        } catch {
          postToWeb({ type: 'SCAN_CANCELLED' });
        }
        return;
      }
      case 'SCAN_SESSION_GET': {
        const uri = getSessionUri(data.sessionId);
        if (!uri) {
          // 연속 촬영으로 세션이 이미 교체됨
          postToWeb({ type: 'SCAN_SESSION_GET_ERROR', sessionId: data.sessionId, reason: 'expired' });
          return;
        }
        try {
          // 순차로 돌린다 — Promise.all로 겹치면 12MP 원본을 동시에 두 번 디코딩하게 되고
          // (장당 약 48MB) 저사양 Android에서 그대로 OOM이다. 어차피 사용자는 둘 다 기다린다.
          const thumb = await thumbDataUrl(uri);
          const lines = await recognize(uri);
          postToWeb({ type: 'SCAN_SESSION_GET_OK', sessionId: data.sessionId, thumb, lines });
        } catch {
          postToWeb({ type: 'SCAN_SESSION_GET_ERROR', sessionId: data.sessionId, reason: 'failed' });
        }
        return;
      }
      case 'SCAN_FULL_IMAGE_REQUEST': {
        const uri = getSessionUri(data.sessionId);
        if (!uri) {
          postToWeb({ type: 'SCAN_FULL_IMAGE_ERROR', sessionId: data.sessionId, reason: 'expired' });
          return;
        }
        try {
          postToWeb({ type: 'SCAN_FULL_IMAGE_OK', sessionId: data.sessionId, dataUrl: await fullImageDataUrl(uri) });
        } catch {
          postToWeb({ type: 'SCAN_FULL_IMAGE_ERROR', sessionId: data.sessionId, reason: 'failed' });
        }
        return;
      }
      case 'NAVIGATE_PUSH': {
        navigation.push('WebScreen', { url: resolveWebViewUrl(data.url), title: data.title });
        return;
      }
      case 'NAVIGATE_REPLACE': {
        navigation.replace('WebScreen', { url: resolveWebViewUrl(data.url), title: data.title });
        return;
      }
      case 'NAVIGATE_POP': {
        if (navigation.canGoBack()) navigation.goBack();
        return;
      }
      case 'LIBRARY_FOLDERS': {
        postToWeb({ type: 'LIBRARY_FOLDERS_OK', folders: listFolders() });
        return;
      }
      case 'LIBRARY_CREATE_FOLDER': {
        postToWeb({ type: 'LIBRARY_CREATE_FOLDER_OK', folder: createFolder(data.name) });
        return;
      }
      case 'LIBRARY_RENAME_FOLDER': {
        postToWeb({ type: 'LIBRARY_RENAME_FOLDER_OK', folder: renameFolder(data.folderId, data.name) });
        return;
      }
      case 'LIBRARY_LIST': {
        const { sentences, nextCursor } = listSentences(data.folderId, data.cursor);
        postToWeb({ type: 'LIBRARY_LIST_OK', folderId: data.folderId, sentences, nextCursor });
        return;
      }
      case 'LIBRARY_SAVE': {
        const speakParams = { text: data.text, voice: data.voice, speed: data.speed };
        const key = await audioKey(speakParams);
        const sentence = insertSentence({
          folderId: data.folderId,
          text: data.text,
          phonetic: data.phonetic,
          words: data.words,
          audioKey: key,
          voice: data.voice,
          speed: data.speed,
        });
        enqueue(key, speakParams);
        postToWeb({ type: 'LIBRARY_SAVE_OK', sentence });
        return;
      }
      case 'LIBRARY_DELETE': {
        deleteSentence(data.sentenceId);
        postToWeb({ type: 'LIBRARY_DELETE_OK', sentenceId: data.sentenceId });
        return;
      }
      case 'SENTENCE_GET': {
        const sentence = getSentenceById(data.sentenceId);
        if (!sentence) {
          postToWeb({ type: 'SENTENCE_GET_ERROR', sentenceId: data.sentenceId, reason: 'not_found' });
          return;
        }
        postToWeb({ type: 'SENTENCE_GET_OK', sentence });
        return;
      }
      case 'AUDIO_REQUEST': {
        const speak = getSentenceSpeakParams(data.sentenceId);
        if (!speak) {
          postToWeb({ type: 'AUDIO_ERROR', sentenceId: data.sentenceId, reason: 'not_found' });
          return;
        }
        try {
          const file = await ensureAudio(speak.audioKey, speak.params);
          postToWeb({ type: 'AUDIO_READY', sentenceId: data.sentenceId, base64: await file.base64() });
        } catch {
          postToWeb({ type: 'AUDIO_ERROR', sentenceId: data.sentenceId, reason: 'offline' });
        }
        return;
      }
      case 'AUDIO_PREFETCH': {
        for (const sentenceId of data.sentenceIds) {
          const speak = getSentenceSpeakParams(sentenceId);
          if (speak) enqueue(speak.audioKey, speak.params);
        }
        return;
      }
      case 'SETTINGS_GET': {
        postToWeb({ type: 'SETTINGS_OK', settings: await getAppSettings() });
        return;
      }
      case 'SETTINGS_SET_REMINDER': {
        const { settings, denied } = await setReminder(data.enabled, data.hour, data.minute);
        postToWeb({ type: denied ? 'SETTINGS_REMINDER_DENIED' : 'SETTINGS_OK', settings });
        return;
      }
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.webviewWrapper, { paddingTop: insets.top }]}>
        <WebView
          // 로드가 실패한 뒤의 reload()는 플랫폼에 따라 먹지 않는다. 다시 시도는 웹뷰를 새로 만든다.
          key={load.reloadKey}
          ref={webviewRef}
          source={{ uri: url }}
          onMessage={handleWebMessage}
          onNavigationStateChange={(nav: WebViewNavigation) => {
            canGoBackRef.current = nav.canGoBack;
          }}
          // 설정의 "문의하기"(mailto:) 같은 링크는 웹뷰가 열 수 없다 — 그대로 두면
          // 아무 일도 안 일어난 것처럼 보인다. 앱 밖으로 나갈 주소는 OS에 넘긴다.
          onShouldStartLoadWithRequest={handleShouldStartLoad}
          style={styles.webview}
          // 첫 페인트를 알리는 스크립트. 문서보다 먼저 심어야 페인트 관측을 놓치지 않는다.
          injectedJavaScriptBeforeContentLoaded={LOADING_PROBE_SCRIPT}
          {...load.handlers}
        />

        {/* 로더는 웹뷰 위를 덮기만 한다 — 웹뷰 자체에 opacity를 걸면 안드로이드에서 렌더가 깨진다. */}
        <WebViewLoadingOverlay
          visible={load.loaderVisible}
          label={load.label}
          progress={load.progress}
          slow={load.slow}
          onRetry={load.retry}
        />

        {load.phase === 'error' && load.error ? (
          <WebViewErrorView
            error={load.error}
            onRetry={load.retry}
            onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  webviewWrapper: { flex: 1, backgroundColor: WEBVIEW_BACKGROUND_COLOR },
  webview: { flex: 1, backgroundColor: WEBVIEW_BACKGROUND_COLOR },
});
