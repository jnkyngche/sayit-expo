import { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { setAudioModeAsync } from 'expo-audio';
import WebScreen from './screens/WebScreen';
import type { RootStackParamList } from './navigation/types';
import { WEBVIEW_URL } from './config';
import { bootstrapAudioStore } from './lib/audio-store';
import { migrateDb } from './lib/db';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  useEffect(() => {
    bootstrapAudioStore();
    migrateDb();
    // 재생은 웹뷰 안 Web Audio API가 하지만, iOS에서 WKWebView의 오디오 세션은
    // 앱 전체(AVAudioSession) 설정을 따라간다 — 여기서 안 켜면 무음 스위치가
    // 켜진 기기에서 발음이 전혀 안 들린다.
    setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'duckOthers',
      shouldPlayInBackground: false, // 연속 재생을 넣을 때 true + 잠금화면 컨트롤
    });
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="WebScreen" component={WebScreen} initialParams={{ url: WEBVIEW_URL }} />
        </Stack.Navigator>
      </NavigationContainer>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
