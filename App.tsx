import { useEffect } from 'react';
import { DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { setAudioModeAsync } from 'expo-audio';
import WebScreen from './screens/WebScreen';
import CameraScreen from './screens/CameraScreen';
import type { RootStackParamList } from './navigation/types';
import { WEBVIEW_BACKGROUND_COLOR, WEBVIEW_URL } from './config';
import { bootstrapAudioStore } from './lib/audio-store';
import { bootstrapNotifications } from './lib/app-settings';
import { migrateDb } from './lib/db';

const Stack = createNativeStackNavigator<RootStackParamList>();

// 화면이 아직 안 그려진 순간에 드러나는 바탕색. 기본 테마는 밝은 회색이라 스플래시(종이색)와
// 웹뷰(종이색) 사이에서 한 프레임 번쩍인다 — 실행부터 첫 화면까지 같은 색으로 잇는다.
const navigationTheme: Theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: WEBVIEW_BACKGROUND_COLOR },
};

export default function App() {
  useEffect(() => {
    bootstrapAudioStore();
    migrateDb();
    // 알림 표시 방식과 Android 채널. 실제 스케줄은 설정 화면에서 켤 때 걸린다.
    bootstrapNotifications();
    // 재생은 웹뷰 안 Web Audio API가 하지만, iOS에서 WKWebView의 오디오 세션은
    // 앱 전체(AVAudioSession) 설정을 따라간다 — 여기서 안 켜면 무음 스위치가
    // 켜진 기기에서 발음이 전혀 안 들린다.
    setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'duckOthers',
      // 연속 재생을 넣을 때 true + 잠금화면 컨트롤. 그때는 app.json의 expo-audio
      // enableBackgroundPlayback도 같이 켜야 한다 — 여기만 켜면 OS가 백그라운드에서
      // 오디오 세션을 끊는다. 반대로 그쪽만 켜두면 쓰지도 않는 백그라운드 오디오를
      // 선언한 셈이 되어 심사에서 걸린다.
      shouldPlayInBackground: false,
    });
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={navigationTheme}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="WebScreen" component={WebScreen} initialParams={{ url: WEBVIEW_URL }} />
          {/* 촬영 화면은 웹뷰 위로 덮이는 전체화면이라 웹뷰 배경색(paper)이 비치면 안 된다. */}
          <Stack.Screen
            name="CameraScreen"
            component={CameraScreen}
            options={{ animation: 'fade', contentStyle: { backgroundColor: '#000' } }}
          />
        </Stack.Navigator>
      </NavigationContainer>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
