const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, "public")));

// ── Game State ──────────────────────────────────────────────
const players = new Map();
let nextId = 1;

const COLORS = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
  "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F",
  "#BB8FCE", "#85C1E9", "#F0B27A", "#82E0AA",
];

const ROOM_SIZE = 800;

const SPAWNS = [
  { x: 100, y: 700 },
  { x: 700, y: 700 },
  { x: 100, y: 100 },
  { x: 700, y: 100 },
  { x: 400, y: 100 },
  { x: 400, y: 700 },
  { x: 100, y: 400 },
  { x: 700, y: 400 },
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

wss.on("connection", (ws) => {
  const id = nextId++;
  const color = COLORS[(id - 1) % COLORS.length];
  const spawn = SPAWNS[(id - 1) % SPAWNS.length];
  const player = { x: spawn.x, y: spawn.y, angle: 0, color, name: `Player ${id}` };

  players.set(id, player);

  ws.send(JSON.stringify({ type: "init", id, players: Object.fromEntries(players) }));
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
          p.angle = msg.angle;
          broadcast({ type: "player_moved", id, x: msg.x, y: msg.y, angle: msg.angle }, ws);
        }
      }
      if (msg.type === "set_name") {
        const p = players.get(id);
        if (p) {
          p.name = msg.name.slice(0, 20);
          broadcastAll({ type: "player_renamed", id, name: p.name });
        }
      }
    } catch (e) {}
  });

  ws.on("close", () => {
    players.delete(id);
    broadcastAll({ type: "player_left", id });
    console.log(`Player ${id} disconnected (${wss.clients.size} online)`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
