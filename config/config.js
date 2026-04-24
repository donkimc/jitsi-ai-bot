/**
 * config.js — All tunable settings in one place
 * Copy .env.example to .env and fill in your API keys.
 */

require('dotenv').config();

module.exports = {
  jitsi: {
    serverURL: process.env.JITSI_SERVER_URL || 'https://meet.jit.si',
    roomName:  process.env.JITSI_ROOM_NAME  || 'english-lesson-room',
  },

  bot: {
    displayName:  process.env.BOT_NAME      || 'Alex (AI Tutor)',
    triggerName:  process.env.BOT_TRIGGER   || 'Alex',   // name people say to call the bot
    systemPrompt: null,   // null = load default prompt from config/default-prompt.txt
  },

  llm: {
    model: 'llama-3.1-8b-instant',    // or 'mixtral-8x7b-32768'
  },

  stt: {
    provider: process.env.STT_PROVIDER || 'groq',  // groq via Whisper
  },

  tts: {
    provider: process.env.TTS_PROVIDER || 'browser',    // 'browser' uses Web Speech API
  },
};
