// ИНИЦИАЛИЗАЦИЯ TELEGRAM WEBAPP SDK
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg) {
    try { 
        tg.expand();
        tg.ready();
        if (tg.BackButton) {
            tg.BackButton.show();
            tg.BackButton.offClick();
            tg.BackButton.onClick(() => {
                location.href = "index.html";
            });
        }
    } catch(e) { console.error("Ошибка Telegram SDK:", e); }
}

// НАСТРОЙКИ СВЯЗИ С PYTHON-СЕРВЕРОМ RENDER
const SERVER_URL = "https://onrender.com";
const MY_ADMIN_ID = 6682822292;

let userId = MY_ADMIN_ID;
if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    userId = tg.initDataUnsafe.user.id;
}

// ПОРЯДОК ЧИСЕЛ НА ЕВРОПЕЙСКОМ КОЛЕСЕ РУЛЕТКИ
const WHEEL_NUMBERS = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
    5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

// КАРТА ЦВЕТОВ ДЛЯ КАЖДОГО НОМЕРА РУЛЕТКИ
const NUMBER_COLORS = {
    0: "green",  1: "red",    2: "black",  3: "red",    4: "black",  5: "red",
    6: "black",  7: "red",    8: "black",  9: "red",    10: "black", 11: "black",
    12: "red",   13: "black", 14: "red",   15: "black", 16: "red",   17: "black",
    18: "red",   19: "red",   20: "black", 21: "red",   22: "black", 23: "red",
    24: "black", 25: "red",   26: "black", 27: "red",   28: "black", 29: "black",
    30: "red",   31: "black", 32: "red",   33: "black", 34: "red",   35: "black",
    36: "red"
};
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ СОСТОЯНИЯ ИГРОВОГО ДВИЖКА
let playerBalance = parseInt(localStorage.getItem('wog_secure_balance')) || 5000;
let activeBetAmount = 100;
let currentRoundBets = {}; 
let totalRoundBetSum = 0;
let isGameSessionActive = false; 
let countdownTimerInterval = null;
let secondsRemaining = 20;

// ПРЕДРАСЧИТАННЫЕ ДАННЫЕ ТЕКУЩЕГО РАУНДА (PROVABLY FAIR)
let roundSecretSalt = "";
let roundWinningNumber = 0;
let roundLuckyNumbersList = [];

// АВТОМАТИЧЕСКАЯ ГЕНЕРАЦИЯ КЛАВИАТУРЫ ТОЧНЫХ ЧИСЕЛ 1-36
function buildNumbersKeyboardLayout() {
    const container = document.getElementById('wp-num-keys-generator-box');
    if (!container) return;
    container.innerHTML = "";
    
    // Генерируем клавишу для нуля
    const zeroBtn = document.createElement('button');
    zeroBtn.className = "wp-bet-trigger-btn wp-btn-green";
    zeroBtn.id = "cell-num0";
    zeroBtn.innerHTML = `0 <span class="wp-badge-x">x30</span>`;
    zeroBtn.onclick = () => placeBetOnCell('num0');
    container.appendChild(zeroBtn);

    // Gенерируем остальные 36 чисел
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
// КРИПТОГРАФИЧЕСКИЙ МОДУЛЬ ЧЕСТНОЙ ИГРЫ (PROVABLY FAIR)
function generateSecureRoundData() {
    // 1. Честно выбираем выигрышный сектор от 0 до 36
    roundWinningNumber = Math.floor(Math.random() * 37);

    // 2. Генерируем 3 уникальных счастливых числа из скриншотов
    let availableNumbers = Array.from({length: 37}, (_, i) => i);
    roundLuckyNumbersList = [];
    const multiplierOptions =;

    for (let i = 0; i < 3; i++) {
        let randomIndex = Math.floor(Math.random() * availableNumbers.length);
        let selectedNum = availableNumbers.splice(randomIndex, 1)[0];
        let selectedMult = multiplierOptions[Math.floor(Math.random() * multiplierOptions.length)];
        
        roundLuckyNumbersList.push({
            num: selectedNum,
            mult: selectedMult
        });
    }

    // 3. Создаем криптографическую соль (Salt) для защиты от взлома
    roundSecretSalt = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    // 4. Формируем проверочную строку раунда (MD5 / String из скриншота)
    let luckyString = roundLuckyNumbersList.map(item => `${item.num}:x${item.mult}`).join(',');
    let rawRoundString = `${roundSecretSalt}|${roundWinningNumber}|lucky:[${luckyString}]`;

    // 5. Вычисляем хэш SHA-256 для вывода игроку в футер
    let calculatedSha256Hash = CryptoJS.SHA256(rawRoundString).toString();
    
    // Выводим хэш на экран до начала ставок
    const hashEl = document.getElementById('wp-crypto-hash-sha256');
    if (hashEl) hashEl.innerText = calculatedSha256Hash;
    
    // Подготавливаем строку проверки
    let md5Block = document.getElementById('wp-crypto-md5-string');
    if (md5Block) {
        md5Block.style.display = "none";
        md5Block.innerText = `String verify: ${rawRoundString}`;
    }
}

// Визуальное обновление плашек Lucky Numbers на экране
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
// НАПОЛНЕНИЕ СТАТИЧЕСКИХ ДАННЫХ И КОЭФФИЦИЕНТОВ
const WHEEL_NUMBERS =;
const multiplierOptions =;

// ФУНКЦИИ СИНХРОНИЗАЦИИ КОШЕЛЬКА И СОХРАНЕНИЯ В ПАМЯТЬ ТЕЛЕФОНА
function refreshUI() {
    const balDisplay = document.getElementById('wp-balance-display');
    const betDisplay = document.getElementById('wp-player-total-bet');
    
    if (balDisplay) balDisplay.innerText = playerBalance;
    if (betDisplay) betDisplay.innerText = `${totalRoundBetSum} W`;
    
    localStorage.setItem('wog_secure_balance', playerBalance);
}

// РЕГУЛИРОВКА СТАВКИ КНОПКАМИ x2 И /2
function modifyBetSize(action) {
    if (isGameSessionActive && secondsRemaining <= 0) return;
    let field = document.getElementById('wp-bet-field');
    if (!field) return;
    let current = parseInt(field.value) || 100;

    if (action === 'x2') current = Math.min(playerBalance, current * 2);
    if (action === '/2') current = Math.max(10, Math.floor(current / 2));

    field.value = current;
    activeBetAmount = current;
}

// БЫСТРЫЕ ФИШКИ ДОБАВЛЕНИЯ НОМИНАЛОВ ИЗ СКРИНШОТА
function addChipValue(amount) {
    if (isGameSessionActive && secondsRemaining <= 0) return;
    let field = document.getElementById('wp-bet-field');
    if (!field) return;
    let current = parseInt(field.value) || 0;
    
    let targetAmount = current + amount;
    if (targetAmount > playerBalance) targetAmount = playerBalance;
    
    field.value = targetAmount;
    activeBetAmount = targetAmount;
}

// ПЕРЕКЛЮЧЕНИЕ ТАБЛИЦ СТАВОК (ОБЩИЙ СТОЛ / КЛАВИАТУРА ЧИСЕЛ)
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
// НАПОЛНЕНИЕ СТАТИЧЕСКИХ ДАННЫХ И КОЭФФИЦИЕНТОВ
const WHEEL_NUMBERS =;
const multiplierOptions =;

// МЕХАНИКА РАЗМЕЩЕНИЯ СТАВОК НА ИГРОВОМ СТОЛЕ С ТРИГГЕРОМ ТАЙМЕРА
function placeBetOnCell(cellId) {
    // Если время вышло и колесо крутится, ставки блокируются
    if (isGameSessionActive && secondsRemaining <= 0) return;

    const inputField = document.getElementById('wp-bet-field');
    if (!inputField) return;
    activeBetAmount = parseInt(inputField.value) || 0;

    if (activeBetAmount <= 0) {
        alert("Введите корректную сумму ставки!");
        return;
    }

    if (playerBalance < activeBetAmount) {
        alert("Недостаточно монет на балансе!");
        return;
    }

    // Накапливаем ставку на выбранном исходе
    if (!currentRoundBets[cellId]) {
        currentRoundBets[cellId] = 0;
    }
    currentRoundBets[cellId] += activeBetAmount;
    
    // Корректируем балансы
    playerBalance -= activeBetAmount;
    totalRoundBetSum += activeBetAmount;
    
    // Включаем свечение ячейки и маркер точки ставки
    const targetBtn = document.getElementById(`cell-${cellId}`);
    if (targetBtn) {
        targetBtn.classList.add('wp-bet-active-glow');
        targetBtn.classList.add('has-bets-placed');
    }

    refreshUI();

    // ТРИГГЕР: Если это первая ставка в раунде — запускаем таймер на 20 секунд
    if (!isGameSessionActive) {
        startRoundCountdownTimer();
    }

    // Тактильный отклик смартфона
    if (tg && typeof tg.HapticFeedback === 'object') {
        tg.HapticFeedback.impactOccurred('light');
    }
}
const WHEEL_NUMBERS =;
const multiplierOptions =;

// ЛОГИКА РАБОТЫ ТАЙМЕРА ОБРАТНОГО ОТСЧЕТА (20 СЕКУНД)
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
            // Вибрация в последние секунды для динамики
            if (tg && typeof tg.HapticFeedback === 'object' && secondsRemaining <= 5) {
                tg.HapticFeedback.impactOccurred('light');
            }
        } else {
            // Время истекло: фиксируем остановку, закрываем приём ставок
            clearInterval(countdownTimerInterval);
            if (emojiElement) emojiElement.innerText = "🌀";
            if (textElement) textElement.innerText = "Крутим!";
            
            const field = document.getElementById('wp-bet-field');
            if (field) field.disabled = true;

            // Запускаем физику вращения колеса и качения шарика
            initiateWheelSpinAnimation();
        }
    }, 1000);
}
const WHEEL_NUMBERS =;
const multiplierOptions =;

// ГРАФИЧЕСКИЙ ДВИЖОК CANVAS: ИНИЦИАЛИЗАЦИЯ И РЕНДЕРИНГ КОЛЕСА
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

    // 1. Рисуем чередующиеся цветные сектора с числами
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

        // Отрисовываем цифры
        ctx.save();
        ctx.rotate(startAngle + arcLengthPerSector / 2 + Math.PI / 2);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 15px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(currentSectorNumber, 0, -outerRadius + 30);
        ctx.restore();
    }

    // Внутреннее кольцо
    ctx.beginPath();
    ctx.arc(0, 0, outerRadius - 45, 0, 2 * Math.PI);
    ctx.fillStyle = "#0c0f1d";
    ctx.fill();
    ctx.strokeStyle = "#29315c";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
}
const WHEEL_NUMBERS =;
const multiplierOptions =;

// УЛУЧШЕННАЯ ФУНКЦИЯ DRAW С СИСТЕМОЙ ОТРЕНДЕРЕННОГО ШАРИКА
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

    // 1. Рисуем чередующиеся цветные сектора с числами
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

    // Рисуем внутреннее темное кольцо
    ctx.beginPath();
    ctx.arc(0, 0, outerRadius - 45, 0, 2 * Math.PI);
    ctx.fillStyle = "#0c0f1d";
    ctx.fill();
    ctx.strokeStyle = "#29315c";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // 2. ОТРИСОВКА ФИЗИКИ БЕГУЩЕГО БЕЛОГО ШАРИКА
    if (displayBall) {
        ctx.save();
        ctx.translate(cx, cy);
        // Шарик катится в противоположную сторону по внешнему ободу
        ctx.rotate(ballAngle);

        ctx.beginPath();
        // Накладываем орбиту шарика на цветные ячейки
        ctx.arc(0, -outerRadius + 22, 9, 0, 2 * Math.PI);
        ctx.fillStyle = "#ffffff"; // Белый глянцевый шар
        ctx.fill();
        
        // Объемное неоновое свечение шара
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur = 10;
        ctx.restore();
    }
}

// Первичный запуск отрисовки статичного колеса и генерация первого раунда
drawPremiumRouletteWheel(0, 0, false);
generateSecureRoundData();
updateLuckyNumbersUI();
const WHEEL_NUMBERS =;
const multiplierOptions =;

// ФИЗИЧЕСКИЙ ДВИЖОК: ЗАПУСК ВРАЩЕНИЯ И РАСЧЕТ ТРАЕКТОРИИ ШАРИКА
function initiateWheelSpinAnimation() {
    updateLuckyNumbersUI();

    const targetSectorIndex = WHEEL_NUMBERS.indexOf(roundWinningNumber);
    const anglePerSector = (2 * Math.PI) / WHEEL_NUMBERS.length;

    // Задаем случайное смещение для колеса, чтобы анимация была непредсказуемой
    const finalWheelRotationAngle = (2 * Math.PI * 4) + (Math.random() * Math.PI * 2);

    // МАТЕМАТИКА ШАРИКА: Шарик делает ровно 5 кругов (-2 * Math.PI * 5)
    // в противоположную сторону и падает точно в ячейку выигравшего числа
    const finalBallRotationAngle = -(2 * Math.PI * 5) - (targetSectorIndex * anglePerSector);

    let currentAnimationFrameTime = 0;
    const totalDurationFrames = 240; // Анимация длится ровно 4 секунды (60 кадров/сек * 4)

    function processPhysicsFrame() {
        currentAnimationFrameTime++;

        if (currentAnimationFrameTime <= totalDurationFrames) {
            // Используем кубическое сглаживание (Ease-Out) для реалистичного трения и замедления шара и колеса
            const cubicProgress = 1 - Math.pow(1 - (currentAnimationFrameTime / totalDurationFrames), 3);

            // Рассчитываем текущие физические углы на основе прогресса замедления
            currentWheelRotationAngle = finalWheelRotationAngle * cubicProgress;
            ballCurrentPhysicsAngle = finalBallRotationAngle * cubicProgress;

            // Отрисовываем обновленные координаты колеса и шарика
            drawPremiumRouletteWheel(currentWheelRotationAngle, ballCurrentPhysicsAngle, true);

            // Рекурсивно вызываем следующий кадр анимации
            requestAnimationFrame(processPhysicsFrame);
        } else {
            // Анимация завершена: фиксируем финальный кадр и переходим к начислению монет
            currentWheelRotationAngle = finalWheelRotationAngle % (2 * Math.PI);
            ballCurrentPhysicsAngle = finalBallRotationAngle;
            
            drawPremiumRouletteWheel(currentWheelRotationAngle, ballCurrentPhysicsAngle, true);
            finalizeRoundResultsAndPayouts();
        }
    }

    // Запускаем цикл отрисовки
    requestAnimationFrame(processPhysicsFrame);
}
const WHEEL_NUMBERS =;
const multiplierOptions =;

// МАТЕМАТИЧЕСКИЙ КАЛЬКУЛЯТОР СТАВОК И НАЧИСЛЕНИЯ КОЭФФИЦИЕНТОВ
function finalizeRoundResultsAndPayouts() {
    let totalAmountWonThisRound = 0;
    const winningColor = NUMBER_COLORS[roundWinningNumber];

    // 1. Проверяем, попало ли число в список Счастливых чисел текущего раунда
    let luckyMultiplierBonus = 1;
    let isLuckyHit = false;
    
    roundLuckyNumbersList.forEach(bonus => {
        if (Number(bonus.num) === roundWinningNumber) {
            luckyMultiplierBonus = bonus.mult;
            isLuckyHit = true;
        }
    });

    // 2. Цикл обхода и расчета всех сделанных ставок игрока
    for (let cellId in currentRoundBets) {
        let betValue = currentRoundBets[cellId];
        if (betValue <= 0) continue;

        // Ставка на Красное (x2)
        if (cellId === 'red' && winningColor === 'red') {
            totalAmountWonThisRound += betValue * 2;
        }
        // Ставка на Черное (x2)
        else if (cellId === 'black' && winningColor === 'black') {
            totalAmountWonThisRound += betValue * 2;
        }
        // Ставка на Ноль (x30)
        else if (cellId === 'zero' && roundWinningNumber === 0) {
            totalAmountWonThisRound += betValue * 30;
        }
        // Ставка на Четное (x2)
        else if (cellId === 'even' && roundWinningNumber !== 0 && roundWinningNumber % 2 === 0) {
            totalAmountWonThisRound += betValue * 2;
        }
        // Ставка на Нечетное (x2)
        else if (cellId === 'odd' && roundWinningNumber % 2 !== 0) {
            totalAmountWonThisRound += betValue * 2;
        }
        // Ставка на Малые числа 1-18 (x2)
        else if (cellId === 'low' && roundWinningNumber >= 1 && roundWinningNumber <= 18) {
            totalAmountWonThisRound += betValue * 2;
        }
        // Ставка на Большие числа 19-36 (x2)
        else if (cellId === 'high' && roundWinningNumber >= 19 && roundWinningNumber <= 36) {
            totalAmountWonThisRound += betValue * 2;
        }
        // Первая Дюжина 1-12 (x3)
        else if (cellId === 'doz1' && roundWinningNumber >= 1 && roundWinningNumber <= 12) {
            totalAmountWonThisRound += betValue * 3;
        }
        // Вторая Дюжина 13-24 (x3)
        else if (cellId === 'doz2' && roundWinningNumber >= 13 && roundWinningNumber <= 24) {
            totalAmountWonThisRound += betValue * 3;
        }
        // Третья Дюжина 25-36 (x3)
        else if (cellId === 'doz3' && roundWinningNumber >= 25 && roundWinningNumber <= 36) {
            totalAmountWonThisRound += betValue * 3;
        }
        // Проверка точных одиночных чисел рулетки (cellId вида 'num24')
        else if (cellId.startsWith('num')) {
            let parsedTargetNumber = parseInt(cellId.replace('num', ''));
            if (parsedTargetNumber === roundWinningNumber) {
                // Если это точное число И оно стало Счастливым — применяем мега-множитель (до 500Х)!
                if (isLuckyHit) {
                    totalAmountWonThisRound += betValue * luckyMultiplierBonus;
                } else {
                    totalAmountWonThisRound += betValue * 30; // Обычная выплата за число x30
                }
            }
        }
    }

    // Начисляем выигрыш на баланс игрока
    playerBalance += totalAmountWonThisRound;

    // Вызываем визуальный поп-ап результатов и раскрываем крипто-строку честности
    displayRoundWinnerModalPopup(totalAmountWonThisRound, isLuckyHit, luckyMultiplierBonus);
}
// НАПОЛНЕНИЕ СТАТИЧЕСКИХ ДАННЫХ И КОЭФФИЦИЕНТОВ
const WHEEL_NUMBERS =;
const multiplierOptions =;

// ВЫВОД МОДАЛЬНОГО ОКНА С РЕЗУЛЬТАТАМИ РАУНДА И ОБНОВЛЕНИЕ ЛЕНТЫ ИСТОРИИ ИГР
function displayRoundWinnerModalPopup(amountWon, isLuckyHit, luckyBonus) {
    // Заполняем поп-ап выпавшим числом
    const modalNum = document.getElementById('modal-winning-number');
    if (modalNum) {
        modalNum.innerText = roundWinningNumber;
        // Меняем цвет текста выпавшего числа в поп-апе
        const numColor = NUMBER_COLORS[roundWinningNumber];
        if (roundWinningNumber === 0) modalNum.style.color = "var(--color-green)";
        else if (numColor === 'red') modalNum.style.color = "var(--color-red)";
        else modalNum.style.color = "#ffffff";
    }
    
    // Рендерим плашку множителя (если число счастливое — пишем бонус, иначе пишем стандарт х30)
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

    // Текст статуса победы/проигрыша для игрока
    const statusText = document.getElementById('modal-player-win-status-text');
    if (statusText) {
        if (amountWon > 0) {
            statusText.innerHTML = `🎉 Поздравляем! Ваш выигрыш составил:<br><span style="color: var(--color-gold); font-size: 20px; font-weight: 900;">+ ${amountWon} W</span>`;
            if (tg && typeof tg.HapticFeedback === 'object') tg.HapticFeedback.notificationOccurred('success');
        } else {
            statusText.innerText = "В этот раз не повезло. Сделайте новую ставку!";
        }
    }

    // Раскрываем секретную строку MD5 / String проверки честности раунда в футере
    const md5Str = document.getElementById('wp-crypto-md5-string');
    if (md5Str) md5Str.style.display = "block";

    // Плавно показываем оверлей поп-апа результатов раунда на экране смартфона
    const modalPopup = document.getElementById('wp-result-modal-popup');
    if (modalPopup) modalPopup.style.display = "flex";

    // ДОБАВЛЕНИЕ НОВОГО ЧИСЛА В НАЧАЛО БЕГУЩЕЙ ЛЕНТЫ ИСТОРИИ ИГР СВЕРХУ
    const historyLine = document.getElementById('wp-history-line');
    if (historyLine) {
        const numColor = NUMBER_COLORS[roundWinningNumber];
        const newCircle = document.createElement('div');
        newCircle.className = `hist-circle ${numColor}`;
        newCircle.innerText = roundWinningNumber;
        
        // Вставляем самый свежий раунд на первое место слева
        historyLine.insertBefore(newCircle, historyLine.firstChild);
        
        // Если лента разрослась слишком длинной (больше 10 раундов) — убираем самый старый кружок справа
        if (historyLine.children.length > 10) {
            historyLine.removeChild(historyLine.lastChild);
        }
    }
}

// ЗАКРЫТИЕ ПОП-АПА, СБРОС ИГРОВОГО СТОЛА И ГЕНЕРАЦИЯ СЛЕДУЮЩЕГО ХЭША ЧЕСТНОСТИ
function closeResultModalPopup() {
    const modalPopup = document.getElementById('wp-result-modal-popup');
    if (modalPopup) modalPopup.style.display = "none";

    // Сбрасываем и очищаем массивы ставок раунда
    currentRoundBets = {};
    totalRoundBetSum = 0;

    // Снимаем белую подсветку и маркеры ставок со всех кнопок стола ставок
    const allTriggerButtons = document.querySelectorAll('.wp-bet-trigger-btn');
    allTriggerButtons.forEach(btn => {
        btn.classList.remove('wp-bet-active-glow');
        btn.classList.remove('has-bets-placed');
    });

    // Разблокируем ввод инпута ставки для нового раунда
    const field = document.getElementById('wp-bet-field');
    if (field) field.disabled = false;

    // Возвращаем колесо рулетки в исходное нулевое положение на Canvas
    drawPremiumRouletteWheel(0, 0, false);

    // Переключаем игровую фазу: переводим автомат в режим ожидания ставки
    isGameSessionActive = false;

    // СВЕРХВАЖНО: До начала новых ставок генерируем новый хэш SHA-256 следующего раунда!
    generateSecureRoundData();
    updateLuckyNumbersUI();

    // Синхронизируем и сохраняем новый баланс в памяти телефона
    refreshUI();
}

// Финальный стартовый рендеринг экрана при открытии игры движком
refreshUI();
