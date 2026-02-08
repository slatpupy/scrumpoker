# Scrum Poker

Real-time planning poker for agile teams, built with Node.js and Socket.IO.

Terminal-style UI — green-on-black, monospace, no frills.

```
 ___                        ___      _
/ __| __ _ _ _  _ _ __     | _ \___ | |__ ___  _ _
\__ \/ _| '_| || | '  \    |  _/ _ \| / // -_)| '_|
|___/\__|_|  \_,_|_|_|_|   |_| \___/|_\_\\___||_|
```

## Features

### Room Management
- **Create a room** — generates a short 8-character room ID
- **Shareable join link** — send the URL to your team, they enter their name and join
- **Host controls** — the room creator can reveal votes, clear rounds, set topics, manage the timer, switch voting schemes, and kick participants
- **Auto host transfer** — if the host disconnects, another online participant is promoted
- **Reconnection support** — rejoin with the same name to recover your previous vote and role

### Voting
- **Hidden votes** — participants see who has voted (yellow "voted" badge) but values stay hidden until the host reveals
- **Toggle vote** — click your choice again to deselect
- **Multiple voting schemes:**
  - **Fibonacci** — 0, 1, 2, 3, 5, 8, 13, 21, 34, ?, pass
  - **T-Shirt** — XS, S, M, L, XL, XXL, ?, pass
  - **Powers of 2** — 0, 1, 2, 4, 8, 16, 32, 64, ?, pass
  - **Sequential** — 1 through 10, ?, pass
- **Special values** — `?` for uncertainty, `pass` to abstain

### Statistics (shown after reveal)
- **Average** and **Median** of numeric votes
- **Range** (min – max)
- **Consensus detection** — highlights when all voters agree
- **Vote distribution** — horizontal bar chart showing how votes spread
- **Voter count** — how many voted out of total participants

### Timer
- **Host-controlled** — only the room creator can start/stop
- **Server-synced** — all participants see the same countdown in real time
- **Presets** — 1, 2, 3, or 5 minute timers
- **Visual warning** — turns red in the last 30 seconds
- **Toast notification** — "Time's up!" when the timer expires

### History
- **Round history** — the last 10 completed rounds are saved in the sidebar
- **Per-round details** — topic, average, median, consensus status, and individual votes
- **Automatic archiving** — rounds are saved when the host clears after a reveal

### Other
- **Name persistence** — your display name is saved to localStorage
- **Participant list** — shows online/offline status, host badge, vote status
- **Kick participants** — host can remove people from the room
- **Auto-cleanup** — stale rooms are removed after 30 minutes of inactivity
- **Offline grace period** — disconnected participants are kept for 5 minutes to allow reconnection

## Quick Start

```bash
# Clone
git clone https://github.com/slatpupy/scrumpoker.git
cd scrumpoker

# Install
npm install

# Configure (optional)
cp .env.example .env
# Edit .env to change PORT (default: 3000)

# Run
npm start
```

Open `http://localhost:3100` (or whatever port you configured).

## Configuration

Create a `.env` file in the project root:

```env
PORT=3100
```

The server defaults to port `3000` if no `.env` file is present.

## Running with pm2

```bash
# Start
pm2 start server.js --name scrumpoker --node-args="--env-file=.env"

# View logs
pm2 logs scrumpoker

# Restart after changes
pm2 restart scrumpoker

# Stop
pm2 stop scrumpoker
```

## npm Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the server (reads `.env`) |
| `npm run dev` | Start with `--watch` for auto-reload during development |

## Tech Stack

- **Server:** Node.js, Express, Socket.IO
- **Client:** Vanilla HTML/CSS/JS (no build step, no framework)
- **Real-time:** WebSocket via Socket.IO
- **Styling:** Custom CSS with kiui terminal theme (Roboto Mono, `#0a0a0a` bg, `#00ff41` green)

## Project Structure

```
scrumpoker/
  .env                  # Port configuration
  server.js             # Express + Socket.IO server
  package.json
  public/
    index.html          # Landing page (create/join room)
    room.html           # Room page (voting UI)
    css/
      terminal.css      # kiui terminal theme
    js/
      app.js            # Landing page logic
      room.js           # Room client logic (Socket.IO)
```

## How It Works

1. **Create a room** — host enters their name and clicks "Create Room"
2. **Share the link** — copy the join URL and send it to your team
3. **Set a topic** — host types the story or ticket being estimated
4. **Vote** — everyone picks a card; the UI shows who has voted but not what
5. **Reveal** — host clicks reveal to show all votes and statistics
6. **Discuss** — review the distribution, average, and whether there's consensus
7. **Next round** — host clicks clear to reset votes and move to the next story

## License

MIT
