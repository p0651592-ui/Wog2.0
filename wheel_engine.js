// ============================================================================
// WOG Wheel Plus engine
// Cleaned version: stable state, safe DOM access, configurable backend calls
// ============================================================================

const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
const API_BASE = (window.WOG_API_BASE || localStorage.getItem('wog_api_base') || '').replace(/\/$/, '');
const MY_ADMIN_ID = 6682822292;

const WHEEL_NUMBERS = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
    5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

const NUMBER_COLORS = {
    0: 'green', 1: 'red', 2: 'black', 3: 'red', 4: 'black', 5: 'red',
    6: 'black', 7: 'red', 8: 'black', 9: 'red', 10: 'black', 11: 'black',
    12: 'red', 13: 'black', 14: 'red', 15: 'black', 16: 'red', 17: 'black',
    18: 'red', 19: 'red', 20: 'black', 21: 'red', 22: 'black', 23: 'red',
    24: 'black', 25: 'red', 26: 'black', 27: 'red', 28: 'black', 29: 'black',
    30: 'red', 31: 'black', 32: 'red', 33: 'black', 34: 'red', 35: 'black', 36: 'red'
};

const MULTIPLIER_OPTIONS = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500];

const state = {
    userId: MY_ADMIN_ID,
    username: 'Guest_Player',
    firstName: 'Guest',
    photoUrl: '',
    playerBalance: 0,
    activeBetAmount: 100,
    currentRoundBets: {},
    totalRoundBetSum: 0,
    isGameSessionActive: false,
    countdownTimerInterval: null,
    secondsRemaining: 20,
    roundSecretSalt: '',
    roundWinningNumber: 0,
    roundLuckyNumbersList: [],
    currentWheelRotationAngle: 0,
    ballCurrentPhysicsAngle: 0,
};

const WogLogger = {
    info: (msg, data = '') => console.log(`[WOG-INFO] [${new Date().toISOString()}] ${msg}`, data),
    warn: (msg, data = '') => console.warn(`[WOG-WARN] [${new Date().toISOString()}] ${msg}`, data),
    error: (msg, err = '') => console.error(`[WOG-ERROR] [${new Date().toISOString()}] ${msg}`, err),
};

function el(id) {
    return document.getElementById(id);
}

function apiUrl(path) {
    return API_BASE ? `${API_BASE}${path}` : path;
}

function safeJson(res) {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

function setText(id, value) {
    const node = el(id);
    if (node) node.innerText = value;
}

function setHtml(id, value) {
    const node = el(id);
    if (node) node.innerHTML = value;
}

function triggerHaptic(kind = 'light') {
    try {
        if (tg && tg.HapticFeedback && typeof tg.HapticFeedback.impactOccurred === 'function' && kind === 'light') {
            tg.HapticFeedback.impactOccurred('light');
        } else if (tg && tg.HapticFeedback && typeof tg.HapticFeedback.notificationOccurred === 'function' && kind !== 'light') {
            tg.HapticFeedback.notificationOccurred(kind);
        }
    } catch (err) {
        WogLogger.warn('Haptic feedback failed', err);
    }
}

function setupTelegram() {
    if (!tg) return;
    try {
        tg.expand();
        tg.ready();
        if (tg.BackButton) {
            tg.BackButton.show();
            tg.BackButton.offClick();
            tg.BackButton.onClick(exitRouletteToLobby);
        }
        if (typeof tg.enableClosingConfirmation === 'function') {
            tg.enableClosingConfirmation();
        }
    } catch (err) {
        WogLogger.error('Telegram init failed', err);
    }

    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        const user = tg.initDataUnsafe.user;
        state.userId = user.id || MY_ADMIN_ID;
        state.username = user.username || user.first_name || 'User';
        state.firstName = user.first_name || 'User';
        state.photoUrl = user.photo_url || '';
    }
}

function renderProfile() {
    const avatar = el('avatar-container');
    if (avatar) {
        if (state.photoUrl) {
            avatar.innerHTML = `<img src="${state.photoUrl}" class="avatar-img" alt="Avatar">`;
        } else {
            avatar.innerText = state.firstName ? state.firstName.charAt(0).toUpperCase() : 'W';
        }
    }

    const usernameDisplay = el('username-display');
    if (usernameDisplay) {
        usernameDisplay.innerText = state.firstName + (state.username && state.username !== state.firstName ? ` (@${state.username})` : '');
    }

    const statusDisplay = el('status-display');
    if (statusDisplay) {
        if (Number(state.userId) === MY_ADMIN_ID) {
            statusDisplay.innerText = 'ADMIN';
            statusDisplay.style.color = 'var(--neon-gold)';
        } else {
            statusDisplay.innerText = 'PLAYER';
            statusDisplay.style.color = 'var(--text-muted)';
        }
    }

    const adminBtn = el('admin-trigger-btn');
    if (adminBtn) {
        adminBtn.style.display = Number(state.userId) === MY_ADMIN_ID ? 'block' : 'none';
    }
}

function buildNumbersKeyboardLayout() {
    const container = el('wp-num-keys-generator-box');
    if (!container) return;

    container.innerHTML = '';

    const zeroBtn = document.createElement('button');
    zeroBtn.className = 'wp-bet-trigger-btn wp-btn-green';
    zeroBtn.id = 'cell-num0';
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

function formatCasinoValue(num) {
    const value = Number(num) || 0;
    if (value >= 1.0e+12) return (value / 1.0e+12).toFixed(1).replace(/\.0$/, '') + 'T';
    if (value >= 1.0e+9) return (value / 1.0e+9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (value >= 1.0e+6) return (value / 1.0e+6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (value >= 1.0e+3) return (value / 1.0e+3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(value);
}

function refreshUI() {
    setText('wp-balance-display', state.playerBalance);
    setText('wp-player-total-bet', `${state.totalRoundBetSum} W`);
    setText('wp-bet-field-value', state.activeBetAmount);
}

async function syncBalanceFromServer() {
    if (!tg || !tg.initData) return;

    try {
        const res = await fetch(apiUrl('/api/user'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: state.userId,
                first_name: state.firstName,
                username: state.username,
                photo_url: state.photoUrl,
                auth_data: tg.initData,
            }),
        });

        const data = await safeJson(res);
        if (data && data.balance !== undefined) {
            state.playerBalance = Number(data.balance) || 0;
            refreshUI();
        }
    } catch (err) {
        WogLogger.warn('Balance sync failed', err);
    }
}

async function adjustRemoteBalance(delta) {
    if (!tg || !tg.initData || !delta) return;
    try {
        const res = await fetch(apiUrl('/api/balance'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: state.userId, amount: delta }),
        });
        const data = await safeJson(res);
        if (data && data.balance !== undefined) {
            state.playerBalance = Number(data.balance) || state.playerBalance;
            refreshUI();
        }
    } catch (err) {
        WogLogger.warn('Remote balance update failed', err);
    }
}

function modifyBetSize(action) {
    if (state.isGameSessionActive && state.secondsRemaining <= 0) return;
    const field = el('wp-bet-field');
    if (!field) return;

    let current = parseInt(field.value, 10);
    if (!Number.isFinite(current) || current <= 0) current = state.activeBetAmount || 100;

    if (action === 'x2') current = Math.min(state.playerBalance, current * 2);
    if (action === '/2') current = Math.max(10, Math.floor(current / 2));

    state.activeBetAmount = current;
    field.value = current;
}

function addChipValue(amount) {
    if (state.isGameSessionActive && state.secondsRemaining <= 0) return;
    const field = el('wp-bet-field');
    if (!field) return;

    const add = Number(amount) || 0;
    let current = parseInt(field.value, 10);
    if (!Number.isFinite(current) || current < 0) current = 0;

    let next = current + add;
    if (next > state.playerBalance) next = state.playerBalance;

    state.activeBetAmount = next;
    field.value = next;
}

function toggleKeyboardLayout(layoutName) {
    const mainView = el('wp-main-table-view');
    const numKeysView = el('wp-numbers-keyboard-view');
    if (!mainView || !numKeysView) return;

    if (layoutName === 'numbers') {
        mainView.style.display = 'none';
        numKeysView.style.display = 'grid';
    } else {
        mainView.style.display = 'flex';
        numKeysView.style.display = 'none';
    }
}

function placeBetOnCell(cellId) {
    if (state.isGameSessionActive && state.secondsRemaining <= 0) return;

    const field = el('wp-bet-field');
    if (!field) return;

    const bet = parseInt(field.value, 10) || 0;
    if (bet <= 0 || state.playerBalance < bet) return;

    state.activeBetAmount = bet;
    state.currentRoundBets[cellId] = (state.currentRoundBets[cellId] || 0) + bet;
    state.playerBalance -= bet;
    state.totalRoundBetSum += bet;

    const targetBtn = el(`cell-${cellId}`);
    if (targetBtn) {
        targetBtn.classList.add('wp-bet-active-glow', 'has-bets-placed');
        let chip = targetBtn.querySelector('.wp-live-chip-badge');
        if (!chip) {
            chip = document.createElement('div');
            chip.className = 'wp-live-chip-badge';
            targetBtn.appendChild(chip);
        }
        chip.innerText = formatCasinoValue(state.currentRoundBets[cellId]);
    }

    refreshUI();
    triggerHaptic('light');

    if (!state.isGameSessionActive) {
        startRoundCountdownTimer();
    }

    adjustRemoteBalance(-bet);
}

function startRoundCountdownTimer() {
    state.isGameSessionActive = true;
    state.secondsRemaining = 20;

    const emoji = el('wp-center-emoji');
    const text = el('wp-center-text');
    if (emoji) emoji.innerText = '⏳';
    if (text) text.innerText = `${state.secondsRemaining} сек`;

    if (state.countdownTimerInterval) clearInterval(state.countdownTimerInterval);

    state.countdownTimerInterval = setInterval(async () => {
        state.secondsRemaining -= 1;

        if (state.secondsRemaining > 0) {
            if (text) text.innerText = `${state.secondsRemaining} сек`;
            return;
        }

        clearInterval(state.countdownTimerInterval);
        state.countdownTimerInterval = null;
        await generateSecureRoundData();

        if (emoji) emoji.innerText = '🎰';
        if (text) text.innerText = 'БОНУСЫ!';

        const field = el('wp-bet-field');
        if (field) field.disabled = true;

        animateLuckyNumbersSlots();
    }, 1000);
}

async function generateSecureRoundData() {
    state.roundWinningNumber = Math.floor(Math.random() * 37);
    const availableNumbers = Array.from({ length: 37 }, (_, i) => i);
    state.roundLuckyNumbersList = [];

    for (let i = 0; i < 3; i++) {
        const randomIndex = Math.floor(Math.random() * availableNumbers.length);
        const selectedNum = Number(availableNumbers.splice(randomIndex, 1)[0]);
        const selectedMult = MULTIPLIER_OPTIONS[Math.floor(Math.random() * MULTIPLIER_OPTIONS.length)];
        state.roundLuckyNumbersList.push({ num: selectedNum, mult: selectedMult });
    }

    state.roundSecretSalt = Math.random().toString(36).slice(2, 15);

    try {
        if (window.crypto && crypto.subtle) {
            const luckyString = state.roundLuckyNumbersList.map(item => `${item.num}:x${item.mult}`).join(',');
            const raw = `${state.roundSecretSalt}|${state.roundWinningNumber}|lucky:[${luckyString}]`;
            const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
            const hash = Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
            setText('wp-crypto-hash-sha256', hash);
        }
    } catch (err) {
        WogLogger.warn('Hash generation failed', err);
    }
}

function animateLuckyNumbersSlots() {
    let currentFrame = 0;
    const maxAnimationFrames = 90;
    const num1 = el('lucky-num-1');
    const num2 = el('lucky-num-2');
    const num3 = el('lucky-num-3');
    const mult1 = el('lucky-mult-1');
    const mult2 = el('lucky-mult-2');
    const mult3 = el('lucky-mult-3');

    if (num1) num1.style.filter = 'blur(3px)';
    if (num2) num2.style.filter = 'blur(3px)';
    if (num3) num3.style.filter = 'blur(3px)';

    function tick() {
        currentFrame += 1;

        if (currentFrame < 30) {
            if (num1) num1.innerText = Math.floor(Math.random() * 37);
            if (mult1) mult1.innerText = `${MULTIPLIER_OPTIONS[Math.floor(Math.random() * MULTIPLIER_OPTIONS.length)]}X`;
        } else if (currentFrame === 30 && num1) {
            num1.style.filter = 'none';
            fixSingleLuckySlotUI(0);
        }

        if (currentFrame < 60) {
            if (num2) num2.innerText = Math.floor(Math.random() * 37);
            if (mult2) mult2.innerText = `${MULTIPLIER_OPTIONS[Math.floor(Math.random() * MULTIPLIER_OPTIONS.length)]}X`;
        } else if (currentFrame === 60 && num2) {
            num2.style.filter = 'none';
            fixSingleLuckySlotUI(1);
        }

        if (currentFrame < 85) {
            if (num3) num3.innerText = Math.floor(Math.random() * 37);
            if (mult3) mult3.innerText = `${MULTIPLIER_OPTIONS[Math.floor(Math.random() * MULTIPLIER_OPTIONS.length)]}X`;
        } else if (currentFrame === 85 && num3) {
            num3.style.filter = 'none';
            fixSingleLuckySlotUI(2);
        }

        if (currentFrame <= maxAnimationFrames) {
            requestAnimationFrame(tick);
        } else {
            setTimeout(() => initiateWheelSpinAnimation(), 450);
        }
    }

    requestAnimationFrame(tick);
}

function fixSingleLuckySlotUI(slotIndex) {
    const data = state.roundLuckyNumbersList[slotIndex];
    if (!data) return;

    const numElement = el(`lucky-num-${slotIndex + 1}`);
    const multElement = el(`lucky-mult-${slotIndex + 1}`);
    if (!numElement || !multElement) return;

    numElement.innerText = data.num;
    multElement.innerText = `${data.mult}X`;

    const box = numElement.parentElement;
    if (box) {
        box.style.transform = 'scale(1.12)';
        setTimeout(() => { box.style.transform = 'scale(1)'; }, 150);

        if (data.mult >= 300) {
            box.style.borderColor = 'var(--neon-gold)';
            box.style.boxShadow = '0 0 15px rgba(245, 158, 11, 0.4)';
            multElement.className = 'wp-bonus-multiplier wp-m100';
        } else if (data.mult >= 100) {
            box.style.borderColor = 'var(--neon-cyan)';
            box.style.boxShadow = '0 0 15px rgba(34, 211, 238, 0.35)';
            multElement.className = 'wp-bonus-multiplier wp-m100';
        } else {
            box.style.borderColor = 'var(--neon-blue)';
            box.style.boxShadow = '0 0 15px rgba(47, 107, 242, 0.35)';
            multElement.className = 'wp-bonus-multiplier wp-m50';
        }
    }

    triggerHaptic('medium');
}

function updateLuckyNumbersUI() {
    for (let i = 0; i < 3; i++) {
        const data = state.roundLuckyNumbersList[i];
        if (!data) continue;
        const numElement = el(`lucky-num-${i + 1}`);
        const multElement = el(`lucky-mult-${i + 1}`);
        if (!numElement || !multElement) continue;

        numElement.innerText = data.num;
        multElement.innerText = `${data.mult}X`;
    }
}

const canvas = el('wheel-render-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;

function drawPremiumRouletteWheel(wheelAngle = 0) {
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const outerRadius = canvas.width / 2 - 10;
    const arcLength = (2 * Math.PI) / WHEEL_NUMBERS.length;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(wheelAngle);

    for (let i = 0; i < WHEEL_NUMBERS.length; i++) {
        const number = WHEEL_NUMBERS[i];
        const startAngle = i * arcLength - Math.PI / 2 - arcLength / 2;
        const endAngle = startAngle + arcLength;

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, outerRadius, startAngle, endAngle);
        ctx.closePath();

        if (number === 0) ctx.fillStyle = '#10b981';
        else if (NUMBER_COLORS[number] === 'red') ctx.fillStyle = '#e52e4d';
        else ctx.fillStyle = '#151a30';

        ctx.fill();
        ctx.strokeStyle = '#29315c';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.save();
        ctx.rotate(startAngle + arcLength / 2 + Math.PI / 2);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(number), 0, -outerRadius + 30);
        ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(0, 0, outerRadius - 45, 0, 2 * Math.PI);
    ctx.fillStyle = '#0c0f1d';
    ctx.fill();
    ctx.strokeStyle = '#29315c';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
}

function updateWheelViewWithBall(wheelAngle, ballAngle) {
    drawPremiumRouletteWheel(wheelAngle);
    if (!canvas || !ctx) return;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const outerRadius = canvas.width / 2 - 10;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ballAngle);
    ctx.beginPath();
    ctx.arc(0, -outerRadius + 22, 9, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.restore();
}

function initiateWheelSpinAnimation() {
    const targetSectorIndex = WHEEL_NUMBERS.indexOf(state.roundWinningNumber);
    const anglePerSector = (2 * Math.PI) / WHEEL_NUMBERS.length;

    if (!canvas || !ctx) {
        finalizeRoundResultsAndPayouts();
        return;
    }

    const finalWheelRotationAngle = (2 * Math.PI * 4) + (Math.random() * Math.PI * 2);
    const wheelRemainderAngle = finalWheelRotationAngle % (2 * Math.PI);
    const finalBallRotationAngle = -(2 * Math.PI * 5) - (targetSectorIndex * anglePerSector) + wheelRemainderAngle;

    let frame = 0;
    const totalFrames = 240;

    function step() {
        frame += 1;
        const progress = 1 - Math.pow(1 - (frame / totalFrames), 3);
        state.currentWheelRotationAngle = finalWheelRotationAngle * progress;
        state.ballCurrentPhysicsAngle = finalBallRotationAngle * progress;
        updateWheelViewWithBall(state.currentWheelRotationAngle, state.ballCurrentPhysicsAngle);

        if (frame < totalFrames) {
            requestAnimationFrame(step);
        } else {
            state.currentWheelRotationAngle = wheelRemainderAngle;
            state.ballCurrentPhysicsAngle = finalBallRotationAngle;
            updateWheelViewWithBall(state.currentWheelRotationAngle, state.ballCurrentPhysicsAngle);
            finalizeRoundResultsAndPayouts();
        }
    }

    requestAnimationFrame(step);
}

function finalizeRoundResultsAndPayouts() {
    let totalAmountWonThisRound = 0;
    const winningColor = NUMBER_COLORS[state.roundWinningNumber];
    let luckyMultiplierBonus = 1;
    let isLuckyHit = false;

    state.roundLuckyNumbersList.forEach(bonus => {
        if (Number(bonus.num) === state.roundWinningNumber) {
            luckyMultiplierBonus = bonus.mult;
            isLuckyHit = true;
        }
    });

    for (const cellId in state.currentRoundBets) {
        const betValue = Number(state.currentRoundBets[cellId]) || 0;
        if (betValue <= 0) continue;

        if (cellId === 'red' && winningColor === 'red') totalAmountWonThisRound += betValue * 2;
        else if (cellId === 'black' && winningColor === 'black') totalAmountWonThisRound += betValue * 2;
        else if (cellId === 'zero' && state.roundWinningNumber === 0) totalAmountWonThisRound += betValue * 30;
        else if (cellId === 'even' && state.roundWinningNumber !== 0 && state.roundWinningNumber % 2 === 0) totalAmountWonThisRound += betValue * 2;
        else if (cellId === 'odd' && state.roundWinningNumber % 2 !== 0) totalAmountWonThisRound += betValue * 2;
        else if (cellId === 'low' && state.roundWinningNumber >= 1 && state.roundWinningNumber <= 18) totalAmountWonThisRound += betValue * 2;
        else if (cellId === 'high' && state.roundWinningNumber >= 19 && state.roundWinningNumber <= 36) totalAmountWonThisRound += betValue * 2;
        else if (cellId === 'doz1' && state.roundWinningNumber >= 1 && state.roundWinningNumber <= 12) totalAmountWonThisRound += betValue * 3;
        else if (cellId === 'doz2' && state.roundWinningNumber >= 13 && state.roundWinningNumber <= 24) totalAmountWonThisRound += betValue * 3;
        else if (cellId === 'doz3' && state.roundWinningNumber >= 25 && state.roundWinningNumber <= 36) totalAmountWonThisRound += betValue * 3;
        else if (cellId.startsWith('num')) {
            const parsed = parseInt(cellId.replace('num', ''), 10);
            if (parsed === state.roundWinningNumber) {
                totalAmountWonThisRound += betValue * (isLuckyHit ? luckyMultiplierBonus : 30);
            }
        }
    }

    state.playerBalance += totalAmountWonThisRound;
    refreshUI();

    if (totalAmountWonThisRound > 0) {
        adjustRemoteBalance(totalAmountWonThisRound);
    }

    displayRoundWinnerModalPopup(totalAmountWonThisRound, isLuckyHit, luckyMultiplierBonus);
}

function displayRoundWinnerModalPopup(amountWon, isLuckyHit, luckyBonus) {
    const modalNum = el('modal-winning-number');
    if (modalNum) {
        modalNum.innerText = state.roundWinningNumber;
        modalNum.style.color = state.roundWinningNumber === 0 ? 'var(--neon-green)' : NUMBER_COLORS[state.roundWinningNumber] === 'red' ? 'var(--neon-red)' : '#ffffff';
    }

    const badge = el('modal-winning-multiplier-badge');
    if (badge) {
        if (isLuckyHit) {
            badge.innerText = `LUCKY BONUS x${luckyBonus}!`;
            badge.style.background = 'rgba(245, 158, 11, 0.2)';
            badge.style.borderColor = 'var(--neon-gold)';
            badge.style.color = '#fef08a';
        } else {
            badge.innerText = 'x30';
            badge.style.background = 'rgba(16, 185, 129, 0.2)';
            badge.style.borderColor = 'var(--neon-green)';
            badge.style.color = '#a7f3d0';
        }
    }

    const statusText = el('modal-player-win-status-text');
    if (statusText) {
        if (amountWon > 0) {
            statusText.innerHTML = `🎉 Выиграли:<br><span style="color: var(--neon-gold); font-size: 20px; font-weight: 900;">+ ${amountWon} W</span>`;
            triggerHaptic('success');
        } else {
            statusText.innerText = 'В этот раз не повезло.';
        }
    }

    const modal = el('wp-result-modal-popup');
    if (modal) modal.style.display = 'flex';

    const historyLine = el('wp-history-line');
    if (historyLine) {
        const circle = document.createElement('div');
        circle.className = `hist-circle ${NUMBER_COLORS[state.roundWinningNumber]}`;
        circle.innerText = state.roundWinningNumber;
        historyLine.insertBefore(circle, historyLine.firstChild);
        while (historyLine.children.length > 10) historyLine.removeChild(historyLine.lastChild);
    }
}

function closeResultModalPopup() {
    const modal = el('wp-result-modal-popup');
    if (modal) modal.style.display = 'none';

    state.currentRoundBets = {};
    state.totalRoundBetSum = 0;
    state.activeBetAmount = 100;
    state.isGameSessionActive = false;
    state.secondsRemaining = 20;

    document.querySelectorAll('.wp-bet-trigger-btn').forEach(btn => {
        btn.classList.remove('wp-bet-active-glow', 'has-bets-placed');
        const chip = btn.querySelector('.wp-live-chip-badge');
        if (chip) chip.remove();
    });

    const field = el('wp-bet-field');
    if (field) {
        field.disabled = false;
        field.value = state.activeBetAmount;
    }

    drawPremiumRouletteWheel(0);
    refreshUI();
}

function exitRouletteToLobby() {
    triggerHaptic('light');

    if (state.isGameSessionActive && state.secondsRemaining <= 0) {
        if (tg && typeof tg.showAlert === 'function') {
            tg.showAlert('⚠️ Дождитесь окончания раунда.');
            return;
        }
    }

    if (state.countdownTimerInterval) {
        clearInterval(state.countdownTimerInterval);
        state.countdownTimerInterval = null;
    }

    location.href = 'index.html';
}

function openAdminMenu() {
    let choice = prompt('УПРАВЛЕНИЕ WOG:\n1 - Обновить баланс\n2 - Синхронизировать баланс\n3 - Перезагрузить игру', '1');
    if (!choice) return;

    if (choice === '1') {
        const amount = prompt('Сколько добавить/убавить?', '100000');
        if (amount && !isNaN(amount)) {
            adjustRemoteBalance(parseInt(amount, 10));
        }
    } else if (choice === '2') {
        syncBalanceFromServer();
    } else if (choice === '3') {
        location.reload();
    }
}

async function initGameEngineOnLoad() {
    setupTelegram();
    renderProfile();
    buildNumbersKeyboardLayout();
    drawPremiumRouletteWheel(0);
    await generateSecureRoundData();
    updateLuckyNumbersUI();

    const field = el('wp-bet-field');
    if (field) {
        field.value = state.activeBetAmount;
        field.addEventListener('change', () => {
            const next = parseInt(field.value, 10) || 0;
            state.activeBetAmount = Math.max(10, next);
            field.value = state.activeBetAmount;
        });
    }

    const balDisplay = el('wp-balance-display');
    if (balDisplay) balDisplay.innerText = 'Загрузка...';

    if (tg && tg.initData) {
        await syncBalanceFromServer();
    } else {
        state.playerBalance = 100000;
        refreshUI();
    }
}

window.modifyBetSize = modifyBetSize;
window.addChipValue = addChipValue;
window.toggleKeyboardLayout = toggleKeyboardLayout;
window.placeBetOnCell = placeBetOnCell;
window.startRoundCountdownTimer = startRoundCountdownTimer;
window.generateSecureRoundData = generateSecureRoundData;
window.animateLuckyNumbersSlots = animateLuckyNumbersSlots;
window.fixSingleLuckySlotUI = fixSingleLuckySlotUI;
window.updateLuckyNumbersUI = updateLuckyNumbersUI;
window.drawPremiumRouletteWheel = drawPremiumRouletteWheel;
window.updateWheelViewWithBall = updateWheelViewWithBall;
window.initiateWheelSpinAnimation = initiateWheelSpinAnimation;
window.finalizeRoundResultsAndPayouts = finalizeRoundResultsAndPayouts;
window.displayRoundWinnerModalPopup = displayRoundWinnerModalPopup;
window.closeResultModalPopup = closeResultModalPopup;
window.exitRouletteToLobby = exitRouletteToLobby;
window.openAdminMenu = openAdminMenu;
window.refreshUI = refreshUI;
window.syncBalanceFromServer = syncBalanceFromServer;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGameEngineOnLoad);
} else {
    initGameEngineOnLoad();
}
