import { initZaloSession } from './src/zalo.js';

console.log('Testing Zalo browser launch...');
initZaloSession(console.log, false)
  .then(() => {
    console.log('Zalo browser launched successfully!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Failed to launch Zalo browser:', err);
    process.exit(1);
  });
