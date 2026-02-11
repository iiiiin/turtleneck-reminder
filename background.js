// 상수 정의
const ALARM_NAME = 'neckPostureCheck';
const ALARM_INTERVAL_MINUTES = 1;

// 기본 설정
const DEFAULT_TIMES = {
  danger: 50
};
const MIN_DANGER_MINUTES = 1;
const MAX_DANGER_MINUTES = 180;
const DEFAULT_REMINDER_TYPE = 'turtle';
const ICONS = {
  turtle: {
    good: 'images/neck_no.png',
    danger: 'images/neck_long.png'
  },
  giraffe: {
    good: 'images/giraffe_no.png',
    danger: 'images/giraffe_long.png'
  }
};

// 확장 프로그램 설치 또는 업데이트 시
chrome.runtime.onInstalled.addListener(async () => {
  await initializeTimer();
});

// 브라우저 시작 시
chrome.runtime.onStartup.addListener(async () => {
  await initializeTimer();
});

// 서비스 워커 활성화 시 (중요!)
// 서비스 워커가 깨어날 때마다 알람이 설정되어 있는지 확인
(async () => {
  const alarm = await chrome.alarms.get(ALARM_NAME);
  if (!alarm) {
    await startAlarm();
  }
  // 즉시 아이콘 상태 업데이트
  await checkAndUpdateIcon();
})();

function normalizeDangerMinutes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TIMES.danger;
  }
  const intValue = Math.floor(parsed);
  if (intValue < MIN_DANGER_MINUTES) {
    return MIN_DANGER_MINUTES;
  }
  if (intValue > MAX_DANGER_MINUTES) {
    return MAX_DANGER_MINUTES;
  }
  return intValue;
}

// 타이머 초기화
async function initializeTimer() {
  const result = await chrome.storage.local.get(['startTime', 'notifiedDanger', 'times', 'notificationEnabled', 'reminderType']);

  if (!result.startTime) {
    await chrome.storage.local.set({
      startTime: Date.now(),
      notifiedDanger: false
    });
  }

  const normalizedDanger = normalizeDangerMinutes(result.times && result.times.danger);
  if (!result.times || normalizedDanger !== Number(result.times.danger)) {
    await chrome.storage.local.set({ times: { danger: normalizedDanger } });
  }

  // 알림 기본값: 켜짐
  if (result.notificationEnabled === undefined) {
    await chrome.storage.local.set({ notificationEnabled: true });
  }

  if (!result.reminderType) {
    await chrome.storage.local.set({ reminderType: DEFAULT_REMINDER_TYPE });
  }

  await startAlarm();
  await checkAndUpdateIcon();
}

// 알람 시작
async function startAlarm() {
  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: ALARM_INTERVAL_MINUTES,
    periodInMinutes: ALARM_INTERVAL_MINUTES
  });
}

// 알람 이벤트 리스너
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await checkAndUpdateIcon();
  }
});

// 경과 시간 계산 및 아이콘 업데이트
async function checkAndUpdateIcon() {
  const result = await chrome.storage.local.get(['startTime', 'notifiedDanger', 'times', 'notificationEnabled', 'reminderType']);
  const startTime = result.startTime;
  const dangerTime = normalizeDangerMinutes(result.times && result.times.danger);
  const notificationEnabled = result.notificationEnabled === true;
  const reminderType = result.reminderType || DEFAULT_REMINDER_TYPE;

  if (!startTime) {
    return;
  }

  const elapsedMinutes = Math.floor((Date.now() - startTime) / 1000 / 60);

  let iconPath;

  if (elapsedMinutes >= dangerTime) {
    iconPath = getIconPath(reminderType, 'danger');

    // 위험 알림 (한 번만)
    if (notificationEnabled && !result.notifiedDanger) {
      await sendDangerNotification(reminderType);
      await chrome.storage.local.set({ notifiedDanger: true });
    }
  } else {
    iconPath = getIconPath(reminderType, 'good');
  }

  try {
    await chrome.action.setIcon({
      path: {
        "16": iconPath,
        "48": iconPath,
        "128": iconPath
      }
    });
  } catch (e) {
    console.error('Icon update failed:', e);
  }
}

// 알림 전송
async function sendDangerNotification(reminderType) {
  const msg = {
    title: chrome.i18n.getMessage('danger_title'),
    message: chrome.i18n.getMessage('danger_message'),
    icon: getIconPath(reminderType, 'danger')
  };

  chrome.notifications.create({
    type: 'basic',
    iconUrl: msg.icon,
    title: msg.title,
    message: msg.message,
    priority: 2
  });
}

// 메시지 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'resetTimer') {
    resetTimer().then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === 'getStatus') {
    getStatus().then((data) => sendResponse(data));
    return true;
  }

  if (message.action === 'updateTimes') {
    updateTimes(message.times).then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === 'getTimes') {
    getTimes().then((data) => sendResponse(data));
    return true;
  }

  if (message.action === 'setNotificationEnabled') {
    setNotificationEnabled(message.enabled).then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === 'getNotificationEnabled') {
    getNotificationEnabled().then((data) => sendResponse({ enabled: data }));
    return true;
  }

  if (message.action === 'setReminderType') {
    setReminderType(message.reminderType).then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === 'getReminderType') {
    getReminderType().then((data) => sendResponse({ reminderType: data }));
    return true;
  }
});

// 타이머 리셋
async function resetTimer() {
  await chrome.storage.local.set({
    startTime: Date.now(),
    notifiedDanger: false
  });
  await checkAndUpdateIcon();
}

// 현재 상태 반환
async function getStatus() {
  const result = await chrome.storage.local.get(['startTime', 'times', 'reminderType']);
  const startTime = result.startTime || Date.now();
  const dangerTime = normalizeDangerMinutes(result.times && result.times.danger);
  const reminderType = result.reminderType || DEFAULT_REMINDER_TYPE;
  const elapsedMinutes = Math.floor((Date.now() - startTime) / 1000 / 60);

  return { elapsedMinutes, times: { danger: dangerTime }, reminderType };
}

// 시간 설정 업데이트
async function updateTimes(times) {
  const normalizedDanger = normalizeDangerMinutes(times && times.danger);

  // 알림 플래그 초기화 (시간 변경 시)
  await chrome.storage.local.set({
    times: { danger: normalizedDanger },
    notifiedDanger: false
  });
  await checkAndUpdateIcon();
}

// 시간 설정 반환
async function getTimes() {
  const result = await chrome.storage.local.get(['times']);
  return { danger: normalizeDangerMinutes(result.times && result.times.danger) };
}

// 알림 설정
async function setNotificationEnabled(enabled) {
  await chrome.storage.local.set({ notificationEnabled: enabled === true });
}

// 알림 설정 반환
async function getNotificationEnabled() {
  const result = await chrome.storage.local.get(['notificationEnabled']);
  return result.notificationEnabled === true;
}

// 알리미 유형 설정
async function setReminderType(reminderType) {
  const type = reminderType === 'giraffe' ? 'giraffe' : DEFAULT_REMINDER_TYPE;
  await chrome.storage.local.set({ reminderType: type });
  await checkAndUpdateIcon();
}

// 알리미 유형 반환
async function getReminderType() {
  const result = await chrome.storage.local.get(['reminderType']);
  return result.reminderType || DEFAULT_REMINDER_TYPE;
}

function getIconPath(reminderType, level) {
  const type = reminderType === 'giraffe' ? 'giraffe' : DEFAULT_REMINDER_TYPE;
  return ICONS[type][level] || ICONS[DEFAULT_REMINDER_TYPE].good;
}
