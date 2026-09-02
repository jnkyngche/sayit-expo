import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  WEBVIEW_ACCENT_COLOR,
  WEBVIEW_BACKGROUND_COLOR,
  WEBVIEW_INK_COLOR,
  WEBVIEW_LINE_COLOR,
  WEBVIEW_MUTED_COLOR,
} from '../config';

type Props = {
  visible: boolean;
  label: string;
  progress: number;
  slow: boolean;
  onRetry: () => void;
};

export default function WebViewLoadingOverlay({ visible, label, progress, slow, onRetry }: Props) {
  // visible이 꺼져도 페이드아웃이 끝날 때까지는 붙어 있어야 한다 — 그래서 mount는 따로 관리한다.
  const [mounted, setMounted] = useState(visible);
  const [trackWidth, setTrackWidth] = useState(0);
  const opacity = useRef(new Animated.Value(0)).current;
  const fill = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) setMounted(true);
    const animation = Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: visible ? 160 : 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => animation.stop();
  }, [visible, opacity]);

  useEffect(() => {
    const animation = Animated.timing(fill, {
      toValue: progress,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, fill]);

  useEffect(() => {
    if (!mounted) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [mounted, pulse]);

  if (!mounted) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, { opacity }]}>
      <View style={styles.track} onLayout={handleTrackLayout}>
        {/* 트랙 폭만큼의 막대를 왼쪽에서 밀어 넣는다 — width 애니메이션과 달리 네이티브 드라이버로 돈다. */}
        <Animated.View
          style={[
            styles.trackFill,
            {
              width: trackWidth,
              transform: [
                { translateX: fill.interpolate({ inputRange: [0, 1], outputRange: [-trackWidth, 0] }) },
              ],
            },
          ]}
        />
      </View>

      <View style={styles.center}>
        <Animated.View style={{ opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }}>
          <View style={styles.wordmarkWrap}>
            <View style={styles.wordmarkHighlight} />
            <Text style={styles.wordmark}>sayIt</Text>
          </View>
        </Animated.View>

        {slow ? (
          <View style={styles.slowBlock}>
            <Text style={styles.slowText}>네트워크가 느린 것 같아요.{'\n'}조금 더 기다리거나 다시 시도해 주세요.</Text>
            <Pressable
              onPress={onRetry}
              hitSlop={8}
              style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
            >
              <Text style={styles.retryLabel}>다시 시도</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.status}>{label}</Text>
        )}
      </View>
    </Animated.View>
  );

  function handleTrackLayout(event: LayoutChangeEvent) {
    setTrackWidth(event.nativeEvent.layout.width);
  }
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: WEBVIEW_BACKGROUND_COLOR,
  },
  track: {
    height: 3,
    width: '100%',
    backgroundColor: WEBVIEW_LINE_COLOR,
    overflow: 'hidden',
  },
  trackFill: {
    height: 3,
    backgroundColor: WEBVIEW_ACCENT_COLOR,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    // 정중앙보다 살짝 위가 시선이 머무는 자리다.
    paddingBottom: 48,
  },
  wordmarkWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmarkHighlight: {
    position: 'absolute',
    left: -6,
    right: -6,
    bottom: 3,
    height: 10,
    borderRadius: 2,
    backgroundColor: WEBVIEW_ACCENT_COLOR,
  },
  wordmark: {
    // 앱 아이콘·스플래시와 같은 글자체다(assets/fonts/Inter-ExtraBold.ttf, SIL OFL).
    // 시스템 폰트를 쓰면 iOS는 SF Pro, Android는 Roboto로 갈려서 스플래시에서 이 화면으로
    // 넘어오는 순간 글자 모양이 바뀐다. app.json의 expo-font 플러그인이 네이티브에 심어두므로
    // useFonts 없이 첫 프레임부터 쓸 수 있다 — 로딩 화면이라 비동기 로딩을 기다릴 수 없다.
    fontFamily: 'Inter',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: WEBVIEW_INK_COLOR,
  },
  status: {
    marginTop: 18,
    fontSize: 13,
    color: WEBVIEW_MUTED_COLOR,
  },
  slowBlock: {
    marginTop: 18,
    alignItems: 'center',
  },
  slowText: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    color: WEBVIEW_MUTED_COLOR,
  },
  retryButton: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: WEBVIEW_LINE_COLOR,
  },
  retryButtonPressed: {
    opacity: 0.6,
  },
  retryLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: WEBVIEW_INK_COLOR,
  },
});
