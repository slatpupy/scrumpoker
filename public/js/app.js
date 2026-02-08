// ── Landing Page Logic ────────────────────────────────────────────────

(function () {
  const nameInput = document.getElementById("input-name");
  const roomIdInput = document.getElementById("input-room-id");
  const joinRoomGroup = document.getElementById("join-room-group");
  const btnCreate = document.getElementById("btn-create");
  const btnJoin = document.getElementById("btn-join");
  const errorMsg = document.getElementById("error-msg");

  // Check URL for room id (e.g. /?room=abc123)
  const params = new URLSearchParams(window.location.search);
  const roomFromUrl = params.get("room");

  if (roomFromUrl) {
    joinRoomGroup.style.display = "block";
    roomIdInput.value = roomFromUrl;
    btnJoin.textContent = "[>] Join Room";
    btnCreate.style.display = "none";
  }

  // Restore name from localStorage
  const savedName = localStorage.getItem("scrumpoker-name");
  if (savedName) nameInput.value = savedName;

  let joinMode = !!roomFromUrl;

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.style.display = "block";
    setTimeout(() => (errorMsg.style.display = "none"), 4000);
  }

  function getName() {
    const name = nameInput.value.trim();
    if (!name) {
      showError("Please enter your name");
      nameInput.focus();
      return null;
    }
    localStorage.setItem("scrumpoker-name", name);
    return name;
  }

  btnCreate.addEventListener("click", async () => {
    if (joinMode) {
      // Toggle back to create mode
      joinMode = false;
      joinRoomGroup.style.display = "none";
      btnCreate.textContent = "[+] Create Room";
      btnJoin.textContent = "[>] Join Room";
      return;
    }

    const name = getName();
    if (!name) return;

    btnCreate.disabled = true;
    btnCreate.textContent = "creating...";

    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      window.location.href = `/room.html?room=${data.roomId}&name=${encodeURIComponent(name)}`;
    } catch (err) {
      showError("Failed to create room");
      btnCreate.disabled = false;
      btnCreate.textContent = "[+] Create Room";
    }
  });

  btnJoin.addEventListener("click", async () => {
    if (!joinMode) {
      // Toggle to join mode
      joinMode = true;
      joinRoomGroup.style.display = "block";
      btnCreate.textContent = "[<] Back";
      btnJoin.textContent = "[>] Join Room";
      roomIdInput.focus();
      return;
    }

    const name = getName();
    if (!name) return;

    const roomId = roomIdInput.value.trim();
    if (!roomId) {
      showError("Please enter a room ID");
      roomIdInput.focus();
      return;
    }

    btnJoin.disabled = true;
    btnJoin.textContent = "joining...";

    try {
      const res = await fetch(`/api/rooms/${roomId}`);
      if (!res.ok) {
        showError("Room not found");
        btnJoin.disabled = false;
        btnJoin.textContent = "[>] Join Room";
        return;
      }
      window.location.href = `/room.html?room=${roomId}&name=${encodeURIComponent(name)}`;
    } catch (err) {
      showError("Failed to join room");
      btnJoin.disabled = false;
      btnJoin.textContent = "[>] Join Room";
    }
  });

  // Enter key submits
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      if (joinMode) btnJoin.click();
      else btnCreate.click();
    }
  });

  roomIdInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") btnJoin.click();
  });
})();
