import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../navigation/types';
import { normalizeCapture, settleCapture, type CaptureResult } from '../lib/scan';

type Props = NativeStackScreenProps<RootStackParamList, 'CameraScreen'>;

const ACCENT = '#e4e724';

// 가이드 사각형이 비워둘 여백. 교재 페이지를 통째로 담아야 해서 화면을 거의 다 쓴다 —
// 사각형이 작으면 사용자가 그 안에 맞추려고 멀리서 찍게 되고, 활자가 작아져 인식률이 떨어진다.
const GUIDE_INSET_X = 14;
const GUIDE_INSET_TOP = 68; // 상단 닫기/플래시 버튼 아래
const GUIDE_INSET_BOTTOM = 126; // 하단 셔터 위

/**
 * 한 장만 찍고 바로 닫히는 촬영 화면.
 *
 * 결과는 return이 아니라 lib/scan의 settleCapture로 흘려보낸다. 스와이프 백·하드웨어 백처럼
 * 우리가 가로채지 않는 종료 경로가 있어서, 어떤 식으로 화면이 사라지든 언마운트 시점에 딱
 * 한 번 결과를 확정한다 — 여기서 놓치면 SCAN_START가 영영 await에 걸려 웹 버튼이 잠긴다.
 */
export default function CameraScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const resultRef = useRef<CaptureResult | null>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [torch, setTorch] = useState(false);

  useEffect(() => {
    return () => settleCapture(resultRef.current ?? { status: 'cancelled' });
  }, []);

  // OS 팝업은 한 번 거부되면 다시 뜨지 않는다. 더 물어볼 수 없는 상태면 화면을 붙잡아두지
  // 말고 바로 닫아서, 웹이 "설정에서 권한을 켜주세요" 안내를 띄우게 한다.
  useEffect(() => {
    if (!permission) return;
    if (permission.granted) return;
    if (permission.canAskAgain) {
      requestPermission();
      return;
    }
    close({ status: 'denied' });
  }, [permission]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {permission?.granted && (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          animateShutter={false}
          onCameraReady={() => setReady(true)}
        />
      )}

      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={() => close({ status: 'cancelled' })}
          accessibilityLabel="닫기"
          style={styles.roundButton}
        >
          <Text style={styles.closeGlyph}>✕</Text>
        </Pressable>
        <Pressable
          onPress={() => setTorch((on) => !on)}
          accessibilityLabel="플래시"
          style={[styles.roundButton, torch && styles.roundButtonOn]}
        >
          <Text style={[styles.torchGlyph, torch && styles.torchGlyphOn]}>⚡</Text>
        </Pressable>
      </View>

      <View
        style={[
          styles.guide,
          { top: insets.top + GUIDE_INSET_TOP, bottom: insets.bottom + GUIDE_INSET_BOTTOM },
        ]}
        pointerEvents="none"
      >
        <View style={[styles.corner, styles.cornerTopLeft]} />
        <View style={[styles.corner, styles.cornerTopRight]} />
        <View style={[styles.corner, styles.cornerBottomLeft]} />
        <View style={[styles.corner, styles.cornerBottomRight]} />
      </View>

      <View style={[styles.hintWrapper, { bottom: insets.bottom + 112 }]} pointerEvents="none">
        <Text style={styles.hint}>문장이 사각형 안에 꽉 차도록 가까이서 찍어주세요</Text>
      </View>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 24 }]}>
        <Pressable
          onPress={handleShutter}
          disabled={!ready || busy}
          accessibilityLabel="촬영"
          style={[styles.shutter, (!ready || busy) && styles.shutterDisabled]}
        >
          {busy ? <ActivityIndicator color="#33352a" /> : <View style={styles.shutterCore} />}
        </Pressable>
      </View>
    </View>
  );

  async function handleShutter() {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 1 });
      if (!photo?.uri) {
        close({ status: 'cancelled' });
        return;
      }
      close({ status: 'ok', uri: await normalizeCapture(photo.uri) });
    } catch {
      // 카메라 하드웨어 오류. 여기서 화면을 붙잡아두면 사용자가 빠져나갈 길이 없다.
      close({ status: 'cancelled' });
    }
  }

  function close(result: CaptureResult) {
    resultRef.current = result;
    navigation.goBack();
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    zIndex: 1,
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  roundButtonOn: { backgroundColor: ACCENT },
  closeGlyph: { color: '#faf8ef', fontSize: 17, lineHeight: 20 },
  torchGlyph: { color: '#faf8ef', fontSize: 17, lineHeight: 20 },
  torchGlyphOn: { color: '#33352a' },
  guide: { position: 'absolute', left: GUIDE_INSET_X, right: GUIDE_INSET_X },
  corner: { position: 'absolute', width: 36, height: 36, borderColor: ACCENT },
  cornerTopLeft: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 10 },
  cornerTopRight: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 10 },
  cornerBottomLeft: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 10 },
  cornerBottomRight: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 10 },
  hintWrapper: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  hint: {
    color: '#faf8ef',
    fontSize: 13,
    fontWeight: '500',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', paddingTop: 20 },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#faf8ef',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDisabled: { opacity: 0.5 },
  shutterCore: { width: 56, height: 56, borderRadius: 28, backgroundColor: ACCENT },
});
