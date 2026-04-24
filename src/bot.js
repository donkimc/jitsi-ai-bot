const config = require('../config/config');
const { createBotSession } = require('./bot-session');

async function main() {
  console.log('[Bot] Starting AI English tutor participant...');
  const session = createBotSession({ roomName: config.jitsi.roomName });
  await session.start();
}

main().catch((err) => {
  console.error('[Bot] Fatal error:', err);
  process.exit(1);
});
