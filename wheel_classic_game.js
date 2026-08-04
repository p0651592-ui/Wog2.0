(() => {
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  const API_BASE = (window.WOG_CONFIG && window.WOG_CONFIG.API_BASE_URL)
    ? String(window.WOG_CONFIG.API_BASE_URL).replace(/\/$/, '')
    : '';

  const AMERICAN_SEQUENCE = [
    '0','28','9','26','30','11','7','20','32','17','5','22','34','15','3','24','36','13','1','00',
    '27','10','25','29','12','8','19','31','18','6','21','33','16','4','23','35','14','2'
  ];
  const RED_SET = new Set(['1','3','5','7','9','12','14','16','18','19','21','23','25','27','30','32','34','36']);

  const BET_LABELS = {
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
    number: 'Число',
  };

  const state = {
    balance: Number(localStorage.getItem('wog_secure_balance')) || 0,
    initData: tg && tg.initData ? tg.initData : '',
    last: [],
    spinning: false,
    selectedType: 'number',
    selectedNumber: '0',
    userId: tg && tg.initDataUnsafe && tg.initDataUnsafe.user ? tg.initDataUnsafe.user.id : 0,
  };

  const $ = (id) => document.getElementById(id);

  function apiUrl(path) {
    return API_BASE ? `${API_BASE}${path.startsWith('/') ? path : `/${path}`}` : path;
  }

  function haptic(kind = 'impact') {
    try {
      if (tg && tg.HapticFeedback && typeof tg.HapticFeedback.impactOccurred === 'function') {
        tg.HapticFeedback.impactOccurred(kind);
      }
    } catch (_) {}
  }

  function colorOf(result) {
    if (result === '0' || result === '00') return 'green';
    return RED_SET.has(String(result)) ? 'red' : 'black';
  }

  function isNumericResult(result) {
    return /^\d+$/.test(String(result));
  }

  function resultLabel(result) {
    const color = colorOf(result).toUpperCase();
    return `${result} • ${color}`;
  }

  function setStatus(text) {
    const el = $('status');
    if (el) el.innerText = text;
  }

  function setResult(text) {
    const el = $('result-text');
    if (el) el.innerHTML = text;
  }

  function setPill(id, text) {
    const el = $(id);
    if (el) el.innerText = text;
  }

  function setBalance(value) {
    state.balance = Math.max(0, Number(value) || 0);
    localStorage.setItem('wog_secure_balance', String(state.balance));
    const el = $('balance');
    if (el) el.innerText = `${state.balance} W`;
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
      const message = data && (data.detail || data.message)
        ? (data.detail || data.message)
        : `Ошибка сервера (${response.status})`;
      throw new Error(message);
    }

    return data;
  }

  function pushHistory(result) {
    state.last.unshift(result);
    state.last = state.last.slice(0, 8);
    const row = $('last-row');
    if (!row) return;
    row.innerHTML = state.last.map((r) => `<div class="bubble ${colorOf(r)}">${r}</div>`).join('');
  }

  function randomChoice(arr) {
    const tmp = new Uint32Array(1);
    crypto.getRandomValues(tmp);
    return arr[tmp[0] % arr.length];
  }

  function randomWheelResult() {
    return randomChoice(AMERICAN_SEQUENCE);
  }

  function payoutMultiplier(type) {
    if (type === 'number') return 36;
    if (type === 'dozen1' || type === 'dozen2' || type === 'dozen3' || type === 'column1' || type === 'column2' || type === 'column3') {
      return 3;
    }
    return 2;
  }

  function betLabel(type) {
    return BET_LABELS[type] || '—';
  }

  function isWin(result, type, selectedNumber) {
    const color = colorOf(result);
    const n = Number(result);

    switch (type) {
      case 'number':
        return selectedNumber !== '' && String(result) === String(selectedNumber);
      case 'red':
        return color === 'red';
      case 'black':
        return color === 'black';
      case 'even':
        return isNumericResult(result) && n >= 1 && n <= 36 && n % 2 === 0;
      case 'odd':
        return isNumericResult(result) && n >= 1 && n <= 36 && n % 2 === 1;
      case 'low':
        return isNumericResult(result) && n >= 1 && n <= 18;
      case 'high':
        return isNumericResult(result) && n >= 19 && n <= 36;
      case 'dozen1':
        return isNumericResult(result) && n >= 1 && n <= 12;
      case 'dozen2':
        return isNumericResult(result) && n >= 13 && n <= 24;
      case 'dozen3':
        return isNumericResult(result) && n >= 25 && n <= 36;
      case 'column1':
        return isNumericResult(result) && n >= 1 && n <= 36 && n % 3 === 1;
      case 'column2':
        return isNumericResult(result) && n >= 1 && n <= 36 && n % 3 === 2;
      case 'column3':
        return isNumericResult(result) && n >= 1 && n <= 36 && n % 3 === 0;
      default:
        return false;
    }
  }

  function updateWheelBackground() {
    const wheel = $('wheel');
    if (!wheel) return;

    const step = 360 / AMERICAN_SEQUENCE.length;
    const parts = AMERICAN_SEQUENCE.map((num, idx) => {
      const c = colorOf(num) === 'green' ? '#05c46b' : colorOf(num) === 'red' ? '#ff3838' : '#1e2336';
      return `${c} ${idx * step}deg ${(idx + 1) * step}deg`;
    }).join(',');

    wheel.style.background = `conic-gradient(${parts})`;
  }

  function updateSelectedUI() {
    const selectedTypeEl = $('last-type');
    const selectedNumberEl = $('number-input');
    const titleBig = $('center-big');
    const titleSub = $('center-sub');

    if (selectedTypeEl) selectedTypeEl.innerText = `Ставка: ${betLabel(state.selectedType)}${state.selectedType === 'number' ? ` (${state.selectedNumber})` : ''}`;
    if (selectedNumberEl) selectedNumberEl.value = state.selectedNumber;
    if (titleBig) titleBig.innerText = state.selectedType === 'number' ? state.selectedNumber : betLabel(state.selectedType);
    if (titleSub) titleSub.innerText = state.selectedType === 'number' ? '0 • 00 • 1–36' : 'Без Lucky Numbers';

    document.querySelectorAll('[data-bet-type]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-bet-type') === state.selectedType);
    });
    document.querySelectorAll('[data-num]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-num') === state.selectedNumber);
    });
  }

  function selectBet(type, number = '') {
    state.selectedType = type;
    if (type === 'number') {
      state.selectedNumber = number || state.selectedNumber || '0';
    }
    updateSelectedUI();
    haptic('light');
  }

  function renderNumberGrid() {
    const grid = $('number-grid');
    if (!grid) return;

    const nums = ['0', '00', ...Array.from({ length: 36 }, (_, i) => String(i + 1))];
    grid.innerHTML = nums.map((num) => {
      const cls = colorOf(num);
      return `<button class="num-btn ${cls}" data-num="${num}" type="button">${num}</button>`;
    }).join('');

    grid.querySelectorAll('[data-num]').forEach((btn) => {
      btn.addEventListener('click', () => selectBet('number', btn.getAttribute('data-num') || '0'));
    });
  }

  function renderBetChips() {
    const row = $('chips-row');
    if (!row) return;

    const types = ['red', 'black', 'even', 'odd', 'low', 'high', 'dozen1', 'dozen2', 'dozen3', 'column1', 'column2', 'column3'];
    row.innerHTML = types.map((type) => `<button class="chip" data-bet-type="${type}" type="button">${BET_LABELS[type]}</button>`).join('');
    row.querySelectorAll('[data-bet-type]').forEach((btn) => {
      btn.addEventListener('click', () => selectBet(btn.getAttribute('data-bet-type') || 'red'));
    });
  }

  function renderHistory() {
    const row = $('last-row');
    if (row) row.innerHTML = '';
  }

  async function refreshBalance() {
    try {
      if (!state.initData) {
        setBalance(state.balance);
        return;
      }
      const data = await requestJson('/api/user/balance', { init_data: state.initData });
      if (data && typeof data.balance !== 'undefined') setBalance(data.balance);
    } catch (error) {
      console.warn('Баланс не обновлён:', error.message);
      setBalance(state.balance);
    }
  }

  async function spin() {
    if (state.spinning) return;

    const betField = $('bet-amount');
    const amount = Math.floor(Number(betField ? betField.value : 0));
    if (!Number.isFinite(amount) || amount <= 0) {
      setResult('Введите корректную ставку.');
      return;
    }
    if (amount > state.balance) {
      setResult('Недостаточно WC для ставки.');
      return;
    }

    state.spinning = true;
    const spinBtn = $('spin-btn');
    if (spinBtn) spinBtn.disabled = true;

    const result = randomWheelResult();
    const won = isWin(result, state.selectedType, state.selectedNumber);
    const multiplier = payoutMultiplier(state.selectedType);
    const payout = won ? amount * multiplier : 0;
    const net = payout - amount;
    const turns = 6 + Math.floor(Math.random() * 4);
    const wheel = $('wheel');

    try {
      setStatus('Вращение колеса...');
      setResult('Колесо крутится...');
      if (wheel) {
        const current = Number((wheel.style.transform || 'rotate(0deg)').match(/-?\d+/)?.[0] || 0);
        const targetIndex = AMERICAN_SEQUENCE.indexOf(String(result));
        const step = 360 / AMERICAN_SEQUENCE.length;
        const targetAngle = 360 * turns + (360 - targetIndex * step);
        wheel.style.transform = `rotate(${current + targetAngle}deg)`;
      }

      await new Promise((resolve) => setTimeout(resolve, 2400));

      const payload = {
        init_data: state.initData,
        game_type: 'wheel',
        bet: amount,
        payout,
        multiplier,
        client_seed: `wheel-${Date.now()}`,
        server_seed_hash: `local-${result}`,
        server_seed: '',
        nonce: Date.now(),
        result_json: {
          result,
          color: colorOf(result),
          bet_type: state.selectedType,
          selected_number: state.selectedNumber,
          win: won,
          payout,
          net,
        },
      };

      let response = null;
      try {
        response = await requestJson('/api/games/round/finish', payload);
      } catch (error) {
        console.warn('Серверный round finish не ответил, обновляю локально:', error.message);
      }

      const newBalance = response && response.profile && typeof response.profile.balance !== 'undefined'
        ? response.profile.balance
        : state.balance + net;

      setBalance(newBalance);
      pushHistory(result);
      setPill('last-win', `Последний результат: ${resultLabel(result)}`);
      setPill('last-type', `Ставка: ${betLabel(state.selectedType)}${state.selectedType === 'number' ? ` (${state.selectedNumber})` : ''}`);
      setStatus(won ? `Выигрыш +${payout} WC` : `Проигрыш -${amount} WC`);
      setResult(won
        ? `🎉 Выпало <b>${resultLabel(result)}</b>. Выигрыш: <b>${payout} WC</b>.`
        : `😕 Выпало <b>${resultLabel(result)}</b>. Ставка: <b>${amount} WC</b>.`);
      haptic(won ? 'success' : 'error');
    } catch (error) {
      setStatus('Ошибка вращения');
      setResult(error.message || 'Не удалось выполнить вращение.');
      haptic('error');
    } finally {
      state.spinning = false;
      if (spinBtn) spinBtn.disabled = false;
    }
  }

  function wireStaticControls() {
    const spinBtn = $('spin-btn');
    if (spinBtn) spinBtn.addEventListener('click', spin);

    const refreshBtn = $('refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshBalance);

    const betType = $('bet-type');
    if (betType) {
      betType.addEventListener('change', () => selectBet(betType.value));
    }

    const numberInput = $('number-input');
    if (numberInput) {
      numberInput.addEventListener('input', () => {
        const raw = String(numberInput.value || '').trim().toUpperCase();
        if (raw === '00' || raw === '0') {
          state.selectedNumber = raw;
          state.selectedType = 'number';
        } else {
          const n = Number(raw);
          if (Number.isInteger(n) && n >= 1 && n <= 36) {
            state.selectedNumber = String(n);
            state.selectedType = 'number';
          }
        }
        updateSelectedUI();
      });
    }

    const backBtn = $('back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        window.location.href = 'index.html';
      });
    }
  }

  function init() {
    updateWheelBackground();
    renderNumberGrid();
    renderBetChips();
    renderHistory();
    wireStaticControls();
    setBalance(state.balance);
    selectBet('number', '0');
    refreshBalance();
    if (tg && typeof tg.ready === 'function') tg.ready();
    if (tg && typeof tg.expand === 'function') tg.expand();
  }

  document.addEventListener('DOMContentLoaded', init);
  window.WheelClassicGame = { spin, refreshBalance, selectBet };
})();
