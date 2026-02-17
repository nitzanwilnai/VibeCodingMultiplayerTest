# Multiplayer Circles

A simple real-time multiplayer game where players move colored circles around a shared canvas.

## How It Works

- **Server**: Node.js + Express + `ws` (WebSocket library)
- **Client**: Plain HTML5 Canvas (no build step needed)
- Players connect, get assigned a color, and move with WASD or Arrow Keys
- Positions sync in real-time via WebSocket messages

## Run Locally

```bash
npm install
npm start
```

Open `http://localhost:3000` in multiple browser tabs to test.

## Deploy to Railway

1. Push this folder to a **GitHub repo**
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub Repo**
3. Select your repo. Railway auto-detects Node.js.
4. It will run `npm install` then `npm start` automatically.
5. Go to **Settings** → **Networking** → **Generate Domain** to get a public URL.
6. Share the URL with your friends!

**No extra config needed** — the `PORT` env var is set automatically by Railway.

## Deploy to Render

1. Push this folder to a **GitHub repo**
2. Go to [render.com](https://render.com) → **New** → **Web Service**
3. Connect your GitHub repo
4. Settings:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Render will give you a `.onrender.com` URL — share it with friends!

## Project Structure

```
├── server.js          # Express + WebSocket server
├── public/
│   └── index.html     # Game client (Canvas + WS)
├── package.json
└── README.md
```

## Controls

- **WASD** or **Arrow Keys** — Move your circle
- **Name input** (top-right) — Set your display name
