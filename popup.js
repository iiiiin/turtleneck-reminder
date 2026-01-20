// DOM 요소
const statusIcon = document.getElementById('statusIcon');
const elapsedTimeEl = document.getElementById('elapsedTime');
const statusText = document.getElementById('statusText');
const resetBtn = document.getElementById('resetBtn');
const warningTimeInput = document.getElementById('warningTime');
const dangerTimeInput = document.getElementById('dangerTime');
const notificationToggle = document.getElementById('notificationToggle');
const saveBtn = document.getElementById('saveBtn');

// 상태 메시지
const STATUS_MESSAGES = {
    good: '좋은 자세예요!',
    warning: '자세를 점검해주세요',
    danger: '지금 바로 스트레칭하세요!'
};

// 팝업 열릴 때
document.addEventListener('DOMContentLoaded', async () => {
    await updateStatus();
    await loadSettings();
});

// 상태 업데이트
async function updateStatus() {
    const response = await chrome.runtime.sendMessage({ action: 'getStatus' });
    const { elapsedMinutes, times } = response;

    elapsedTimeEl.textContent = `${elapsedMinutes}분 경과`;

    let iconPath, message, stateClass;

    if (elapsedMinutes >= times.danger) {
        iconPath = 'images/necklong.png';
        message = STATUS_MESSAGES.danger;
        stateClass = 'danger';
    } else if (elapsedMinutes >= times.warning) {
        iconPath = 'images/neckshort.png';
        message = STATUS_MESSAGES.warning;
        stateClass = 'warning';
    } else {
        iconPath = 'images/neckno.png';
        message = STATUS_MESSAGES.good;
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

// 저장 버튼
saveBtn.addEventListener('click', async () => {
    const warning = parseInt(warningTimeInput.value) || 20;
    const danger = parseInt(dangerTimeInput.value) || 50;

    if (warning >= danger) {
        alert('첫 번째 알림 시간은 두 번째보다 작아야 합니다.');
        return;
    }

    await chrome.runtime.sendMessage({
        action: 'updateTimes',
        times: { warning, danger }
    });

    saveBtn.textContent = '저장됨';
    saveBtn.classList.add('saved');

    setTimeout(() => {
        saveBtn.textContent = '저장';
        saveBtn.classList.remove('saved');
    }, 1500);

    await updateStatus();
});
