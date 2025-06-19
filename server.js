// server.js  — simple grid world with click-to-move
import express            from 'express';
import { createServer }   from 'http';
import { Server }         from 'socket.io';

const app        = express();
const httpServer = createServer(app);
const io         = new Server(httpServer);

app.use(express.static('public'));

/* ════════════════ WORLD  ══════════════════════════ */
const world = new Map();          // "x,y" → { type:'village'|'wilderness' }
world.set('0,0', { type: 'village' });

function key(x, y) { return `${x},${y}`; }
function ensureTile(x, y) {
  const k = key(x, y);
  if (!world.has(k)) world.set(k, { type: 'wilderness' });
}

/* ════════════════ PLAYERS ═════════════════════════ */
const COLORS = [
  '#d33', '#36c', '#3a3', '#c63', '#933', '#06a', '#690', '#aa0',
];
let colorIdx = 0;

const players = new Map();  // socket.id → { name,x,y,color }

function nextColor() {
  const c = COLORS[colorIdx % COLORS.length];
  colorIdx += 1;
  return c;
}

function broadcast() {
  io.emit('state', {
    tiles: Object.fromEntries(world),
    players: Object.fromEntries(players),
  });
}

/* ════════════════ SOCKET IO ═══════════════════════ */
io.on('connection', sock => {
  console.log('👋', sock.id, 'connected');

  sock.on('join', ({ name }) => {
    if (!name) return;
    players.set(sock.id, { name, x: 0, y: 0, color: nextColor() });
    ensureTile(0, 0);
    broadcast();
    console.log('✅', name, 'joined');
  });

  sock.on('moveTo', ({ x, y }) => {
    const p = players.get(sock.id);
    if (!p) return;
    const dx = Math.abs(x - p.x);
    const dy = Math.abs(y - p.y);
    if (dx + dy !== 1) return;          // allow only adjacent moves
    p.x = x; p.y = y;
    ensureTile(x, y);
    broadcast();
  });

  sock.on('disconnect', () => {
    const name = players.get(sock.id)?.name;
    if (name) console.log('❌', name, 'left');
    players.delete(sock.id);
    broadcast();
  });
});

httpServer.listen(3000, '0.0.0.0', () =>
  console.log('✓ Server running on port 3000 (all interfaces)'));
