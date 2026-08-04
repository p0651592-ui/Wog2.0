(() => {
  if (window.__WHEEL_PLUS_ROOM_BRIDGE__) return;
  window.__WHEEL_PLUS_ROOM_BRIDGE__ = true;

  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  const API_BASE = (window.WOG_CONFIG && window.WOG_CONFIG.API_BASE_URL)
    ? String(window.WOG_CONFIG.API_BASE_URL).replace(/\/$/, '')
    : '';

  const $ = (id) => document.getElementById(id);
  const state = window.__WHEEL_PLUS_ROOM_STATE__ || (window.__WHEEL_PLUS_ROOM_STATE__ = {
    initData: tg && tg.initData ? tg.initData : '',
    pollTimer: null,
    room: null,
    lastResolvedRoundId: 0,
    currentUserBetTotal: 0,
    lastSnapshot: null,
  });

  function apiUrl(path) {
    return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  }

  function notify(message) {
    const text = String(message);
    if (tg && typeof tg.showAlert === 'function') tg.showAlert(text);
    else alert(text);
  }

  async function requestJson(path, payload, method = 'POST') {
    const response = await fetch(apiUrl(path), {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(payload || {}),
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

  function ensureInjectedStyles() {
    if ($('wp-room-bridge-styles')) return;
    const style = document.createElement('style');
    style.id = 'wp-room-bridge-styles';
    style.textContent = `
      .wp-room-panel { background: var(--bg-card, #151a30); border: 1px solid var(--border-neon, #29315c); border-radius: 18px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
      .wp-room-panel-head { display:flex; justify-content:space-between; align-items:center; gap:10px; }
      .wp-room-pill { font-size: 11px; font-weight: 900; color: var(--text-main, #fff); background: rgba(47,107,242,.12); border: 1px solid rgba(47,107,242,.35); padding: 5px 8px; border-radius: 999px; white-space: nowrap; }
      .wp-live-players-grid { display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; }
      .wp-live-player { background: var(--bg-inner, #1d233d); border: 1px solid var(--border-neon, #29315c); border-radius: 12px; padding: 10px; display:flex; flex-direction:column; gap:4px; }
      .wp-live-player-name { font-size: 12px; font-weight: 900; color: var(--text-main, #fff); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .wp-live-player-meta { font-size: 10px; color: var(--text-muted, #64748b); font-weight: 700; }
      .wp-room-empty { color: var(--text-muted, #64748b); font-size: 12px; font-weight: 700; padding: 4px 2px; }
      .wp-history-clickable { cursor: pointer; transition: transform .12s ease, box-shadow .12s ease; }
      .wp-history-clickable:active { transform: scale(.95); }
      .wp-room-modal-overlay { position: fixed; inset: 0; background: rgba(6, 8, 16, 0.82); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 2000; display: none; align-items: center; justify-content: center; padding: 16px; }
      .wp-room-modal { width: 100%; max-width: 420px; background: var(--bg-card, #151a30); border: 1px solid var(--border-neon, #29315c); border-radius: 22px; padding: 18px; box-shadow: 0 10px 30px rgba(0,0,0,.5); }
      .wp-room-modal h3 { font-size: 16px; margin-bottom: 8px; }
      .wp-room-modal .line { font-size: 12px; color: var(--text-main, #fff); line-height: 1.45; margin-bottom: 6px; word-break: break-word; }
      .wp-room-modal .muted { color: var(--text-muted, #64748b); }
      .wp-room-modal .actions { display:flex; gap:8px; margin-top: 14px; }
      .wp-room-modal .btn { flex:1; border:none; border-radius: 12px; padding: 11px 12px; font-weight: 900; cursor:pointer; color:#fff; background: var(--bg-inner, #1d233d); }
      .wp-room-modal .btn.primary { background: var(--blue, #2f6bf2); }
      .wp-room-modal .btn:active { transform: scale(.98); }
      @media (max-width: 380px) { .wp-live-players-grid { grid-template-columns: 1fr; } }
    `;
    document.head.appendChild(style);
  }

  function betLabel(cell) {
    const labels = {
      red: 'Красное', black: 'Чёрное', even: 'Чёт', odd: 'Нечёт', low: '1–18', high: '19–36',
      doz1: '1-я дюжина', doz2: '2-я дюжина', doz3: '3-я дюжина',
    };
    if (labels[cell]) return labels[cell];
    if (String(cell).startsWith('num')) return `№ ${String(cell).replace('num', '')}`;
    return String(cell || '—');
  }

  function colorOf(number) {
    if (number === 0) return 'green';
    const red = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
    return red.has(Number(number)) ? 'red' : 'black';
  }

  function ensureRoomPanel() {
    if ($('wp-room-panel')) return;
    const mainTable = $('wp-main-table-view');
    if (!mainTable || !mainTable.parentElement) return;

    const panel = document.createElement('div');
    panel.id = 'wp-room-panel';
    panel.className = 'wp-room-panel';
    panel.innerHTML = `
      <div class="wp-room-panel-head">
        <div>
          <div style="font-size: 13px; font-weight: 900; color: var(--text-main, #fff);">Комната Wheel Plus</div>
          <div style="font-size: 11px; font-weight: 700; color: var(--text-muted, #64748b);">Общая комната, общая история, общие спины</div>
        </div>
        <span class="wp-room-pill" id="wp-room-pill">Подключение...</span>
      </div>
      <div>
        <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--text-muted, #64748b); margin-bottom: 6px;">Реальные игроки</div>
        <div class="wp-live-players-grid" id="wp-live-players-grid"></div>
      </div>
    `;

    mainTable.insertAdjacentElement('afterend', panel);
  }

  function ensureFairnessModal() {
    if ($('wp-room-fairness-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'wp-room-fairness-modal';
    modal.className = 'wp-room-modal-overlay';
    modal.innerHTML = `
      <div class="wp-room-modal">
        <h3>Проверка честности</h3>
        <div class="line" id="wp-fair-round">Раунд: —</div>
        <div class="line" id="wp-fair-number">Выпало: —</div>
        <div class="line" id="wp-fair-server-hash">Server hash: —</div>
        <div class="line" id="wp-fair-server-seed">Server seed: —</div>
        <div class="line" id="wp-fair-client-seed">Client seed: —</div>
        <div class="line" id="wp-fair-nonce">Nonce: —</div>
        <div class="line" id="wp-fair-lucky">Lucky: —</div>
        <div class="line" id="wp-fair-total">Оборот: —</div>
        <div class="actions">
          <button class="btn" type="button" id="wp-fair-copy-btn">Копировать</button>
          <button class="btn primary" type="button" id="wp-fair-close-btn">Закрыть</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) hideFairnessModal();
    });
    const closeBtn = $('wp-fair-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', hideFairnessModal);
    const copyBtn = $('wp-fair-copy-btn');
    if (copyBtn) copyBtn.addEventListener('click', copyFairnessSnapshot);
  }

  function showFairnessModal(round) {
    ensureFairnessModal();
    const modal = $('wp-room-fairness-modal');
    if (!modal) return;

    const luckyText = Array.isArray(round.lucky_numbers)
      ? round.lucky_numbers.map((item) => `${item.num}×${item.mult}`).join(', ')
      : '—';
    const totalText = `${Number(round.total_bets || 0).toLocaleString('ru-RU')} W / ${Number(round.total_payout || 0).toLocaleString('ru-RU')} W`;

    $('wp-fair-round').textContent = `Раунд: #${round.round_index || round.id || '—'}`;
    $('wp-fair-number').textContent = `Выпало: ${round.winning_number ?? '—'} (${String(round.winning_color || '').toUpperCase() || '—'})`;
    $('wp-fair-server-hash').textContent = `Server hash: ${round.server_seed_hash || '—'}`;
    $('wp-fair-server-seed').textContent = `Server seed: ${round.server_seed || 'скрыт до окончания раунда'}`;
    $('wp-fair-client-seed').textContent = `Client seed: ${round.client_seed || '—'}`;
    $('wp-fair-nonce').textContent = `Nonce: ${round.nonce ?? '—'}`;
    $('wp-fair-lucky').textContent = `Lucky numbers: ${luckyText}`;
    $('wp-fair-total').textContent = `Оборот: ${totalText}`;

    modal.style.display = 'flex';
    state.lastSnapshot = round;
  }

  function hideFairnessModal() {
    const modal = $('wp-room-fairness-modal');
    if (modal) modal.style.display = 'none';
  }

  async function copyFairnessSnapshot() {
    const round = state.lastSnapshot;
    if (!round) return;
    const text = [
      `Round #${round.round_index || round.id || '—'}`,
      `Winning number: ${round.winning_number ?? '—'}`,
      `Winning color: ${round.winning_color ?? '—'}`,
      `Server hash: ${round.server_seed_hash || '—'}`,
      `Server seed: ${round.server_seed || '—'}`,
      `Client seed: ${round.client_seed || '—'}`,
      `Nonce: ${round.nonce ?? '—'}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      notify('Скопировано');
    } catch (_) {
      notify(text);
    }
  }

  function renderHistory(history) {
    const line = $('wp-history-line');
    if (!line || !Array.isArray(history)) return;

    line.innerHTML = '';
    history.slice(0, 10).forEach((round) => {
      const bubble = document.createElement('div');
      bubble.className = `hist-circle ${colorOf(Number(round.winning_number || 0))} wp-history-clickable`;
      bubble.textContent = String(round.winning_number ?? '—');
      bubble.title = 'Проверка честности';
      bubble.addEventListener('click', () => showFairnessModal(round));
      line.appendChild(bubble);
    });
  }

  function renderLivePlayers(players) {
    const grid = $('wp-live-players-grid');
    if (!grid) return;
    const list = Array.isArray(players) ? players : [];
    if (!list.length) {
      grid.innerHTML = '<div class="wp-room-empty">Пока ставок нет. Будь первым.</div>';
      return;
    }

    grid.innerHTML = list.slice(0, 12).map((player) => `
      <div class="wp-live-player">
        <div class="wp-live-player-name">${player.name ? String(player.name) : 'noname'}</div>
        <div class="wp-live-player-meta">Ставка: ${Number(player.amount || 0).toLocaleString('ru-RU')} W</div>
        <div class="wp-live-player-meta">${betLabel(player.cell)} • ${player.telegram_id || ''}</div>
      </div>
    `).join('');
  }

  function syncBalanceFromSnapshot(snapshot) {
    const balance = Number(snapshot?.profile?.balance ?? snapshot?.balance ?? 0);
    if (Number.isFinite(balance)) {
      state.playerBalance = balance;
      if (typeof window.refreshUI === 'function') window.refreshUI();
    }
  }

  function updateRoomPill(snapshot) {
    const pill = $('wp-room-pill');
    if (!pill) return;
    const room = snapshot?.room || {};
    pill.textContent = room.phase === 'open'
      ? `Раунд #${room.round_index || '—'} • ${Number(room.seconds_remaining || 0)} сек`
      : `Раунд #${room.round_index || '—'}`;
  }

  function updateCenterText(snapshot) {
    const emoji = $('wp-center-emoji');
    const text = $('wp-center-text');
    const room = snapshot?.room || {};
    if (!emoji || !text) return;
    if (snapshot?.resolved_round && snapshot.resolved_round.id && snapshot.resolved_round.id !== state.lastResolvedRoundId) {
      emoji.textContent = '🎰';
      text.textContent = 'Раунд завершён';
      return;
    }
    if (room.phase === 'open') {
      emoji.textContent = '⏳';
      text.textContent = `${room.seconds_remaining || 0} сек`;
    } else {
      emoji.textContent = '🎰';
      text.textContent = 'Ожидание';
    }
  }

  function updateLuckyNumbersFromSnapshot(round) {
    if (!round) return;
    const lucky = Array.isArray(round.lucky_numbers) ? round.lucky_numbers : [];
    state.roundLuckyNumbersList = lucky;
    state.roundWinningNumber = Number(round.winning_number || 0);
    state.roundSecretSalt = round.server_seed || '';
    if (typeof window.updateLuckyNumbersUI === 'function') window.updateLuckyNumbersUI();
  }

  function applyResolvedRound(snapshot) {
    const round = snapshot?.resolved_round;
    if (!round || !round.id || round.id === state.lastResolvedRoundId) return;

    state.lastResolvedRoundId = round.id;
    state.roomResolvedSnapshot = round;
    updateLuckyNumbersFromSnapshot(round);

    if (typeof window.animateLuckyNumbersSlots === 'function') {
      window.animateLuckyNumbersSlots();
    } else if (typeof window.displayRoundWinnerModalPopup === 'function') {
      window.displayRoundWinnerModalPopup(Number(round.my_result?.amount_won || 0), Boolean(round.my_result?.is_lucky_hit), Number(round.my_result?.lucky_bonus || 0));
    }
  }

  async function syncRoomState() {
    if (!state.initData) return;
    try {
      const snapshot = await requestJson('/state', { init_data: state.initData });
      state.room = snapshot;
      syncBalanceFromSnapshot(snapshot);
      renderHistory(snapshot.history || []);
      renderLivePlayers(snapshot.live_players || []);
      updateRoomPill(snapshot);
      updateCenterText(snapshot);
      applyResolvedRound(snapshot);
      state.lastSnapshot = snapshot.resolved_round || snapshot.current_round || snapshot;
    } catch (error) {
      console.warn('Wheel Plus room sync failed:', error.message);
    }
  }

  async function submitRoomBet(cellId) {
    const field = $('wp-bet-field');
    const bet = Math.floor(Number(field ? field.value : 0));
    if (!Number.isFinite(bet) || bet <= 0) {
      notify('Укажи корректную ставку');
      return;
    }
    if (bet > Number(window.state?.playerBalance ?? 0)) {
      notify('Недостаточно WC');
      return;
    }

    try {
      const snapshot = await requestJson('/bet', {
        init_data: state.initData,
        bet_cell: cellId,
        amount: bet,
      });
      state.room = snapshot;
      syncBalanceFromSnapshot(snapshot);
      if (typeof window.refreshUI === 'function') window.refreshUI();
      renderLivePlayers(snapshot.live_players || []);
      renderHistory(snapshot.history || []);
      updateRoomPill(snapshot);
      updateCenterText(snapshot);
      state.currentUserBetTotal = Number(snapshot?.current_round?.my_result?.amount_bet || 0);
      if (typeof window.triggerHaptic === 'function') window.triggerHaptic('light');
      if (!state.pollTimer) startRoomPolling();
    } catch (error) {
      notify(error.message || 'Не удалось принять ставку');
    }
  }

  function startRoomPolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    syncRoomState();
    state.pollTimer = setInterval(syncRoomState, 1500);
  }

  function overrideGameApi() {
    const originalModifyBetSize = window.modifyBetSize;
    const originalAddChipValue = window.addChipValue;
    const originalToggleKeyboardLayout = window.toggleKeyboardLayout;

    window.modifyBetSize = function modifyBetSizeWrapped(action) {
      if (typeof originalModifyBetSize === 'function') {
        return originalModifyBetSize(action);
      }
      return undefined;
    };

    window.addChipValue = function addChipValueWrapped(amount) {
      if (typeof originalAddChipValue === 'function') {
        return originalAddChipValue(amount);
      }
      return undefined;
    };

    window.toggleKeyboardLayout = function toggleKeyboardLayoutWrapped(layoutName) {
      if (typeof originalToggleKeyboardLayout === 'function') {
        return originalToggleKeyboardLayout(layoutName);
      }
      return undefined;
    };

    window.placeBetOnCell = function placeBetOnCellWrapped(cellId) {
      submitRoomBet(cellId);
    };

    window.startRoundCountdownTimer = function startRoundCountdownTimerWrapped() {
      state.isGameSessionActive = true;
      startRoomPolling();
    };

    window.generateSecureRoundData = async function generateSecureRoundDataWrapped() {
      await syncRoomState();
    };

    window.animateLuckyNumbersSlots = function animateLuckyNumbersSlotsWrapped() {
      if (typeof window.initiateWheelSpinAnimation === 'function') {
        window.initiateWheelSpinAnimation();
      }
    };

    window.initiateWheelSpinAnimation = function initiateWheelSpinAnimationWrapped() {
      const round = state.roomResolvedSnapshot;
      if (!round) return;
      if (typeof window.drawPremiumRouletteWheel === 'function') {
        window.drawPremiumRouletteWheel(0);
      }
      if (typeof window.updateWheelViewWithBall === 'function') {
        window.updateWheelViewWithBall(0, 0);
      }
      window.setTimeout(() => {
        if (typeof window.finalizeRoundResultsAndPayouts === 'function') {
          window.finalizeRoundResultsAndPayouts();
        }
      }, 400);
    };

    window.finalizeRoundResultsAndPayouts = function finalizeRoundResultsAndPayoutsWrapped() {
      const round = state.roomResolvedSnapshot;
      if (!round) return;

      const amountWon = Number(round.my_result?.amount_won || 0);
      const isLuckyHit = Boolean(round.my_result?.is_lucky_hit);
      const luckyBonus = Number(round.my_result?.lucky_bonus || 0);
      const modalNum = $('modal-winning-number');
      if (modalNum) {
        modalNum.textContent = String(round.winning_number ?? '—');
        modalNum.style.color = round.winning_color === 'green' ? 'var(--neon-green)' : round.winning_color === 'red' ? 'var(--neon-red)' : '#ffffff';
      }

      const badge = $('modal-winning-multiplier-badge');
      if (badge) {
        badge.innerText = isLuckyHit ? `LUCKY BONUS x${luckyBonus}!` : 'Wheel Plus';
        badge.style.background = isLuckyHit ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)';
        badge.style.borderColor = isLuckyHit ? 'var(--neon-gold)' : 'var(--neon-green)';
        badge.style.color = isLuckyHit ? '#fef08a' : '#a7f3d0';
      }

      const statusText = $('modal-player-win-status-text');
      if (statusText) {
        statusText.innerHTML = amountWon > 0
          ? `🎉 Выиграли:<br><span style="color: var(--neon-gold); font-size: 20px; font-weight: 900;">+ ${amountWon} W</span>`
          : 'В этот раз не повезло.';
      }

      const modal = $('wp-result-modal-popup');
      if (modal) modal.style.display = 'flex';

      const historyLine = $('wp-history-line');
      if (historyLine) {
        const circle = document.createElement('div');
        circle.className = `hist-circle ${round.winning_color || 'black'} wp-history-clickable`;
        circle.innerText = String(round.winning_number ?? '—');
        circle.addEventListener('click', () => showFairnessModal(round));
        historyLine.insertBefore(circle, historyLine.firstChild);
        while (historyLine.children.length > 10) historyLine.removeChild(historyLine.lastChild);
      }

      if (amountWon > 0 && tg && typeof tg.HapticFeedback?.notificationOccurred === 'function') {
        tg.HapticFeedback.notificationOccurred('success');
      }
    };

    window.adjustRemoteBalance = function adjustRemoteBalanceWrapped() {
      return undefined;
    };

    window.syncBalanceFromServer = async function syncBalanceFromServerWrapped() {
      await syncRoomState();
    };
  }

  function boot() {
    ensureInjectedStyles();
    ensureRoomPanel();
    ensureFairnessModal();
    overrideGameApi();
    startRoomPolling();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
