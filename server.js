// server.js  — world + village + basic combat + profiles
// ────────────────────────────────────────────────

// ===== Profiles (simple persistence) =====
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('./data');
const PROFILES_PATH = path.join(DATA_DIR, 'profiles.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
ensureDataDir();

function loadProfiles() {
  try {
    if (!fs.existsSync(PROFILES_PATH)) return {};
    return JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf8'));
  } catch (e) {
    console.error('Failed to load profiles.json', e);
    return {};
  }
}

let profiles = loadProfiles();

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const tmp = PROFILES_PATH + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(profiles, null, 2), 'utf8');
      fs.renameSync(tmp, PROFILES_PATH);
    } catch (e) {
      console.error('Failed to save profiles.json', e);
    }
  }, 500); // batch saves
}

function makeToken() {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).toUpperCase();
}

// default stats (matcher klientformatet ditt)
function defaultStats() {
  return {
    level: 1,
    xp: 0,
    gold: 0,
    hp: 100,
    weaponTier: -1,
    armorTier: -1,
    homeTier: -1
  };
}

// ────────────────────────────────────────────────
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const http = createServer(app);
const io = new Server(http);

app.use(express.static('public'));

/* ═══════════════ 1. WORLD / TILES ═══════════════ */

const world = new Map(); // "x,y" → { type, monstersRemaining, cleared, spawnPool }
world.set('0,0', { type: 'village', monstersRemaining: 0, cleared: true });

function key(x, y) { return `${x},${y}`; }
function ringOf(x, y) { return Math.max(Math.abs(x), Math.abs(y)); }

/* ═══════════════ 2. MONSTER TABLE ═══════════════ */

const monsters = [
  { name:'Rat',           hp: 20,               atk: 3,        xp: 4,           gold: 1,           weight: 1 },
  { name:'Green Slime',   hp: 115,              atk: 2,        xp: 26,          gold: 3,           weight: 2 },
  { name:'Goblin',        hp: 225,              atk: 13,       xp: 49,          gold: 8,           weight: 3 },
  { name:'Orc',           hp: 440,              atk: 25,       xp: 89,          gold: 15,          weight: 4 },
  { name:'Troll',         hp: 800,              atk: 40,       xp: 179,         gold: 31,          weight: 5 },
  { name:'Wither',        hp: 334,              atk: 99,       xp: 393,         gold: 67,          weight: 6 },
  { name:'Gryphon',       hp: 2106,             atk: 167,      xp: 797,         gold: 175,         weight: 7 },
  { name:'Dragon',        hp: 8000,             atk: 340,      xp: 3543,        gold: 4500,        weight: 8 },
  { name:'Titan',         hp: 67000,            atk: 949,      xp: 14012,       gold: 7431,        weight: 9 },
  { name:'SCRAMLER',      hp: 1480000,          atk: 77777,    xp: 27041,       gold: 13321,       weight: 10 },
  { name:'Blasphemer',    hp: 35000000,         atk: 99999,    xp: 99999,       gold: 99999,       weight: 11 },
  { name:'ZLAGO',         hp: 2500000000,       atk: 99999,    xp: 999999,      gold: 150000,      weight: 12 },
  { name:'Void Herald',   hp: 80000000000,      atk: 150000,   xp: 1500000,     gold: 300000,      weight: 13 },
  { name:'Abyss Warden',  hp: 180000000000,     atk: 220000,   xp: 2800000,     gold: 600000,      weight: 14 },
  { name:'Star Devourer', hp: 4200000000000,    atk: 350000,   xp: 5200000,     gold: 1200000,     weight: 15 },
  { name:'World Eater',   hp: 9000000000000,    atk: 600000,   xp: 10000000,    gold: 2500000,     weight: 16 },
  { name:'Eclipse King',  hp: 18000000000000,   atk: 950000,   xp: 20000000,    gold: 5000000,     weight: 17 },
  { name:'Reality Tear',  hp: 36000000000000,   atk: 1500000,  xp: 40000000,    gold: 10000000,    weight: 18 },
  { name:'Chrono Beast',  hp: 72000000000000,   atk: 2300000,  xp: 80000000,    gold: 20000000,    weight: 19 },
  { name:'Null Emperor',  hp: 140000000000000,  atk: 3500000,  xp: 160000000,   gold: 40000000,    weight: 20 },
  { name:'Omega Seraph',  hp: 280000000000000,  atk: 5500000,  xp: 320000000,   gold: 80000000,    weight: 21 },
  { name:'Final Witness', hp: 560000000000000,  atk: 8500000,  xp: 640000000,   gold: 160000000,   weight: 22 },
  { name:'Paradox Lord',  hp: 1120000000000000, atk: 13000000, xp: 1280000000,  gold: 320000000,   weight: 23 },
  { name:'Singularity',   hp: 2240000000000000, atk: 20000000, xp: 2560000000,  gold: 640000000,   weight: 24 },
  { name:'The End',       hp: 4480000000000000, atk: 30000000, xp: 5120000000,  gold: 1280000000,  weight: 25 },
  { name:'Unmaker',       hp: 9000000000000000, atk: 45000000, xp: 10000000000, gold: 2500000000,  weight: 26 },
  { name:'ABSENCE',       hp: 18000000000000000,atk: 70000000, xp: 20000000000, gold: 5000000000,  weight: 27 }
];

function rollMonster(tile) {
  const pool = tile.spawnPool || [0]; // fallback to Rat if not set
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  return { ...monsters[chosen] }; // clone
}

/** create wilderness tile lazily (8 · ring monsters max) */
function ensureTile(x, y) {
  const k = key(x, y);
  if (world.has(k)) return world.get(k);

  // protect 0,0 (should exist already, but just in case)
  if (x === 0 && y === 0) {
    const v = { type: 'village', monstersRemaining: 0, cleared: true };
    world.set(k, v);
    return v;
  }

  const r = ringOf(x, y);
  const layer = Math.max(r, 1); // 1 = first ring, 2 = second ring, etc.
  const t = { type: 'wilderness', monstersRemaining: 0, cleared: false, spawnPool: [] };

  // Determine how many monsters in this tile
  const baseMin = 8;
  const baseMax = baseMin * layer;
  t.monstersRemaining = Math.floor(Math.random() * (baseMax - baseMin + 1)) + baseMin;

  // Build weighted monster pool based on layer
  const weights = [];
  for (let i = 0; i < monsters.length; i++) {
    if (i < layer) weights.push(i + 1);
    else weights.push(0);
  }

  // Create weighted pool for this tile
  t.spawnPool = monsters.flatMap((m, i) => Array(weights[i]).fill(i));

  world.set(k, t);
  return t;
}

/* ═══════════════ 3. PLAYERS ═════════════════════ */

const COLORS = ['#d33', '#36c', '#3a3', '#c63', '#933', '#06a', '#690', '#aa0'];
let colorIdx = 0;
function nextColor() { return COLORS[colorIdx++ % COLORS.length]; }

const players = new Map(); // id → { id, name, color, x, y, inVillage, homeTier, token }

/* ═══════════════ 4. VILLAGE & ECONOMY ═══════════ */

const village = { population: 200, growthClock: 0 };

function clearedTiles() {
  let n = 0;
  for (const t of world.values()) if (t.cleared) n++;
  return n;
}

setInterval(() => {
  let growth = 0;
  const N = clearedTiles();
  for (let i = 1; i <= N; i++) growth += 0.015 / i;

  village.growthClock += growth;
  if (village.growthClock >= 1) {
    const inc = Math.floor(village.growthClock);
    village.population += inc;
    village.growthClock -= inc;
    broadcast();
  }
}, 1000);

/* ═══════════════ 5. BROADCAST STATE ═════════════ */

const VIEW_SIZE = 15;
const VIEW_R = Math.floor(VIEW_SIZE / 2);

function buildTilesView(cx, cy) {
  const tiles = {};
  for (let y = cy - VIEW_R; y <= cy + VIEW_R; y++) {
    for (let x = cx - VIEW_R; x <= cx + VIEW_R; x++) {
      const t = ensureTile(x, y);       // lazily create if missing
      tiles[key(x, y)] = t;             // send only this window
    }
  }
  return tiles;
}

function buildPlayersState() {
  return Object.fromEntries(players);
}

function broadcast() {
  const playersState = buildPlayersState();

  for (const [socketId, socket] of io.of("/").sockets) {
    const p = players.get(socketId);
    if (!p) continue; // not joined yet

    socket.emit('state', {
      tiles: buildTilesView(p.x, p.y),
      players: playersState,
      village
    });
  }
}

/* ═══════════════ 6. SOCKET.IO HANDLERS ══════════ */

io.on('connection', sock => {

  // Save profile stats (client calls this whenever it wants)
  sock.on('saveProfile', ({ token, stats }) => {
    if (!token || !profiles[token]) return;

    // solid sanity (avoid NaN ruining tiers)
    const clean = {
      level: Number.isFinite(Number(stats.level)) ? Number(stats.level) : 1,
      xp: Number.isFinite(Number(stats.xp)) ? Number(stats.xp) : 0,
      gold: Number.isFinite(Number(stats.gold)) ? Number(stats.gold) : 0,
      hp: Number.isFinite(Number(stats.hp)) ? Number(stats.hp) : 100,
      weaponTier: Number.isFinite(Number(stats.weaponTier)) ? Number(stats.weaponTier) : -1,
      armorTier: Number.isFinite(Number(stats.armorTier)) ? Number(stats.armorTier) : -1,
      homeTier: Number.isFinite(Number(stats.homeTier)) ? Number(stats.homeTier) : -1
    };

    profiles[token].stats = clean;
    profiles[token].lastSeen = Date.now();
    scheduleSave();

    // keep players-map homeTier in sync for others to see
    const p = players.get(sock.id);
    if (p) p.homeTier = clean.homeTier;

    broadcast();
  });

  /* ─ join world ─ */
  sock.on('join', ({ name, token }) => {
    // 1) find/create profile
    let profileToken = token && profiles[token] ? token : null;

    if (!profileToken) {
      profileToken = makeToken();
      profiles[profileToken] = {
        name: (name || 'Player'),
        stats: defaultStats(),
        lastSeen: Date.now()
      };
      scheduleSave();
    } else {
      profiles[profileToken].name = name || profiles[profileToken].name;
      profiles[profileToken].lastSeen = Date.now();
      scheduleSave();
    }

    const prof = profiles[profileToken];

    // 2) create player in world (position resets to 0,0 on reconnect)
    players.set(sock.id, {
      id: sock.id,
      name: prof.name,
      color: nextColor(),
      x: 0, y: 0,
      inVillage: false,
      homeTier: prof.stats.homeTier ?? -1,
      token: profileToken
    });

    // 3) send token + stats back only to this client
    sock.emit('joined', { token: profileToken, stats: prof.stats });

    broadcast();
  });

  /* ─ move one tile N/E/S/W ─ */
  sock.on('moveTo', ({ x, y }) => {
    const p = players.get(sock.id);
    if (!p) return;
    if (Math.abs(x - p.x) + Math.abs(y - p.y) !== 1) return; // only adjacent

    p.x = x; p.y = y; p.inVillage = false;
    ensureTile(x, y);
    broadcast();
  });

  /* ─ village screen ─ */
  sock.on('enterVillage', () => {
    const p = players.get(sock.id);
    if (!p) return;
    if (p.x === 0 && p.y === 0) {
      p.inVillage = true;
      broadcast();
    }
  });

  sock.on('leaveVillage', () => {
    const p = players.get(sock.id);
    if (!p) return;
    p.inVillage = false;
    broadcast();
  });

  /* ─ heal at church ─ */
  sock.on('healAtChurch', () => {
    const p = players.get(sock.id);
    if (!p || !p.inVillage) return;
    sock.emit('healed'); // client resets HP locally
  });

  /* ─ combat: send a monster ─ */
  sock.on('requestEnemy', ({ x, y }) => {
    const t = ensureTile(x, y); // IMPORTANT: make sure tile exists
    if (!t || t.type === 'village' || t.cleared || t.monstersRemaining <= 0) {
      sock.emit('enemyData', null);
      return;
    }
    const foe = rollMonster(t);
    sock.emit('enemyData', foe);
  });

  /* ─ combat: mark kill ─ */
  sock.on('enemyDefeated', ({ x, y }) => {
    const t = world.get(key(x, y));
    if (t && t.monstersRemaining > 0) {
      t.monstersRemaining--;
      if (t.monstersRemaining === 0) t.cleared = true;
      broadcast();
    }
  });

  sock.on('respawn', () => {
    const p = players.get(sock.id);
    if (p) {
      p.x = 0;
      p.y = 0;
      p.inVillage = false;
      broadcast();
    }
  });

  /* ─ disconnect ─ */
  sock.on('disconnect', () => {
    players.delete(sock.id);
    broadcast();
  });
});

/* ═══════════════ 7. START SERVER ════════════════ */

http.listen(3000, '0.0.0.0', () =>
  console.log('✓ TBRPG server listening on :3000 (all interfaces)'));


