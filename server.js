// server.js  — world + village + basic combat
// ────────────────────────────────────────────────
import express           from 'express';
import { createServer }  from 'http';
import { Server }        from 'socket.io';

const app  = express();
const http = createServer(app);
const io   = new Server(http);

app.use(express.static('public'));

/* ═══════════════ 1. WORLD / TILES ═══════════════ */

const world = new Map();                // "x,y" → { type, monstersRemaining, cleared }
world.set('0,0', { type: 'village', monstersRemaining: 0, cleared: true });

function key (x, y)            { return `${x},${y}`; }
function ringOf (x, y)         { return Math.max(Math.abs(x), Math.abs(y)); }

/** create wilderness tile lazily (8 · ring monsters max) */
function ensureTile(x, y) {
  const k = key(x, y);
  if (world.has(k)) return world.get(k);

  const r = ringOf(x, y);
  const layer = Math.max(r, 1); // 1 = first ring, 2 = second ring, etc.
  const t = { type: 'wilderness', monstersRemaining: 0, cleared: false, spawnPool: [] };

  // Determine how many monsters in this tile
  const baseMin = 8;
  const baseMax = baseMin * layer;
  t.monstersRemaining = Math.floor(Math.random() * (baseMax - baseMin + 1)) + baseMin;

  // Build weighted monster pool based on layer
  let weights = [];
  for (let i = 0; i < monsters.length; i++) {
    if (i < layer) {
      weights.push(i + 1); // e.g. layer 2 gives Rat:1, Slime:2
    } else {
      weights.push(0); // monster not available yet
    }
  }

  // Create weighted pool for this tile
  t.spawnPool = monsters.flatMap((m, i) => Array(weights[i]).fill(i));

  world.set(k, t);
  return t;
}

/* ═══════════════ 2. MONSTER TABLE ═══════════════ */

const monsters = [
  { name:'Rat',         hp: 20,  atk:  3, xp: 10, gold:  5, weight: 18 },
  { name:'Green Slime', hp: 25,  atk:  4, xp: 15, gold:  8, weight: 22 },
  { name:'Goblin',      hp:100,  atk: 10, xp: 50, gold: 12, weight: 12 },
  { name:'Orc',         hp:150,  atk: 15, xp: 90, gold: 18, weight:  7 },
  { name:'Troll',       hp:220,  atk: 25, xp:180, gold: 30, weight:  4 },
];

function rollMonster(tile) {
  const pool = tile.spawnPool || [0]; // fallback to Rat if not set
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  return { ...monsters[chosen] }; // clone
}

/* ═══════════════ 3. PLAYERS ═════════════════════ */

const COLORS = ['#d33', '#36c', '#3a3', '#c63', '#933', '#06a', '#690', '#aa0'];
let   colorIdx = 0;
function nextColor () { return COLORS[colorIdx++ % COLORS.length]; }

const players = new Map();   // id → { id, name, color, x, y, inVillage }

/* ═══════════════ 4. VILLAGE & ECONOMY ═══════════ */

const village   = { population: 100, growthClock: 0 };
const weaponTiers = ['Wooden Club', 'Stone Knife', 'Bronze Dagger', 'Iron Sword'];
const armorTiers  = ['Cloth Tunic', 'Padded Vest', 'Leather Armor', 'Chain Shirt'];

function clearedTiles () {
  let n = 0; for (const t of world.values()) if (t.cleared) n++; return n;
}

/* grow by 1 pop when growthClock ≥ 1 — proportional to cleared tiles */
setInterval(() => {
  const growth = clearedTiles() * 0.01;     // tweak factor as desired
  village.growthClock += growth;
  if (village.growthClock >= 1) {
    const inc = Math.floor(village.growthClock);
    village.population += inc;
    village.growthClock -= inc;
    broadcast();                            // everyone sees new pop
  }
}, 1000);

/* ═══════════════ 5. BROADCAST STATE ═════════════ */

function buildState () {
  return {
    tiles   : Object.fromEntries(world),
    players : Object.fromEntries(players),
    village
  };
}
function broadcast () { io.emit('state', buildState()); }

/* ═══════════════ 6. SOCKET.IO HANDLERS ══════════ */

io.on('connection', sock => {

  /* ─ join world ─ */
  sock.on('join', ({ name }) => {
    players.set(sock.id, {
      id: sock.id,
      name,
      color: nextColor(),
      x: 0, y: 0,
      inVillage: false
    });
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
    const p = players.get(sock.id); if (!p) return;
    if (p.x === 0 && p.y === 0) { p.inVillage = true; broadcast(); }
  });
  sock.on('leaveVillage', () => {
    const p = players.get(sock.id); if (!p) return;
    p.inVillage = false; broadcast();
  });

  /* ─ heal at church ─ */
  sock.on('healAtChurch', () => {
    const p = players.get(sock.id); if (!p || !p.inVillage) return;
    sock.emit('healed');           // client resets HP locally
  });

  /* ─ combat: send a monster ─ */
  sock.on('requestEnemy', ({ x, y }) => {
    const t = world.get(key(x, y));
    if (!t || t.cleared || t.monstersRemaining <= 0) {
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
    p.inVillage = false; // player is back in village square but not inside the UI
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

