// ============================================================================
// WOG PREMIUM CASINO ENGINE: WHEEL APP (PART 1 OF 3)
// INITIALIZATION, MATRICES & CORE LAYOUT GENERATOR
// ============================================================================

const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

const WogLogger = {
    info: (msg, data = "") => console.log(`[WOG-INFO] [${new Date().toISOString()}] ${msg}`, data),
    error: (msg, err = "") => console.error(`[WOG-ERROR] [${new Date().toISOString()}] ${msg}`, err),
    warn: (msg, data = "") => console.warn(`[WOG-WARN] [${new Date().toISOString()}] ${msg}`, data)
};

WogLogger.info("Инициализация монолитного игрового движка Wheel+...");

if (tg) {
    try {
        tg.expand();
        tg.ready();
        if (tg.BackButton) {
            tg.BackButton.show();
            tg.BackButton.offClick();
            tg.BackButton.onClick(() => { location.href = "index.html"; });
        }
        if (typeof tg.enableClosingConfirmation === 'function') {
            tg.enableClosingConfirmation();
        }
    } catch (e) {
        WogLogger.error("Сбой инициализации Telegram SDK:", e);
    }
}

const SERVER_URL = "https://onrender.com";
const MY_ADMIN_ID = 6682822292;
let userId = MY_ADMIN_ID;
let username = "Guest_Player";

if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    userId = tg.initDataUnsafe.user.id;
    username = tg.initDataUnsafe.user.username || tg.initDataUnsafe.user.first_name || "User";
}

const WHEEL_NUMBERS = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
    5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

const MULTIPLIER_OPTIONS = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500];

const NUMBER_COLORS = {
    0: "green",  1: "red",    2: "black",  3: "red",    4: "black",  5: "red",
    6: "black",  7: "red",    8: "black",  9: "red",    10: "black", 11: "black",
    12: "red",   13: "black", 14: "red",   15: "black", 16: "red",   17: "black",
    18: "red",   19: "red",   20: "black", 21: "red",   22: "black", 23: "red",
    24: "black", 25: "red",   26: "black", 27: "red",   28: "black", 29: "black",
    30: "red",   31: "black", 32: "red",   33: "black", 34: "red",   35: "black", 36: "red"
};

let playerBalance = parseInt(localStorage.getItem('wog_secure_balance')) || 100000;
let activeBetAmount = 100;
let currentRoundBets = {};
let totalRoundBetSum = 0;
let isGameSessionActive = false;
let countdownTimerInterval = null;
let secondsRemaining = 20;
let roundSecretSalt = "";
let roundWinningNumber = 0;
let roundLuckyNumbersList = [];

function buildNumbersKeyboardLayout() {
    const container = document.getElementById('wp-num-keys-generator-box');
    if (!container) return;
    container.innerHTML = "";
    
    const zeroBtn = document.createElement('button');
    zeroBtn.className = "wp-bet-trigger-btn wp-btn-green";
    zeroBtn.id = "cell-num0";
    zeroBtn.innerHTML = `0 <span class="wp-badge-x">x30</span>`;
    zeroBtn.onclick = () => placeBetOnCell('num0');
    container.appendChild(zeroBtn);
    
    for (let i = 1; i <= 36; i++) {
        const btn = document.createElement('button');
        const btnColorClass = NUMBER_COLORS[i] === 'red' ? 'wp-btn-red' : 'wp-btn-black';
        btn.className = `wp-bet-trigger-btn ${btnColorClass}`;
        btn.id = `cell-num${i}`;
        btn.innerHTML = `${i} <span class="wp-badge-x">x30</span>`;
        btn.onclick = () => placeBetOnCell(`num${i}`);
        container.appendChild(btn);
    }
}
buildNumbersKeyboardLayout();
// ============================================================================
// WOG PREMIUM CASINO ENGINE: WHEEL APP (PART 2 OF 3)
// BET CONTROLLER, PROVABLY FAIR ENGINE & INTENSE SLOTS ANIMATION
// ============================================================================

// Функция форматирования чисел по стандарту казино (K, M, B, T)
function formatCasinoValue(num) {
    if (num >= 1.0e+12) return (num / 1.0e+12).toFixed(1).replace(/\.0$/, '') + 'T';
    if (num >= 1.0e+9) return (num / 1.0e+9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (num >= 1.0e+6) return (num / 1.0e+6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1.0e+3) return (num / 1.0e+3).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
}


function refreshUI() {
    const balDisplay = document.getElementById('wp-balance-display');
    const betDisplay = document.getElementById('wp-player-total-bet');
    if (balDisplay) balDisplay.innerText = playerBalance;
    if (betDisplay) betDisplay.innerText = `${totalRoundBetSum} W`;
    
    // Сохраняем локально, но в персональную ячейку конкретного Telegram ID
    localStorage.setItem(`wog_balance_${userId}`, playerBalance);
    
    // Синхронизируем с Python-сервером
    fetch(`${SERVER_URL}/update-balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, amount: playerBalance })
    })
    .then(res => res.json())
    .catch(err => console.log("Сервер занят, баланс сохранен локально"));
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
    if (layoutName === 'numbers') {
        mainView.style.display = "none";
        numKeysView.style.display = "grid";
    } else {
        mainView.style.display = "flex";
        numKeysView.style.display = "none";
    }
}

function placeBetOnCell(cellId) {
    if (isGameSessionActive && secondsRemaining <= 0) return;
    
    const inputField = document.getElementById('wp-bet-field');
    if (!inputField) return;
    activeBetAmount = parseInt(inputField.value) || 0;
    
    if (activeBetAmount <= 0 || playerBalance < activeBetAmount) return;
    
    if (!currentRoundBets[cellId]) { 
        currentRoundBets[cellId] = 0; 
    }
    currentRoundBets[cellId] += activeBetAmount;
    
    playerBalance -= activeBetAmount; 
    totalRoundBetSum += activeBetAmount;
    
    const targetBtn = document.getElementById(`cell-${cellId}`);
    if (targetBtn) { 
        targetBtn.classList.add('wp-bet-active-glow'); 
        targetBtn.classList.add('has-bets-placed'); 
        
        // Ищем или создаем фишку внутри кнопки для отображения суммы ставки
        let chipBadge = targetBtn.querySelector('.wp-live-chip-badge');
        if (!chipBadge) {
            chipBadge = document.createElement('div');
            chipBadge.className = 'wp-live-chip-badge';
            targetBtn.appendChild(chipBadge);
        }
        // Записываем отформатированное значение ставки (например, 25K)
        chipBadge.innerText = formatCasinoValue(currentRoundBets[cellId]);
    }
    
    refreshUI();
    
    if (!isGameSessionActive) { 
        startRoundCountdownTimer(); 
    }
    if (tg && typeof tg.HapticFeedback === 'object') { 
        tg.HapticFeedback.impactOccurred('light'); 
    }
}


function startRoundCountdownTimer() {
    isGameSessionActive = true; secondsRemaining = 20;
    const emojiElement = document.getElementById('wp-center-emoji');
    const textElement = document.getElementById('wp-center-text');
    if (emojiElement) emojiElement.innerText = "⏳";
    if (textElement) textElement.innerText = `${secondsRemaining} сек`;
    countdownTimerInterval = setInterval(async () => {
        secondsRemaining--;
        if (secondsRemaining > 0) {
            if (textElement) textElement.innerText = `${secondsRemaining} сек`;
        } else {
            clearInterval(countdownTimerInterval);
            await generateSecureRoundData();
            if (emojiElement) emojiElement.innerText = "🎰";
            if (textElement) textElement.innerText = "БОНУСЫ!";
            const field = document.getElementById('wp-bet-field');
            if (field) field.disabled = true;
            animateLuckyNumbersSlots();
        }
    }, 1000);
}

async function generateSecureRoundData() {
    roundWinningNumber = Math.floor(Math.random() * 37);
    let availableNumbers = Array.from({length: 37}, (_, i) => i);
    roundLuckyNumbersList = [];
    for (let i = 0; i < 3; i++) {
        let randomIndex = Math.floor(Math.random() * availableNumbers.length);
        let selectedNum = availableNumbers.splice(randomIndex, 1);
        let selectedMult = MULTIPLIER_OPTIONS[Math.floor(Math.random() * MULTIPLIER_OPTIONS.length)];
        roundLuckyNumbersList.push({ num: selectedNum, mult: selectedMult });
    }
    roundSecretSalt = Math.random().toString(36).substring(2, 15);
    let luckyString = roundLuckyNumbersList.map(item => `${item.num}:x${item.mult}`).join(',');
    let rawRoundString = `${roundSecretSalt}|${roundWinningNumber}|lucky:[${luckyString}]`;
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(rawRoundString);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const calculatedSha256Hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        const hashEl = document.getElementById('wp-crypto-hash-sha256');
        if (hashEl) hashEl.innerText = calculatedSha256Hash;
    } catch (e) { console.error(e); }
}

function animateLuckyNumbersSlots() {
    let currentFrame = 0; const maxAnimationFrames = 90;
    const num1 = document.getElementById('lucky-num-1'); const num2 = document.getElementById('lucky-num-2'); const num3 = document.getElementById('lucky-num-3');
    const mult1 = document.getElementById('lucky-mult-1'); const mult2 = document.getElementById('lucky-mult-2'); const mult3 = document.getElementById('lucky-mult-3');
    if (num1) num1.style.filter = "blur(3px)"; if (num2) num2.style.filter = "blur(3px)"; if (num3) num3.style.filter = "blur(3px)";
    function updateSlotsPhysics() {
        currentFrame++;
        if (currentFrame < 30) {
            if (num1) num1.innerText = Math.floor(Math.random() * 37);
            if (mult1) mult1.innerText = `${MULTIPLIER_OPTIONS[Math.floor(Math.random() * MULTIPLIER_OPTIONS.length)]}X`;
        } else if (currentFrame === 30) { if (num1) num1.style.filter = "none"; fixSingleLuckySlotUI(0); }
        if (currentFrame < 60) {
            if (num2) num2.innerText = Math.floor(Math.random() * 37);
            if (mult2) mult2.innerText = `${MULTIPLIER_OPTIONS[Math.floor(Math.random() * MULTIPLIER_OPTIONS.length)]}X`;
        } else if (currentFrame === 60) { if (num2) num2.style.filter = "none"; fixSingleLuckySlotUI(1); }
        if (currentFrame < 85) {
            if (num3) num3.innerText = Math.floor(Math.random() * 37);
            if (mult3) mult3.innerText = `${MULTIPLIER_OPTIONS[Math.floor(Math.random() * MULTIPLIER_OPTIONS.length)]}X`;
        } else if (currentFrame === 85) { if (num3) num3.style.filter = "none"; fixSingleLuckySlotUI(2); }
        if (currentFrame <= maxAnimationFrames) { requestAnimationFrame(updateSlotsPhysics); }
        else {
            const textElement = document.getElementById('wp-center-text'); const emojiElement = document.getElementById('wp-center-emoji');
            if (emojiElement) emojiElement.innerText = "🌀"; if (textElement) textElement.innerText = "Крутим!";
            setTimeout(() => { initiateWheelSpinAnimation(); }, 600);
        }
    }
    requestAnimationFrame(updateSlotsPhysics);
}
function fixSingleLuckySlotUI(slotIndex) {
    const data = roundLuckyNumbersList[slotIndex]; 
    if (!data) return;
    
    const numElement = document.getElementById(`lucky-num-${slotIndex + 1}`); 
    const multElement = document.getElementById(`lucky-mult-${slotIndex + 1}`);
    
    if (numElement && multElement) {
        numElement.innerText = data.num; 
        multElement.innerText = `${data.mult}X`;
        const box = numElement.parentElement;
        if (box) {
            box.style.transform = "scale(1.15)"; 
            setTimeout(() => { box.style.transform = "scale(1)"; }, 150);
            
            if (data.mult >= 300) { 
                box.style.borderColor = "var(--color-gold)"; 
                box.style.boxShadow = "0 0 15px rgba(245, 158, 11, 0.4)"; 
                multElement.className = "wp-bonus-multiplier wp-m100"; 
            } else if (data.mult >= 100) { 
                box.style.borderColor = "var(--color-purple)"; 
                box.style.boxShadow = "0 0 15px rgba(99, 102, 241, 0.4)"; 
                multElement.className = "wp-bonus-multiplier wp-m100"; 
            } else { 
                box.style.borderColor = "var(--color-blue)"; 
                box.style.boxShadow = "0 0 15px rgba(37, 99, 235, 0.4)"; 
                multElement.className = "wp-bonus-multiplier wp-m50"; 
            }
        }
    }
    if (tg && typeof tg.HapticFeedback === 'object') { 
        tg.HapticFeedback.impactOccurred('medium'); 
    }
}

function updateLuckyNumbersUI() {
    for (let i = 0; i < 3; i++) {
        let data = roundLuckyNumbersList[i]; 
        if (!data) continue;
        let numElement = document.getElementById(`lucky-num-${i+1}`); 
        let multElement = document.getElementById(`lucky-mult-${i+1}`);
        if (numElement && multElement) {
            numElement.innerText = data.num; 
            multElement.innerText = `${data.mult}X`;
            let box = numElement.parentElement;
            if (box) {
                if (data.mult >= 300) { 
                    box.style.borderColor = "var(--color-gold)"; 
                    multElement.className = "wp-bonus-multiplier wp-m100"; 
                } else if (data.mult >= 100) { 
                    box.style.borderColor = "var(--color-purple)"; 
                    multElement.className = "wp-bonus-multiplier wp-m100"; 
                } else { 
                    box.style.borderColor = "var(--color-blue)"; 
                    multElement.className = "wp-bonus-multiplier wp-m50"; 
                }
            }
        }
    }
}

const canvas = document.getElementById('wheel-render-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
let currentWheelRotationAngle = 0; 
let ballCurrentPhysicsAngle = 0;
function drawPremiumRouletteWheel(wheelAngle, ballAngle, displayBall = false) {
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cx = canvas.width / 2; 
    const cy = canvas.height / 2; 
    const outerRadius = canvas.width / 2 - 10;
    const totalSectors = WHEEL_NUMBERS.length; 
    const arcLengthPerSector = (2 * Math.PI) / totalSectors;
    
    ctx.save(); 
    ctx.translate(cx, cy); 
    ctx.rotate(wheelAngle);
    
    for (let i = 0; i < totalSectors; i++) {
        const currentSectorNumber = WHEEL_NUMBERS[i];
        const startAngle = i * arcLengthPerSector - Math.PI / 2 - arcLengthPerSector / 2; 
        const endAngle = startAngle + arcLengthPerSector;
        
        ctx.beginPath(); 
        ctx.moveTo(0, 0); 
        ctx.arc(0, 0, outerRadius, startAngle, endAngle); 
        ctx.closePath();
        
        if (currentSectorNumber === 0) ctx.fillStyle = "#10b981";
        else if (NUMBER_COLORS[currentSectorNumber] === "red") ctx.fillStyle = "#e52e4d";
        else ctx.fillStyle = "#151a30";
        
        ctx.fill(); 
        ctx.strokeStyle = "#29315c"; 
        ctx.lineWidth = 1.5; 
        ctx.stroke();
        
        ctx.save(); 
        ctx.rotate(startAngle + arcLengthPerSector / 2 + Math.PI / 2);
        ctx.fillStyle = "#ffffff"; 
        ctx.font = "bold 15px sans-serif"; 
        ctx.textAlign = "center";
        ctx.fillText(currentSectorNumber, 0, -outerRadius + 30); 
        ctx.restore();
    }
    
    ctx.beginPath(); 
    ctx.arc(0, 0, outerRadius - 45, 0, 2 * Math.PI); 
    ctx.fillStyle = "#0c0f1d";
    ctx.fill(); 
    ctx.strokeStyle = "#29315c"; 
    ctx.lineWidth = 3; 
    ctx.stroke(); 
    ctx.restore();
}

function updateWheelViewWithBall(wheelAngle, ballAngle) {
    drawPremiumRouletteWheel(wheelAngle, ballAngle, true);
    if (!canvas || !ctx) return;
    const cx = canvas.width / 2; 
    const cy = canvas.height / 2; 
    const outerRadius = canvas.width / 2 - 10;
    
    ctx.save(); 
    ctx.translate(cx, cy); 
    ctx.rotate(ballAngle);
    ctx.beginPath(); 
    ctx.arc(0, -outerRadius + 22, 9, 0, 2 * Math.PI);
    ctx.fillStyle = "#ffffff"; 
    ctx.fill(); 
    ctx.shadowColor = "#ffffff"; 
    ctx.shadowBlur = 10; 
    ctx.restore();
}

function initiateWheelSpinAnimation() {
    const targetSectorIndex = WHEEL_NUMBERS.indexOf(roundWinningNumber); 
    const anglePerSector = (2 * Math.PI) / WHEEL_NUMBERS.length;
    
    // Колесо делает 4 полных круга + случайное смещение
    const finalWheelRotationAngle = (2 * Math.PI * 4) + (Math.random() * Math.PI * 2);
    const wheelRemainderAngle = finalWheelRotationAngle % (2 * Math.PI);
    
    // Шарик летит в ПРОТИВОХОД (минус): делает 5 кругов и падает в нужный карман с учетом сдвига колеса
    const finalBallRotationAngle = -(2 * Math.PI * 5) - (targetSectorIndex * anglePerSector) + wheelRemainderAngle;
    
    let currentAnimationFrameTime = 0; 
    const totalDurationFrames = 240; // 4 секунды при 60 FPS
    
    function processPhysicsFrame() {
        currentAnimationFrameTime++;
        if (currentAnimationFrameTime <= totalDurationFrames) {
            // Cubic Ease-Out плавное торможение
            const cubicProgress = 1 - Math.pow(1 - (currentAnimationFrameTime / totalDurationFrames), 3);
            currentWheelRotationAngle = finalWheelRotationAngle * cubicProgress; 
            ballCurrentPhysicsAngle = finalBallRotationAngle * cubicProgress;
            
            updateWheelViewWithBall(currentWheelRotationAngle, ballCurrentPhysicsAngle);
            requestAnimationFrame(processPhysicsFrame);
        } else {
            // Мертвая фиксация в целевом секторе
            currentWheelRotationAngle = wheelRemainderAngle; 
            ballCurrentPhysicsAngle = finalBallRotationAngle;
            
            updateWheelViewWithBall(currentWheelRotationAngle, ballCurrentPhysicsAngle); 
            finalizeRoundResultsAndPayouts();
        }
    }
    requestAnimationFrame(processPhysicsFrame);
}

function finalizeRoundResultsAndPayouts() {
    let totalAmountWonThisRound = 0; 
    const winningColor = NUMBER_COLORS[roundWinningNumber];
    let luckyMultiplierBonus = 1; 
    let isLuckyHit = false;
    
    roundLuckyNumbersList.forEach(bonus => { 
        if (Number(bonus.num) === roundWinningNumber) { 
            luckyMultiplierBonus = bonus.mult; 
            isLuckyHit = true; 
        } 
    });
    
    for (let cellId in currentRoundBets) {
        let betValue = currentRoundBets[cellId]; 
        if (betValue <= 0) continue;
        
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
            if (parsed === roundWinningNumber) { 
                if (isLuckyHit) totalAmountWonThisRound += betValue * luckyMultiplierBonus; 
                else totalAmountWonThisRound += betValue * 30; 
            }
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
        if (isLuckyHit) { 
            badge.innerText = `LUCKY BONUS x${luckyBonus}!`; 
            badge.style.background = "rgba(245, 158, 11, 0.2)"; 
            badge.style.borderColor = "var(--color-gold)"; 
            badge.style.color = "#fef08a"; 
        } else { 
            badge.innerText = `x30`; 
            badge.style.background = "rgba(16, 185, 129, 0.2)"; 
            badge.style.borderColor = "var(--color-green)"; 
            badge.style.color = "#a7f3d0"; 
        }
    }
    
    const statusText = document.getElementById('modal-player-win-status-text');
    if (statusText) {
        if (amountWon > 0) { 
            statusText.innerHTML = `🎉 Выиграли:<br><span style="color: var(--color-gold); font-size: 20px; font-weight: 900;">+ ${amountWon} W</span>`; 
            if (tg && typeof tg.HapticFeedback === 'object') tg.HapticFeedback.notificationOccurred('success'); 
        } else { 
            statusText.innerText = "В этот раз не повезло."; 
        }
    }
    
    const modalPopup = document.getElementById('wp-result-modal-popup'); 
    if (modalPopup) modalPopup.style.display = "flex";
    
    const historyLine = document.getElementById('wp-history-line');
    if (historyLine) {
        const numColor = NUMBER_COLORS[roundWinningNumber]; 
        const newCircle = document.createElement('div');
        newCircle.className = `hist-circle ${numColor}`; 
        newCircle.innerText = roundWinningNumber;
        historyLine.insertBefore(newCircle, historyLine.firstChild); 
        if (historyLine.children.length > 10) historyLine.removeChild(historyLine.lastChild);
    }
}

function closeResultModalPopup() {
    const modalPopup = document.getElementById('wp-result-modal-popup'); 
    if (modalPopup) modalPopup.style.display = "none";
    currentRoundBets = {}; 
    totalRoundBetSum = 0;
    
    document.querySelectorAll('.wp-bet-trigger-btn').forEach(btn => { 
        btn.classList.remove('wp-bet-active-glow'); 
        btn.classList.remove('has-bets-placed'); 
    });
    
    const field = document.getElementById('wp-bet-field'); 
    if (field) field.disabled = false;
    
    drawPremiumRouletteWheel(0, 0, false); 
    isGameSessionActive = false; 
    refreshUI();
}

// [Внутрь функции closeResultModalPopup найди этот блок и замени]
document.querySelectorAll('.wp-bet-trigger-btn').forEach(btn => { 
    btn.classList.remove('wp-bet-active-glow'); 
    btn.classList.remove('has-bets-placed'); 
    // Удаляем старые фишки с кнопок перед новым раундом
    const oldChip = btn.querySelector('.wp-live-chip-badge');
    if (oldChip) oldChip.remove();
});


// Функция безопасного и мгновенного выхода из рулетки в главное меню лобби
function exitRouletteToLobby() {
    if (typeof tg !== 'undefined' && tg) {
        try {
            // Включаем легкую вибрацию при клике на выход
            if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
        } catch (e) {
            console.error("Haptic error:", e);
        }
    }

    // Защита: если колесо уже бешено крутится, не даем игроку выйти, чтобы не завис баланс
    if (isGameSessionActive && secondsRemaining <= 0) {
        if (tg && typeof tg.showAlert === 'function') {
            tg.showAlert("⚠️ Нельзя выйти во время вращения колеса! Дождитесь распределения выигрыша раунда.");
            return;
        }
    }

    // Полностью очищаем интервал таймера, чтобы он не тикал в фоновом режиме и не жрал батарею
    if (countdownTimerInterval) {
        clearInterval(countdownTimerInterval);
    }

    // Мгновенное перенаправление на главную страницу приложения
    location.href = "index.html";
}

async function initGameEngineOnLoad() {
    drawPremiumRouletteWheel(0, 0, false); 
    await generateSecureRoundData(); 
    updateLuckyNumbersUI();
    
    // ПРОВЕРКА НА КОРРЕКТНОСТЬ БАЛАНСА
    let storedBalance = localStorage.getItem('wog_secure_balance');
    
    // Если баланса нет, если он равен 0, если он сломался (NaN), принудительно выдаем 100k
    if (!storedBalance || isNaN(parseInt(storedBalance)) || parseInt(storedBalance) <= 0) { 
        localStorage.setItem('wog_secure_balance', 100000); 
    }
    
    playerBalance = parseInt(localStorage.getItem('wog_secure_balance')); 
    refreshUI();
}

initGameEngineOnLoad();
