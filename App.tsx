import { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import WebView, { WebViewMessageEvent } from 'react-native-webview';

// TODO: 나중에 실제 Next.js 프로젝트 URL로 교체
const TEST_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f2f2f7; }
    button { padding: 16px 24px; font-size: 17px; border-radius: 12px; border: none; background: #007aff; color: white; margin-bottom: 20px; }
    img { max-width: 90%; border-radius: 12px; }
  </style>
</head>
<body>
  <button onclick="requestPhoto()">사진 찍기</button>
  <img id="photo" />
  <script>
    function requestPhoto() {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'OPEN_CAMERA' }));
    }
    window.addEventListener('message', function (event) {
      var data = JSON.parse(event.data);
      if (data.type === 'PHOTO_CAPTURED') {
        document.getElementById('photo').src = 'data:image/jpeg;base64,' + data.base64;
      }
    });
  </script>
</body>
</html>
`;

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const webviewRef = useRef<WebView>(null);

  const handleWebMessage = async (event: WebViewMessageEvent) => {
    const data = JSON.parse(event.nativeEvent.data);
    if (data.type === 'OPEN_CAMERA') {
      if (!permission?.granted) {
        const result = await requestPermission();
        if (!result.granted) {
          Alert.alert('카메라 권한이 필요합니다');
          return;
        }
      }
      setCameraReady(false);
      setCameraOpen(true);
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
      <WebView
        ref={webviewRef}
        source={{ html: TEST_HTML }}
        onMessage={handleWebMessage}
        style={styles.webview}
      />
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
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  webview: { flex: 1 },
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
