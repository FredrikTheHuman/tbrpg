// server.js
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app        = express();
const httpServer = createServer(app);
const io         = new Server(httpServer);

app.use(express.static('public'));

// ── NEW: in-memory player registry ────────────────
const players = new Map();     // socket.id → name

function broadcastList() {
  io.emit('playerList', [...players.values()]);
}

// ── connection lifecycle ──────────────────────────
io.on('connection', sock => {
  console.log('👋  client connected', sock.id);

  // listen for the first "join"
  sock.on('join', ({ name }) => {
    players.set(sock.id, name);
    broadcastList();
    console.log(`✅ ${name} joined (${sock.id})`);
  });

  sock.on('disconnect', () => {
    const name = players.get(sock.id);
    if (name) console.log(`❌ ${name} left`);
    players.delete(sock.id);
    broadcastList();
  });
});

httpServer.listen(3000, '0.0.0.0', () =>
  console.log('✓ Server running on port 3000 (all interfaces)'));
