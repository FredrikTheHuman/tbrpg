// server.js  (adds village pop + simple economy)
import express           from 'express';
import { createServer }  from 'http';
import { Server }        from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
app.use(express.static('public'));

/* ───────── World / Tiles ─────────────────────────── */
const world = new Map();           // "x,y" → tile
world.set('0,0', { type:'village', monstersRemaining:0, cleared:true });
function key(x,y){return `${x},${y}`;}
function ringOf(x,y){return Math.max(Math.abs(x),Math.abs(y));}

function ensureTile(x,y){
  const k=key(x,y);
  if(world.has(k)) return world.get(k);
  const ring=ringOf(x,y);
  const mons=Math.floor(Math.random()*(8*ring))+1;    // 1..8r
  const t={type:'wilderness',monstersRemaining:mons,cleared:false};
  world.set(k,t); return t;
}

/* ───────── Players ──────────────────────────────── */
const COLORS=['#d33','#36c','#3a3','#c63','#933','#06a','#690','#aa0'];
let ci=0;
const players=new Map();  // id → {x,y,name,color,inVillage}
function nextColor(){return COLORS[(ci++)%COLORS.length];}

/* ───────── Village & economy ─────────────────────── */
const village={
  population:100,
  growthClock:0         // accumulates fractional pop until +1
};
const weaponTiers=['Wooden Club','Stone Knife','Bronze Dagger','Iron Sword'];
const armorTiers =['Cloth Tunic','Padded Vest','Leather Armor','Chain Shirt'];

function clearedTiles(){
  let n=0; for(const t of world.values()) if(t.cleared) n++; return n;
}
setInterval(()=>{               // tick every second
  const growth = clearedTiles()*0.01;      // tweak as desired
  village.growthClock += growth;
  if(village.growthClock >= 1){
    const inc = Math.floor(village.growthClock);
    village.population += inc;
    village.growthClock -= inc;
    broadcast();
  }
},1000);

/* ───────── Broadcast helpers ─────────────────────── */
function broadcast(){
  io.emit('state',{
    tiles   : Object.fromEntries(world),
    players : Object.fromEntries(players),
    village
  });
}

/* ───────── Socket.io ─────────────────────────────── */
io.on('connection',sock=>{
  /* join */
  sock.on('join',({name})=>{
    players.set(sock.id,{id:sock.id,name,color:nextColor(),x:0,y:0,inVillage:false});
    broadcast();
  });

  /* movement */
  sock.on('moveTo',({x,y})=>{
    const p=players.get(sock.id); if(!p) return;
    if(Math.abs(x-p.x)+Math.abs(y-p.y)!==1) return;
    p.x=x;p.y=y;p.inVillage=false;
    ensureTile(x,y); broadcast();
  });

  /* enter/leave village screen */
  sock.on('enterVillage',()=>{const p=players.get(sock.id); if(p){p.inVillage=true;broadcast();}});
  sock.on('leaveVillage',()=>{const p=players.get(sock.id); if(p){p.inVillage=false;broadcast();}});

  /* heal / herbs */
  sock.on('healAtChurch',()=>{
    const p=players.get(sock.id); if(!p||!p.inVillage)return;
    sock.emit('healed');          // just tell client it succeeded
  });
  sock.on('eatHerb',()=>  sock.emit('herbDone'));

  /* battle part identical to previous version ------------------ */
  /* ... enemy generation & defeat code from prior snippet ... */
  sock.on('requestEnemy', ({x,y})=>{/* unchanged */});
  sock.on('enemyDefeated',({x,y})=>{
      const t=world.get(key(x,y));
      if(t&&t.monstersRemaining>0){t.monstersRemaining--;
        if(t.monstersRemaining===0)t.cleared=true; broadcast();}
  });

  /* disconnect */
  sock.on('disconnect',()=>{players.delete(sock.id);broadcast();});
});

httpServer.listen(3000,'0.0.0.0',()=>console.log('✓ listening :3000'));
