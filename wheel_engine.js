// Инициализация Telegram WebApp и конфигурация
const tg = window.Telegram?.WebApp;
if (tg) {
    try { tg.expand(); tg.ready(); tg.enableClosingConfirmation?.(); } catch(e) {}
    if (tg.BackButton) { tg.BackButton.show(); tg.BackButton.onClick(() => window.history.back()); }
}

const SERVER_URL = "https://onrender.com";
const NUMBER_COLORS = {0:"green",...Object.fromEntries(Array.from({length:36},(_,i)=>i+1).map(i=>[i,i%2===0?'black':'red']))};

// Глобальные переменные состояния
let playerBalance = parseInt(localStorage.getItem('wog_secure_balance')) || 100000;
let activeBetAmount = 100, currentRoundBets = {}, totalRoundBetSum = 0, isGameSessionActive = false;

// Генерация игрового поля (36 чисел + 0)
function buildNumbersKeyboardLayout() {
    const container = document.getElementById('wp-num-keys-generator-box');
    if (!container) return;
    container.innerHTML = "";
    [0,...Array.from({length:36},(_,i)=>i+1)].forEach(num => {
        const btn = document.createElement('button');
        const color = NUMBER_COLORS[num];
        btn.className = `wp-bet-trigger-btn wp-btn-${color}`;
        btn.id = `cell-num${num}`;
        btn.innerHTML = `${num} <span class="wp-badge-x">x30</span>`;
        btn.onclick = () => placeBetOnCell(`num${num}`);
        container.appendChild(btn);
    });
}
buildNumbersKeyboardLayout();
// Часть 2: UI, Управление ставками, Размещение ставок
function refreshUI() {
    // ... [код функции обновления отображения баланса и ставок из вашего источника] [1.1]
}

function modifyBetSize(action) {
    // ... [код функции x2, /2 из вашего источника] [1.1]
}

function addChipValue(amount) {
    // ... [код функции добавления фишек из вашего источника] [1.1]
}

function toggleKeyboardLayout(layoutName) {
    // ... [код функции переключения раскладки из вашего источника] [1.1]
}

function placeBetOnCell(cellId) {
    // ... [код функции размещения ставки из вашего источника] [1.1]
}
// Часть 3: Таймер, Provably Fair (SHA-256) и Анимация слотов (обновлено)
function startRoundCountdownTimer() {
    isGameSessionActive = true; secondsRemaining = 20;
    // ... [Логика таймера]
    countdownTimerInterval = setInterval(async () => {
        // ... [Логика окончания таймера]
            await generateSecureRoundData();
            animateLuckyNumbersSlots();
        // ...
    }, 1000);
}

// Генерация данных раунда и SHA-256 хэш
async function generateSecureRoundData() {
    // ... [Генерация случайных чисел и соли]
    // Web Crypto API SHA-256
    try {
        const msgBuffer = new TextEncoder().encode(rawData);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        // ... [Отображение хэша]
    } catch (e) { console.error("Crypto API error", e); }
}

// Улучшенная анимация слотов с размытием
function animateLuckyNumbersSlots() {
    // ... [Логика анимации слотов с blur]
    requestAnimationFrame(update);
}
// Часть 4: Рендеринг Canvas, Расчет выигрышей и Инициализация
const canvas = document.getElementById('wheel-render-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
let currentWheelRotationAngle = 0, ballCurrentPhysicsAngle = 0;

// Отрисовка колеса и анимация шарика
function drawPremiumRouletteWheel(wheelAngle, ballAngle, displayBall = false) { /* ... код отрисовки canvas ... */ }
function updateWheelViewWithBall(wheelAngle, ballAngle) { /* ... код обновления view ... */ }
function initiateWheelSpinAnimation() { /* ... физика спина ... */ }

// Логика выплат и модального окна
function finalizeRoundResultsAndPayouts() { /* ... расчет выигрышей ... */ }
function displayRoundWinnerModalPopup(amount, isLucky, bonus) { /* ... отображение результатов ... */ }
function closeResultModalPopup() { /* ... сброс раунда ... */ }

// Инициализация игры
async function initGameEngineOnLoad() {
    drawPremiumRouletteWheel(0, 0, false);
    await generateSecureRoundData(); updateLuckyNumbersUI();
    if (!localStorage.getItem('wog_secure_balance')) { localStorage.setItem('wog_secure_balance', 100000); }
    playerBalance = parseInt(localStorage.getItem('wog_secure_balance')); refreshUI();
}
initGameEngineOnLoad();
