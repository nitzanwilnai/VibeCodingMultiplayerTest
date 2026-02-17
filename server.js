const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files from /public
app.use(express.static(path.join(__dirname, "public")));

// ── Game State ──────────────────────────────────────────────
const players = new Map(); // id -> { x, y, color, name }
let nextId = 1;

const COLORS = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
  "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F",
  "#BB8FCE", "#85C1E9", "#F0B27A", "#82E0AA",
];

function broadcast(data, excludeWs) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

function broadcastAll(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// ── WebSocket Handling ──────────────────────────────────────
wss.on("connection", (ws) => {
  const id = nextId++;
  const color = COLORS[(id - 1) % COLORS.length];
  const player = {
    x: 200 + Math.random() * 400,
    y: 200 + Math.random() * 200,
    color,
    name: `Player ${id}`,
  };

  players.set(id, player);

  // Send this player their id + all existing players
  ws.send(JSON.stringify({
    type: "init",
    id,
    players: Object.fromEntries(players),
  }));

  // Tell everyone else about the new player
  broadcast({ type: "player_joined", id, player }, ws);

  console.log(`Player ${id} connected (${wss.clients.size} online)`);

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw);

      if (msg.type === "move") {
        const p = players.get(id);
        if (p) {
          p.x = msg.x;
          p.y = msg.y;
          broadcast({ type: "player_moved", id, x: msg.x, y: msg.y }, ws);
        }
      }

      if (msg.type === "set_name") {
        const p = players.get(id);
        if (p) {
          p.name = msg.name.slice(0, 20);
          broadcastAll({ type: "player_renamed", id, name: p.name });
        }
      }
    } catch (e) {
      // ignore bad messages
    }
  });

  ws.on("close", () => {
    players.delete(id);
    broadcastAll({ type: "player_left", id });
    console.log(`Player ${id} disconnected (${wss.clients.size} online)`);
  });
});

// ── Start Server ────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
