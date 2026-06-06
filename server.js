const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const GAMES = JSON.parse(fs.readFileSync(path.join(__dirname, 'games.json'), 'utf8'));

const PHASES = [
  { id: 'seeding',      label: 'Seeding',        day: 'Vendredi 15 mai',  games: ['rocket_boots', 'rubiks'] },
  { id: 'knockout',     label: 'Knockout',        day: 'Ven–Sam 15-16 mai', games: ['aoe4', 'gorilla', 'satisfactory', 'street_fighter', 'super_golf', 'worms'] },
  { id: 'eliminations', label: 'Éliminatoires',   day: 'Samedi 16 mai',   games: ['rocket_boots', 'aoe4', 'gorilla', 'satisfactory', 'street_fighter', 'super_golf', 'worms'] },
  { id: 'finale',       label: 'Finale',          day: 'Dimanche 17 mai', games: ['mystere'] }
];

let state = {
  game: null,
  phase: PHASES[0],
  timer: {
    running: false,
    initialValue: 0,
    startTime: null,
    direction: 'down'
  },
  score: { us: 0, them: 0 },
  lives: 3,
  gamesLeft: 0,
  hasOpponents: true,
  rank: '',
  record: '',
  timeOnGame: '',
  nextMatch: '',
  showPov: true,
  records: { warllam: '1m23', ryroy: '2m50' },
  opponent: {
    player1: { pseudo: '', steamId: null },
    player2: { pseudo: '', steamId: null }
  },
  steamHours: {}
};

let timerTimeout = null;

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

function broadcastState() {
  broadcast({ type: 'state', data: state });
}

function startTimer() {
  if (state.timer.running) return;
  clearTimeout(timerTimeout);
  state.timer.running = true;
  state.timer.startTime = Date.now();

  if (state.timer.direction === 'down' && state.timer.initialValue > 0) {
    timerTimeout = setTimeout(() => {
      state.timer.running = false;
      state.timer.initialValue = 0;
      state.timer.startTime = null;
      broadcast({ type: 'timer_end' });
      broadcastState();
    }, state.timer.initialValue * 1000);
  }

  broadcastState();
}

function stopTimer() {
  if (!state.timer.running) return;
  clearTimeout(timerTimeout);
  const elapsed = (Date.now() - state.timer.startTime) / 1000;
  if (state.timer.direction === 'down') {
    state.timer.initialValue = Math.max(0, state.timer.initialValue - elapsed);
  } else {
    state.timer.initialValue = Math.floor(state.timer.initialValue + elapsed);
  }
  state.timer.running = false;
  state.timer.startTime = null;
  broadcastState();
}

// Steam
const ZLAN_STEAM_APPIDS = {
  rocket_boots:   942200,
  aoe4:           1466860,
  gorilla:        3217900,
  satisfactory:   526870,
  street_fighter: 1364780,
  super_golf:     4069520,
  worms:          327030
};

function getConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')); }
  catch { return null; }
}

async function fetchPlayerHours(steamId, apiKey) {
  const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId}&include_appinfo=1&format=json`;
  const res = await fetch(url);
  const json = await res.json();
  const games = json.response?.games || [];
  const result = {};
  for (const [gameId, appid] of Object.entries(ZLAN_STEAM_APPIDS)) {
    const g = games.find(g => g.appid === appid);
    result[gameId] = g ? Math.round(g.playtime_forever / 6) / 10 : 0;
  }
  return result;
}

async function resolveVanityUrl(pseudo, apiKey) {
  try {
    const url = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${apiKey}&vanityurl=${encodeURIComponent(pseudo)}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.response?.success === 1) return json.response.steamid;
  } catch {}
  return null;
}

async function refreshAllHours() {
  const cfg = getConfig();
  if (!cfg?.steam?.apiKey || cfg.steam.apiKey.includes('ICI')) return;
  const { apiKey, players } = cfg.steam;

  const toFetch = [
    ...Object.entries(players).map(([key, steamId]) => ({ key, steamId })),
    state.opponent.player1.steamId ? { key: 'opp1', steamId: state.opponent.player1.steamId } : null,
    state.opponent.player2.steamId ? { key: 'opp2', steamId: state.opponent.player2.steamId } : null,
  ].filter(Boolean);

  const result = {};
  for (const { key, steamId } of toFetch) {
    try { result[key] = await fetchPlayerHours(steamId, apiKey); }
    catch (e) { console.error(`Steam error for ${key}:`, e.message); result[key] = null; }
  }
  state.steamHours = result;
  broadcastState();
}

// Refresh toutes les 5 min
setInterval(refreshAllHours, 5 * 60 * 1000);

app.get('/steam-hours', (req, res) => res.json(state.steamHours));

app.post('/opponent', async (req, res) => {
  const cfg = getConfig();
  const apiKey = cfg?.steam?.apiKey;
  const { player1, player2 } = req.body;

  for (const [key, p] of [['player1', player1], ['player2', player2]]) {
    if (!p) continue;
    state.opponent[key].pseudo  = p.pseudo  || '';
    state.opponent[key].steamId = p.steamId || null;
    if (!state.opponent[key].steamId && p.pseudo && apiKey) {
      state.opponent[key].steamId = await resolveVanityUrl(p.pseudo, apiKey);
    }
  }

  broadcastState();
  await refreshAllHours();
  res.json({ ok: true, opponent: state.opponent });
});

app.get('/steam/resolve', async (req, res) => {
  const cfg = getConfig();
  const apiKey = cfg?.steam?.apiKey;
  if (!apiKey) return res.json({ steamId: null });
  const steamId = await resolveVanityUrl(req.query.pseudo, apiKey);
  res.json({ steamId });
});

// Routes
app.get('/state', (req, res) => res.json(state));
app.get('/games', (req, res) => res.json(GAMES));
app.get('/phases', (req, res) => res.json(PHASES));

app.post('/game', (req, res) => {
  const game = GAMES.find(g => g.id === req.body.id) || null;
  state.game = game;
  broadcastState();
  res.json({ ok: true });
});

app.post('/phase', (req, res) => {
  const phase = PHASES.find(p => p.id === req.body.id) || PHASES[0];
  state.phase = phase;
  broadcastState();
  res.json({ ok: true });
});

app.post('/timer/start', (req, res) => { startTimer(); res.json({ ok: true }); });
app.post('/timer/stop',  (req, res) => { stopTimer();  res.json({ ok: true }); });

app.post('/timer/reset', (req, res) => {
  stopTimer();
  state.timer = {
    running: false,
    initialValue: req.body.value ?? 0,
    startTime: null,
    direction: req.body.direction || state.timer.direction
  };
  broadcastState();
  res.json({ ok: true });
});

app.post('/score', (req, res) => {
  const { team, delta } = req.body;
  if (team === 'us')   state.score.us   = Math.max(0, state.score.us   + delta);
  if (team === 'them') state.score.them = Math.max(0, state.score.them + delta);
  broadcastState();
  res.json({ ok: true });
});

app.post('/score/reset', (req, res) => {
  state.score = { us: 0, them: 0 };
  broadcastState();
  res.json({ ok: true });
});

app.post('/lives', (req, res) => {
  state.lives = Math.max(0, Math.min(3, req.body.lives ?? state.lives));
  broadcastState();
  res.json({ ok: true });
});

app.post('/games-left', (req, res) => {
  state.gamesLeft = Math.max(0, req.body.count ?? state.gamesLeft);
  broadcastState();
  res.json({ ok: true });
});

app.post('/has-opponents', (req, res) => {
  state.hasOpponents = !!req.body.has;
  broadcastState();
  res.json({ ok: true });
});

app.post('/records', (req, res) => {
  if (req.body.warllam !== undefined) state.records.warllam = req.body.warllam;
  if (req.body.ryroy   !== undefined) state.records.ryroy   = req.body.ryroy;
  broadcastState();
  res.json({ ok: true });
});

app.post('/info', (req, res) => {
  const { rank, record, timeOnGame, nextMatch } = req.body;
  if (rank       !== undefined) state.rank       = rank;
  if (record     !== undefined) state.record     = record;
  if (timeOnGame !== undefined) state.timeOnGame = timeOnGame;
  if (nextMatch  !== undefined) state.nextMatch  = nextMatch;
  broadcastState();
  res.json({ ok: true });
});

app.post('/pov', (req, res) => {
  state.showPov = !!req.body.show;
  broadcastState();
  res.json({ ok: true });
});

// ── Routes GET pour Stream Deck (action "Website") ──────────────────────────
const ok = res => res.send('<script>window.close()</script>');

app.get('/sd/timer/start', (req, res) => { startTimer(); ok(res); });
app.get('/sd/timer/stop',  (req, res) => { stopTimer();  ok(res); });
app.get('/sd/timer/reset', (req, res) => {
  stopTimer();
  state.timer = { running: false, initialValue: Number(req.query.value) || 0, startTime: null, direction: req.query.dir || 'down' };
  broadcastState();
  ok(res);
});

app.get('/sd/pov/show',   (req, res) => { state.showPov = true;           broadcastState(); ok(res); });
app.get('/sd/pov/hide',   (req, res) => { state.showPov = false;          broadcastState(); ok(res); });
app.get('/sd/pov/toggle', (req, res) => { state.showPov = !state.showPov; broadcastState(); ok(res); });

app.get('/sd/lives/up',   (req, res) => { state.lives = Math.min(3, state.lives + 1); broadcastState(); ok(res); });
app.get('/sd/lives/down', (req, res) => { state.lives = Math.max(0, state.lives - 1); broadcastState(); ok(res); });

app.get('/sd/game/next', (req, res) => {
  const idx = GAMES.findIndex(g => g.id === state.game?.id);
  state.game = GAMES[(idx + 1) % GAMES.length];
  broadcastState();
  ok(res);
});

app.get('/sd/game/prev', (req, res) => {
  const idx = GAMES.findIndex(g => g.id === state.game?.id);
  state.game = GAMES[(idx - 1 + GAMES.length) % GAMES.length];
  broadcastState();
  ok(res);
});

app.get('/sd/game/:id', (req, res) => {
  state.game = GAMES.find(g => g.id === req.params.id) || null;
  broadcastState();
  ok(res);
});
// ────────────────────────────────────────────────────────────────────────────

wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'state', data: state }));
});

function getLocalIP() {
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const net of iface) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

const PORT = 3456;
refreshAllHours();

server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('\n  ZLAN Regie 2026 demarre !\n');
  console.log(`  Dashboard (Steam Deck)  : http://${ip}:${PORT}/dashboard.html`);
  console.log(`  Dashboard (local)       : http://localhost:${PORT}/dashboard.html`);
  console.log(`  Overlay OBS (infos)     : http://localhost:${PORT}/overlay.html`);
  console.log(`  Overlay OBS (cam frame) : http://localhost:${PORT}/overlay-cam.html`);
  console.log(`  Overlay OBS (POV Pilou) : http://localhost:${PORT}/overlay-pov.html\n`);
});
