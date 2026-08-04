(() => {
  if (window.__WHEEL_PLUS_ROOM_RUNTIME__) return;
  window.__WHEEL_PLUS_ROOM_RUNTIME__ = true;

  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  const API_BASE = (window.WOG_CONFIG && window.WOG_CONFIG.API_BASE_URL)
    ? String(window.WOG_CONFIG.API_BASE_URL).replace(/\/$/, '')
    : '';

  const WHEEL_NUMBERS = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
    5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
  ];

  const ui = {
    initData: tg && tg.initData ? tg.initData : '',
    pollTimer: null,
    playerBalance: Number(localStorage.getItem('wog_secure_balance')) || 0,
    activeBetAmount: 100,
    totalRoundBetSum: 0,
    currentRoundBets: {},
    currentResolvedRoundId: 0,
    room: null,
    lastResultRound: null,
    lastKnownWinningNumber: 0,
  };

  const $ = (id) => document.getElementById(id);

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

  function colorOf(number) {
    const n = Number(number);
    if (n === 0) return 'green';
    return [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(n) ? 'red' : 'black';
  }

  function betLabel(cell) {
    const labels = {
      red: 'Красное',
      black: 'Чёрное',
      even: 'Чёт',
      odd: 'Нечёт',
      low: '1–18',
      high: '19–36',
      doz1: '1-я дюжина',
      doz2: '2-я дюжина',
      doz3: '3-я дюжина',
    };
    if (labels[cell]) return labels[cell];
    if (String(cell).startsWith('num')) return `№ ${String(cell).replace('num', '')}`;
    return String(cell || '—');
  }

  function ensureStyles() {
    if ($('wp-room-runtime-styles')) return;
    const style = document.createElement('style');
    style.id = 'wp-room-runtime-styles';
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
      .wp-room-modal .actions { display:flex; gap:8px; margin-top: 14px; }
      .wp-room-modal .btn { flex:1; border:none; border-radius: 12px; padding: 11px 12px; font-weight: 900; cursor:pointer; color:#fff; background: var(--bg-inner, #1d233d); }
      .wp-room-modal .btn.primary { background: var(--blue, #2f6bf2); }
      .wp-room-modal .btn:active { transform: scale(.98); }
      @media (max-width: 380px) { .wp-live-players-grid { grid-template-columns: 1fr; } }
    `;
    document.head.appendChild(style);
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
          <div style="font-size: 11px; font-weight: 700; color: var(--text-muted, #64748b);">Общая комната, общая история, реальные игроки</div>
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
    ui.lastResultRound = round;
  }

  function hideFairnessModal() {
    const modal = $('wp-room-fairness-modal');
    if (modal) modal.style.display = 'none';
  }

  async function copyFairnessSnapshot() {
    const round = ui.lastResultRound;
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

  function renderBalance() {
    const balanceEl = $('wp-balance-display');
    if (balanceEl) balanceEl.textContent = `${Number(ui.playerBalance || 0).toLocaleString('ru-RU')} W`;

    const totalBetEl = $('wp-player-total-bet');
    if (totalBetEl) totalBetEl.textContent = `${Number(ui.totalRoundBetSum || 0).toLocaleString('ru-RU')} W`;

    const field = $('wp-bet-field');
    if (field) field.value = String(ui.activeBetAmount || 100);
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
    if (snapshot?.resolved_round && snapshot.resolved_round.id && snapshot.resolved_round.id !== ui.currentResolvedRoundId) {
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

  function updateLuckyNumbers(round) {
    const lucky = Array.isArray(round?.lucky_numbers) ? round.lucky_numbers : [];
    for (let i = 0; i < 3; i += 1) {
      const numEl = $(`lucky-num-${i + 1}`);
      const multEl = $(`lucky-mult-${i + 1}`);
      if (!numEl || !multEl) continue;
      const data = lucky[i];
      if (!data) {
        numEl.textContent = '-';
        multEl.textContent = '0X';
        continue;
      }
      numEl.textContent = String(data.num);
      multEl.textContent = `${data.mult}X`;
    }
  }

  function drawResolvedWheel(number) {
    if (typeof window.drawPremiumRouletteWheel === 'function') {
      window.drawPremiumRouletteWheel(0);
    }
    if (typeof window.updateWheelViewWithBall === 'function') {
      const idx = Math.max(0, WHEEL_NUMBERS.indexOf(Number(number)));
      const segment = (2 * Math.PI) / WHEEL_NUMBERS.length;
      const wheelAngle = 0;
      const ballAngle = -(idx * segment) + (Math.PI / 2);
      window.updateWheelViewWithBall(wheelAngle, ballAngle);
    }
  }

  function playLuckyRevealAnimation() {
    const round = ui.lastResultRound;
    if (!round) return;

    let frame = 0;
    const maxFrames = 90;
    const numEls = [$('lucky-num-1'), $('lucky-num-2'), $('lucky-num-3')];
    const multEls = [$('lucky-mult-1'), $('lucky-mult-2'), $('lucky-mult-3')];
    const lucky = Array.isArray(round.lucky_numbers) ? round.lucky_numbers : [];

    function tick() {
      frame += 1;
      for (let i = 0; i < 3; i += 1) {
        if (frame < (i + 1) * 30) {
          if (numEls[i]) numEls[i].textContent = String(Math.floor(Math.random() * 37));
          if (multEls[i]) multEls[i].textContent = `${LUCKY_MULTIPLIERS[Math.floor(Math.random() * LUCKY_MULTIPLIERS.length)]}X`;
        } else if (lucky[i]) {
          if (numEls[i]) numEls[i].textContent = String(lucky[i].num);
          if (multEls[i]) multEls[i].textContent = `${lucky[i].mult}X`;
        }
      }

      if (frame < maxFrames) {
        requestAnimationFrame(tick);
        return;
      }

      setTimeout(() => {
        drawResolvedWheel(round.winning_number);
        setTimeout(() => {
          window.finalizeRoundResultsAndPayouts();
        }, 450);
      }, 300);
    }

    requestAnimationFrame(tick);
  }

  function showResolvedRound(snapshot) {
    const round = snapshot?.resolved_round;
    if (!round || !round.id || round.id === ui.currentResolvedRoundId) return;

    ui.currentResolvedRoundId = round.id;
    ui.lastResultRound = round;
    updateLuckyNumbers(round);
    playLuckyRevealAnimation();
  }

  async function syncRoomState() {
    if (!ui.initData) return;
    try {
      const snapshot = await requestJson('/state', { init_data: ui.initData });
      ui.room = snapshot;
      ui.playerBalance = Number(snapshot?.profile?.balance ?? ui.playerBalance ?? 0);
      ui.livePlayers = snapshot.live_players || [];
      renderBalance();
      renderHistory(snapshot.history || []);
      renderLivePlayers(ui.livePlayers);
      updateRoomPill(snapshot);
      updateCenterText(snapshot);
      showResolvedRound(snapshot);
    } catch (error) {
      console.warn('Wheel Plus room sync failed:', error.message);
    }
  }

  function updateBetHighlights(cellId, amount) {
    const targetBtn = $(`cell-${cellId}`);
    if (!targetBtn) return;
    targetBtn.classList.add('wp-bet-active-glow', 'has-bets-placed');
    let chip = targetBtn.querySelector('.wp-live-chip-badge');
    if (!chip) {
      chip = document.createElement('div');
      chip.className = 'wp-live-chip-badge';
      targetBtn.appendChild(chip);
    }
    chip.textContent = String(Number(amount || 0).toLocaleString('ru-RU'));
  }

  function clearBetHighlights() {
    document.querySelectorAll('.wp-bet-trigger-btn').forEach((btn) => {
      btn.classList.remove('wp-bet-active-glow', 'has-bets-placed');
      const chip = btn.querySelector('.wp-live-chip-badge');
      if (chip) chip.remove();
    });
  }

  async function submitRoomBet(cellId) {
    const field = $('wp-bet-field');
    const bet = Math.floor(Number(field ? field.value : 0));
    const balance = Number(ui.playerBalance || 0);

    if (!Number.isFinite(bet) || bet <= 0) {
      notify('Укажи корректную ставку');
      return;
    }
    if (bet > balance) {
      notify('Недостаточно WC');
      return;
    }

    try {
      const snapshot = await requestJson('/bet', {
        init_data: ui.initData,
        bet_cell: cellId,
        amount: bet,
      });
      ui.room = snapshot;
      ui.playerBalance = Number(snapshot?.profile?.balance ?? ui.playerBalance);
      ui.activeBetAmount = bet;
      ui.totalRoundBetSum = Number(snapshot?.current_round?.my_result?.amount_bet ?? ui.totalRoundBetSum + bet);
      ui.currentRoundBets[cellId] = (ui.currentRoundBets[cellId] || 0) + bet;
      renderBalance();
      renderLivePlayers(snapshot.live_players || []);
      renderHistory(snapshot.history || []);
      updateRoomPill(snapshot);
      updateCenterText(snapshot);
      updateBetHighlights(cellId, ui.currentRoundBets[cellId]);
      if (tg && tg.HapticFeedback && typeof tg.HapticFeedback.impactOccurred === 'function') {
        tg.HapticFeedback.impactOccurred('light');
      }
      if (!ui.pollTimer) startRoomPolling();
    } catch (error) {
      notify(error.message || 'Не удалось принять ставку');
    }
  }

  function startRoomPolling() {
    if (ui.pollTimer) clearInterval(ui.pollTimer);
    syncRoomState();
    ui.pollTimer = setInterval(syncRoomState, 1500);
  }

  function overrideGameApi() {
    window.placeBetOnCell = function placeBetOnCellWrapped(cellId) {
      submitRoomBet(cellId);
    };

    window.modifyBetSize = function modifyBetSizeWrapped(action) {
      let current = Math.floor(Number(ui.activeBetAmount || 100));
      if (!Number.isFinite(current) || current <= 0) current = 100;
      if (action === 'x2') current = Math.min(Number(ui.playerBalance || current), current * 2);
      if (action === '/2') current = Math.max(10, Math.floor(current / 2));
      ui.activeBetAmount = current;
      renderBalance();
    };

    window.addChipValue = function addChipValueWrapped(amount) {
      const add = Number(amount) || 0;
      let next = Math.floor(Number(ui.activeBetAmount || 0)) + add;
      if (next > Number(ui.playerBalance || next)) next = Number(ui.playerBalance || next);
      ui.activeBetAmount = next;
      renderBalance();
    };

    window.toggleKeyboardLayout = function toggleKeyboardLayoutWrapped(layoutName) {
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
    };

    window.startRoundCountdownTimer = function startRoundCountdownTimerWrapped() {
      startRoomPolling();
    };

    window.generateSecureRoundData = async function generateSecureRoundDataWrapped() {
      await syncRoomState();
    };

    window.updateLuckyNumbersUI = function updateLuckyNumbersUIWrapped() {
      if (ui.lastResultRound) updateLuckyNumbers(ui.lastResultRound);
    };

    window.animateLuckyNumbersSlots = function animateLuckyNumbersSlotsWrapped() {
      const round = ui.lastResultRound;
      if (!round) return;
      playLuckyRevealAnimation();
    };

    window.initiateWheelSpinAnimation = function initiateWheelSpinAnimationWrapped() {
      const round = ui.lastResultRound;
      if (!round) return;
      drawResolvedWheel(round.winning_number);
      setTimeout(() => {
        window.finalizeRoundResultsAndPayouts();
      }, 300);
    };

    window.finalizeRoundResultsAndPayouts = function finalizeRoundResultsAndPayoutsWrapped() {
      const round = ui.lastResultRound;
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

      renderBalance();
      clearBetHighlights();
      if (tg && tg.HapticFeedback && typeof tg.HapticFeedback.notificationOccurred === 'function' && amountWon > 0) {
        tg.HapticFeedback.notificationOccurred('success');
      }
    };

    window.displayRoundWinnerModalPopup = function displayRoundWinnerModalPopupWrapped() {
      window.finalizeRoundResultsAndPayouts();
    };

    window.closeResultModalPopup = function closeResultModalPopupWrapped() {
      const modal = $('wp-result-modal-popup');
      if (modal) modal.style.display = 'none';
      ui.currentRoundBets = {};
      ui.totalRoundBetSum = 0;
      ui.activeBetAmount = 100;
      renderBalance();
      clearBetHighlights();
      const field = $('wp-bet-field');
      if (field) {
        field.disabled = false;
        field.value = String(ui.activeBetAmount);
      }
      if (typeof window.drawPremiumRouletteWheel === 'function') {
        window.drawPremiumRouletteWheel(0);
      }
    };

    window.exitRouletteToLobby = function exitRouletteToLobbyWrapped() {
      if (ui.pollTimer) {
        clearInterval(ui.pollTimer);
        ui.pollTimer = null;
      }
      location.href = 'index.html';
    };

    window.openAdminMenu = function openAdminMenuWrapped() {
      location.href = apiUrl('/admin');
    };

    window.refreshUI = function refreshUIWrapped() {
      renderBalance();
      updateRoomPill(ui.room);
      updateCenterText(ui.room);
    };

    window.syncBalanceFromServer = async function syncBalanceFromServerWrapped() {
      await syncRoomState();
    };

    window.adjustRemoteBalance = function adjustRemoteBalanceWrapped() {
      return undefined;
    };
  }

  function init() {
    ensureInjectedStyles();
    ensureRoomPanel();
    ensureFairnessModal();
    overrideGameApi();
    renderBalance();
    startRoomPolling();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
