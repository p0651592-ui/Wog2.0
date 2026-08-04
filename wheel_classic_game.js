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
  const PROMO_CODES = ['wog2', 'wog_test'];

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
    clientSeed: '',
    spinning: false,
    history: loadHistory(),
    latestRound: null,
    wheelRotation: 0,
    ballAngle: 0,
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

  function haptic(kind = 'impact') {
    try {
      if (tg && tg.HapticFeedback && typeof tg.HapticFeedback.impactOccurred === 'function') {
        tg.HapticFeedback.impactOccurred(kind);
      }
    } catch (_) {}
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

  function fmt(n) {
    return Number(n || 0).toLocaleString('ru-RU');
  }

  function setStatus(text) {
    if (el.status) el.status.textContent = text;
  }

  function setBalance(value) {
    state.balance = Math.max(0, Number(value) || 0);
    localStorage.setItem('wog_secure_balance', String(state.balance));
    if (el.balance) el.balance.textContent = `${state.balance}`;
  }

  function setResult(text) {
    if (el.resultText) el.resultText.innerHTML = text;
  }

  function setTopState() {
    if (el.lastType) {
      el.lastType.textContent = `Ставка: ${betLabel(state.betType)}${state.betType === 'number' ? ` (${state.selectedNumber})` : ''}`;
    }
    if (el.centerResult) {
      el.centerResult.textContent = state.betType === 'number' ? state.selectedNumber : betLabel(state.betType);
    }
    if (el.centerSub) {
      el.centerSub.textContent = state.betType === 'number' ? '0 • 00 • 1–36' : 'Без Lucky Numbers';
    }

    document.querySelectorAll('[data-bet-type]').forEach((button) => {
      button.classList.toggle('active', button.getAttribute('data-bet-type') === state.betType);
    });

    document.querySelectorAll('[data-num]').forEach((button) => {
      button.classList.toggle('active', button.getAttribute('data-num') === state.selectedNumber);
    });
  }

  function renderWheelLabels() {
    if (!el.wheelLabels) return;

    const step = 360 / WHEEL_SEQUENCE.length;
    el.wheelLabels.innerHTML = WHEEL_SEQUENCE.map((num, index) => {
      const angle = index * step - 90 + step / 2;
      const cls = colorOf(num);
      return `<span class="wheel-label ${cls}" style="--angle:${angle}deg">${num}</span>`;
    }).join('');
  }

  function renderNumberGrid() {
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
        setTopState();
        haptic('light');
      });
    });
  }

  function renderBetChips() {
    if (!el.betGrid) return;

    const types = ['red', 'black', 'even', 'odd', 'low', 'high', 'dozen1', 'dozen2', 'dozen3', 'column1', 'column2', 'column3'];
    el.betGrid.innerHTML = types.map((type) => `<button type="button" class="chip-btn" data-bet-type="${type}">${BET_LABELS[type]}</button>`).join('');

    el.betGrid.querySelectorAll('[data-bet-type]').forEach((button) => {
      button.addEventListener('click', () => {
        state.betType = button.getAttribute('data-bet-type') || 'red';
        if (el.betType) el.betType.value = state.betType;
        setTopState();
        haptic('light');
      });
    });
  }

  function renderHistory() {
    if (!el.historyStrip) return;

    el.historyStrip.innerHTML = state.history.map((round, index) => {
      const result = String(round.result || '—');
      const cls = colorOf(result);
      return `<button type="button" class="history-item ${cls}" data-history-index="${index}">${result}</button>`;
    }).join('');

    el.historyStrip.querySelectorAll('[data-history-index]').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.getAttribute('data-history-index') || 0);
        const round = state.history[index];
        if (round) openFairModal(round);
      });
    });
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem('wog_wheel_classic_history');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.slice(0, 12) : [];
    } catch (_) {
      return [];
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem('wog_wheel_classic_history', JSON.stringify(state.history.slice(0, 12)));
    } catch (_) {}
  }

  function pushHistory(round) {
    state.history.unshift(round);
    state.history = state.history.slice(0, 12);
    saveHistory();
    renderHistory();
  }

  function openFairModal(round) {
    state.latestRound = round;
    if (!el.fairBody || !el.fairModal) return;

    const rows = [
      ['Раунд', round.id ?? '—'],
      ['Результат', `${round.result ?? '—'}${round.color ? ` (${String(round.color).toUpperCase()})` : ''}`],
      ['Ставка', `${fmt(round.bet)} WC`],
      ['Тип ставки', betLabel(round.bet_type || 'number')],
      ['Выбранное число', round.chosen_number ?? '—'],
      ['Client seed', round.client_seed ?? '—'],
      ['Server seed hash', round.server_seed_hash ?? '—'],
      ['Server seed', round.server_seed ?? '—'],
      ['Nonce', round.nonce ?? '—'],
      ['Выплата', `${fmt(round.payout)} WC`],
      ['Множитель', `${round.multiplier ?? 0}x`],
    ];

    el.fairBody.innerHTML = rows.map(([label, value]) => `
      <div class="fair-row">
        <div class="label">${label}</div>
        <div class="value">${String(value)}</div>
      </div>
    `).join('');

    el.fairModal.classList.add('open');
  }

  function closeFairModal() {
    if (el.fairModal) el.fairModal.classList.remove('open');
  }

  function requestJson(path, payload) {
    return fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(async (response) => {
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
    });
  }

  function animateWheel(result) {
    const wheel = el.wheelDisc;
    const ball = el.ball;
    if (!wheel || !ball) return;

    const index = Math.max(0, WHEEL_SEQUENCE.indexOf(String(result)));
    const step = 360 / WHEEL_SEQUENCE.length;
    const landing = 360 - (index * step) - (step / 2);

    state.wheelRotation += 8 * 360 + landing;
    state.ballAngle += 8 * 360 + landing;

    wheel.style.transition = 'transform 4.9s cubic-bezier(.12,.84,.08,1)';
    ball.style.transition = 'transform 4.9s cubic-bezier(.12,.84,.08,1)';

    wheel.style.transform = `rotate(${state.wheelRotation}deg)`;
    ball.style.setProperty('--ball-angle', `${state.ballAngle}deg`);
    ball.style.setProperty('--ball-radius', '86px');
  }

  function settleBall(result) {
    const ball = el.ball;
    if (!ball) return;

    const index = Math.max(0, WHEEL_SEQUENCE.indexOf(String(result)));
    const step = 360 / WHEEL_SEQUENCE.length;
    const targetAngle = -90 + index * step + step / 2;
    ball.style.transition = 'transform 0.8s cubic-bezier(.16,.92,.24,1)';
    ball.style.setProperty('--ball-angle', `${targetAngle}deg`);
    ball.style.setProperty('--ball-radius', '74px');
  }

  async function syncProfile() {
    if (!state.initData) {
      setBalance(state.balance);
      return;
    }

    try {
      const profile = await requestJson('/api/profile/me', { init_data: state.initData });
      setBalance(profile.balance ?? 0);
      setStatus('Готов к вращению');
    } catch (error) {
      console.warn('Profile sync failed:', error.message);
      setStatus('Не удалось загрузить профиль');
    }
  }

  async function redeemPromo() {
    const code = String(el.promoInput ? el.promoInput.value : '').trim();
    if (!code) {
      if (el.promoStatus) el.promoStatus.textContent = 'Введите промокод.';
      return;
    }

    if (!state.initData) {
      safeAlert('Сначала открой игру внутри Telegram');
      return;
    }

    if (el.promoStatus) el.promoStatus.textContent = 'Проверяю промокод...';

    try {
      const data = await requestJson('/api/wheel-plus/promo/redeem', {
        init_data: state.initData,
        code,
      });

      if (typeof data.balance !== 'undefined') {
        setBalance(data.balance);
      }
      if (el.promoStatus) {
        el.promoStatus.textContent = `Промокод ${String(data.code || code).toUpperCase()} активирован: +${fmt(data.amount)} WC`;
      }
      if (el.promoInput) el.promoInput.value = '';
      setStatus('Промокод активирован');
      haptic('success');
    } catch (error) {
      if (el.promoStatus) el.promoStatus.textContent = error.message || 'Не удалось активировать промокод';
      haptic('error');
      safeAlert(error.message || 'Не удалось активировать промокод');
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

    const clientSeed = String(el.clientSeed ? el.clientSeed.value : '').trim() || `wheel-${Date.now()}`;
    const payload = {
      init_data: state.initData,
      bet,
      bet_type: state.betType,
      number: state.selectedNumber,
      client_seed: clientSeed,
    };

    state.spinning = true;
    if (el.spinBtn) el.spinBtn.disabled = true;
    if (el.refreshBtn) el.refreshBtn.disabled = true;
    setStatus('Колесо вращается...');
    setResult('Подготавливаем вращение...');

    try {
      const data = await requestJson('/api/wheel-plus/classic/spin', payload);
      animateWheel(data.result);
      setTimeout(() => settleBall(data.result), 100);

      window.setTimeout(() => {
        const result = String(data.result || '0');
        const payout = Number(data.payout || 0);
        const resultColor = String(data.color || colorOf(result)).toUpperCase();
        const round = data.round || {};

        if (el.centerResult) el.centerResult.textContent = result;
        if (el.centerSub) el.centerSub.textContent = `${result} • ${resultColor}`;
        if (el.lastWin) el.lastWin.textContent = `Последний результат: ${result}`;
        if (el.lastType) {
          el.lastType.textContent = `Ставка: ${betLabel(state.betType)}${state.betType === 'number' ? ` (${state.selectedNumber})` : ''}`;
        }

        setBalance(data.balance ?? state.balance);
        setStatus(payout > 0 ? `Выигрыш +${fmt(payout)} WC` : `Проигрыш -${fmt(bet)} WC`);
        setResult(
          payout > 0
            ? `🎉 Выпало <b>${labelOf(result)}</b>. Выигрыш: <b>${fmt(payout)} WC</b>.`
            : `😕 Выпало <b>${labelOf(result)}</b>. Ставка не зашла.`
        );

        const storedRound = {
          id: round.id ?? Date.now(),
          result,
          color: data.color || colorOf(result),
          bet,
          bet_type: round.bet_type || state.betType,
          chosen_number: round.chosen_number || state.selectedNumber,
          client_seed: round.client_seed || clientSeed,
          server_seed_hash: round.server_seed_hash || '',
          server_seed: round.server_seed || '',
          nonce: round.nonce ?? 0,
          payout,
          multiplier: Number(data.multiplier || 0),
          created_at: new Date().toISOString(),
        };

        pushHistory(storedRound);
        openFairModal(storedRound);
        haptic(payout > 0 ? 'success' : 'error');
      }, 4900);
    } catch (error) {
      setStatus('Ошибка вращения');
      setResult(error.message || 'Не удалось выполнить spin');
      safeAlert(error.message || 'Не удалось выполнить spin');
      haptic('error');
    } finally {
      state.spinning = false;
      window.setTimeout(() => {
        if (el.spinBtn) el.spinBtn.disabled = false;
        if (el.refreshBtn) el.refreshBtn.disabled = false;
      }, 4900);
    }
  }

  function wireInputs() {
    if (el.betType) {
      el.betType.addEventListener('change', () => {
        state.betType = el.betType.value || 'number';
        setTopState();
      });
    }

    if (el.numberInput) {
      el.numberInput.addEventListener('input', () => {
        const raw = String(el.numberInput.value || '').trim().toUpperCase();
        if (raw === '00' || raw === '0') {
          state.selectedNumber = raw;
          state.betType = 'number';
        } else {
          const value = Number(raw);
          if (Number.isInteger(value) && value >= 1 && value <= 36) {
            state.selectedNumber = String(value);
            state.betType = 'number';
          }
        }
        if (el.betType) el.betType.value = state.betType;
        setTopState();
      });
    }

    if (el.clientSeed) {
      el.clientSeed.addEventListener('input', () => {
        state.clientSeed = String(el.clientSeed.value || '');
      });
    }

    if (el.spinBtn) {
      el.spinBtn.addEventListener('click', spin);
    }

    if (el.refreshBtn) {
      el.refreshBtn.addEventListener('click', syncProfile);
    }

    if (el.promoBtn) {
      el.promoBtn.addEventListener('click', redeemPromo);
    }

    if (el.promoInput) {
      el.promoInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          redeemPromo();
        }
      });
    }

    if (el.backBtn) {
      el.backBtn.addEventListener('click', () => {
        window.location.href = 'index.html';
      });
    }

    if (el.fairClose) {
      el.fairClose.addEventListener('click', closeFairModal);
    }

    if (el.fairModal) {
      el.fairModal.addEventListener('click', (event) => {
        if (event.target === el.fairModal) closeFairModal();
      });
    }
  }

  function boot() {
    el.backBtn = document.getElementById('back-btn');
    el.balance = document.getElementById('balance');
    el.status = document.getElementById('status');
    el.lastWin = document.getElementById('last-win');
    el.lastType = document.getElementById('last-type');
    el.resultText = document.getElementById('result-text');
    el.numberGrid = document.getElementById('number-grid');
    el.betGrid = document.getElementById('bet-grid');
    el.betType = document.getElementById('bet-type');
    el.betAmount = document.getElementById('bet-amount');
    el.numberInput = document.getElementById('number-input');
    el.clientSeed = document.getElementById('client-seed');
    el.spinBtn = document.getElementById('spin-btn');
    el.refreshBtn = document.getElementById('refresh-btn');
    el.promoInput = document.getElementById('promo-input');
    el.promoBtn = document.getElementById('promo-btn');
    el.promoStatus = document.getElementById('promo-status');
    el.historyStrip = document.getElementById('history-strip');
    el.wheelDisc = document.getElementById('wheel-disc');
    el.ball = document.getElementById('roulette-ball');
    el.wheelLabels = document.getElementById('wheel-labels');
    el.centerResult = document.getElementById('center-result');
    el.centerSub = document.getElementById('center-sub');
    el.fairModal = document.getElementById('fair-modal');
    el.fairBody = document.getElementById('fair-body');
    el.fairClose = document.getElementById('fair-close');

    renderWheelLabels();
    renderNumberGrid();
    renderBetChips();
    renderHistory();
    wireInputs();
    setTopState();
    setBalance(state.balance);

    if (tg && typeof tg.ready === 'function') tg.ready();
    if (tg && typeof tg.expand === 'function') tg.expand();

    if (el.clientSeed) {
      el.clientSeed.value = state.clientSeed || `seed-${Math.random().toString(36).slice(2, 8)}`;
      state.clientSeed = el.clientSeed.value;
    }

    syncProfile();
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
})();