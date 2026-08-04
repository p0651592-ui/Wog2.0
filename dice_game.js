const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
const API_BASE = window.API_BASE || window.location.origin;
const ADMIN_ID = 6682822292;

const MULTIPLIERS = {
  under: 2.4,
  seven: 5.9,
  over: 2.4,
  even: 2.0,
  odd: 2.0,
  c1: 3.2, c2: 3.2, c3: 3.2, c4: 3.2, c5: 3.2, c6: 3.2,
  sum2: 35.3, sum3: 17.6, sum4: 11.8, sum5: 8.8, sum6: 7.1, sum7: 5.9,
  sum8: 7.1, sum9: 8.8, sum10: 11.8, sum11: 17.6, sum12: 35.3,
  p1: 35.3, p2: 35.3, p3: 35.3, p4: 35.3, p5: 35.3, p6: 35.3, anypair: 5.9
};

let userId = ADMIN_ID;
let playerBalance = 0;
let activeBetType = 'under';
let isRolling = false;
let currentHistory = [];

function $(id) {
  return document.getElementById(id);
}

function safeHaptic(kind) {
  try {
    if (!tg || !tg.HapticFeedback) return;
    if (kind === 'win') tg.HapticFeedback.notificationOccurred('success');
    else if (kind === 'lose') tg.HapticFeedback.notificationOccurred('error');
    else tg.HapticFeedback.impactOccurred('light');
  } catch (_) {}
}

function showAlert(message) {
  if (tg && typeof tg.showAlert === 'function') tg.showAlert(message);
  else alert(message);
}

function updateBalanceUI() {
  const balanceEl = $('balance-display');
  if (balanceEl) balanceEl.innerText = String(playerBalance);
}

function updateBetLabel() {
  const betValue = parseInt($('bet-input')?.value || '0', 10) || 0;
  const mult = MULTIPLIERS[activeBetType] || 1;
  const label = $('current-bet-label');
  if (label) label.innerText = `${betValue} W (x${mult})`;
}

function highlightActiveBet() {
  document.querySelectorAll('.outcome-card-btn, .even-odd-btn, .cube-select-btn').forEach(btn => {
    btn.classList.remove('selected-bet-active');
  });
  const activeBtn = $(`bet-${activeBetType}`);
  if (activeBtn) activeBtn.classList.add('selected-bet-active');
  updateBetLabel();
}

function setStatus(text, color = '') {
  const label = $('game-status-label');
  if (!label) return;
  label.innerText = text;
  label.style.color = color || '';
}

function switchTableTab(tabName) {
  if (isRolling) return;

  const mainView = $('table-main-view');
  const numbersView = $('table-numbers-view');
  const pairsView = $('table-pairs-view');

  if (mainView) mainView.style.display = 'none';
  if (numbersView) numbersView.style.display = 'none';
  if (pairsView) pairsView.style.display = 'none';

  const btnMain = $('tab-btn-main');
  const btnNumbers = $('tab-btn-numbers');
  const btnPairs = $('tab-btn-pairs');
  if (btnMain) btnMain.style.background = '#1c2130';
  if (btnNumbers) btnNumbers.style.background = '#1c2130';
  if (btnPairs) btnPairs.style.background = '#1c2130';

  if (tabName === 'main') {
    if (mainView) mainView.style.display = 'flex';
    if (btnMain) btnMain.style.background = '#2a314b';
    activeBetType = 'under';
  } else if (tabName === 'numbers') {
    if (numbersView) numbersView.style.display = 'grid';
    if (btnNumbers) btnNumbers.style.background = '#2a314b';
    activeBetType = 'sum7';
  } else if (tabName === 'pairs') {
    if (pairsView) pairsView.style.display = 'grid';
    if (btnPairs) btnPairs.style.background = '#2a314b';
    activeBetType = 'anypair';
  }

  highlightActiveBet();
}

function selectBetType(betType) {
  if (isRolling) return;
  activeBetType = betType;
  highlightActiveBet();
}

function adjustBet(action) {
  if (isRolling) return;
  const input = $('bet-input');
  if (!input) return;
  let currentBet = parseInt(input.value || '0', 10) || 100;
  if (action === 'x2') currentBet = Math.min(playerBalance, currentBet * 2);
  if (action === 'half') currentBet = Math.max(1, Math.floor(currentBet / 2));
  input.value = String(currentBet);
  updateBetLabel();
}

function addBetAmount(amount) {
  if (isRolling) return;
  const input = $('bet-input');
  if (!input) return;
  let currentBet = parseInt(input.value || '0', 10) || 0;
  currentBet = Math.min(playerBalance, currentBet + amount);
  input.value = String(currentBet);
  updateBetLabel();
}

function rollDice() {
  return [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
}

function evaluateBet(sum, d1, d2) {
  let win = false;

  if (activeBetType === 'under' && sum < 7) win = true;
  if (activeBetType === 'seven' && sum === 7) win = true;
  if (activeBetType === 'over' && sum > 7) win = true;
  if (activeBetType === 'even' && sum % 2 === 0) win = true;
  if (activeBetType === 'odd' && sum % 2 !== 0) win = true;
  if (activeBetType === 'c1' && (d1 === 1 || d2 === 1)) win = true;
  if (activeBetType === 'c2' && (d1 === 2 || d2 === 2)) win = true;
  if (activeBetType === 'c3' && (d1 === 3 || d2 === 3)) win = true;
  if (activeBetType === 'c4' && (d1 === 4 || d2 === 4)) win = true;
  if (activeBetType === 'c5' && (d1 === 5 || d2 === 5)) win = true;
  if (activeBetType === 'c6' && (d1 === 6 || d2 === 6)) win = true;

  if (activeBetType === `sum${sum}`) win = true;

  const pair = d1 === d2;
  if (activeBetType === 'anypair' && pair) win = true;
  if (activeBetType === 'p1' && pair && d1 === 1) win = true;
  if (activeBetType === 'p2' && pair && d1 === 2) win = true;
  if (activeBetType === 'p3' && pair && d1 === 3) win = true;
  if (activeBetType === 'p4' && pair && d1 === 4) win = true;
  if (activeBetType === 'p5' && pair && d1 === 5) win = true;
  if (activeBetType === 'p6' && pair && d1 === 6) win = true;

  return win;
}

async function syncBalanceChange(amountChange) {
  try {
    const response = await fetch(`${API_BASE}/api/balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: userId, amount: amountChange, game_mode: 'dice' })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Balance sync error:', error);
    return null;
  }
}

function addHistory(sum, d1, d2, win) {
  currentHistory.unshift({ sum, d1, d2, win });
  currentHistory = currentHistory.slice(0, 8);

  const sumDisplay = $('sum-display');
  if (sumDisplay) sumDisplay.innerText = `Результат броска: ${d1} + ${d2} = ${sum}`;

  const c1 = $('result-cube-1');
  const c2 = $('result-cube-2');
  if (c1) c1.innerText = String(d1);
  if (c2) c2.innerText = String(d2);

  const status = $('game-status-label');
  if (status) {
    status.innerText = win ? `🎉 Выигрыш! x${MULTIPLIERS[activeBetType]}` : `💥 Проигрыш`;
    status.style.color = win ? 'var(--btn-green)' : 'var(--btn-red)';
  }
}

async function executeDiceBet() {
  if (isRolling) return;

  const betInput = $('bet-input');
  const bet = parseInt(betInput?.value || '0', 10);

  if (!Number.isFinite(bet) || bet <= 0) {
    showAlert('Некорректная сумма ставки!');
    return;
  }

  if (bet > playerBalance) {
    showAlert('Недостаточно баланса!');
    return;
  }

  isRolling = true;
  const rollBtn = $('roll-action-trigger');
  if (rollBtn) {
    rollBtn.disabled = true;
    rollBtn.innerText = 'Бросаем...';
  }

  setStatus('Ставка принята. Бросок...');
  safeHaptic('light');

  const c1 = $('result-cube-1');
  const c2 = $('result-cube-2');
  if (c1) c1.innerText = '🎲';
  if (c2) c2.innerText = '🎲';

  setTimeout(async () => {
    const [d1, d2] = rollDice();
    const sum = d1 + d2;
    const win = evaluateBet(sum, d1, d2);
    const multiplier = MULTIPLIERS[activeBetType] || 1;
    const amountChange = win ? Math.round(bet * (multiplier - 1)) : -bet;

    if (win) safeHaptic('win');
    else safeHaptic('lose');

    playerBalance += amountChange;
    updateBalanceUI();
    addHistory(sum, d1, d2, win);

    const serverResult = await syncBalanceChange(amountChange);
    if (serverResult && typeof serverResult.balance === 'number') {
      playerBalance = serverResult.balance;
      updateBalanceUI();
    }

    isRolling = false;
    if (rollBtn) {
      rollBtn.disabled = false;
      rollBtn.innerText = 'Подтвердить ставку';
    }

    if (win) showAlert(`Отлично! +${Math.round(bet * multiplier)} W`);
    else showAlert(`Ставка проиграна: -${bet} W`);

    updateBetLabel();
    highlightActiveBet();
  }, 1000);
}

async function loadUser() {
  try {
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
      userId = tg.initDataUnsafe.user.id || ADMIN_ID;
    }

    if (tg) {
      const user = tg.initDataUnsafe?.user || {};
      const res = await fetch(`${API_BASE}/api/user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: userId,
          first_name: user.first_name || 'Player',
          username: user.username || '',
          photo_url: user.photo_url || '',
          auth_data: tg.initData || ''
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (typeof data.balance === 'number') playerBalance = data.balance;
      }
    } else {
      playerBalance = 5000;
    }
  } catch (error) {
    console.error('User load error:', error);
    if (!playerBalance) playerBalance = 5000;
  } finally {
    updateBalanceUI();
    updateBetLabel();
  }
}

function initTelegram() {
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    if (tg.BackButton) {
      tg.BackButton.show();
      tg.BackButton.offClick();
      tg.BackButton.onClick(() => {
        safeHaptic('light');
        location.href = 'index.html';
      });
    }
  } catch (error) {
    console.error(error);
  }
}

function bindUi() {
  $('back-btn')?.addEventListener('click', () => {
    safeHaptic('light');
    location.href = 'index.html';
  });

  $('bet-x2')?.addEventListener('click', () => adjustBet('x2'));
  $('bet-half')?.addEventListener('click', () => adjustBet('half'));

  document.querySelectorAll('.quick-chip-btn').forEach(btn => {
    btn.addEventListener('click', () => addBetAmount(parseInt(btn.dataset.add || '0', 10)));
  });

  document.querySelectorAll('[data-bet]').forEach(btn => {
    btn.addEventListener('click', () => selectBetType(btn.dataset.bet || 'under'));
  });

  $('tab-btn-main')?.addEventListener('click', () => switchTableTab('main'));
  $('tab-btn-numbers')?.addEventListener('click', () => switchTableTab('numbers'));
  $('tab-btn-pairs')?.addEventListener('click', () => switchTableTab('pairs'));
  $('numbers-back-btn')?.addEventListener('click', () => switchTableTab('main'));
  $('pairs-back-btn')?.addEventListener('click', () => switchTableTab('main'));
  $('roll-action-trigger')?.addEventListener('click', executeDiceBet);
  $('bet-input')?.addEventListener('input', updateBetLabel);
}

window.addEventListener('DOMContentLoaded', async () => {
  initTelegram();
  bindUi();
  await loadUser();
  switchTableTab('main');
  selectBetType('under');
});