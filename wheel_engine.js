(() => {
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  const API_BASE = (window.WOG_CONFIG && window.WOG_CONFIG.API_BASE_URL)
    ? String(window.WOG_CONFIG.API_BASE_URL).replace(/\/$/, '')
    : (window.WOG_API_BASE || localStorage.getItem('wog_api_base') || '').replace(/\/$/, '');

  const POLL_INTERVAL_MS = 1000;
  const WHEEL_SEQUENCE = [
    '0', '32', '15', '19', '4', '21', '2', '25', '17', '34', '6', '27',
    '13', '36', '11', '30', '8', '23', '10', '5', '24', '16', '33', '1',
    '20', '14', '31', '9', '22', '18', '29', '7', '28', '12', '35', '3',
    '26',
  ];

  const RED_NUMBERS = new Set(['1', '3', '5', '7', '9', '12', '14', '16', '18', '19', '21', '23', '25', '27', '30', '32', '34', '36']);
  const BLACK_NUMBERS = new Set(['2', '4', '6', '8', '10', '11', '13', '15', '17', '20', '22', '24', '26', '28', '29', '31', '33', '35']);

  const BET_LABELS = {
    red: 'Красное',
    black: 'Чёрное',
    even: 'Чёт',
    odd: 'Нечёт',
    low: '1–18',
    high: '19–36',
    doz1: '1-я дюжина',
    doz2: '2-я дюжина',
    doz3: '3-я дюжина',
    column1: '1-й столбец',
    column2: '2-й столбец',
    column3: '3-й столбец',
    num0: '0',
    zero: '0',
  };

  const CELL_TO_ID = {
    red: 'cell-red',
    black: 'cell-black',
    even: 'cell-even',
    odd: 'cell-odd',
    low: 'cell-low',
    high: 'cell-high',
    doz1: 'cell-doz1',
    doz2: 'cell-doz2',
    doz3: 'cell-doz3',
    zero: 'cell-zero',
    num0: 'cell-num0',
  };

  const state = {
    initData: tg && tg.initData ? tg.initData : '',
    userId: tg && tg.initDataUnsafe && tg.initDataUnsafe.user ? tg.initDataUnsafe.user.id : 0,
    username: 'Guest_Player',
    firstName: 'Guest',
    photoUrl: '',
    balance: 0,
    profile: null,
    room: null,
    round: null,
    history: [],
    historyMap: new Map(),
    livePlayers: [],
    cellTotals: {},
    pollTimer: null,
    started: false,
    settling: false,
    lastSeenSettledRoundId: 0,
    wheelRotation: 0,
  };

  const $ = (id) => document.getElementById(id);
  const apiUrl = (path) => (API_BASE ? `${API_BASE}${path.startsWith('/') ? path : `/${path}`}` : path);
  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const formatMoney = (value) => Number(value || 0).toLocaleString('ru-RU');
  const formatPlayerName = (player) => player?.name || player?.username || 'noname';

  function safeAlert(message) {
    const text = String(message);
    if (tg && typeof tg.showAlert === 'function') tg.showAlert(text);
    else alert(text);
  }

  function notify(message) {
    const text = String(message);
    if (tg && typeof tg.showPopup === 'function') {
      tg.showPopup({ title: 'WOG', message: text, buttons: [{ type: 'ok', text: 'Ок' }] });
    } else {
      safeAlert(text);
    }
  }

  function triggerHaptic(kind = 'light') {
    try {
      if (!tg || !tg.HapticFeedback) return;
      if (kind === 'light' && typeof tg.HapticFeedback.impactOccurred === 'function') {
        tg.HapticFeedback.impactOccurred('light');
      } else if (typeof tg.HapticFeedback.notificationOccurred === 'function') {
        tg.HapticFeedback.notificationOccurred(kind);
      }
    } catch (_) {}
  }

  async function requestJson(path, payload) {
    const response = await fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    let data = null;
    try { data = await response.json(); } catch (_) { data = null; }
    if (!response.ok) throw new Error((data && (data.detail || data.message)) ? (data.detail || data.message) : `Ошибка сервера (${response.status})`);
    return data;
  }

  function setText(id, value) {
    const node = $(id);
    if (node) node.innerText = value;
  }

  function setBalance(value) {
    state.balance = Math.max(0, Number(value) || 0);
    setText('wp-balance-display', `${formatMoney(state.balance)} W`);
  }

  function setTotalBet(value) {
    setText('wp-player-total-bet', `${formatMoney(value || 0)} W`);
  }

  function setProfile(profile) {
    state.profile = profile || null;
    if (!profile) return;
    if (profile.telegram_id !== undefined && profile.telegram_id !== null) state.userId = Number(profile.telegram_id) || state.userId;
    if (profile.username) state.username = profile.username;
    if (profile.first_name) state.firstName = profile.first_name;
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
      if (typeof tg.enableClosingConfirmation === 'function') tg.enableClosingConfirmation();
    } catch (_) {}
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
      const user = tg.initDataUnsafe.user;
      state.userId = user.id || state.userId;
      state.username = user.username || user.first_name || state.username;
      state.firstName = user.first_name || state.firstName;
      state.photoUrl = user.photo_url || '';
    }
  }

  function renderProfile() {
    const avatar = $('avatar-container');
    if (avatar) {
      if (state.photoUrl) avatar.innerHTML = `<img src="${escapeHtml(state.photoUrl)}" class="avatar-img" alt="Avatar">`;
      else avatar.innerText = state.firstName ? state.firstName.charAt(0).toUpperCase() : 'W';
    }

    const usernameDisplay = $('username-display');
    if (usernameDisplay) {
      usernameDisplay.innerText = state.username
        ? `${state.firstName}${state.username && state.username !== state.firstName ? ` (@${state.username})` : ''}`
        : state.firstName;
    }

    const statusDisplay = $('status-display');
    if (statusDisplay) {
      statusDisplay.innerText = state.profile?.status || 'PLAYER';
      statusDisplay.style.color = state.profile?.status === 'blocked' ? 'var(--neon-red)' : 'var(--text-muted)';
    }

    const adminBtn = $('admin-trigger-btn');
    if (adminBtn) {
      const isAdmin = state.profile?.role ? ['admin', 'owner'].includes(String(state.profile.role).toLowerCase()) : Number(state.userId) === 6682822292;
      adminBtn.style.display = isAdmin ? 'block' : 'none';
    }
  }

  function drawWheelCanvas() {
    const canvas = $('wheel-render-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    const radius = center - 12;
    const step = (Math.PI * 2) / WHEEL_SEQUENCE.length;

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate((-Math.PI / 2) + (state.wheelRotation * Math.PI / 180));

    WHEEL_SEQUENCE.forEach((num, index) => {
      const start = index * step;
      const end = start + step;
      const color = num === '0' ? '#05c46b' : RED_NUMBERS.has(num) ? '#ff3838' : '#1e2336';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      ctx.save();
      ctx.rotate(start + (step / 2));
      ctx.translate(radius * 0.70, 0);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(num), 0, 0);
      ctx.restore();
    });

    ctx.restore();

    ctx.beginPath();
    ctx.arc(center, center, center * 0.37, 0, Math.PI * 2);
    ctx.fillStyle = '#090c15';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#222938';
    ctx.stroke();
  }

  function animateWheelToResult(resultNumber) {
    const canvas = $('wheel-render-canvas');
    if (!canvas) return;
    const index = Math.max(0, WHEEL_SEQUENCE.indexOf(String(resultNumber)));
    const step = 360 / WHEEL_SEQUENCE.length;
    const spins = 6;
    const landing = 360 - (index * step) - (step / 2);
    state.wheelRotation += (spins * 360) + landing;
    canvas.style.transition = 'transform 4.8s cubic-bezier(.15,.85,.08,1)';
    canvas.style.transform = `rotate(${state.wheelRotation}deg)`;
  }

  function buildNumbersKeyboardLayout() {
    const container = $('wp-num-keys-generator-box');
    if (!container) return;
    container.innerHTML = '';

    const zeroBtn = document.createElement('button');
    zeroBtn.className = 'wp-bet-trigger-btn wp-btn-green';
    zeroBtn.id = 'cell-num0';
    zeroBtn.innerHTML = `0 <span class="wp-badge-x">x30</span>`;
    zeroBtn.onclick = () => placeBetOnCell('num0');
    container.appendChild(zeroBtn);

    for (let i = 1; i <= 36; i += 1) {
      const btn = document.createElement('button');
      const btnColorClass = RED_NUMBERS.has(String(i)) ? 'wp-btn-red' : 'wp-btn-black';
      btn.className = `wp-bet-trigger-btn ${btnColorClass}`;
      btn.id = `cell-num${i}`;
      btn.innerHTML = `${i} <span class="wp-badge-x">x30</span>`;
      btn.onclick = () => placeBetOnCell(`num${i}`);
      container.appendChild(btn);
    }
  }

  function _normalizeCellForLabel(cellKey) {
    const key = String(cellKey || '').toLowerCase();
    if (key === 'dozen1') return 'doz1';
    if (key === 'dozen2') return 'doz2';
    if (key === 'dozen3') return 'doz3';
    if (key === 'num0' || key === 'zero' || key === '0') return 'zero';
    return key;
  }

  function ensureLivePlayersPanel() {
    const chips = document.querySelector('.wp-quick-chips-grid');
    if (!chips) return null;
    let panel = $('wp-live-players-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'wp-live-players-panel';
      panel.style.cssText = 'background: var(--bg-card); border: 1px solid var(--border-neon); border-radius: var(--radius-premium); padding: 12px; display:flex; flex-direction:column; gap:10px; width:100%;';
      panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div style="font-size:13px;font-weight:900;color:var(--text-main);">Реальные игроки в комнате</div>
          <div id="wp-room-live-count" style="font-size:11px;font-weight:800;color:var(--text-muted);">0 игроков</div>
        </div>
        <div id="wp-room-live-list" style="display:flex;gap:8px;overflow-x:auto;padding-bottom:2px;"></div>
      `;
      chips.insertAdjacentElement('afterend', panel);
    }
    return panel;
  }

  function renderLivePlayers(players) {
    ensureLivePlayersPanel();
    const list = $('wp-room-live-list');
    const count = $('wp-room-live-count');
    if (!list || !count) return;

    count.innerText = `${players.length} игроков`;
    list.innerHTML = '';

    if (!players.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:var(--text-muted);font-size:12px;font-weight:700;padding:4px 0;';
      empty.innerText = 'Пока ставок нет. Будь первым.';
      list.appendChild(empty);
      return;
    }

    players.forEach((player) => {
      const card = document.createElement('div');
      card.style.cssText = 'min-width: 150px; background:#101523; border:1px solid var(--border-neon); border-radius:14px; padding:10px; display:flex; flex-direction:column; gap:6px;';
      const initials = formatPlayerName(player).slice(0, 1).toUpperCase();
      const cells = Array.isArray(player.cells) ? player.cells.map((c) => BET_LABELS[_normalizeCellForLabel(c)] || c).slice(0, 3).join(', ') : '';
      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--bg-inner);border:1px solid var(--border-neon);font-weight:900;color:var(--gold);flex:0 0 auto;">${escapeHtml(initials)}</div>
          <div style="min-width:0;">
            <div style="font-size:12px;font-weight:900;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(formatPlayerName(player))}</div>
            <div style="font-size:10px;color:var(--text-muted);font-weight:700;">${escapeHtml(player.status || 'active')}</div>
          </div>
        </div>
        <div style="font-size:12px;font-weight:900;color:var(--gold);">${formatMoney(player.amount)} W</div>
        <div style="font-size:10px;color:var(--text-muted);font-weight:700;line-height:1.3;">${cells ? `Ставки: ${escapeHtml(cells)}` : 'Ставки на столе'}</div>
      `;
      list.appendChild(card);
    });
  }

  function renderCellTotals(cellTotals) {
    const totals = cellTotals || {};
    Object.entries(CELL_TO_ID).forEach(([key, id]) => {
      const btn = $(id);
      if (!btn) return;
      const total = Number(totals[key] || 0);
      let badge = btn.querySelector('.wp-live-chip-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'wp-live-chip-badge';
        btn.appendChild(badge);
      }
      if (total > 0) {
        badge.innerText = formatMoney(total);
        btn.classList.add('has-bets-placed');
      } else {
        badge.innerText = '';
        btn.classList.remove('has-bets-placed');
      }
    });

    for (let i = 0; i <= 36; i += 1) {
      const btn = $(`cell-num${i}`);
      if (!btn) continue;
      const total = Number(totals[`num${i}`] || 0);
      let badge = btn.querySelector('.wp-live-chip-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'wp-live-chip-badge';
        btn.appendChild(badge);
      }
      if (total > 0) {
        badge.innerText = formatMoney(total);
        btn.classList.add('has-bets-placed');
      } else {
        badge.innerText = '';
        btn.classList.remove('has-bets-placed');
      }
    }
  }

  function renderLuckyNumbers(luckyNumbers) {
    const slots = Array.isArray(luckyNumbers) ? luckyNumbers.slice(0, 3) : [];
    const ids = [
      { num: 'lucky-num-1', mult: 'lucky-mult-1' },
      { num: 'lucky-num-2', mult: 'lucky-mult-2' },
      { num: 'lucky-num-3', mult: 'lucky-mult-3' },
    ];
    ids.forEach((pair, index) => {
      const item = slots[index];
      const num = $(pair.num);
      const mult = $(pair.mult);
      if (num) num.innerText = item ? String(item.number) : '-';
      if (mult) mult.innerText = item ? `x${item.multiplier}` : '0X';
    });
  }

  function renderHistory(history) {
    const line = $('wp-history-line');
    if (!line) return;
    line.innerHTML = '';
    history.forEach((round) => {
      state.historyMap.set(round.id, round);
      const bubble = document.createElement('button');
      bubble.type = 'button';
      bubble.className = `hist-circle ${round.result_color || 'black'}`;
      bubble.innerText = String(round.result_number ?? '-');
      bubble.onclick = () => openFairnessPopup(round);
      line.appendChild(bubble);
    });
  }

  function updateRoomHeader(room, round) {
    const emoji = $('wp-center-emoji');
    const text = $('wp-center-text');
    if (!room || !round) return;
    if (room.status === 'betting') {
      if (emoji) emoji.innerText = '⏳';
      if (text) text.innerText = `${room.seconds_remaining || 0} сек`;
    } else if (room.status === 'settled') {
      if (emoji) emoji.innerText = '🎰';
      if (text) text.innerText = `Выпало ${round.result_number || '—'}`;
    }
  }

  function showModal({ title, number, badge, message, buttonText = 'Понятно' }) {
    const overlay = $('wp-result-modal-popup');
    const titleEl = overlay ? overlay.querySelector('.section-title') : null;
    const numberEl = $('modal-winning-number');
    const badgeEl = $('modal-winning-multiplier-badge');
    const messageEl = $('modal-player-win-status-text');
    const buttonEl = overlay ? overlay.querySelector('.wp-modal-confirm-btn') : null;

    if (titleEl) titleEl.innerText = title || 'Результат';
    if (numberEl) numberEl.innerText = String(number ?? '—');
    if (badgeEl) badgeEl.innerText = badge || '';
    if (messageEl) messageEl.innerHTML = message || '';
    if (buttonEl) buttonEl.innerText = buttonText;
    if (overlay) overlay.style.display = 'flex';
  }

  function closeResultModalPopup() {
    const overlay = $('wp-result-modal-popup');
    if (overlay) overlay.style.display = 'none';
  }

  function openRoundResultModal(round) {
    const lucky = Array.isArray(round.lucky_numbers) ? round.lucky_numbers.map((item) => `${item.number} ×${item.multiplier}`).join(', ') : '—';
    showModal({
      title: `Раунд #${round.id}`,
      number: round.result_number,
      badge: `x${round.result_color === 'green' ? 30 : round.total_payout && round.total_bet ? Math.max(1, Math.round(round.total_payout / Math.max(round.total_bet, 1))) : 0}`,
      message: `
        <div style="display:flex;flex-direction:column;gap:6px;text-align:left;">
          <div><b>Цвет:</b> ${escapeHtml(round.result_color || '—')}</div>
          <div><b>Ставок в раунде:</b> ${formatMoney(round.total_bet || 0)} W</div>
          <div><b>Выплата:</b> ${formatMoney(round.total_payout || 0)} W</div>
          <div><b>Lucky Numbers:</b> ${escapeHtml(lucky)}</div>
        </div>
      `,
      buttonText: 'Понятно',
    });
    triggerHaptic('success');
  }

  function openFairnessPopup(round) {
    if (!round) return;
    const lucky = Array.isArray(round.lucky_numbers) ? round.lucky_numbers.map((item) => `${item.number} ×${item.multiplier}`).join(', ') : '—';
    showModal({
      title: `Проверка честности #${round.id}`,
      number: round.result_number,
      badge: 'Provably Fair',
      message: `
        <div style="display:flex;flex-direction:column;gap:6px;text-align:left;font-size:12px;line-height:1.45;word-break:break-word;">
          <div><b>SHA-256:</b> ${escapeHtml(round.server_seed_hash || '—')}</div>
          <div><b>Server seed:</b> ${escapeHtml(round.server_seed || '—')}</div>
          <div><b>Client seed:</b> ${escapeHtml(round.client_seed || 'wheel-plus-room')}</div>
          <div><b>Nonce:</b> ${escapeHtml(round.nonce ?? '—')}</div>
          <div><b>Результат:</b> ${escapeHtml(round.result_number || '—')} (${escapeHtml(round.result_color || '—')})</div>
          <div><b>Ставок:</b> ${formatMoney(round.total_bet || 0)} W</div>
          <div><b>Выплата:</b> ${formatMoney(round.total_payout || 0)} W</div>
          <div><b>Lucky Numbers:</b> ${escapeHtml(lucky)}</div>
        </div>
      `,
      buttonText: 'Закрыть',
    });
    triggerHaptic('light');
  }

  function applyRoomState(data) {
    if (!data) return;
    if (data.profile) setProfile(data.profile);
    if (typeof data.balance !== 'undefined') setBalance(data.balance);
    if (data.room) state.room = data.room;
    if (data.round) state.round = data.round;
    if (Array.isArray(data.history)) {
      state.history = data.history;
      state.historyMap = new Map(data.history.map((item) => [item.id, item]));
    }
    if (Array.isArray(data.live_players)) state.livePlayers = data.live_players;
    if (data.cell_totals) state.cellTotals = data.cell_totals;

    renderProfile();
    renderLivePlayers(state.livePlayers);
    renderCellTotals(state.cellTotals);
    renderLuckyNumbers(state.round?.lucky_numbers || []);
    renderHistory(state.history);
    updateRoomHeader(state.room, state.round);
    if (state.room) setTotalBet(state.room.total_bet || 0);

    if (data.settled_round && data.settled_round.id !== state.lastSeenSettledRoundId) {
      state.lastSeenSettledRoundId = data.settled_round.id;
      openRoundResultModal(data.settled_round);
      animateWheelToResult(data.settled_round.result_number);
    }
  }

  async function syncRoomState() {
    if (!state.initData || state.settling) return;
    try {
      const data = await requestJson('/api/wheel-plus/state', { init_data: state.initData });
      applyRoomState(data);
      if (data.room && data.room.status === 'betting' && Number(data.room.seconds_remaining || 0) <= 0) {
        await generateSecureRoundData();
      }
    } catch (error) {
      console.warn('Room sync failed:', error.message);
    }
  }

  function ensurePolling() {
    if (state.started) return;
    state.started = true;
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(() => { syncRoomState().catch(() => {}); }, POLL_INTERVAL_MS);
  }

  function modifyBetSize(action) {
    const field = $('wp-bet-field');
    if (!field) return;
    const balance = Math.max(0, Number(state.balance) || 0);
    let current = Math.floor(Number(field.value || 0));
    if (!Number.isFinite(current) || current <= 0) current = 100;
    if (action === 'x2') current = Math.min(balance || current * 2, current * 2);
    if (action === '/2') current = Math.max(10, Math.floor(current / 2));
    if (balance > 0) current = Math.min(current, balance);
    field.value = current;
    triggerHaptic('light');
  }

  function addChipValue(amount) {
    const field = $('wp-bet-field');
    if (!field) return;
    const balance = Math.max(0, Number(state.balance) || 0);
    let current = Math.floor(Number(field.value || 0));
    if (!Number.isFinite(current) || current < 0) current = 0;
    let next = current + Number(amount || 0);
    if (balance > 0) next = Math.min(next, balance);
    field.value = Math.max(0, next);
    triggerHaptic('light');
  }

  function toggleKeyboardLayout(layoutName) {
    const mainView = $('wp-main-table-view');
    const numKeysView = $('wp-numbers-keyboard-view');
    if (!mainView || !numKeysView) return;
    if (layoutName === 'numbers') {
      mainView.style.display = 'none';
      numKeysView.style.display = 'grid';
    } else {
      mainView.style.display = 'flex';
      numKeysView.style.display = 'none';
    }
    triggerHaptic('light');
  }

  function canPlaceBet() {
    const room = state.room;
    return !!room && room.status === 'betting' && Number(room.seconds_remaining || 0) > 0 && !state.settling;
  }

  async function placeBetOnCell(cellId) {
    const field = $('wp-bet-field');
    if (!field) return;
    const amount = Math.floor(Number(field.value || 0));
    if (!Number.isFinite(amount) || amount <= 0) {
      notify('Укажи корректную ставку');
      return;
    }
    if (amount > state.balance) {
      notify('Недостаточно WC');
      return;
    }
    if (!canPlaceBet()) {
      notify('Ставки уже закрыты');
      return;
    }

    try {
      const data = await requestJson('/api/wheel-plus/bet', {
        init_data: state.initData,
        cell_key: cellId,
        amount,
      });
      applyRoomState(data);
      triggerHaptic('light');
      ensurePolling();
    } catch (error) {
      notify(error.message || 'Не удалось поставить ставку');
    }
  }

  async function generateSecureRoundData() {
    if (state.settling) return;
    state.settling = true;
    try {
      const data = await requestJson('/api/wheel-plus/settle', { init_data: state.initData });
      applyRoomState(data);
      if (data.settled_round) animateWheelToResult(data.settled_round.result_number);
    } catch (error) {
      console.warn('Settle failed:', error.message);
    } finally {
      state.settling = false;
    }
  }

  function animateLuckyNumbersSlots() {
    [['lucky-num-1', 'lucky-mult-1'], ['lucky-num-2', 'lucky-mult-2'], ['lucky-num-3', 'lucky-mult-3']].forEach(([numId, multId]) => {
      const num = $(numId);
      const mult = $(multId);
      if (num) num.style.animation = 'none';
      if (mult) mult.style.animation = 'none';
      window.requestAnimationFrame(() => {
        if (num) num.style.animation = 'wpBetPulse 0.5s ease';
        if (mult) mult.style.animation = 'wpBetPulse 0.5s ease';
      });
    });
  }

  function exitRouletteToLobby() {
    window.location.href = 'index.html';
  }

  async function initialSync() {
    if (!state.initData) {
      setBalance(0);
      setText('wp-center-text', 'Нужен Telegram WebApp');
      return;
    }
    try {
      const data = await requestJson('/api/wheel-plus/state', { init_data: state.initData });
      applyRoomState(data);
      ensurePolling();
    } catch (error) {
      console.warn(error.message || error);
      try {
        const profile = await requestJson('/api/profile/me', { init_data: state.initData });
        setProfile(profile);
        setBalance(profile.balance || 0);
        renderProfile();
      } catch (_) {}
    }
  }

  function wireStaticControls() {
    const backBtn = document.querySelector('.wp-back-lobby-btn');
    if (backBtn) backBtn.addEventListener('click', exitRouletteToLobby);

    const modalBtn = $('wp-result-modal-popup');
    if (modalBtn) {
      modalBtn.addEventListener('click', (event) => {
        if (event.target === modalBtn) closeResultModalPopup();
      });
    }

    const field = $('wp-bet-field');
    if (field) {
      field.addEventListener('input', () => {
        const balance = Math.max(0, Number(state.balance) || 0);
        let value = Math.floor(Number(field.value || 0));
        if (!Number.isFinite(value) || value < 0) value = 0;
        if (balance > 0 && value > balance) value = balance;
        field.value = value;
      });
    }

    const hiddenCloseBtn = document.querySelector('.wp-modal-confirm-btn');
    if (hiddenCloseBtn) hiddenCloseBtn.onclick = closeResultModalPopup;
  }

  window.exitRouletteToLobby = exitRouletteToLobby;
  window.modifyBetSize = modifyBetSize;
  window.addChipValue = addChipValue;
  window.toggleKeyboardLayout = toggleKeyboardLayout;
  window.placeBetOnCell = placeBetOnCell;
  window.startRoundCountdownTimer = ensurePolling;
  window.generateSecureRoundData = generateSecureRoundData;
  window.animateLuckyNumbersSlots = animateLuckyNumbersSlots;
  window.closeResultModalPopup = closeResultModalPopup;
  window.openFairnessPopup = openFairnessPopup;

  function boot() {
    setupTelegram();
    buildNumbersKeyboardLayout();
    drawWheelCanvas();
    wireStaticControls();
    initialSync();
    window.addEventListener('resize', drawWheelCanvas, { passive: true });
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
})();
