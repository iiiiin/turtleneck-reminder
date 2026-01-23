// DOM 요소
const statusIcon = document.getElementById('statusIcon');
const elapsedTimeEl = document.getElementById('elapsedTime');
const statusText = document.getElementById('statusText');
const resetBtn = document.getElementById('resetBtn');
const warningTimeInput = document.getElementById('warningTime');
const dangerTimeInput = document.getElementById('dangerTime');
const notificationToggle = document.getElementById('notificationToggle');
const reminderTypeSelect = document.getElementById('reminderType');
const saveBtn = document.getElementById('saveBtn');
const ICONS = {
    turtle: {
        good: 'images/neck_no.png',
        warning: 'images/neck_short.png',
        danger: 'images/neck_long.png'
    },
    giraffe: {
        good: 'images/giraffe_no.png',
        warning: 'images/giraffe_short.png',
        danger: 'images/giraffe_long.png'
    }
};

// 팝업 열릴 때
document.addEventListener('DOMContentLoaded', async () => {
    localizeUI();
    await updateStatus();
    await loadSettings();
});

// 상태 업데이트
async function updateStatus() {
    const response = await chrome.runtime.sendMessage({ action: 'getStatus' });
    const { elapsedMinutes, times, reminderType } = response;

    elapsedTimeEl.textContent = chrome.i18n.getMessage('elapsed_time', [elapsedMinutes.toString()]);

    let iconPath, message, stateClass;

    if (elapsedMinutes >= times.danger) {
        iconPath = getIconPath(reminderType, 'danger');
        message = chrome.i18n.getMessage('status_danger');
        stateClass = 'danger';
    } else if (elapsedMinutes >= times.warning) {
        iconPath = getIconPath(reminderType, 'warning');
        message = chrome.i18n.getMessage('status_warning');
        stateClass = 'warning';
    } else {
        iconPath = getIconPath(reminderType, 'good');
        message = chrome.i18n.getMessage('status_good');
        stateClass = 'good';
    }

    statusIcon.src = iconPath;
    statusText.textContent = message;

    document.body.classList.remove('good', 'warning', 'danger');
    document.body.classList.add(stateClass);
}

// 설정 로드
async function loadSettings() {
    const times = await chrome.runtime.sendMessage({ action: 'getTimes' });
    warningTimeInput.value = times.warning;
    dangerTimeInput.value = times.danger;

    const response = await chrome.runtime.sendMessage({ action: 'getNotificationEnabled' });
    // response는 { enabled: boolean } 형태
    notificationToggle.checked = response.enabled === true;

    const reminderResponse = await chrome.runtime.sendMessage({ action: 'getReminderType' });
    reminderTypeSelect.value = reminderResponse.reminderType || 'turtle';
}

// 리셋 버튼
resetBtn.addEventListener('click', async () => {
    resetBtn.classList.add('clicked');
    await chrome.runtime.sendMessage({ action: 'resetTimer' });
    await updateStatus();
    setTimeout(() => resetBtn.classList.remove('clicked'), 200);
});

// 알림 토글 변경 시 즉시 저장
notificationToggle.addEventListener('change', async () => {
    await chrome.runtime.sendMessage({
        action: 'setNotificationEnabled',
        enabled: notificationToggle.checked
    });
});

// 알리미 선택 변경 시 즉시 저장
reminderTypeSelect.addEventListener('change', async () => {
    await chrome.runtime.sendMessage({
        action: 'setReminderType',
        reminderType: reminderTypeSelect.value
    });
    await updateStatus();
});

// 저장 버튼
saveBtn.addEventListener('click', async () => {
    const warning = parseInt(warningTimeInput.value) || 20;
    const danger = parseInt(dangerTimeInput.value) || 50;

    if (warning >= danger) {
        alert(chrome.i18n.getMessage('alert_warning_before_danger'));
        return;
    }

    await chrome.runtime.sendMessage({
        action: 'updateTimes',
        times: { warning, danger }
    });

    saveBtn.textContent = chrome.i18n.getMessage('save_done');
    saveBtn.classList.add('saved');

    setTimeout(() => {
        saveBtn.textContent = chrome.i18n.getMessage('save_button');
        saveBtn.classList.remove('saved');
    }, 1500);

    await updateStatus();
});

function localizeUI() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        const msg = chrome.i18n.getMessage(key);
        if (msg) el.textContent = msg;
    });
}

function getIconPath(reminderType, level) {
    const type = reminderType === 'giraffe' ? 'giraffe' : 'turtle';
    return (ICONS[type] && ICONS[type][level]) || ICONS.turtle.good;
}
