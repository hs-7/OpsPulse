const net = require('net');
const socket = new net.Socket();

socket.connect(5432, '127.0.0.1', () => {
  console.log('✅ PostgreSQL port 5432 is OPEN and reachable!');
  socket.destroy();
});

socket.on('error', (err) => {
  console.log('❌ PostgreSQL port 5432 connection failed:', err.message);
});
