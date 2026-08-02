const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg) {
    try { 
        tg.expand(); tg.ready();
        if (tg.BackButton) {
            tg.BackButton.show(); tg.BackButton.offClick();
            tg.BackButton.onClick(() => { location.href = "index.html"; });
        }
    } catch(e) { console.error(e); }
}

const SERVER_URL = "https://wog-becend2.onrender.com";
const MY_ADMIN_ID = 6682822292;
let userId = MY_ADMIN_ID;
if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) { userId = tg.initDataUnsafe.user.id; }

// ПОЛНЫЕ МАССИВЫ РУЛЕТОЧНОГО КРУГА И БОНУСНЫХ МНОЖИТЕЛЕЙ
const WHEEL_NUMBERS = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const MULTIPLIER_OPTIONS = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500];

const NUMBER_COLORS = {
    0: "green",  1: "red",    2: "black",  3: "red",    4: "black",  5: "red",
    6: "black",  7: "red",    8: "black",  9: "red",    10: "black", 11: "black",
    12: "red",   13: "black", 14: "red",   15: "black", 16: "red",   17: "black",
    18: "red",   19: "red",   20: "black", 21: "red",   22: "black", 23: "red",
    24: "black", 25: "red",   26: "black", 27: "red",   28: "black", 29: "black",
    30: "red",   31: "black", 32: "red",   33: "black", 34: "red",   35: "black", 36: "red"
};

if (tg) {
    try {
        tg.ready();
        tg.expand();
        // Блокируем закрытие Mini App случайным движением пальца вниз
        if (typeof tg.enableClosingConfirmation === 'function') { tg.enableClosingConfirmation(); }
        // Считываем никнейм и ID игрока
        if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
            userId = tg.initDataUnsafe.user.id;
            username = tg.initDataUnsafe.user.username || tg.initDataUnsafe.user.first_name || "User";
        }
        // Интегрируем нативную кнопку Telegram "Назад"
        if (tg.BackButton) {
            tg.BackButton.show(); tg.BackButton.offClick();
            tg.BackButton.onClick(() => { location.href = "index.html"; });
        }
    } catch (e) { console.error("Ошибка Telegram API:", e); }
}

let playerBalance = parseInt(localStorage.getItem('wog_secure_balance')) || 5000000000;
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

async function refreshUI() {
    const balDisplay = document.getElementById('wp-balance-display');
    const betDisplay = document.getElementById('wp-player-total-bet');
    if (balDisplay) balDisplay.innerText = playerBalance;
    if (betDisplay) betDisplay.innerText = `${totalRoundBetSum} W`;
    localStorage.setItem('wog_secure_balance', playerBalance);
    try {
        const response = await fetch(`${SERVER_URL}/api/user/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId, username: username, local_balance: playerBalance })
        });
        if (response.ok) {
            const serverData = await response.json();
            if (serverData && typeof serverData.balance !== 'undefined') {
                playerBalance = serverData.balance;
                if (balDisplay) balDisplay.innerText = playerBalance;
                localStorage.setItem('wog_secure_balance', playerBalance);
            }
        }
    } catch (e) { console.warn("Сервер спит, локальный режим активен"); }
}

async function placeBetOnCell(cellId) {
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
    try {
        fetch(`${SERVER_URL}/api/wheel/bet`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId, bet_cell: cellId, amount: activeBetAmount })
        }).catch(() => {});
    } catch (e) {}
    if (!isGameSessionActive) { startRoundCountdownTimer(); }
    if (tg && typeof tg.HapticFeedback === 'object') { tg.HapticFeedback.impactOccurred('light'); }
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

function startRoundCountdownTimer() {
    isGameSessionActive = true; 
    secondsRemaining = 20;
    
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
            
            // СВЕРХВАЖНО: В эту же секунду генерируем новые числа раунда до старта анимации!
            generateSecureRoundData();
            
            if (emojiElement) emojiElement.innerText = "🎰";
            if (textElement) textElement.innerText = "БОНУСЫ!";
            
            const field = document.getElementById('wp-bet-field');
            if (field) field.disabled = true;
            
            // Запускаем крутилку слотов, теперь roundLuckyNumbersList гарантированно заполнен!
            animateLuckyNumbersSlots();
        }
    }, 1000);
}

function animateLuckyNumbersSlots() {
    let currentFrame = 0;
    const maxAnimationFrames = 90; 
    
    const num1 = document.getElementById('lucky-num-1');
    const num2 = document.getElementById('lucky-num-2');
    const num3 = document.getElementById('lucky-num-3');
    
    const mult1 = document.getElementById('lucky-mult-1');
    const mult2 = document.getElementById('lucky-mult-2');
    const mult3 = document.getElementById('lucky-mult-3');

    function updateSlotsPhysics() {
        currentFrame++;
        
        // Первый слот бешено мелькает до 30 кадра
        if (currentFrame < 30) {
            if (num1) num1.innerText = Math.floor(Math.random() * 37);
            if (mult1) mult1.innerText = `${MULTIPLIER_OPTIONS[Math.floor(Math.random() * MULTIPLIER_OPTIONS.length)]}X`;
        } else if (currentFrame === 30) {
            fixSingleLuckySlotUI(0); // Намертво фиксируем реальный первый бонус раунда
        }
        
        // Второй слот мелькает до 60 кадра
        if (currentFrame < 60) {
            if (num2) num2.innerText = Math.floor(Math.random() * 37);
            if (mult2) mult2.innerText = `${MULTIPLIER_OPTIONS[Math.floor(Math.random() * MULTIPLIER_OPTIONS.length)]}X`;
        } else if (currentFrame === 60) {
            fixSingleLuckySlotUI(1); // Намертво фиксируем реальный второй бонус раунда
        }
        
        // Третий слот мелькает до 85 кадра
        if (currentFrame < 85) {
            if (num3) num3.innerText = Math.floor(Math.random() * 37);
            if (mult3) mult3.innerText = `${MULTIPLIER_OPTIONS[Math.floor(Math.random() * MULTIPLIER_OPTIONS.length)]}X`;
        } else if (currentFrame === 85) {
            fixSingleLuckySlotUI(2); // Намертво фиксируем реальный третий бонус раунда
        }

        if (currentFrame <= maxAnimationFrames) {
            requestAnimationFrame(updateSlotsPhysics);
        } else {
            // Как только все три плашки зафиксировались — плавно переключаем на запуск колеса
            const textElement = document.getElementById('wp-center-text');
            const emojiElement = document.getElementById('wp-center-emoji');
            if (emojiElement) emojiElement.innerText = "🌀";
            if (textElement) textElement.innerText = "Крутим!";
            
            setTimeout(() => {
                initiateWheelSpinAnimation();
            }, 600); // Небольшая задержка в 0.6 сек, чтобы игрок успел рассмотреть выпавшие иксы
        }
    }
    requestAnimationFrame(updateSlotsPhysics);
}
function animateLuckyNumbersSlots() {
    let currentFrame = 0;
    const maxAnimationFrames = 90; 
    
    const num1 = document.getElementById('lucky-num-1');
    const num2 = document.getElementById('lucky-num-2');
    const num3 = document.getElementById('lucky-num-3');
    
    const mult1 = document.getElementById('lucky-mult-1');
    const mult2 = document.getElementById('lucky-mult-2');
    const mult3 = document.getElementById('lucky-mult-3');

    // ДОБАВЛЯЕМ КЛАССИЧЕСКИЙ ЭФФЕКТ РАЗМЫТИЯ СЛОТОВ (MOTION BLUR) ПРИ ВРАЩЕНИИ
    if (num1) num1.style.filter = "blur(3px)";
    if (num2) num2.style.filter = "blur(3px)";
    if (num3) num3.style.filter = "blur(3px)";

    function updateSlotsPhysics() {
        currentFrame++;
        
        if (currentFrame < 30) {
            if (num1) num1.innerText = Math.floor(Math.random() * 37);
            if (mult1) mult1.innerText = `${MULTIPLIER_OPTIONS[Math.floor(Math.random() * MULTIPLIER_OPTIONS.length)]}X`;
        } else if (currentFrame === 30) {
            if (num1) num1.style.filter = "none"; // Убираем размытие при остановке
            fixSingleLuckySlotUI(0); 
        }
        
        if (currentFrame < 60) {
            if (num2) num2.innerText = Math.floor(Math.random() * 37);
            if (mult2) mult2.innerText = `${MULTIPLIER_OPTIONS[Math.floor(Math.random() * MULTIPLIER_OPTIONS.length)]}X`;
        } else if (currentFrame === 60) {
            if (num2) num2.style.filter = "none";
            fixSingleLuckySlotUI(1); 
        }
        
        if (currentFrame < 85) {
            if (num3) num3.innerText = Math.floor(Math.random() * 37);
            if (mult3) mult3.innerText = `${MULTIPLIER_OPTIONS[Math.floor(Math.random() * MULTIPLIER_OPTIONS.length)]}X`;
        } else if (currentFrame === 85) {
            if (num3) num3.style.filter = "none";
            fixSingleLuckySlotUI(2); 
        }

        if (currentFrame <= maxAnimationFrames) {
            requestAnimationFrame(updateSlotsPhysics);
        } else {
            const textElement = document.getElementById('wp-center-text');
            const emojiElement = document.getElementById('wp-center-emoji');
            if (emojiElement) emojiElement.innerText = "🌀";
            if (textElement) textElement.innerText = "Крутим!";
            
            setTimeout(() => {
                initiateWheelSpinAnimation();
            }, 600); 
        }
    }
    requestAnimationFrame(updateSlotsPhysics);
}


}
// ФУНКЦИЯ ФИКСАЦИИ И КРАСИВОЙ НЕОНОВОЙ ПОДСВЕТКИ ВЫПАВШЕГО СЛОТА
function fixSingleLuckySlotUI(slotIndex) {
    const data = roundLuckyNumbersList[slotIndex];
    if (!data) return;

    const numElement = document.getElementById(`lucky-num-${slotIndex + 1}`);
    const multElement = document.getElementById(`lucky-mult-${slotIndex + 1}`);

    if (numElement && multElement) {
        // Жестко фиксируем реальный результат раунда из базы данных
        numElement.innerText = data.num;
        multElement.innerText = `${data.mult}X`;

        const box = numElement.parentElement;
        if (box) {
            // Эффект вспышки при фиксации числа (ударный масштаб)
            box.style.transform = "scale(1.15)";
            setTimeout(() => { box.style.transform = "scale(1)"; }, 150);

            // Красим рамки и плашки в неоновые цвета по весу икса
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

    // Триггерим легкую вибрацию на телефоне в момент фиксации каждого барабана
    if (tg && typeof tg.HapticFeedback === 'object') {
        tg.HapticFeedback.impactOccurred('medium');
    }
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
        // Используем встроенное в браузер аппаратное шифрование SHA-256
        const encoder = new TextEncoder();
        const data = encoder.encode(rawRoundString);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const calculatedSha256Hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        const hashEl = document.getElementById('wp-crypto-hash-sha256');
        if (hashEl) hashEl.innerText = calculatedSha256Hash;
    } catch (e) {
        console.error("Крипто-ошибка:", e);
    }

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

function updateWheelViewWithBall(wheelAngle, ballAngle) {
    drawPremiumRouletteWheel(wheelAngle, ballAngle, true);
    if (!canvas || !ctx) return;
    const cx = canvas.width / 2; const cy = canvas.height / 2;
    const outerRadius = canvas.width / 2 - 10;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ballAngle);
    ctx.beginPath(); ctx.arc(0, -outerRadius + 22, 9, 0, 2 * Math.PI);
    ctx.fillStyle = "#ffffff"; ctx.fill(); ctx.shadowColor = "#ffffff"; ctx.shadowBlur = 10; ctx.restore();
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
            currentWheelRotationAngle = finalWheelRotationAngle % (2 * Math.PI); ballCurrentPhysicsAngle = finalBallRotationAngle;
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
    const modalPopup = document.getElementById('wp-result-modal-popup'); 
    if (modalPopup) modalPopup.style.display = "none";
    
    // Очищаем локальные массивы ставок текущего раунда
    currentRoundBets = {}; 
    totalRoundBetSum = 0;
    
    // Снимаем неоновую подсветку со всех кнопок стола ставок
    document.querySelectorAll('.wp-bet-trigger-btn').forEach(btn => { 
        btn.classList.remove('wp-bet-active-glow'); 
        btn.classList.remove('has-bets-placed'); 
    });
    
    // Разблокируем поле ввода размера ставки для нового раунда
    const field = document.getElementById('wp-bet-field'); 
    if (field) field.disabled = false;
    
    // Возвращаем колесо рулетки в исходную позицию 0 градусов
    drawPremiumRouletteWheel(0, 0, false); 
    isGameSessionActive = false;
    
    // СВЕРХВАЖНО: Мы БОЛЬШЕ НЕ ВЫЗЫВАЕМ тут generateSecureRoundData() и updateLuckyNumbersUI()!
    // Благодаря этому старые выпавшие счастливые числа остаются гореть на экране во время сбора новых ставок.
    
    refreshUI();
}


drawPremiumRouletteWheel(0, 0, false);
generateSecureRoundData();
updateLuckyNumbersUI();
refreshUI();
