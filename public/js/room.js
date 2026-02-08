// ── Room Client Logic ─────────────────────────────────────────────────

(function () {
  // ── Parse URL params ────────────────────────────────────────────────

  const params = new URLSearchParams(window.location.search);
  const roomId = params.get("room");
  const name = params.get("name");

  if (!roomId || !name) {
    window.location.href = "/";
    return;
  }

  // ── DOM refs ────────────────────────────────────────────────────────

  const $ = (id) => document.getElementById(id);

  const roomIdDisplay = $("room-id-display");
  const connectionStatus = $("connection-status");
  const roomLinkBox = $("room-link-box");
  const roomLinkUrl = $("room-link-url");
  const btnCopyLink = $("btn-copy-link");
  const topicInput = $("topic-input");
  const topicDisplay = $("topic-display");
  const voteCards = $("vote-cards");
  const voteSection = $("vote-section");
  const creatorControls = $("creator-controls");
  const btnReveal = $("btn-reveal");
  const btnClear = $("btn-clear");
  const statsPanel = $("stats-panel");
  const participantTbody = $("participant-tbody");
  const participantCount = $("participant-count");
  const schemeSelector = $("scheme-selector");
  const timerDisplay = $("timer-display");
  const historyList = $("history-list");
  const footerStatus = $("footer-status");
  const footerInfo = $("footer-info");
  const toast = $("toast");

  // ── State ───────────────────────────────────────────────────────────

  let isCreator = false;
  let currentVote = null;
  let currentScheme = "fibonacci";
  let timerRemaining = null;

  const SCHEMES = {
    fibonacci: ["0", "1", "2", "3", "5", "8", "13", "21", "34", "?", "pass"],
    tshirt: ["XS", "S", "M", "L", "XL", "XXL", "?", "pass"],
    powers: ["0", "1", "2", "4", "8", "16", "32", "64", "?", "pass"],
    sequential: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "?", "pass"],
  };

  // ── Init ────────────────────────────────────────────────────────────

  roomIdDisplay.textContent = roomId;
  document.title = `Scrum Poker — ${roomId}`;

  const joinLink = `${window.location.origin}/?room=${roomId}`;
  roomLinkUrl.textContent = joinLink;

  // ── Socket.IO ───────────────────────────────────────────────────────

  const socket = io();

  socket.on("connect", () => {
    connectionStatus.textContent = "connected";
    footerStatus.textContent = "connected";
    socket.emit("join-room", { roomId, name });
  });

  socket.on("disconnect", () => {
    connectionStatus.textContent = "disconnected";
    footerStatus.textContent = "disconnected";
  });

  socket.on("joined", (data) => {
    isCreator = data.isCreator;
    updateUI(data.state);
    setupCreatorUI();
  });

  socket.on("room-update", (state) => {
    updateUI(state);
  });

  socket.on("error-msg", (data) => {
    showToast(data.message);
  });

  socket.on("kicked", () => {
    showToast("You have been removed from the room");
    setTimeout(() => (window.location.href = "/"), 2000);
  });

  socket.on("timer-sync", ({ remaining, duration }) => {
    timerRemaining = remaining;
    updateTimerDisplay(remaining);
    if (remaining === 0) {
      showToast("Time's up!");
    }
  });

  // ── UI Updates ──────────────────────────────────────────────────────

  function updateUI(state) {
    // Topic
    if (state.topic) {
      topicDisplay.textContent = state.topic;
      topicDisplay.classList.remove("term-dim");
    } else {
      topicDisplay.textContent = "No topic set";
      topicDisplay.classList.add("term-dim");
    }
    if (isCreator && topicInput.style.display !== "none") {
      // Keep input visible while editing
    }

    // Voting scheme
    currentScheme = state.votingScheme || "fibonacci";
    updateSchemeButtons();

    // Vote cards
    renderVoteCards(state);

    // Participants
    renderParticipants(state);

    // Stats
    renderStats(state);

    // Creator controls
    if (isCreator) {
      creatorControls.style.display = "flex";
      btnReveal.disabled = state.revealed;
      btnClear.disabled = !state.revealed;

      if (state.revealed) {
        btnReveal.textContent = "[*] Revealed";
        btnClear.textContent = "[x] Clear / Next";
      } else {
        const votedCount = state.participants.filter((p) => p.hasVoted).length;
        const total = state.participants.length;
        btnReveal.textContent = `[*] Reveal (${votedCount}/${total})`;
        btnClear.textContent = "[x] Clear / Next";
      }
    }

    // History
    renderHistory(state.history);

    // Timer (sync from room state on initial load)
    if (state.timerRemaining !== undefined) {
      updateTimerDisplay(state.timerRemaining);
    }

    // Footer info
    const online = state.participants.filter((p) => p.isOnline).length;
    footerInfo.textContent = `${online} online | room: ${state.id}`;
  }

  function renderVoteCards(state) {
    const values = SCHEMES[currentScheme] || SCHEMES.fibonacci;
    voteCards.innerHTML = "";

    values.forEach((val) => {
      const card = document.createElement("button");
      card.className = "vote-card";
      card.textContent = val;

      if (state.revealed) {
        card.classList.add("revealed-card");
        if (currentVote === val) card.classList.add("selected");
      } else {
        if (currentVote === val) card.classList.add("selected");
        card.addEventListener("click", () => {
          if (currentVote === val) {
            // Deselect
            currentVote = null;
            socket.emit("vote", { value: null });
          } else {
            currentVote = val;
            socket.emit("vote", { value: val });
          }
          renderVoteCards(state);
        });
      }

      voteCards.appendChild(card);
    });

    // Update heading
    const heading = voteSection.querySelector(".term-heading");
    if (state.revealed) {
      heading.innerHTML = '<span class="term-dim">&gt;</span> Votes revealed';
    } else if (currentVote) {
      heading.innerHTML = `<span class="term-dim">&gt;</span> You voted: <span class="term-bright">${currentVote}</span>`;
    } else {
      heading.innerHTML = '<span class="term-dim">&gt;</span> Cast your vote';
    }
  }

  function renderParticipants(state) {
    participantTbody.innerHTML = "";
    participantCount.textContent = `(${state.participants.length})`;

    state.participants.forEach((p) => {
      const tr = document.createElement("tr");
      if (p.name === name) tr.classList.add("is-self");
      if (!p.isOnline) tr.classList.add("is-offline");

      // Name cell
      const tdName = document.createElement("td");
      let nameHtml = escapeHtml(p.name);
      if (p.isCreator) nameHtml += ' <span class="creator-badge">[host]</span>';
      if (!p.isOnline) nameHtml += ' <span class="offline-badge">[offline]</span>';
      tdName.innerHTML = nameHtml;
      tr.appendChild(tdName);

      // Status cell
      const tdStatus = document.createElement("td");
      if (state.revealed) {
        tdStatus.innerHTML = '<span class="vote-status-revealed">revealed</span>';
      } else if (p.hasVoted) {
        tdStatus.innerHTML = '<span class="vote-status-voted">voted</span>';
      } else {
        tdStatus.innerHTML = '<span class="vote-status-pending">waiting...</span>';
      }
      tr.appendChild(tdStatus);

      // Vote cell
      const tdVote = document.createElement("td");
      if (state.revealed && p.vote !== null) {
        tdVote.innerHTML = `<span class="term-bright">${escapeHtml(String(p.vote))}</span>`;
      } else if (p.hasVoted) {
        tdVote.innerHTML = '<span class="term-dim">***</span>';
      } else {
        tdVote.textContent = "-";
      }
      tr.appendChild(tdVote);

      // Actions cell
      const tdAction = document.createElement("td");
      if (isCreator && p.name !== name && p.isOnline) {
        const kickBtn = document.createElement("span");
        kickBtn.className = "participant-action";
        kickBtn.textContent = "[kick]";
        kickBtn.addEventListener("click", () => {
          if (confirm(`Remove ${p.name} from the room?`)) {
            socket.emit("kick", { participantId: p.id });
          }
        });
        tdAction.appendChild(kickBtn);
      }
      tr.appendChild(tdAction);

      participantTbody.appendChild(tr);
    });
  }

  function renderStats(state) {
    if (!state.revealed || !state.stats) {
      statsPanel.style.display = "none";
      return;
    }

    statsPanel.style.display = "block";
    const s = state.stats;

    $("stat-average").textContent = s.average;
    $("stat-median").textContent = s.median;
    $("stat-range").textContent = `${s.min} – ${s.max}`;
    $("stat-voted").textContent = `${s.totalVotes} / ${s.totalParticipants}`;

    if (s.consensus) {
      $("stat-consensus").innerHTML = '<span class="consensus-yes">YES</span>';
    } else {
      $("stat-consensus").innerHTML = '<span class="consensus-no">NO</span>';
    }

    // Vote distribution
    renderDistribution(state);
  }

  function renderDistribution(state) {
    const dist = $("vote-distribution");
    dist.innerHTML = "";

    if (!state.revealed) return;

    const voteCounts = {};
    let maxCount = 0;
    state.participants.forEach((p) => {
      if (p.vote !== null) {
        const v = String(p.vote);
        voteCounts[v] = (voteCounts[v] || 0) + 1;
        if (voteCounts[v] > maxCount) maxCount = voteCounts[v];
      }
    });

    // Sort by vote value
    const sortedVotes = Object.keys(voteCounts).sort((a, b) => {
      const na = parseFloat(a);
      const nb = parseFloat(b);
      if (isNaN(na) && isNaN(nb)) return a.localeCompare(b);
      if (isNaN(na)) return 1;
      if (isNaN(nb)) return -1;
      return na - nb;
    });

    sortedVotes.forEach((vote) => {
      const count = voteCounts[vote];
      const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;

      const row = document.createElement("div");
      row.className = "dist-row";
      row.innerHTML = `
        <span class="dist-label">${escapeHtml(vote)}</span>
        <div class="dist-bar"><div class="dist-fill" style="width: ${pct}%"></div></div>
        <span class="dist-count">${count}x</span>
      `;
      dist.appendChild(row);
    });
  }

  function renderHistory(history) {
    if (!history || history.length === 0) {
      historyList.innerHTML = '<div class="empty-state">No rounds yet</div>';
      return;
    }

    historyList.innerHTML = "";
    history.slice(0, 10).forEach((h) => {
      const div = document.createElement("div");
      div.className = "history-item";

      const votesStr = h.votes.map((v) => `${v.name}:${v.vote}`).join(" ");

      div.innerHTML = `
        <div class="history-topic">${escapeHtml(h.topic)}</div>
        <div class="history-stats">avg: ${h.stats.average} | med: ${h.stats.median} | ${h.stats.consensus ? "consensus" : "no consensus"}</div>
        <div class="history-votes">${escapeHtml(votesStr)}</div>
      `;
      historyList.appendChild(div);
    });
  }

  // ── Creator-only UI ─────────────────────────────────────────────────

  function setupCreatorUI() {
    const timerButtons = document.querySelectorAll("#btn-timer-1, #btn-timer-2, #btn-timer-3, #btn-timer-5, #btn-timer-stop");

    if (isCreator) {
      roomLinkBox.style.display = "flex";
      topicInput.style.display = "block";
      topicDisplay.style.display = "none";
      creatorControls.style.display = "flex";

      // Enable scheme switching
      schemeSelector.querySelectorAll(".scheme-btn").forEach((btn) => {
        btn.style.cursor = "pointer";
      });

      // Enable timer buttons
      timerButtons.forEach((btn) => {
        btn.disabled = false;
        btn.style.opacity = "1";
      });
    } else {
      roomLinkBox.style.display = "flex"; // Everyone can see the link
      topicInput.style.display = "none";
      topicDisplay.style.display = "block";
      creatorControls.style.display = "none";

      // Disable scheme switching for non-creators
      schemeSelector.querySelectorAll(".scheme-btn").forEach((btn) => {
        btn.style.cursor = "default";
        btn.style.opacity = "0.5";
      });

      // Disable timer buttons for non-hosts
      timerButtons.forEach((btn) => {
        btn.disabled = true;
        btn.style.opacity = "0.4";
      });
    }
  }

  // ── Event Listeners ─────────────────────────────────────────────────

  // Copy link
  btnCopyLink.addEventListener("click", () => {
    navigator.clipboard.writeText(joinLink).then(() => {
      showToast("Link copied to clipboard");
      btnCopyLink.textContent = "[ok]";
      setTimeout(() => (btnCopyLink.textContent = "[copy]"), 2000);
    });
  });

  // Topic input
  let topicDebounce = null;
  topicInput.addEventListener("input", () => {
    clearTimeout(topicDebounce);
    topicDebounce = setTimeout(() => {
      socket.emit("set-topic", { topic: topicInput.value.trim() });
    }, 500);
  });

  // Reveal / Clear
  btnReveal.addEventListener("click", () => {
    socket.emit("reveal");
  });

  btnClear.addEventListener("click", () => {
    socket.emit("clear");
    currentVote = null;
    topicInput.value = "";
  });

  // Scheme selector
  schemeSelector.addEventListener("click", (e) => {
    const btn = e.target.closest(".scheme-btn");
    if (!btn || !isCreator) return;
    const scheme = btn.dataset.scheme;
    socket.emit("set-scheme", { scheme });
    currentVote = null;
  });

  function updateSchemeButtons() {
    schemeSelector.querySelectorAll(".scheme-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.scheme === currentScheme);
    });
  }

  // ── Timer (server-synced) ───────────────────────────────────────────

  function updateTimerDisplay(remaining) {
    if (remaining === null || remaining === undefined) {
      timerDisplay.textContent = "--:--";
      timerDisplay.classList.remove("timer-warning");
      return;
    }

    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    timerDisplay.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

    if (remaining <= 30 && remaining > 0) {
      timerDisplay.classList.add("timer-warning");
    } else {
      timerDisplay.classList.remove("timer-warning");
    }
  }

  $("btn-timer-1").addEventListener("click", () => socket.emit("start-timer", { seconds: 60 }));
  $("btn-timer-2").addEventListener("click", () => socket.emit("start-timer", { seconds: 120 }));
  $("btn-timer-3").addEventListener("click", () => socket.emit("start-timer", { seconds: 180 }));
  $("btn-timer-5").addEventListener("click", () => socket.emit("start-timer", { seconds: 300 }));
  $("btn-timer-stop").addEventListener("click", () => socket.emit("stop-timer"));

  // ── Toast ───────────────────────────────────────────────────────────

  let toastTimeout = null;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove("show"), 3000);
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
})();
