import { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import WebScreen from './screens/WebScreen';
import type { RootStackParamList } from './navigation/types';
import { WEBVIEW_URL } from './config';

const Stack = createNativeStackNavigator<RootStackParamList>();

const SILENT_TRACK = require('./assets/silence.wav');

export default function App() {
  // iOS는 실제로 재생 중인 오디오 루트가 없으면 무음 스위치를 켠 순간 오디오 세션이
  // ambient로 되돌아간다. setAudioModeAsync만 호출하고 끝내면(직접 재생 없이) 나중에
  // WebView가 TTS를 재생할 때는 이미 세션이 원복돼 있어 소리가 안 난다. 볼륨 0인
  // 무음 트랙을 앱이 떠 있는 동안 계속 반복 재생시켜 playback 세션을 붙잡아 둔다.
  const silentPlayer = useAudioPlayer(SILENT_TRACK);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch((error) =>
      console.error('[audio] setAudioModeAsync 실패', error),
    );

    silentPlayer.loop = true;
    silentPlayer.volume = 0;
    silentPlayer.play();
  }, [silentPlayer]);

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
