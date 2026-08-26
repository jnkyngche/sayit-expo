import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import WebView, { WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';
import type { RootStackParamList } from '../navigation/types';
import type { NativeToWebMessage, WebToNativeMessage } from '../bridge/webMessages';
import { registerWebView } from '../lib/bridge';
import { audioKey, ensureAudio } from '../lib/audio-store';
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
import { WEBVIEW_BACKGROUND_COLOR, WEBVIEW_URL } from '../config';
import BouncingDotsLoader from '../components/BouncingDotsLoader';

type Props = NativeStackScreenProps<RootStackParamList, 'WebScreen'>;

function resolveWebViewUrl(possiblyRelativeUrl: string): string {
  return new URL(possiblyRelativeUrl, WEBVIEW_URL).toString();
}

export default function WebScreen({ route, navigation }: Props) {
  const { url } = route.params;
  const insets = useSafeAreaInsets();

  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const webviewRef = useRef<WebView>(null);
  const canGoBackRef = useRef(false);

  useEffect(() => {
    if (!webviewRef.current) return;
    return registerWebView(webviewRef.current);
  }, []);

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

  const postToWeb = (message: NativeToWebMessage) => {
    webviewRef.current?.postMessage(JSON.stringify(message));
  };

  const handleWebMessage = async (event: WebViewMessageEvent) => {
    const data = JSON.parse(event.nativeEvent.data) as WebToNativeMessage;
    switch (data.type) {
      case 'OPEN_CAMERA': {
        if (!permission?.granted) {
          const result = await requestPermission();
          if (!result.granted) {
            Alert.alert('카메라 권한이 필요합니다');
            return;
          }
        }
        setCameraReady(false);
        setCameraOpen(true);
        return;
      }
      case 'NAVIGATE_PUSH': {
        navigation.push('WebScreen', { url: resolveWebViewUrl(data.url), title: data.title });
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
    }
  };

  const takePicture = async () => {
    if (!cameraReady) return;
    const photo = await cameraRef.current?.takePictureAsync({ base64: true, quality: 0.5 });
    setCameraOpen(false);
    if (photo?.base64) {
      postToWeb({ type: 'PHOTO_CAPTURED', base64: photo.base64 });
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.webviewWrapper, { paddingTop: insets.top }]}>
        <WebView
          ref={webviewRef}
          source={{ uri: url }}
          onMessage={handleWebMessage}
          onNavigationStateChange={(nav: WebViewNavigation) => {
            canGoBackRef.current = nav.canGoBack;
          }}
          style={styles.webview}
          startInLoadingState
          renderLoading={() => (
            <View style={[StyleSheet.absoluteFill, styles.loadingOverlay]}>
              <BouncingDotsLoader />
            </View>
          )}
        />
      </View>
      {cameraOpen && (
        <View style={StyleSheet.absoluteFill}>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            onCameraReady={() => setCameraReady(true)}
          />
          <TouchableOpacity style={styles.cancelButton} onPress={() => setCameraOpen(false)}>
            <Text style={styles.cancelText}>취소</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.shutterButton, !cameraReady && styles.shutterButtonDisabled]}
            onPress={takePicture}
            disabled={!cameraReady}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  webviewWrapper: { flex: 1, backgroundColor: WEBVIEW_BACKGROUND_COLOR },
  webview: { flex: 1, backgroundColor: WEBVIEW_BACKGROUND_COLOR },
  loadingOverlay: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: WEBVIEW_BACKGROUND_COLOR,
  },
  cancelButton: {
    position: 'absolute',
    top: 60,
    left: 20,
  },
  cancelText: { color: '#fff', fontSize: 17 },
  shutterButton: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    borderWidth: 4,
    borderColor: '#ddd',
  },
  shutterButtonDisabled: {
    opacity: 0.4,
  },
});
