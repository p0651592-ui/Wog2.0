(() => {
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  const API_BASE = (window.WOG_API_BASE || window.API_BASE || "").replace(/\/$/, "");
  const endpoint = (path) => `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

  const state = {
    userId: 6682822292,
    firstName: "Игрок",
    username: "",
    photoUrl: "",
    balance: Number(localStorage.getItem("wog_crash_balance")) || 100000,
    bet: 100,
    multiplier: 1.0,
    crashPoint: 0,
    running: false,
    cashedOut: false,
    startTs: 0,
    rafId: 0,
    history: JSON.parse(localStorage.getItem("wog_crash_history") || "[]"),
  };

  const els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function fmt(n) {
    return new Intl.NumberFormat("ru-RU").format(Math.max(0, Math.floor(Number(n) || 0)));
  }

  function fmtMult(v) {
    return `${Number(v).toFixed(2)}x`;
  }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function haptic(type) {
    try {
      if (!tg || !tg.HapticFeedback) return;
      if (type === "success") tg.HapticFeedback.notificationOccurred("success");
      else if (type === "error") tg.HapticFeedback.notificationOccurred("error");
      else tg.HapticFeedback.impactOccurred(type);
    } catch (_) {}
  }

  function notify(message) {
    if (tg && typeof tg.showAlert === "function") tg.showAlert(message);
    else alert(message);
  }

  async function postJson(path, payload) {
    const response = await fetch(endpoint(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || `HTTP ${response.status}`);
    }
    return data;
  }

  function renderBalance() {
    if (els.balanceValue) els.balanceValue.textContent = fmt(state.balance);
    if (els.availableBalance) els.availableBalance.textContent = fmt(state.balance);
    if (els.userMeta) els.userMeta.textContent = `Баланс: ${fmt(state.balance)} W`;
  }

  function renderBet() {
    if (els.betValue) els.betValue.value = String(state.bet);
  }

  function renderMultiplier() {
    if (els.multiplier) els.multiplier.textContent = fmtMult(state.multiplier);
    if (els.crashProgress) {
      const progress = state.running ? clamp(state.multiplier / Math.max(1.1, state.crashPoint), 0.05, 1) : 0.05;
      els.crashProgress.style.transform = `scaleX(${progress})`;
    }
  }

  function renderRoundInfo(text) {
    if (els.roundInfo) els.roundInfo.textContent = text;
  }

  function renderStatus(text) {
    if (els.roundStatus) els.roundStatus.textContent = text;
  }

  function renderControls() {
    const canStart = !state.running && state.bet > 0 && state.bet <= state.balance;
    if (els.placeBetBtn) {
      els.placeBetBtn.disabled = !canStart;
      els.placeBetBtn.textContent = state.running ? "Раунд идёт" : "Сделать ставку";
    }
    if (els.cashoutBtn) {
      els.cashoutBtn.disabled = !state.running || state.cashedOut;
      els.cashoutBtn.textContent = state.running ? `Cash Out` : "Cash Out";
      els.cashoutBtn.classList.toggle("is-cashout-state", state.running);
    }
  }

  function renderHistory() {
    if (!els.historyTrack) return;
    els.historyTrack.innerHTML = "";
    state.history.slice(0, 10).forEach((item) => {
      const pill = document.createElement("div");
      pill.className = `history-pill ${item.kind === "cash" ? "cash" : "crash"}`;
      pill.textContent = `${fmtMult(item.mult)} ${item.kind === "cash" ? "CASH" : "CRASH"}`;
      els.historyTrack.appendChild(pill);
    });
  }

  function saveHistory(item) {
    state.history.unshift(item);
    state.history = state.history.slice(0, 10);
    localStorage.setItem("wog_crash_history", JSON.stringify(state.history));
    renderHistory();
  }

  function saveBalance() {
    localStorage.setItem("wog_crash_balance", String(state.balance));
    renderBalance();
  }

  function setBalance(next) {
    state.balance = Math.max(0, Math.floor(Number(next) || 0));
    saveBalance();
  }

  async function syncBalanceDelta(delta) {
    if (!Number.isFinite(delta) || delta === 0) return;
    try {
      await postJson("/api/balance", {
        id: state.userId,
        amount: delta,
        game_mode: "crash",
      });
    } catch (error) {
      console.warn("Balance sync failed:", error);
    }
  }

  async function syncProfile() {
    if (!tg || !tg.initDataUnsafe || !tg.initDataUnsafe.user) {
      renderBalance();
      renderControls();
      renderRoundInfo("Тестовый режим");
      renderStatus("Ставки открыты");
      return;
    }

    const user = tg.initDataUnsafe.user;
    state.userId = user.id;
    state.firstName = user.first_name || "Игрок";
    state.username = user.username || "";
    state.photoUrl = user.photo_url || "";

    if (els.userName) {
      els.userName.textContent = state.firstName + (state.username ? ` (@${state.username})` : "");
    }
    if (els.avatarBox) {
      if (state.photoUrl) els.avatarBox.innerHTML = `<img src="${state.photoUrl}" alt="avatar">`;
      else els.avatarBox.textContent = state.firstName.charAt(0).toUpperCase();
    }

    try {
      const data = await postJson("/api/user", {
        id: state.userId,
        first_name: state.firstName,
        username: state.username,
        photo_url: state.photoUrl,
        auth_data: tg.initData,
      });
      if (typeof data.balance === "number") {
        setBalance(data.balance);
      }
      renderRoundInfo("Ставки открыты");
      renderStatus("Ожидание ставки");
    } catch (error) {
      console.warn("User sync failed:", error);
      renderRoundInfo("Офлайн");
      renderStatus("Баланс из кэша");
    }
  }

  function randomCrashPoint() {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const r = buf[0] / 4294967295;
    const point = 1.06 + Math.pow(r, 1.85) * 24;
    return Number(clamp(point, 1.06, 25).toFixed(2));
  }

  function resetRoundUI() {
    state.running = false;
    state.cashedOut = false;
    state.multiplier = 1.0;
    state.crashPoint = 0;
    state.startTs = 0;
    cancelAnimationFrame(state.rafId);
    renderMultiplier();
    renderRoundInfo("Ставки открыты");
    renderStatus("Готов к новому раунду");
    if (els.crashPointText) els.crashPointText.textContent = "Точка краша скрыта до конца раунда";
    renderControls();
  }

  function beginRound() {
    if (state.running) return;
    if (!Number.isFinite(state.bet) || state.bet < 10) state.bet = 10;
    state.bet = Math.floor(state.bet);
    if (state.bet > state.balance) {
      notify("Недостаточно монет для ставки.");
      return;
    }

    setBalance(state.balance - state.bet);
    syncBalanceDelta(-state.bet);

    state.running = true;
    state.cashedOut = false;
    state.multiplier = 1.0;
    state.crashPoint = randomCrashPoint();
    state.startTs = performance.now();
    renderRoundInfo("Раунд идёт");
    renderStatus("Успейте выйти до краша");
    renderControls();
    if (els.cashoutBtn) els.cashoutBtn.textContent = "Cash Out";
    haptic("light");

    cancelAnimationFrame(state.rafId);
    state.rafId = requestAnimationFrame(tick);
  }

  function tick(now) {
    if (!state.running) return;
    const elapsed = now - state.startTs;
    state.multiplier = Number(Math.max(1, Math.pow(1.00032, elapsed)).toFixed(2));
    renderMultiplier();
    renderRoundInfo(`Цель: ${fmtMult(state.crashPoint)}`);

    if (els.autoCashoutValue && Number(els.autoCashoutValue.value) > 1.01 && state.multiplier >= Number(els.autoCashoutValue.value)) {
      cashOut(true);
      return;
    }

    if (state.multiplier >= state.crashPoint) {
      crashRound();
      return;
    }

    state.rafId = requestAnimationFrame(tick);
  }

  async function cashOut(auto = false) {
    if (!state.running || state.cashedOut) return;
    state.cashedOut = true;
    cancelAnimationFrame(state.rafId);

    const payout = Math.floor(state.bet * state.multiplier);
    setBalance(state.balance + payout);
    await syncBalanceDelta(payout);

    state.running = false;
    saveHistory({ mult: state.multiplier, kind: "cash" });
    if (els.crashPointText) els.crashPointText.textContent = `Раунд закрыт. Краш был на ${fmtMult(state.crashPoint)}`;
    renderRoundInfo("Выигрыш зафиксирован");
    renderStatus(auto ? "Автовывод сработал" : `Вывод: ${fmt(payout)} W`);
    if (tg && tg.HapticFeedback) haptic("success");
    renderControls();
    setTimeout(resetRoundUI, 900);
  }

  function crashRound() {
    state.running = false;
    state.cashedOut = false;
    cancelAnimationFrame(state.rafId);
    saveHistory({ mult: state.crashPoint, kind: "crash" });
    if (els.crashPointText) els.crashPointText.textContent = `Взрыв на ${fmtMult(state.crashPoint)}`;
    renderRoundInfo("Краш!");
    renderStatus("Ставка потеряна");
    if (tg && tg.HapticFeedback) haptic("error");
    renderControls();
    setTimeout(resetRoundUI, 1200);
  }

  function addChip(amount) {
    const input = els.betValue;
    const current = Math.max(0, parseInt(input.value || state.bet, 10) || 0);
    const next = clamp(current + amount, 10, Math.max(10, state.balance));
    input.value = String(next);
    state.bet = next;
    renderControls();
    haptic("light");
  }

  function syncBetFromInput() {
    const next = parseInt(els.betValue.value, 10);
    if (Number.isFinite(next)) {
      state.bet = clamp(next, 10, Math.max(10, state.balance));
      els.betValue.value = String(state.bet);
    } else {
      state.bet = 100;
      els.betValue.value = "100";
    }
    renderControls();
  }

  function quickSetBet(pct) {
    const next = Math.floor(state.balance * pct);
    state.bet = clamp(next, 10, Math.max(10, state.balance));
    renderBet();
    renderControls();
    haptic("light");
  }

  function handleCrashActionButtonClick() {
    if (state.running) {
      cashOut(false);
      return;
    }
    syncBetFromInput();
    beginRound();
  }

  function goToLobby() {
    try {
      if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
    } catch (_) {}
    location.href = "index.html";
  }

  function bindUi() {
    els.avatarBox = $("avatar-box");
    els.userName = $("user-name");
    els.userMeta = $("user-meta");
    els.balanceValue = $("balance-value");
    els.availableBalance = $("available-balance");
    els.betValue = $("bet-value");
    els.autoCashoutValue = $("auto-cashout-value");
    els.placeBetBtn = $("place-bet-btn");
    els.cashoutBtn = $("cashout-btn");
    els.multiplier = $("crash-multiplier");
    els.crashProgress = $("crash-progress");
    els.crashPointText = $("crash-point-text");
    els.roundStatus = $("round-status");
    els.roundInfo = $("round-info");
    els.historyTrack = $("history-track");

    $("back-btn").addEventListener("click", goToLobby);
    $("place-bet-btn").addEventListener("click", handleCrashActionButtonClick);
    $("cashout-btn").addEventListener("click", () => cashOut(false));
    $("quick-add-btn").addEventListener("click", () => addChip(100));

    document.querySelectorAll(".quick-bets button").forEach((btn) => {
      btn.addEventListener("click", () => quickSetBet(parseFloat(btn.dataset.pct || "0.1")));
    });

    els.betValue.addEventListener("input", syncBetFromInput);
    els.autoCashoutValue.addEventListener("input", () => {
      const value = parseFloat(els.autoCashoutValue.value);
      els.autoCashoutValue.value = Number.isFinite(value) && value >= 1.01 ? value.toFixed(2) : "2.00";
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Enter") handleCrashActionButtonClick();
    });

    if (tg) {
      try {
        tg.ready();
        tg.expand();
        if (tg.BackButton) {
          tg.BackButton.show();
          tg.BackButton.offClick();
          tg.BackButton.onClick(goToLobby);
        }
      } catch (error) {
        console.warn(error);
      }
    }

    renderBet();
    renderBalance();
    renderHistory();
    renderMultiplier();
    renderControls();
    resetRoundUI();
    syncProfile();
  }

  window.addChip = addChip;
  window.handleCrashActionButtonClick = handleCrashActionButtonClick;
  window.goToLobby = goToLobby;

  document.addEventListener("DOMContentLoaded", bindUi);
})();