import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { WebViewLoadError } from '../lib/webview-load';
import {
  WEBVIEW_ACCENT_COLOR,
  WEBVIEW_BACKGROUND_COLOR,
  WEBVIEW_INK_COLOR,
  WEBVIEW_LINE_COLOR,
  WEBVIEW_MUTED_COLOR,
  WEBVIEW_SURFACE_COLOR,
} from '../config';

type Props = {
  error: WebViewLoadError;
  onRetry: () => void;
  onBack?: () => void;
};

// 웹뷰 자체 오류 페이지("웹페이지를 사용할 수 없음")는 브라우저 냄새가 나고 다시 시도할 방법도 없다.
// 같은 상황을 앱 화면처럼 보여 주고, 무엇이 잘못됐는지와 다음에 할 일을 같이 준다.
export default function WebViewErrorView({ error, onRetry, onBack }: Props) {
  const { title, body } = describe(error);

  return (
    <View style={[StyleSheet.absoluteFill, styles.container]}>
      <View style={styles.badge}>
        <Text style={styles.badgeMark}>!</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>

      <Pressable onPress={onRetry} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
        <Text style={styles.primaryLabel}>다시 시도</Text>
      </Pressable>

      {onBack ? (
        <Pressable onPress={onBack} hitSlop={8} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
          <Text style={styles.secondaryLabel}>이전 화면으로</Text>
        </Pressable>
      ) : null}

      {/* 문의가 들어왔을 때 원인을 좁힐 수 있도록 원본 코드도 작게 남겨 둔다. */}
      <Text style={styles.detail}>{error.detail}</Text>
    </View>
  );
}

function describe(error: WebViewLoadError) {
  switch (error.kind) {
    case 'offline':
      return {
        title: '인터넷에 연결되어 있지 않아요',
        body: '와이파이나 데이터를 켠 뒤 다시 시도해 주세요.\n저장해 둔 문장은 그대로 남아 있어요.',
      };
    case 'server':
      return {
        title: '지금은 화면을 열 수 없어요',
        body: '서버가 응답하지 않았어요.\n잠시 후 다시 시도해 주세요.',
      };
    default:
      return {
        title: '화면을 불러오지 못했어요',
        body: '다시 시도해도 계속되면 앱을 껐다가 다시 실행해 주세요.',
      };
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: WEBVIEW_BACKGROUND_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 48,
  },
  badge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: WEBVIEW_SURFACE_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  badgeMark: {
    fontSize: 24,
    fontWeight: '800',
    color: WEBVIEW_INK_COLOR,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: WEBVIEW_INK_COLOR,
    textAlign: 'center',
  },
  body: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    color: WEBVIEW_MUTED_COLOR,
  },
  primaryButton: {
    marginTop: 24,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: WEBVIEW_ACCENT_COLOR,
  },
  primaryLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: WEBVIEW_INK_COLOR,
  },
  secondaryButton: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: WEBVIEW_LINE_COLOR,
  },
  secondaryLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: WEBVIEW_INK_COLOR,
  },
  pressed: {
    opacity: 0.6,
  },
  detail: {
    position: 'absolute',
    bottom: 24,
    fontSize: 11,
    color: WEBVIEW_MUTED_COLOR,
    opacity: 0.7,
  },
});
