const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, "public")));

// ── Constants ───────────────────────────────────────────────
const ROOM_SIZE = 800;
const WALL_THICKNESS = 16;
const STONE_SIZE = 32;
const PLAYER_RADIUS = 10;
const DOOR = { x: 400, y: 8, width: 60, height: 16 };

const COLORS = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
  "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F",
  "#BB8FCE", "#85C1E9", "#F0B27A", "#82E0AA",
];

// Fixed column positions (same every room for structural feel)
const COLUMNS = [
  { x: 250, y: 250, r: 28 },
  { x: 550, y: 250, r: 28 },
  { x: 250, y: 550, r: 28 },
  { x: 550, y: 550, r: 28 },
];

const PEDESTAL = { x: 400, y: 400, size: 36 };

// ── Room Generation ─────────────────────────────────────────
function generateStones() {
  // Place 5 stones at random positions, avoiding columns/pedestal/walls/door
  const stones = [];
  const margin = WALL_THICKNESS + STONE_SIZE;
  const minDist = STONE_SIZE * 2.5; // min distance between stones

  // Generate shuffled display numbers 1-5
  // The stones array index IS the correct step order
  // But the number displayed on each stone is randomized
  const displayNums = [1, 2, 3, 4, 5];
  // Shuffle display numbers
  for (let i = displayNums.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [displayNums[i], displayNums[j]] = [displayNums[j], displayNums[i]];
  }

  for (let i = 0; i < 5; i++) {
    let attempts = 0;
    while (attempts < 200) {
      const x = margin + Math.random() * (ROOM_SIZE - margin * 2);
      const y = margin + 80 + Math.random() * (ROOM_SIZE - margin * 2 - 80);
      // y offset of 80 keeps stones away from the door area

      // Check distance from columns
      let tooClose = false;
      for (const col of COLUMNS) {
        const dx = x - col.x, dy = y - col.y;
        if (Math.sqrt(dx*dx + dy*dy) < col.r + STONE_SIZE) { tooClose = true; break; }
      }

      // Check distance from pedestal
      const ped = PEDESTAL;
      if (Math.abs(x - ped.x) < ped.size/2 + STONE_SIZE &&
          Math.abs(y - ped.y) < ped.size/2 + STONE_SIZE) tooClose = true;

      // Check distance from other stones
      for (const s of stones) {
        const dx = x - s.x, dy = y - s.y;
        if (Math.sqrt(dx*dx + dy*dy) < minDist) { tooClose = true; break; }
      }

      // Check distance from door
      if (y < WALL_THICKNESS + 60 && Math.abs(x - DOOR.x) < DOOR.width) tooClose = true;

      if (!tooClose) {
        stones.push({ x: Math.round(x), y: Math.round(y), displayNum: displayNums[i], stepOrder: i + 1 });
        break;
      }
      attempts++;
    }

    // Fallback if placement fails
    if (stones.length <= i) {
      stones.push({ x: 150 + i * 120, y: 600, displayNum: displayNums[i], stepOrder: i + 1 });
    }
  }

  return stones;
}

function createRoom() {
  return {
    stones: generateStones(),
    progress: 0,
    doorOpen: false,
    roomNumber: currentRoomNumber,
  };
}

// ── Game State ──────────────────────────────────────────────
const players = new Map();
let nextId = 1;
let currentRoomNumber = 1;
let room = createRoom();

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

function resetPuzzle() {
  room.progress = 0;
  room.doorOpen = false;
  broadcastAll({ type: "puzzle_update", progress: 0, doorOpen: false, reset: true });
}

function advanceRoom() {
  currentRoomNumber++;
  room = createRoom();

  // Teleport all players to the bottom of the new room (entering from south)
  for (const [id, p] of players) {
    p.x = 350 + Math.random() * 100;
    p.y = ROOM_SIZE - 100;
  }

  // Send new room to all clients
  broadcastAll({
    type: "new_room",
    room: {
      stones: room.stones,
      progress: room.progress,
      doorOpen: room.doorOpen,
      roomNumber: room.roomNumber,
    },
    // Send updated player positions
    players: Object.fromEntries(players),
  });

  console.log(`Advanced to Room ${currentRoomNumber}`);
}

function checkStoneStep(px, py) {
  if (room.doorOpen) return;

  for (const stone of room.stones) {
    const dx = px - stone.x;
    const dy = py - stone.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const stepRadius = STONE_SIZE / 2 + PLAYER_RADIUS;

    if (dist < stepRadius) {
      const expectedStep = room.progress + 1;

      if (stone.stepOrder === expectedStep) {
        // Correct stone!
        room.progress++;
        if (room.progress >= 5) {
          room.doorOpen = true;
        }
        broadcastAll({ type: "puzzle_update", progress: room.progress, doorOpen: room.doorOpen, reset: false });
      } else if (stone.stepOrder > expectedStep) {
        // Wrong stone (skipped ahead or wrong order)
        resetPuzzle();
      }
      // If stone.stepOrder <= room.progress, player is re-stepping an already activated stone — ignore
      return;
    }
  }
}

function checkDoorExit(px, py) {
  if (!room.doorOpen) return false;
  const dLeft = DOOR.x - DOOR.width / 2;
  const dRight = DOOR.x + DOOR.width / 2;
  // Trigger when player walks into the door area (y within the wall thickness)
  if (py < WALL_THICKNESS + PLAYER_RADIUS + 2 && px > dLeft && px < dRight) {
    return true;
  }
  return false;
}

// ── WebSocket Handling ──────────────────────────────────────
wss.on("connection", (ws) => {
  const id = nextId++;
  const color = COLORS[(id - 1) % COLORS.length];
  const player = {
    x: 350 + Math.random() * 100,
    y: ROOM_SIZE - 100,
    angle: 0, color, name: `Player ${id}`,
  };

  players.set(id, player);

  ws.send(JSON.stringify({
    type: "init",
    id,
    players: Object.fromEntries(players),
    room: {
      stones: room.stones,
      progress: room.progress,
      doorOpen: room.doorOpen,
      roomNumber: room.roomNumber,
    },
  }));

  broadcast({ type: "player_joined", id, player }, ws);
  console.log(`Player ${id} connected (${wss.clients.size} online) — Room ${currentRoomNumber}`);

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
          checkStoneStep(msg.x, msg.y);
          if (checkDoorExit(msg.x, msg.y)) {
            advanceRoom();
          }
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
