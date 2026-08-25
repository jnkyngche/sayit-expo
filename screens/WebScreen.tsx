import { useCallback, useRef, useState } from 'react';
import { Alert, BackHandler, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import WebView, { WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';
import type { RootStackParamList } from '../navigation/types';
import type { WebToNativeMessage } from '../bridge/webMessages';
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
    }
  };

  const takePicture = async () => {
    if (!cameraReady) return;
    const photo = await cameraRef.current?.takePictureAsync({ base64: true, quality: 0.5 });
    setCameraOpen(false);
    if (photo?.base64) {
      webviewRef.current?.postMessage(JSON.stringify({ type: 'PHOTO_CAPTURED', base64: photo.base64 }));
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
