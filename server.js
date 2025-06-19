// server.js
import express            from 'express';
import { createServer }   from 'http';
import { Server }         from 'socket.io';

const app        = express();
const httpServer = createServer(app);
const io         = new Server(httpServer);
app.use(express.static('public'));

/* ──────────────────────────────
   WORLD MODEL & HELPERS
   grid is sparse: we store only
   tiles that matter in a Map
   key = "x,y"   value = { type, cleared }
──────────────────────────────── */
const world = new Map();
world.set('0,0', { type: 'village', cleared: true });

function tileKey(x, y) { return `${x},${y}`; }
// ensure a tile exists
function ensureTile(x, y) {
  const key = tileKey(x, y);
  if (!world.has(key))
    world.set(key, { type: 'wilderness', cleared: false });
}

/* ──────────────────────────────
   PLAYERS
   id → { name, x, y }
──────────────────────────────── */
const players = new Map();

function broadcastPlayerList() {
  const list = [...players.values()].map(p => p.name);
  io.emit('playerList', list);
}

function broadcastWorldState() {
  // send minimal info: tiles + all player coords
  io.emit('worldState', {
    tiles: Object.fromEntries(world),           // { "0,0":{...}, "1,0":{...} }
    players: Object.fromEntries(
      [...players.entries()].map(([id, p]) => [id, { x: p.x, y: p.y, name: p.name }])
    )
  });
}

/* ──────────────────────────────
   SOCKET HANDLERS
──────────────────────────────── */
io.on('connection', sock => {
  console.log('👋  client connected', sock.id);

  // 1. join
  sock.on('join', ({ name }) => {
    if (!name) return;
    players.set(sock.id, { name, x: 0, y: 0 });
    ensureTile(0, 0);
    broadcastPlayerList();
    broadcastWorldState();
    console.log(`✅ ${name} joined (${sock.id})`);
  });

  // 2. movement
  sock.on('move', dir => {
    const p = players.get(sock.id);
    if (!p) return;                         // not joined yet
    const delta = { up:[0,-1], down:[0,1], left:[-1,0], right:[1,0] }[dir];
    if (!delta) return;

    p.x += delta[0];
    p.y += delta[1];
    ensureTile(p.x, p.y);

    broadcastWorldState();
  });

  // 3. disconnect
  sock.on('disconnect', () => {
    const name = players.get(sock.id)?.name;
    if (name) console.log(`❌ ${name} left`);
    players.delete(sock.id);
    broadcastPlayerList();
    broadcastWorldState();
  });
});

/* ──────────────────────────────
   START
──────────────────────────────── */
httpServer.listen(3000, '0.0.0.0', () =>
  console.log('✓ Server running on port 3000 (all interfaces)'));
