const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// ── In-memory room store ──────────────────────────────────────────────

const rooms = new Map();

function createRoom(creatorName) {
  const id = uuidv4().slice(0, 8);
  const room = {
    id,
    creatorId: null,
    topic: "",
    revealed: false,
    participants: new Map(),
    history: [],
    votingScheme: "fibonacci",
    timerEndsAt: null,
    timerDuration: 0,
    timerIntervalRef: null,
    createdAt: Date.now(),
  };
  rooms.set(id, room);
  return room;
}

function getRoomState(room) {
  const participants = [];
  for (const [socketId, p] of room.participants) {
    participants.push({
      id: socketId,
      name: p.name,
      hasVoted: p.vote !== null,
      vote: room.revealed ? p.vote : null,
      isCreator: socketId === room.creatorId,
      isOnline: p.isOnline,
    });
  }

  let stats = null;
  if (room.revealed) {
    const numericVotes = participants
      .filter((p) => p.vote !== null && p.vote !== "?" && p.vote !== "pass")
      .map((p) => parseFloat(p.vote));

    if (numericVotes.length > 0) {
      const sum = numericVotes.reduce((a, b) => a + b, 0);
      const avg = sum / numericVotes.length;
      const sorted = [...numericVotes].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median =
        sorted.length % 2 !== 0
          ? sorted[mid]
          : (sorted[mid - 1] + sorted[mid]) / 2;
      const allSame = numericVotes.every((v) => v === numericVotes[0]);

      stats = {
        average: Math.round(avg * 10) / 10,
        median,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        consensus: allSame,
        totalVotes: participants.filter((p) => p.vote !== null).length,
        totalParticipants: participants.length,
      };
    }
  }

  let timerRemaining = null;
  if (room.timerEndsAt) {
    timerRemaining = Math.max(0, Math.ceil((room.timerEndsAt - Date.now()) / 1000));
    if (timerRemaining === 0) timerRemaining = null;
  }

  return {
    id: room.id,
    topic: room.topic,
    revealed: room.revealed,
    participants,
    stats,
    history: room.history,
    votingScheme: room.votingScheme,
    timerRemaining,
    timerDuration: room.timerDuration,
  };
}

// ── REST endpoints ────────────────────────────────────────────────────

app.post("/api/rooms", (req, res) => {
  const room = createRoom();
  res.json({ roomId: room.id });
});

app.get("/api/rooms/:id", (req, res) => {
  const room = rooms.get(req.params.id);
  if (!room) return res.status(404).json({ error: "Room not found" });
  res.json({ exists: true, participantCount: room.participants.size });
});

// ── Socket.IO ─────────────────────────────────────────────────────────

io.on("connection", (socket) => {
  let currentRoomId = null;

  socket.on("join-room", ({ roomId, name }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit("error-msg", { message: "Room not found" });
      return;
    }

    currentRoomId = roomId;
    socket.join(roomId);

    // Check if this person was previously in the room (reconnect)
    let existingEntry = null;
    for (const [sid, p] of room.participants) {
      if (p.name === name && !p.isOnline) {
        existingEntry = sid;
        break;
      }
    }

    if (existingEntry) {
      const prev = room.participants.get(existingEntry);
      room.participants.delete(existingEntry);
      prev.isOnline = true;
      room.participants.set(socket.id, prev);
      if (room.creatorId === existingEntry) {
        room.creatorId = socket.id;
      }
    } else {
      // First person to join becomes the creator
      if (room.creatorId === null) {
        room.creatorId = socket.id;
      }
      room.participants.set(socket.id, {
        name,
        vote: null,
        isOnline: true,
      });
    }

    socket.emit("joined", {
      isCreator: socket.id === room.creatorId,
      state: getRoomState(room),
    });
    socket.to(roomId).emit("room-update", getRoomState(room));
  });

  socket.on("vote", ({ value }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.revealed) return;

    const participant = room.participants.get(socket.id);
    if (!participant) return;

    participant.vote = value;
    io.to(currentRoomId).emit("room-update", getRoomState(room));
  });

  socket.on("reveal", () => {
    const room = rooms.get(currentRoomId);
    if (!room || socket.id !== room.creatorId) return;

    room.revealed = true;
    io.to(currentRoomId).emit("room-update", getRoomState(room));
  });

  socket.on("clear", () => {
    const room = rooms.get(currentRoomId);
    if (!room || socket.id !== room.creatorId) return;

    // Save to history if there were votes and they were revealed
    if (room.revealed) {
      const state = getRoomState(room);
      if (state.stats) {
        room.history.unshift({
          topic: room.topic || "(no topic)",
          stats: state.stats,
          votes: state.participants
            .filter((p) => p.vote !== null)
            .map((p) => ({ name: p.name, vote: p.vote })),
          timestamp: Date.now(),
        });
        // Keep last 50 rounds
        if (room.history.length > 50) room.history.pop();
      }
    }

    room.revealed = false;
    for (const [, p] of room.participants) {
      p.vote = null;
    }
    io.to(currentRoomId).emit("room-update", getRoomState(room));
  });

  socket.on("set-topic", ({ topic }) => {
    const room = rooms.get(currentRoomId);
    if (!room || socket.id !== room.creatorId) return;

    room.topic = topic;
    io.to(currentRoomId).emit("room-update", getRoomState(room));
  });

  socket.on("set-scheme", ({ scheme }) => {
    const room = rooms.get(currentRoomId);
    if (!room || socket.id !== room.creatorId) return;

    room.votingScheme = scheme;
    io.to(currentRoomId).emit("room-update", getRoomState(room));
  });

  socket.on("kick", ({ participantId }) => {
    const room = rooms.get(currentRoomId);
    if (!room || socket.id !== room.creatorId) return;
    if (participantId === room.creatorId) return;

    room.participants.delete(participantId);
    const kickedSocket = io.sockets.sockets.get(participantId);
    if (kickedSocket) {
      kickedSocket.emit("kicked");
      kickedSocket.leave(currentRoomId);
    }
    io.to(currentRoomId).emit("room-update", getRoomState(room));
  });

  socket.on("transfer-host", ({ participantId }) => {
    const room = rooms.get(currentRoomId);
    if (!room || socket.id !== room.creatorId) return;
    if (!room.participants.has(participantId)) return;

    room.creatorId = participantId;
    io.to(currentRoomId).emit("room-update", getRoomState(room));
    // Notify new and old host
    socket.emit("joined", {
      isCreator: false,
      state: getRoomState(room),
    });
    const newHostSocket = io.sockets.sockets.get(participantId);
    if (newHostSocket) {
      newHostSocket.emit("joined", {
        isCreator: true,
        state: getRoomState(room),
      });
    }
  });

  socket.on("start-timer", ({ seconds }) => {
    const room = rooms.get(currentRoomId);
    if (!room || socket.id !== room.creatorId) return;

    // Clear any existing timer
    if (room.timerIntervalRef) clearInterval(room.timerIntervalRef);

    room.timerDuration = seconds;
    room.timerEndsAt = Date.now() + seconds * 1000;
    io.to(currentRoomId).emit("timer-sync", {
      remaining: seconds,
      duration: seconds,
    });

    // Tick every second so all clients stay in sync
    room.timerIntervalRef = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((room.timerEndsAt - Date.now()) / 1000));
      io.to(currentRoomId).emit("timer-sync", {
        remaining,
        duration: room.timerDuration,
      });
      if (remaining <= 0) {
        clearInterval(room.timerIntervalRef);
        room.timerIntervalRef = null;
        room.timerEndsAt = null;
        room.timerDuration = 0;
      }
    }, 1000);
  });

  socket.on("stop-timer", () => {
    const room = rooms.get(currentRoomId);
    if (!room || socket.id !== room.creatorId) return;

    if (room.timerIntervalRef) clearInterval(room.timerIntervalRef);
    room.timerIntervalRef = null;
    room.timerEndsAt = null;
    room.timerDuration = 0;
    io.to(currentRoomId).emit("timer-sync", { remaining: null, duration: 0 });
  });

  socket.on("disconnect", () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const participant = room.participants.get(socket.id);
    if (participant) {
      participant.isOnline = false;
      // Remove after 5 minutes of being offline
      setTimeout(() => {
        const r = rooms.get(currentRoomId);
        if (!r) return;
        const p = r.participants.get(socket.id);
        if (p && !p.isOnline) {
          r.participants.delete(socket.id);
          if (r.participants.size === 0) {
            rooms.delete(currentRoomId);
          } else {
            // Transfer creator if they left
            if (r.creatorId === socket.id) {
              for (const [sid, pp] of r.participants) {
                if (pp.isOnline) {
                  r.creatorId = sid;
                  const newHost = io.sockets.sockets.get(sid);
                  if (newHost) {
                    newHost.emit("joined", {
                      isCreator: true,
                      state: getRoomState(r),
                    });
                  }
                  break;
                }
              }
            }
            io.to(currentRoomId).emit("room-update", getRoomState(r));
          }
        }
      }, 5 * 60 * 1000);
    }

    io.to(currentRoomId).emit("room-update", getRoomState(room));
  });
});

// ── Cleanup stale rooms every 30 minutes ──────────────────────────────

setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    const allOffline = [...room.participants.values()].every(
      (p) => !p.isOnline
    );
    if (allOffline && now - room.createdAt > 30 * 60 * 1000) {
      rooms.delete(id);
    }
  }
}, 30 * 60 * 1000);

// ── Start ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[scrumpoker] listening on http://localhost:${PORT}`);
});
