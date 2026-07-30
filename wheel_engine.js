// ГЛОБАЛЬНЫЙ ОБЪЕКТ ДЛЯ СВЯЗИ С TELEGRAM API
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

// НАСТРОЙКИ СВЯЗИ С СЕРВЕРОМ
const SERVER_URL = "https://onrender.com";
const MY_ADMIN_ID = 6682822292;
let userId = MY_ADMIN_ID;
let username = "Guest_Player";

// ПОЛНЫЕ МАССИВЫ КОЛЕСА И МНОЖИТЕЛЕЙ (ЖЕСТКАЯ ФИКСАЦИЯ БЕЗ ПРОПУСКОВ)
const WHEEL_NUMBERS =;
const multiplierOptions =;

if (tg) {
    try {
        // Инициализируем Mini App и разворачиваем на весь экран
        tg.ready();
        tg.expand();

        // ВКЛЮЧАЕМ СИСТЕМНУЮ ЗАЩИТУ: Игрок не закроет игру случайным свайпом вниз во время ставки
        if (typeof tg.enableClosingConfirmation === 'function') {
            tg.enableClosingConfirmation();
        }

        // АВТОМАТИЧЕСКАЯ НАСТРОЙКА ЦВЕТОВОЙ ПАЛИТРЫ ПОД ТЕМУ ТЕЛЕГРАМА ИГРОКА
        if (tg.themeParams) {
            document.documentElement.style.setProperty('--bg-main', tg.themeParams.bg_color || '#0c0f1d');
            document.documentElement.style.setProperty('--bg-card', tg.themeParams.secondary_bg_color || '#151a30');
            document.documentElement.style.setProperty('--text-main', tg.themeParams.text_color || '#ffffff');
            document.documentElement.style.setProperty('--text-muted', tg.themeParams.hint_color || '#64748b');
        }

        // СЧИТЫВАЕМ РЕАЛЬНЫЕ ДАННЫЕ АВТОРИЗАЦИИ ИЗ СДК ТЕЛЕГРАМА
        if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
            userId = tg.initDataUnsafe.user.id;
            username = tg.initDataUnsafe.user.username || tg.initDataUnsafe.user.first_name || "User";
        }

        // НАСТРОЙКА НАТИВНОЙ КНОПКИ ТЕЛЕФОНА "НАЗАД"
        if (tg.BackButton) {
            tg.BackButton.show();
            tg.BackButton.offClick(); // Очищаем старые дубликаты кликов
            tg.BackButton.onClick(() => {
                location.href = "index.html"; // Мягкий возврат на главное меню лобби
            });
        }
    } catch (error) {
        console.error("Ошибка активации Telegram WebApp API:", error);
    }
}
buildNumbersKeyboardLayout();

function generateSecureRoundData() {
    roundWinningNumber = Math.floor(Math.random() * 37);
    let availableNumbers = Array.from({length: 37}, (_, i) => i);
    roundLuckyNumbersList = [];
    for (let i = 0; i < 3; i++) {
        let randomIndex = Math.floor(Math.random() * availableNumbers.length);
        let selectedNum = availableNumbers.splice(randomIndex, 1)[0];
        let selectedMult = multiplierOptions[Math.floor(Math.random() * multiplierOptions.length)];
        roundLuckyNumbersList.push({ num: selectedNum, mult: selectedMult });
    }
    roundSecretSalt = Math.random().toString(36).substring(2, 15);
    let luckyString = roundLuckyNumbersList.map(item => `${item.num}:x${item.mult}`).join(',');
    let rawRoundString = `${roundSecretSalt}|${roundWinningNumber}|lucky:[${luckyString}]`;
    let calculatedSha256Hash = CryptoJS.SHA256(rawRoundString).toString();
    const hashEl = document.getElementById('wp-crypto-hash-sha256');
    if (hashEl) hashEl.innerText = calculatedSha256Hash;
    let md5Block = document.getElementById('wp-crypto-md5-string');
    if (md5Block) { md5Block.style.display = "none"; md5Block.innerText = `String verify: ${rawRoundString}`; }
}

function updateLuckyNumbersUI() {
    for (let i = 0; i < 3; i++) {
        let data = roundLuckyNumbersList[i];
        if (!data) continue;
        let numElement = document.getElementById(`lucky-num-${i+1}`);
        let multElement = document.getElementById(`lucky-mult-${i+1}`);
        if (numElement && multElement) {
            numElement.innerText = data.num; multElement.innerText = `${data.mult}X`;
            let box = numElement.parentElement;
            if (box) {
                if (data.mult >= 300) { box.style.borderColor = "var(--color-gold)"; multElement.className = "wp-bonus-multiplier wp-m100"; }
                else if (data.mult >= 100) { box.style.borderColor = "var(--color-purple)"; multElement.className = "wp-bonus-multiplier wp-m100"; }
                else { box.style.borderColor = "var(--color-blue)"; multElement.className = "wp-bonus-multiplier wp-m50"; }
            }
        }
    }
}
function refreshUI() {
    const balDisplay = document.getElementById('wp-balance-display');
    const betDisplay = document.getElementById('wp-player-total-bet');
    if (balDisplay) balDisplay.innerText = playerBalance;
    if (betDisplay) betDisplay.innerText = `${totalRoundBetSum} W`;
    localStorage.setItem('wog_secure_balance', playerBalance);
}

function modifyBetSize(action) {
    if (isGameSessionActive && secondsRemaining <= 0) return;
    let field = document.getElementById('wp-bet-field');
    if (!field) return;
    let current = parseInt(field.value) || 100;
    if (action === 'x2') current = Math.min(playerBalance, current * 2);
    if (action === '/2') current = Math.max(10, Math.floor(current / 2));
    field.value = current; activeBetAmount = current;
}

function addChipValue(amount) {
    if (isGameSessionActive && secondsRemaining <= 0) return;
    let field = document.getElementById('wp-bet-field');
    if (!field) return;
    let current = parseInt(field.value) || 0;
    let targetAmount = current + amount;
    if (targetAmount > playerBalance) targetAmount = playerBalance;
    field.value = targetAmount; activeBetAmount = targetAmount;
}

function toggleKeyboardLayout(layoutName) {
    const mainView = document.getElementById('wp-main-table-view');
    const numKeysView = document.getElementById('wp-numbers-keyboard-view');
    if (!mainView || !numKeysView) return;
    if (layoutName === 'numbers') { mainView.style.display = "none"; numKeysView.style.display = "grid"; }
    else { mainView.style.display = "flex"; numKeysView.style.display = "none"; }
}

function placeBetOnCell(cellId) {
    if (isGameSessionActive && secondsRemaining <= 0) return;
    const inputField = document.getElementById('wp-bet-field');
    if (!inputField) return;
    activeBetAmount = parseInt(inputField.value) || 0;
    if (activeBetAmount <= 0 || playerBalance < activeBetAmount) return;
    if (!currentRoundBets[cellId]) { currentRoundBets[cellId] = 0; }
    currentRoundBets[cellId] += activeBetAmount;
    playerBalance -= activeBetAmount; totalRoundBetSum += activeBetAmount;
    const targetBtn = document.getElementById(`cell-${cellId}`);
    if (targetBtn) { targetBtn.classList.add('wp-bet-active-glow'); targetBtn.classList.add('has-bets-placed'); }
    refreshUI();
    if (!isGameSessionActive) { startRoundCountdownTimer(); }
    if (tg && typeof tg.HapticFeedback === 'object') { tg.HapticFeedback.impactOccurred('light'); }
}
function startRoundCountdownTimer() {
    isGameSessionActive = true; secondsRemaining = 20;
    const emojiElement = document.getElementById('wp-center-emoji');
    const textElement = document.getElementById('wp-center-text');
    if (emojiElement) emojiElement.innerText = "⏳";
    if (textElement) textElement.innerText = `${secondsRemaining} сек`;
    countdownTimerInterval = setInterval(() => {
        secondsRemaining--;
        if (secondsRemaining > 0) {
            if (textElement) textElement.innerText = `${secondsRemaining} сек`;
        } else {
            clearInterval(countdownTimerInterval);
            if (emojiElement) emojiElement.innerText = "🌀";
            if (textElement) textElement.innerText = "Крутим!";
            const field = document.getElementById('wp-bet-field');
            if (field) field.disabled = true;
            initiateWheelSpinAnimation();
        }
    }, 1000);
}

const canvas = document.getElementById('wheel-render-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
let currentWheelRotationAngle = 0; let ballCurrentPhysicsAngle = 0;

function drawPremiumRouletteWheel(wheelAngle, ballAngle, displayBall = false) {
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cx = canvas.width / 2; const cy = canvas.height / 2;
    const outerRadius = canvas.width / 2 - 10;
    const totalSectors = WHEEL_NUMBERS.length;
    const arcLengthPerSector = (2 * Math.PI) / totalSectors;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(wheelAngle);
    for (let i = 0; i < totalSectors; i++) {
        const currentSectorNumber = WHEEL_NUMBERS[i];
        const startAngle = i * arcLengthPerSector - Math.PI / 2 - arcLengthPerSector / 2;
        const endAngle = startAngle + arcLengthPerSector;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, outerRadius, startAngle, endAngle); ctx.closePath();
        if (currentSectorNumber === 0) ctx.fillStyle = "#10b981";
        else if (NUMBER_COLORS[currentSectorNumber] === "red") ctx.fillStyle = "#e52e4d";
        else ctx.fillStyle = "#151a30";
        ctx.fill(); ctx.strokeStyle = "#29315c"; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.save(); ctx.rotate(startAngle + arcLengthPerSector / 2 + Math.PI / 2);
        ctx.fillStyle = "#ffffff"; ctx.font = "bold 15px sans-serif"; ctx.textAlign = "center";
        ctx.fillText(currentSectorNumber, 0, -outerRadius + 30); ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, outerRadius - 45, 0, 2 * Math.PI); ctx.fillStyle = "#0c0f1d";
    ctx.fill(); ctx.strokeStyle = "#29315c"; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
}
// ОТРИСОВКА ФИЗИКИ БЕГУЩЕГО БЕЛОГО ШАРИКА И АНИМАЦИЯ ВРАЩЕНИЯКОЛЕСА
function updateWheelViewWithBall(wheelAngle, ballAngle) {
    drawPremiumRouletteWheel(wheelAngle, ballAngle, true);
    if (!canvas || !ctx) return;
    const cx = canvas.width / 2; const cy = canvas.height / 2;
    const outerRadius = canvas.width / 2 - 10;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ballAngle);
    ctx.beginPath(); ctx.arc(0, -outerRadius + 22, 9, 0, 2 * Math.PI);
    ctx.fillStyle = "#ffffff"; ctx.fill(); ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 10; ctx.restore();
}

function initiateWheelSpinAnimation() {
    const targetSectorIndex = WHEEL_NUMBERS.indexOf(roundWinningNumber);
    const anglePerSector = (2 * Math.PI) / WHEEL_NUMBERS.length;
    const finalWheelRotationAngle = (2 * Math.PI * 4) + (Math.random() * Math.PI * 2);
    const finalBallRotationAngle = -(2 * Math.PI * 5) - (targetSectorIndex * anglePerSector);
    let currentAnimationFrameTime = 0; const totalDurationFrames = 240;
    
    function processPhysicsFrame() {
        currentAnimationFrameTime++;
        if (currentAnimationFrameTime <= totalDurationFrames) {
            const cubicProgress = 1 - Math.pow(1 - (currentAnimationFrameTime / totalDurationFrames), 3);
            currentWheelRotationAngle = finalWheelRotationAngle * cubicProgress;
            ballCurrentPhysicsAngle = finalBallRotationAngle * cubicProgress;
            updateWheelViewWithBall(currentWheelRotationAngle, ballCurrentPhysicsAngle);
            requestAnimationFrame(processPhysicsFrame);
        } else {
            currentWheelRotationAngle = finalWheelRotationAngle % (2 * Math.PI);
            ballCurrentPhysicsAngle = finalBallRotationAngle;
            updateWheelViewWithBall(currentWheelRotationAngle, ballCurrentPhysicsAngle);
            finalizeRoundResultsAndPayouts();
        }
    }
    requestAnimationFrame(processPhysicsFrame);
}

function finalizeRoundResultsAndPayouts() {
    let totalAmountWonThisRound = 0; const winningColor = NUMBER_COLORS[roundWinningNumber];
    let luckyMultiplierBonus = 1; let isLuckyHit = false;
    roundLuckyNumbersList.forEach(bonus => { if (Number(bonus.num) === roundWinningNumber) { luckyMultiplierBonus = bonus.mult; isLuckyHit = true; } });
    for (let cellId in currentRoundBets) {
        let betValue = currentRoundBets[cellId]; if (betValue <= 0) continue;
        if (cellId === 'red' && winningColor === 'red') totalAmountWonThisRound += betValue * 2;
        else if (cellId === 'black' && winningColor === 'black') totalAmountWonThisRound += betValue * 2;
        else if (cellId === 'zero' && roundWinningNumber === 0) totalAmountWonThisRound += betValue * 30;
        else if (cellId === 'even' && roundWinningNumber !== 0 && roundWinningNumber % 2 === 0) totalAmountWonThisRound += betValue * 2;
        else if (cellId === 'odd' && roundWinningNumber % 2 !== 0) totalAmountWonThisRound += betValue * 2;
        else if (cellId === 'low' && roundWinningNumber >= 1 && roundWinningNumber <= 18) totalAmountWonThisRound += betValue * 2;
        else if (cellId === 'high' && roundWinningNumber >= 19 && roundWinningNumber <= 36) totalAmountWonThisRound += betValue * 2;
        else if (cellId === 'doz1' && roundWinningNumber >= 1 && roundWinningNumber <= 12) totalAmountWonThisRound += betValue * 3;
        else if (cellId === 'doz2' && roundWinningNumber >= 13 && roundWinningNumber <= 24) totalAmountWonThisRound += betValue * 3;
        else if (cellId === 'doz3' && roundWinningNumber >= 25 && roundWinningNumber <= 36) totalAmountWonThisRound += betValue * 3;
        else if (cellId.startsWith('num')) {
            let parsed = parseInt(cellId.replace('num', ''));
            if (parsed === roundWinningNumber) { if (isLuckyHit) totalAmountWonThisRound += betValue * luckyMultiplierBonus; else totalAmountWonThisRound += betValue * 30; }
        }
    }
    playerBalance += totalAmountWonThisRound;
    displayRoundWinnerModalPopup(totalAmountWonThisRound, isLuckyHit, luckyMultiplierBonus);
}
function displayRoundWinnerModalPopup(amountWon, isLuckyHit, luckyBonus) {
    const modalNum = document.getElementById('modal-winning-number');
    if (modalNum) {
        modalNum.innerText = roundWinningNumber;
        const numColor = NUMBER_COLORS[roundWinningNumber];
        if (roundWinningNumber === 0) modalNum.style.color = "var(--color-green)";
        else if (numColor === 'red') modalNum.style.color = "var(--color-red)";
        else modalNum.style.color = "#ffffff";
    }
    const badge = document.getElementById('modal-winning-multiplier-badge');
    if (badge) {
        if (isLuckyHit) { badge.innerText = `LUCKY BONUS x${luckyBonus}!`; badge.style.background = "rgba(245, 158, 11, 0.2)"; badge.style.borderColor = "var(--color-gold)"; badge.style.color = "#fef08a"; }
        else { badge.innerText = `x30`; badge.style.background = "rgba(16, 185, 129, 0.2)"; badge.style.borderColor = "var(--color-green)"; badge.style.color = "#a7f3d0"; }
    }
    const statusText = document.getElementById('modal-player-win-status-text');
    if (statusText) {
        if (amountWon > 0) { statusText.innerHTML = `🎉 Выиграли:<br><span style="color: var(--color-gold); font-size: 20px; font-weight: 900;">+ ${amountWon} W</span>`; if (tg && typeof tg.HapticFeedback === 'object') tg.HapticFeedback.notificationOccurred('success'); }
        else { statusText.innerText = "В этот раз не повезло."; }
    }
    const md5Str = document.getElementById('wp-crypto-md5-string'); if (md5Str) md5Str.style.display = "block";
    const modalPopup = document.getElementById('wp-result-modal-popup'); if (modalPopup) modalPopup.style.display = "flex";
    const historyLine = document.getElementById('wp-history-line');
    if (historyLine) {
        const numColor = NUMBER_COLORS[roundWinningNumber]; const newCircle = document.createElement('div');
        newCircle.className = `hist-circle ${numColor}`; newCircle.innerText = roundWinningNumber;
        historyLine.insertBefore(newCircle, historyLine.firstChild);
        if (historyLine.children.length > 10) historyLine.removeChild(historyLine.lastChild);
    }
}

function closeResultModalPopup() {
    const modalPopup = document.getElementById('wp-result-modal-popup'); if (modalPopup) modalPopup.style.display = "none";
    currentRoundBets = {}; totalRoundBetSum = 0;
    document.querySelectorAll('.wp-bet-trigger-btn').forEach(btn => { btn.classList.remove('wp-bet-active-glow'); btn.classList.remove('has-bets-placed'); });
    const field = document.getElementById('wp-bet-field'); if (field) field.disabled = false;
    drawPremiumRouletteWheel(0, 0, false); isGameSessionActive = false;
    generateSecureRoundData(); updateLuckyNumbersUI(); refreshUI();
}

// ПЕРВИЧНЫЙ ЗАПУСК СИСТЕМЫ И ИНИЦИАЛИЗАЦИЯ ИНТЕРФЕЙСА ПРИ ОТКРЫТИИ СТРАНИЦЫ
drawPremiumRouletteWheel(0, 0, false);
generateSecureRoundData();
updateLuckyNumbersUI();
refreshUI();
