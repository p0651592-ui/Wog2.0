// ============================================================================
// WOG PREMIUM CASINO ENGINE: WHEEL APP (PART 1 OF 10)
// PROVABLY FAIR SYSTEM & ADVANCED GRAPHICS IMPLEMENTATION
// ============================================================================

const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

// СИСТЕМНОЕ ЛОГИРОВАНИЕ ДЛЯ ОТЛАДКИ ВНУТРИ TELEGRAM MINI APP
const WogLogger = {
    info: (msg, data = "") => console.log(`[WOG-INFO] [${new Date().toISOString()}] ${msg}`, data),
    error: (msg, err = "") => console.error(`[WOG-ERROR] [${new Date().toISOString()}] ${msg}`, err),
    warn: (msg, data = "") => console.warn(`[WOG-WARN] [${new Date().toISOString()}] ${msg}`, data)
};

WogLogger.info("Инициализация ядра игрового движка Wheel+...");

if (tg) {
    try {
        tg.expand();
        tg.ready();
        WogLogger.info("Telegram WebApp SDK успешно подключен и развернут на весь экран.");
        
        if (tg.BackButton) {
            tg.BackButton.show();
            tg.BackButton.offClick();
            tg.BackButton.onClick(() => {
                WogLogger.info("Нажата системная кнопка 'Назад'. Возврат в главное меню лобби.");
                location.href = "index.html";
            });
        }
        
        if (typeof tg.enableClosingConfirmation === 'function') {
            tg.enableClosingConfirmation();
            WogLogger.info("Системная защита от случайных свайпов вниз успешно активирована.");
        }
    } catch (sdkError) {
        WogLogger.error("Критический сбой при инициализации Telegram SDK:", sdkError);
    }
} else {
    WogLogger.warn("Telegram WebApp контекст не обнаружен. Запущено в стандартном браузере.");
}

// НАСТРОЙКИ СВЯЗИ С Python СЕРВЕРОМ FASTAPI
const SERVER_URL = "https://onrender.com";
const MY_ADMIN_ID = 6682822292;
let userId = MY_ADMIN_ID;
let username = "Guest_Player";

if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    userId = tg.initDataUnsafe.user.id;
    username = tg.initDataUnsafe.user.username || tg.initDataUnsafe.user.first_name || "User";
    WogLogger.info(`Авторизован игрок: ${username} (ID: ${userId})`);
} else {
    WogLogger.info(`Используются дефолтные параметры администратора (ID: ${userId})`);
}
// ============================================================================
// WOG PREMIUM CASINO ENGINE: WHEEL APP (PART 2 OF 10)
// CONFIGURATION MATRICES & GAME STATE MANAGER
// ============================================================================

// --- СЕКТОРА И МНОЖИТЕЛИ ---
// Стандартный массив европейской рулетки (0-36)
const WHEEL_NUMBERS = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

// Таблица множителей (weights) для слотов Lucky Numbers
const MULTIPLIER_OPTIONS = [50, 50, 50, 50, 50, 50, 50, 50, 100, 100, 100, 100, 150, 150, 150, 200, 200, 250, 300, 500];

// Цветовая карта секторов (для UI)
const NUMBER_COLORS = { 0: "green", 1: "red", 2: "black", /* ... и т.д. ... */ };

// --- ГЛОБАЛЬНЫЙ МЕНЕДЖЕР СОСТОЯНИЙ ---
let playerBalance = parseInt(localStorage.getItem('wog_secure_balance')) || 100000;
let activeBetAmount = 100;
let currentRoundBets = {};
let totalRoundBetSum = 0;

// Управление таймерами и логикой раундов
let isGameSessionActive = false;
let secondsRemaining = 20;
let roundWinningNumber = 0;

WogLogger.info("Конфигурационные матрицы и менеджер состояний инициализированы.");
// ============================================================================
// WOG PREMIUM CASINO ENGINE: WHEEL APP (PART 3 OF 10)
// CORE LAYOUT GENERATOR & INTERACTIVE UI SYNC
// ============================================================================

// ГЕНЕРАТОР КНОПОК ТОЧНЫХ ЧИСЕЛ ДЛЯ СКРЫТОЙ КЛАВИАТУРЫ СТОЛА СТАВОК
function buildNumbersKeyboardLayout() {
    WogLogger.info("Запуск генерации цифровой сетки стола ставок 0-36...");
    const container = document.getElementById('wp-num-keys-generator-box');
    if (!container) {
        WogLogger.error("Критическая ошибка: Контейнер '#wp-num-keys-generator-box' не найден в HTML.");
        return;
    }
    container.innerHTML = "";
    
    // Создаем отдельно зеро-кнопку
    const zeroBtn = document.createElement('button');
    zeroBtn.className = "wp-bet-trigger-btn wp-btn-green";
    zeroBtn.id = "cell-num0";
    zeroBtn.innerHTML = `0 <span class="wp-badge-x">x30</span>`;
    zeroBtn.onclick = () => placeBetOnCell('num0');
    container.appendChild(zeroBtn);
    
    // Генерируем остальные 36 кнопок с правильной цветовой кодировкой
    for (let i = 1; i <= 36; i++) {
        const btn = document.createElement('button');
        const btnColorClass = NUMBER_COLORS[i] === 'red' ? 'wp-btn-red' : 'wp-btn-black';
        btn.className = `wp-bet-trigger-btn ${btnColorClass}`;
        btn.id = `cell-num${i}`;
        btn.innerHTML = `${i} <span class="wp-badge-x">x30</span>`;
        btn.onclick = () => placeBetOnCell(`num${i}`);
        container.appendChild(btn);
    }
    WogLogger.info("Цифровая сетка стола ставок успешно сгенерирована и привязана.");
}

// РАСШИРЕННЫЙ МОДУЛЬ СИНХРОНИЗАЦИИ БАЛАНСОВ И ДАННЫХ СТАВКИ НА ЭКРАНЕ
function refreshUI() {
    const balDisplay = document.getElementById('wp-balance-display');
    const betDisplay = document.getElementById('wp-player-total-bet');
    
    if (balDisplay) {
        balDisplay.innerText = playerBalance;
    } else {
        WogLogger.warn("Элемент отображения баланса '#wp-balance-display' отсутствует на странице.");
    }
    
    if (betDisplay) {
        betDisplay.innerText = `${totalRoundBetSum} W`;
    } else {
        WogLogger.warn("Элемент отображения суммы ставок '#wp-player-total-bet' отсутствует.");
    }
    
    try {
        localStorage.setItem('wog_secure_balance', playerBalance);
    } catch (storageError) {
        WogLogger.error("Не удалось сохранить баланс в LocalStorage:", storageError);
    }
}
// ============================================================================
// WOG PREMIUM CASINO ENGINE: WHEEL APP (PART 4 OF 10)
// BET CONTROLLER, QUICK CHIPS MANAGER & LAYOUT TOGGLER
// ============================================================================

// РЕГУЛИРОВКА РАЗМЕРА СТАВКИ КНОПКАМИ УДВОЕНИЯ И ДЕЛЕНИЯ ПОПОЛАМ
function modifyBetSize(action) {
    if (isGameSessionActive && secondsRemaining <= 0) {
        WogLogger.warn("Попытка изменить ставку после закрытия приёма ставок.");
        return;
    }
    
    let field = document.getElementById('wp-bet-field');
    if (!field) {
        WogLogger.error("Поле ввода размера ставки '#wp-bet-field' не найдено.");
        return;
    }
    
    let current = parseInt(field.value) || 100;
    if (action === 'x2') {
        current = Math.min(playerBalance, current * 2);
        WogLogger.info(`Ставка удвоена: ${current} W`);
    } else if (action === '/2') {
        current = Math.max(10, Math.floor(current / 2));
        WogLogger.info(`Ставка поделена: ${current} W`);
    }
    
    field.value = current;
    activeBetAmount = current;
}

// ДОБАВЛЕНИЕ МОНЕТ С ПАНЕЛИ БЫСТРЫХ СИСТЕМНЫХ ФИШЕК КАЗИНО (+10, +100, +1K, +25K)
function addChipValue(amount) {
    if (isGameSessionActive && secondsRemaining <= 0) {
        WogLogger.warn("Попытка добавить фишку после закрытия приёма ставок.");
        return;
    }
    
    let field = document.getElementById('wp-bet-field');
    if (!field) {
        WogLogger.error("Поле ввода размера ставки '#wp-bet-field' не найдено.");
        return;
    }
    
    let current = parseInt(field.value) || 0;
    let targetAmount = current + amount;
    
    if (targetAmount > playerBalance) {
        WogLogger.warn(`Превышен доступный баланс. Ограничение до максимума: ${playerBalance} W`);
        targetAmount = playerBalance;
    }
    
    field.value = targetAmount;
    activeBetAmount = targetAmount;
    WogLogger.info(`Добавлена фишка +${amount}. Итоговый инпут ставки: ${targetAmount} W`);
}

// ПЕРЕКЛЮЧАТЕЛЬ СЛОЕВ СТОЛА СТАВОК (ОБЩЕЕ ПОЛЕ / СЕТКА ТОЧНЫХ НОМЕРОВ 1-36)
function toggleKeyboardLayout(layoutName) {
    const mainView = document.getElementById('wp-main-table-view');
    const numKeysView = document.getElementById('wp-numbers-keyboard-view');
    
    if (!mainView || !numKeysView) {
        WogLogger.error("Критическая ошибка: Элементы переключения слоев стола отсутствуют в HTML.");
        return;
    }
    
    if (layoutName === 'numbers') {
        mainView.style.display = "none";
        numKeysView.style.display = "grid";
        WogLogger.info("Переключение интерфейса на слой точных номеров (0-36).");
    } else {
        mainView.style.display = "flex";
        numKeysView.style.display = "none";
        WogLogger.info("Переключение интерфейса на слой общих игровых исходов.");
    }
}
// ============================================================================
// WOG PREMIUM CASINO ENGINE: WHEEL APP (PART 5 OF 10)
// CORE BET PLACEMENT ENGINE & SECURITY TIMERS
// ============================================================================

// ЯДРО ФИКСАЦИИ СТАВОК НА ИНТЕРФАКТИВНОМ ИГРОВОМ СТОЛЕ КАЗИНО
function placeBetOnCell(cellId) {
    // [Опущено для краткости: Проверки активного раунда, полей ввода и баланса]
    // [Опущено для краткости: Обновление данных ставок, UI и тактильная отдача]
    // [Опущено для краткости: Запуск таймера при первой ставке]
}

// СИСТЕМНОЕ УПРАВЛЕНИЕ 20-СЕКУНДНЫМ ТАЙМЕРОМ ОБРАТНОГО ОТСЧЕТА РАУНДА
function startRoundCountdownTimer() {
    // [Опущено для краткости: Инициализация таймера, обновление UI]
    // [Опущено для краткости: Логика тиканья (20 сек), генерация данных и анимация]
}
// ============================================================================
// WOG PREMIUM CASINO ENGINE: WHEEL APP (PART 6 OF 10)
// PROVABLY FAIR SYSTEM & ADVANCED SLOTS MOTION BLUR CRYPTO ENGINE
// ============================================================================

// --- Модуль Provably Fair (SHA-256 через Web Crypto API) ---
async function generateSecureRoundData() {
    // [Опущено: Генерация случайных чисел, соли и формирование строки раунда]
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(rawRoundString);
        // Аппаратное хеширование SHA-256
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const calculatedSha256Hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        // [Опущено: Обновление DOM-элемента с хешем]
    } catch (cryptoError) {
        WogLogger.error("Критический сбой Web Crypto API:", cryptoError);
    }
}

// --- Функция анимации слотов с Motion Blur ---
function animateLuckyNumbersSlots() {
    // [Опущено: Инициализация переменных анимации и DOM-элементов]
    // Применение Motion Blur ко всем слотам
    slots.forEach(slot => {
        if (slot.num) slot.num.style.filter = "blur(3px)";
        if (slot.mult) slot.mult.style.filter = "blur(3px)";
    });

    function updateSlotsPhysics() {
        // [Опущено: Логика обновления чисел и множителей в кадрах]
        // [Опущено: Завершение анимации и вызов следующего этапа]
    }
    requestAnimationFrame(updateSlotsPhysics);
}
// ============================================================================
// WOG PREMIUM CASINO ENGINE: WHEEL APP (PART 7 OF 10)
// BOUNCE PHYSICS, MULTIPLIER COLORS & CANVAS INITIALIZATION
// ============================================================================

function fixSingleLuckySlotUI(slotIndex) {
    WogLogger.info(`Фиксация и отрисовка эффектов для слота #${slotIndex + 1}`);
    const data = roundLuckyNumbersList[slotIndex];
    if (!data) return;

    const numElement = document.getElementById(`lucky-num-${slotIndex + 1}`);
    const multElement = document.getElementById(`lucky-mult-${slotIndex + 1}`);

    if (numElement && multElement) {
        numElement.innerText = data.num;
        multElement.innerText = `${data.mult}X`;

        const box = numElement.parentElement;
        if (box) {
            // Эффект отскока
            box.style.transform = "scale(1.15)";
            setTimeout(() => { box.style.transform = "scale(1)"; }, 150);

            // Цветовая индикация
            if (data.mult >= 300) {
                box.style.borderColor = "var(--color-gold)";
                box.style.boxShadow = "0 0 20px rgba(245, 158, 11, 0.6)";
            } else if (data.mult >= 100) {
                box.style.borderColor = "var(--color-purple)";
                box.style.boxShadow = "0 0 20px rgba(99, 102, 241, 0.6)";
            } else {
                box.style.borderColor = "var(--color-blue)";
                box.style.boxShadow = "0 0 20px rgba(37, 99, 235, 0.5)";
            }
        }
    }
}

// Инициализация Canvas
const canvas = document.getElementById('wheel-render-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
let currentWheelRotationAngle = 0;
// ... (остальной код инициализации)
// ============================================================================
// WOG PREMIUM CASINO ENGINE: WHEEL APP (PART 8 OF 10)
// ADVANCED CANVAS GRAPHICS & RADIAL TRIGONOMETRY ENGINE
// ============================================================================

function drawPremiumRouletteWheel(wheelAngle, ballAngle, displayBall = false) {
    if (!canvas || !ctx) {
        WogLogger.error("Критический сбой графики: Графический контекст Canvas не инициализирован.");
        return;
    }
    
    // Полная очистка холста перед каждым кадром анимации
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const outerRadius = canvas.width / 2 - 10;
    const totalSectors = WHEEL_NUMBERS.length;
    const arcLengthPerSector = (2 * Math.PI) / totalSectors;
    
    // Сохраняем чистый контекст и смещаем центр координат для вращения колеса
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(wheelAngle);
    
    // Посекторная отрисовка всего колеса
    for (let i = 0; i < totalSectors; i++) {
        const currentSectorNumber = WHEEL_NUMBERS[i];
        const startAngle = i * arcLengthPerSector - Math.PI / 2 - arcLengthPerSector / 2;
        const endAngle = startAngle + arcLengthPerSector;
        
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, outerRadius, startAngle, endAngle);
        ctx.closePath();
        
        // Цветовое кодирование секторов по правилам европейской рулетки
        if (currentSectorNumber === 0) {
            ctx.fillStyle = "#10b981"; // Зеленый зеро
        } else if (NUMBER_COLORS[currentSectorNumber] === "red") {
            ctx.fillStyle = "#e52e4d"; // Фирменный красный
        } else {
            ctx.fillStyle = "#151a30"; // Матовый темный
        }
        
        ctx.fill();
        ctx.strokeStyle = "#29315c"; // Границы секторов
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        // Отрисовка цифр с радиальным разворотом по вектору сектора
        ctx.save();
        ctx.rotate(startAngle + arcLengthPerSector / 2 + Math.PI / 2);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 15px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(currentSectorNumber, 0, -outerRadius + 30);
        ctx.restore();
    }
    
    // Прорисовываем внутренний тёмный обод колеса (барабан)
    ctx.beginPath();
    ctx.arc(0, 0, outerRadius - 45, 0, 2 * Math.PI);
    ctx.fillStyle = "#0c0f1d";
    ctx.fill();
    ctx.strokeStyle = "#29315c";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
}
// ============================================================================
// WOG PREMIUM CASINO ENGINE: WHEEL APP (PART 9 OF 10)
// BALL PHYSICS, OPPOSITE SPIN & PAYOUT MATRIX CALCULATOR
// ============================================================================

// Функция отрисовки шарика с неоновым свечением
function updateWheelViewWithBall(wheelAngle, ballAngle) {
    drawPremiumRouletteWheel(wheelAngle, ballAngle, true);
    // ... (код рендеринга шарика)
}

function initiateWheelSpinAnimation() {
    WogLogger.info(`Запуск анимации спина. Целевое число: ${roundWinningNumber}`);
    
    // Индекс выигрышного числа и углы поворота
    const targetSectorIndex = WHEEL_NUMBERS.indexOf(roundWinningNumber);
    const anglePerSector = (2 * Math.PI) / WHEEL_NUMBERS.length;
    
    // Колесо: 4 оборота + случайный угол
    const finalWheelRotationAngle = (2 * Math.PI * 4) + (Math.random() * Math.PI * 2);
    const wheelRemainderAngle = finalWheelRotationAngle % (2 * Math.PI);
    
    // Шарик: 5 оборотов (в противоход) + подстройка под финальный угол колеса
    const finalBallRotationAngle = -(2 * Math.PI * 5) - (targetSectorIndex * anglePerSector) + wheelRemainderAngle;
    
    let currentAnimationFrameTime = 0;
    const totalDurationFrames = 240; // 4 секунды при 60fps
    
    function processPhysicsFrame() {
        currentAnimationFrameTime++;
        
        if (currentAnimationFrameTime <= totalDurationFrames) {
            // Cubic Ease-Out для торможения
            const progress = 1 - Math.pow(1 - (currentAnimationFrameTime / totalDurationFrames), 3);
            currentWheelRotationAngle = finalWheelRotationAngle * progress;
            ballCurrentPhysicsAngle = finalBallRotationAngle * progress;
            
            updateWheelViewWithBall(currentWheelRotationAngle, ballCurrentPhysicsAngle);
            requestAnimationFrame(processPhysicsFrame);
        } else {
            // Фиксация в целевом секторе
            updateWheelViewWithBall(wheelRemainderAngle, finalBallRotationAngle);
            WogLogger.info(`Шарик зафиксирован в секторе ${roundWinningNumber}.`);
            finalizeRoundResultsAndPayouts();
        }
    }
    requestAnimationFrame(processPhysicsFrame);
}


// Калькулятор выигрышей, проверка ставок и Lucky Numbers
function finalizeRoundResultsAndPayouts() {
    // ... (логика расчета выплат)
    // ... (обновление баланса)
}
// ============================================================================
// WOG PREMIUM CASINO ENGINE: WHEEL APP (PART 10 OF 10)
// WIN MODAL UI, HISTORIC LINE ENGINE & SYSTEM LOAD INITIALIZATION
// ============================================================================

// Функция вывода модального окна результатов раунда
function displayRoundWinnerModalPopup(amountWon, isLuckyHit, luckyBonus) {
    // ... [Логика обновления DOM-элементов окна] ...
    // ... [Добавление нового кружка в историю игры] ...
}

// Функция закрытия окна и мягкого сброса ставок
function closeResultModalPopup() {
    // ... [Сброс переменных ставок и интерфейса] ...
}

// Асинхронная инициализация движка
async function initGameEngineOnLoad() {
    // ... [Инициализация Canvas, Lucky Numbers, Баланса] ...
}

initGameEngineOnLoad();
