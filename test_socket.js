const io = require('socket.io-client');
const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('Connected!');
  
  socket.on('pinball_state', (state) => {
    console.log('Got pinball state:', state);
    if (state.status === 'lobby') {
      console.log('Emitting join_pinball...');
      socket.emit('join_pinball', { name: 'AutomatedTester' });
    } else {
      console.log('Pinball is not in lobby status!');
    }
  });
});
