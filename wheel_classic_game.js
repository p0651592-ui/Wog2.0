(() => {
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  const API_BASE = (window.WOG_CONFIG && window.WOG_CONFIG.API_BASE_URL)
    ? String(window.WOG_CONFIG.API_BASE_URL).replace(/\/$/, '')
    : '';

  const WHEEL_SEQUENCE = [
    '0', '28', '9', '26', '30', '11', '7', '20', '32', '17', '5', '22',
    '34', '15', '3', '24', '36', '13', '1', '00', '27', '10', '25', '29',
    '12', '8', '19', '31', '18', '6', '21', '33', '16', '4', '23', '35',
    '14', '2',
  ];

  const RED_NUMBERS = new Set(['1', '3', '5', '7', '9', '12', '14', '16', '18', '19', '21', '23', '25', '27', '30', '32', '34', '36']);
  const BLACK_NUMBERS = new Set(['2', '4', '6', '8', '10', '11', '13', '15', '17', '20', '22', '24', '26', '28', '29', '31', '33', '35']);

  const BET_LABELS = {
    number: 'Число',
    red: 'Красное',
    black: 'Чёрное',
    even: 'Чёт',
    odd: 'Нечёт',
    low: '1–18',
    high: '19–36',
    dozen1: '1-я дюжина',
    dozen2: '2-я дюжина',
    dozen3: '3-я дюжина',
    column1: '1-й столбец',
    column2: '2-й столбец',
    column3: '3-й столбец',
  };

  const state = {
    initData: tg && tg.initData ? tg.initData : '',
    balance: Number(localStorage.getItem('wog_secure_balance')) || 0,
    betType: 'number',
    selectedNumber: '0',
    spinning: false,
    history: [],
  };

  const el = {};

  function apiUrl(path) {
    return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  }

  function safeAlert(message) {
    const text = String(message);
    if (tg && typeof tg.showAlert === 'function') {
      tg.showAlert(text);
    } else {
      alert(text);
    }
  }

  function setStatus(message) {
    if (el.status) el.status.textContent = message;
  }

  function setBalance(value) {
    state.balance = Math.max(0, Number(value) || 0);
    localStorage.setItem('wog_secure_balance', String(state.balance));
    if (el.balance) el.balance.textContent = `${state.balance} W`;
  }

  function colorOf(result) {
    const value = String(result);
    if (value === '0' || value === '00') return 'green';
    if (RED_NUMBERS.has(value)) return 'red';
    if (BLACK_NUMBERS.has(value)) return 'black';
    return 'green';
  }

  function labelOf(result) {
    return `${result} • ${colorOf(result).toUpperCase()}`;
  }

  function betLabel(type) {
    return BET_LABELS[type] || type;
  }

  function updateTitleState() {
    if (el.centerBig) {
      el.centerBig.textContent = state.betType === 'number'
        ? state.selectedNumber
        : betLabel(state.betType);
    }
    if (el.centerSub) {
      el.centerSub.textContent = state.betType === 'number'
        ? '0 • 00 • 1–36'
        : 'Без Lucky Numbers';
    }
    if (el.lastType) {
      el.lastType.textContent = `Ставка: ${betLabel(state.betType)}${state.betType === 'number' ? ` (${state.selectedNumber})` : ''}`;
    }

    document.querySelectorAll('[data-bet-type]').forEach((button) => {
      button.classList.toggle('active', button.getAttribute('data-bet-type') === state.betType);
    });

    document.querySelectorAll('[data-num]').forEach((button) => {
      button.classList.toggle('active', button.getAttribute('data-num') === state.selectedNumber);
    });
  }

  function updateHistory(result) {
    state.history.unshift(result);
    state.history = state.history.slice(0, 8);

    if (!el.lastRow) return;
    el.lastRow.innerHTML = state.history
      .map((item) => `<div class="bubble ${colorOf(item)}">${item}</div>`)
      .join('');
  }

  function buildNumberGrid() {
    if (!el.numberGrid) return;

    const numbers = ['0', '00', ...Array.from({ length: 36 }, (_, i) => String(i + 1))];
    el.numberGrid.innerHTML = numbers.map((num) => {
      const cls = colorOf(num);
      return `<button type="button" class="num-btn ${cls}" data-num="${num}">${num}</button>`;
    }).join('');

    el.numberGrid.querySelectorAll('[data-num]').forEach((button) => {
      button.addEventListener('click', () => {
        state.betType = 'number';
        state.selectedNumber = button.getAttribute('data-num') || '0';
        if (el.betType) el.betType.value = 'number';
        if (el.numberInput) el.numberInput.value = state.selectedNumber;
        updateTitleState();
      });
    });
  }

  function buildBetChips() {
    if (!el.chipsRow) return;

    const types = ['red', 'black', 'even', 'odd', 'low', 'high', 'dozen1', 'dozen2', 'dozen3', 'column1', 'column2', 'column3'];
    el.chipsRow.innerHTML = types.map((type) => `<button type="button" class="chip" data-bet-type="${type}">${BET_LABELS[type]}</button>`).join('');

    el.chipsRow.querySelectorAll('[data-bet-type]').forEach((button) => {
      button.addEventListener('click', () => {
        state.betType = button.getAttribute('data-bet-type') || 'red';
        if (el.betType) el.betType.value = state.betType;
        updateTitleState();
      });
    });
  }

  function wireInputs() {
    if (el.betType) {
      el.betType.addEventListener('change', () => {
        state.betType = el.betType.value || 'number';
        updateTitleState();
      });
    }

    if (el.numberInput) {
      el.numberInput.addEventListener('input', () => {
        const raw = String(el.numberInput.value || '').trim().toUpperCase();
        if (raw === '00' || raw === '0') {
          state.selectedNumber = raw;
        } else {
          const value = Number(raw);
          if (Number.isInteger(value) && value >= 1 && value <= 36) {
            state.selectedNumber = String(value);
          }
        }
        state.betType = 'number';
        if (el.betType) el.betType.value = 'number';
        updateTitleState();
      });
    }

    if (el.backBtn) {
      el.backBtn.addEventListener('click', () => {
        window.location.href = 'index.html';
      });
    }

    if (el.refreshBtn) {
      el.refreshBtn.addEventListener('click', refreshProfile);
    }

    if (el.spinBtn) {
      el.spinBtn.addEventListener('click', spin);
    }
  }

  async function requestJson(path, payload) {
    const response = await fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    let data = null;
    try {
      data = await response.json();
    } catch (_) {
      data = null;
    }

    if (!response.ok) {
      throw new Error((data && (data.detail || data.message)) ? (data.detail || data.message) : `Ошибка сервера (${response.status})`);
    }

    return data;
  }

  function animateWheel(result) {
    if (!el.wheel) return;
    const index = Math.max(0, WHEEL_SEQUENCE.indexOf(String(result)));
    const segment = 360 / WHEEL_SEQUENCE.length;
    const spins = 6 + Math.floor(Math.random() * 3);
    const landing = (360 - (index * segment) - (segment / 2));
    const current = Number((el.wheel.dataset.rotation || '0')) || 0;
    const next = current + (spins * 360) + landing;
    el.wheel.dataset.rotation = String(next);
    el.wheel.style.transition = 'transform 4.8s cubic-bezier(.15,.85,.08,1)';
    el.wheel.style.transform = `rotate(${next}deg)`;
  }

  function paintWheel() {
    if (!el.wheel) return;
    const step = 360 / WHEEL_SEQUENCE.length;
    const parts = WHEEL_SEQUENCE.map((num, idx) => {
      const from = idx * step;
      const to = (idx + 1) * step;
      const fill = colorOf(num) === 'red' ? '#ff3838' : colorOf(num) === 'black' ? '#1e2336' : '#05c46b';
      return `${fill} ${from}deg ${to}deg`;
    }).join(', ');
    el.wheel.style.background = `conic-gradient(${parts})`;
  }

  async function refreshProfile() {
    if (!state.initData) {
      setBalance(state.balance);
      return;
    }

    try {
      const profile = await requestJson('/api/profile/me', { init_data: state.initData });
      setBalance(profile.balance ?? 0);
      if (el.resultText) {
        el.resultText.innerHTML = 'Выбери тип ставки и нажми <b>Spin</b>.';
      }
      setStatus('Готов к вращению');
    } catch (error) {
      console.error(error);
      setStatus('Не удалось загрузить профиль');
    }
  }

  async function spin() {
    if (state.spinning) return;

    const bet = Math.floor(Number(el.betAmount ? el.betAmount.value : 0));
    if (!Number.isFinite(bet) || bet <= 0) {
      safeAlert('Укажи корректную ставку');
      return;
    }
    if (bet > state.balance) {
      safeAlert('Недостаточно WC');
      return;
    }

    const payload = {
      init_data: state.initData,
      bet,
      bet_type: state.betType,
      number: state.selectedNumber,
      client_seed: `wheel-${Date.now()}`,
    };

    state.spinning = true;
    if (el.spinBtn) el.spinBtn.disabled = true;
    setStatus('Вращение колеса...');
    if (el.resultText) el.resultText.innerHTML = 'Колесо крутится...';

    try {
      const data = await requestJson('/api/wheel-classic/spin', payload);
      animateWheel(data.result);

      window.setTimeout(() => {
        const payout = Number(data.payout || 0);
        const result = String(data.result || '0');
        const resultColor = data.color || colorOf(result);

        if (el.centerBig) el.centerBig.textContent = result;
        if (el.centerSub) el.centerSub.textContent = `${result} • ${String(resultColor).toUpperCase()}`;

        updateHistory(result);
        setBalance(data.balance ?? state.balance);
        setStatus(payout > 0 ? `Выигрыш +${payout} WC` : `Проигрыш -${bet} WC`);
        if (el.resultText) {
          el.resultText.innerHTML = payout > 0
            ? `🎉 Выпало <b>${labelOf(result)}</b>. Выигрыш: <b>${payout} WC</b>.`
            : `😕 Выпало <b>${labelOf(result)}</b>. Ставка не зашла.`;
        }
        if (el.lastWin) el.lastWin.textContent = `Последний результат: ${result}`;
        updateTitleState();
      }, 4800);

      refreshProfile().catch(() => {});
    } catch (error) {
      console.error(error);
      setStatus('Ошибка спина');
      if (el.resultText) el.resultText.textContent = error.message || 'Не удалось выполнить spin';
      safeAlert(error.message || 'Не удалось выполнить spin');
    } finally {
      state.spinning = false;
      window.setTimeout(() => {
        if (el.spinBtn) el.spinBtn.disabled = false;
      }, 4800);
    }
  }

  function boot() {
    el.backBtn = document.getElementById('back-btn');
    el.balance = document.getElementById('balance');
    el.status = document.getElementById('status');
    el.lastWin = document.getElementById('last-win');
    el.lastType = document.getElementById('last-type');
    el.resultText = document.getElementById('result-text');
    el.lastRow = document.getElementById('last-row');
    el.numberGrid = document.getElementById('number-grid');
    el.chipsRow = document.getElementById('chips-row');
    el.numberInput = document.getElementById('number-input');
    el.betType = document.getElementById('bet-type');
    el.betAmount = document.getElementById('bet-amount');
    el.spinBtn = document.getElementById('spin-btn');
    el.refreshBtn = document.getElementById('refresh-btn');
    el.wheel = document.getElementById('wheel');
    el.centerBig = document.getElementById('center-big');
    el.centerSub = document.getElementById('center-sub');

    paintWheel();
    buildNumberGrid();
    buildBetChips();
    wireInputs();
    setBalance(state.balance);
    updateTitleState();

    if (tg && typeof tg.ready === 'function') tg.ready();
    if (tg && typeof tg.expand === 'function') tg.expand();

    refreshProfile();
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
})();
