import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { readSetting, writeSetting } from './db';
import type { AppSettings } from '../bridge/webMessages';

// app_setting 테이블의 키. 웹은 이 이름을 모른다 — 브릿지에는 AppSettings 모양으로만 나간다.
const REMINDER_ID_KEY = 'reminder.notification_id';
const REMINDER_HOUR_KEY = 'reminder.hour';
const REMINDER_MINUTE_KEY = 'reminder.minute';

// 저녁 8시. 하루를 정리하며 오늘 담아둔 문장을 다시 듣기 좋은 시간이고,
// 알림을 처음 켠 사람이 시각을 안 골라도 이상하지 않은 자리다.
const DEFAULT_HOUR = 20;
const DEFAULT_MINUTE = 0;

// Android는 채널이 없으면 알림이 조용히 사라진다. 채널은 하나뿐이라 이름도 용도 그대로 쓴다.
const ANDROID_CHANNEL_ID = 'reminder';

const REMINDER_TITLE = '오늘의 발음';
const REMINDER_BODY = '보관함에 담아둔 문장, 하나만 다시 들어볼까요?';

/** 앱이 떠 있는 동안에도 알림을 배너로 띄운다. 부팅 시 한 번만 부르면 된다. */
export function bootstrapNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: '복습 알림',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

/**
 * 웹에 내려보낼 설정 한 벌. reminderEnabled는 저장해둔 플래그가 아니라 OS에 실제로 걸려 있는
 * 스케줄과 권한에서 되짚어 만든다 — 설정 앱에서 알림을 꺼버린 경우 저장된 플래그는 켜진 채로
 * 남아 있어서, 그대로 믿으면 오지도 않는 알림을 켜졌다고 보여주게 된다.
 */
export async function getAppSettings(): Promise<AppSettings> {
  const scheduledId = readSetting(REMINDER_ID_KEY);
  const enabled = scheduledId !== null && (await isLive(scheduledId));

  // 스케줄이 사라졌거나 권한이 회수됐으면 붙들고 있던 id도 같이 버린다.
  if (scheduledId !== null && !enabled) writeSetting(REMINDER_ID_KEY, '');

  return {
    reminderEnabled: enabled,
    reminderHour: readNumber(REMINDER_HOUR_KEY, DEFAULT_HOUR),
    reminderMinute: readNumber(REMINDER_MINUTE_KEY, DEFAULT_MINUTE),
    appVersion: Constants.expoConfig?.version ?? '—',
  };
}

/**
 * 복습 알림을 걸거나 끈다. 권한이 거부되면 denied: true로 답하고 설정은 꺼진 상태로 남긴다 —
 * 웹이 토글을 되돌리고 기기 설정으로 안내한다.
 */
export async function setReminder(
  enabled: boolean,
  hour: number,
  minute: number
): Promise<{ settings: AppSettings; denied: boolean }> {
  // 시각은 알림을 못 걸더라도 기억해둔다. 권한을 허용하고 다시 켤 때 고른 시각이 남아 있어야 한다.
  writeSetting(REMINDER_HOUR_KEY, String(clampHour(hour)));
  writeSetting(REMINDER_MINUTE_KEY, String(clampMinute(minute)));

  // 시각만 바꾸는 경우에도 기존 알림을 반드시 먼저 지운다 — 안 지우면 예전 시각의 알림이
  // 그대로 살아남아 하루에 두 번 온다.
  await cancelReminder();

  if (!enabled) {
    return { settings: await getAppSettings(), denied: false };
  }

  if (!(await ensurePermission())) {
    return { settings: await getAppSettings(), denied: true };
  }

  const identifier = await Notifications.scheduleNotificationAsync({
    content: { title: REMINDER_TITLE, body: REMINDER_BODY },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: clampHour(hour),
      minute: clampMinute(minute),
      channelId: ANDROID_CHANNEL_ID,
    },
  });
  writeSetting(REMINDER_ID_KEY, identifier);

  return { settings: await getAppSettings(), denied: false };
}

async function cancelReminder() {
  const identifier = readSetting(REMINDER_ID_KEY);
  if (!identifier) return;

  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch {
    // 이미 사라진 스케줄이면 취소가 던진다. 어차피 지우려던 참이다.
  }
  writeSetting(REMINDER_ID_KEY, '');
}

/** OS에 알림이 실제로 걸려 있고 권한도 살아 있는지. 둘 중 하나만 빠져도 알림은 오지 않는다. */
async function isLive(identifier: string): Promise<boolean> {
  if (identifier.length === 0) return false;

  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return false;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.some((notification) => notification.identifier === identifier);
}

/** 이미 허용돼 있으면 묻지 않는다. 거부된 뒤 다시 부르면 OS가 창을 띄우지 않고 바로 거부로 답한다. */
async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

function readNumber(key: string, fallback: number): number {
  const raw = readSetting(key);
  if (raw === null) return fallback;

  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function clampHour(hour: number): number {
  return Math.min(23, Math.max(0, Math.trunc(hour)));
}

function clampMinute(minute: number): number {
  return Math.min(59, Math.max(0, Math.trunc(minute)));
}
