// server.js  — grid world with multi-monster tiles + simple combat messages
import express            from 'express';
import { createServer }   from 'http';
import { Server }         from 'socket.io';

const app        = express();
const httpServer = createServer(app);
const io         = new Server(httpServer);
app.use(express.static('public'));

/* ════════════════ MONSTER TEMPLATES ═════════════════ */
const templates = [
  { name:'Rat',          hp:20,  atk:3,  xp:5,  gold:3 },
  { name:'Green Slime',  hp:30,  atk:4,  xp:8,  gold:5 },
  { name:'Goblin',       hp:60,  atk:8,  xp:15, gold:10 },
  { name:'Orc',          hp:80,  atk:11, xp:22, gold:15 },
  { name:'Troll',        hp:110, atk:15, xp:35, gold:25 },
  { name:'Dragon',       hp:180, atk:25, xp:90, gold:60 },
];
function weightedRandom(list) {
  const total = list.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const e of list) if ((r -= e.weight) < 0) return e.template;
  return list[0].template;
}
function pickMonsterForRing(ring) {
  /* ring = 1 unlocks Rat
            2 unlocks Slime
            3 unlocks Goblin, etc. */
  const maxIdx = Math.min(ring, templates.length) - 1;
  const pool = [];
  for (let i = 0; i <= maxIdx; i++) {
    pool.push({ template: templates[i], weight: 2 ** i });
  }
  return weightedRandom(pool);
}

/* ════════════════ WORLD MODEL ═══════════════════════ */
const world = new Map();   // key "x,y" → { type, monstersRemaining }
world.set('0,0', { type:'village', monstersRemaining:0 });

function key(x,y){ return `${x},${y}`; }
function ringOf(x,y){ return Math.max(Math.abs(x), Math.abs(y)); }

function ensureTile(x,y){
  const k = key(x,y);
  if (world.has(k)) return world.get(k);

  const ring = ringOf(x,y);
  const mons = Math.floor( Math.random()* (8*ring) ) + 1; // 1..8*ring
  const tile = { type:'wilderness', monstersRemaining: mons };
  world.set(k, tile);
  return tile;
}

/* ════════════════ PLAYERS ═══════════════════════════ */
const COLORS = ['#d33','#36c','#3a3','#c63','#933','#06a','#690','#aa0'];
let colorIdx = 0;
const players = new Map();   // id → { name,x,y,color }

function nextColor(){ return COLORS[ (colorIdx++) % COLORS.length ]; }

/* ════════════════ BROADCAST STATE ═══════════════════ */
function sendFullState(){
  io.emit('state', {
    tiles   : Object.fromEntries(world),
    players : Object.fromEntries(players),
  });
}

/* ════════════════ SOCKET HANDLERS ═══════════════════ */
io.on('connection', sock=>{
  console.log('👋', sock.id);

  sock.on('join', ({name})=>{
    if(!name) return;
    players.set(sock.id,{ name, x:0, y:0, color: nextColor() });
    ensureTile(0,0);
    sendFullState();
  });

  sock.on('moveTo', ({x,y})=>{
    const p = players.get(sock.id);
    if(!p) return;
    if (Math.abs(x-p.x)+Math.abs(y-p.y) !== 1) return;   // must be adjacent
    p.x = x; p.y = y;
    ensureTile(x,y);
    sendFullState();
  });

  /* client asks: “give me a monster for this tile” */
  sock.on('requestEnemy', ({x,y})=>{
    const tile = ensureTile(x,y);
    if (tile.monstersRemaining <= 0) return;

    const enemy = pickMonsterForRing(ringOf(x,y));
    // Send a fresh copy so the client can mutate hp locally
    sock.emit('enemyData', JSON.parse(JSON.stringify(enemy)));
  });

  /* after client wins a fight */
  sock.on('enemyDefeated', ({x,y})=>{
    const tile = world.get(key(x,y));
    if (!tile || tile.monstersRemaining<=0) return;
    tile.monstersRemaining -= 1;
    if (tile.monstersRemaining === 0) tile.cleared = true;
    sendFullState();
  });

  sock.on('disconnect', ()=>{
    players.delete(sock.id);
    sendFullState();
  });
});

httpServer.listen(3000,'0.0.0.0',()=>{
  console.log('✓ listening on :3000');
});
