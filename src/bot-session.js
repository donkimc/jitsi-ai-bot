const { JitsiMeetBot } = require('./jitsi-client');
const { AIBrain } = require('./ai-brain');
const config = require('../config/config');

function createBotSession({ roomName }) {
  let bot = null;
  let brain = null;
  let isProcessing = false;
  let lastSpokenAt = 0;
  let releaseTimer = null;
  let autoExitTimer = null;
  let stopped = false;

  const COOLDOWN_MS = 4000;

  function clearTimers() {
    if (releaseTimer) {
      clearTimeout(releaseTimer);
      releaseTimer = null;
    }
    if (autoExitTimer) {
      clearTimeout(autoExitTimer);
      autoExitTimer = null;
    }
  }

  function isExitCommand(text) {
    if (!text) return false;
    const normalized = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const trigger = config.bot.triggerName.toLowerCase();
    return normalized.includes(`${trigger} exit conversation`) || normalized === `${trigger} exit conversation`;
  }

  async function stop() {
    if (stopped) return;
    stopped = true;
    clearTimers();

    if (bot) {
      await bot.disconnect();
    }
  }

  async function start() {
    bot = new JitsiMeetBot({
      roomName,
      serverURL: config.jitsi.serverURL,
      displayName: config.bot.displayName,
    });

    brain = new AIBrain({
      model: config.llm.model,
      triggerName: config.bot.triggerName,
      systemPrompt: config.bot.systemPrompt,
    });

    bot.on('audioReceived', async (transcript, speakerName) => {
      if (stopped || !transcript || !transcript.trim()) return;

      const normalizedTranscript = transcript.trim().toLowerCase();
      if (isExitCommand(normalizedTranscript)) {
        console.log('[Bot] Exit command received. Shutting down...');
        await stop();
        return;
      }

      if (isProcessing) {
        console.log(`[Bot] Busy - dropped: "${transcript}"`);
        return;
      }

      const msSinceSpoke = Date.now() - lastSpokenAt;
      if (msSinceSpoke < COOLDOWN_MS) {
        console.log(`[Bot] Cooldown (${msSinceSpoke}ms) - dropped: "${transcript}"`);
        return;
      }

      if (speakerName.toLowerCase().includes('ai tutor')) return;
      if (speakerName.toLowerCase().includes(config.bot.triggerName.toLowerCase())) return;

      console.log(`[Heard] ${speakerName}: "${transcript}"`);
      isProcessing = true;

      try {
        const response = await brain.process(transcript, speakerName);
        if (!response) {
          isProcessing = false;
          return;
        }

        console.log(`[Alex] Will say: "${response.text}"`);

        const fullText = response.correction
          ? `${response.text} ... By the way, ${response.correction}`
          : response.text;

        await bot.speak(fullText);
        lastSpokenAt = Date.now();

        const speakDurationMs = Math.max(3000, fullText.length * 70);
        releaseTimer = setTimeout(() => {
          isProcessing = false;
          console.log('[Bot] Ready to listen again');
        }, speakDurationMs);
      } catch (err) {
        console.error('[Bot] Error processing transcript:', err.message);
        isProcessing = false;
      }
    });

    bot.on('connected', async () => {
      console.log('[Bot] Connected! Greeting in 3s...');
      isProcessing = true;
      lastSpokenAt = Date.now();

      setTimeout(async () => {
        if (stopped) return;

        const greeting =
          `Hello everyone! I'm ${config.bot.displayName}, your AI conversation partner. ` +
          `Just say my name to get my attention!`;

        await bot.speak(greeting);
        const greetDuration = Math.max(3000, greeting.length * 70);
        releaseTimer = setTimeout(() => {
          isProcessing = false;
          lastSpokenAt = Date.now();
          console.log('[Bot] Ready to listen');
        }, greetDuration);
      }, 3000);
    });

    bot.on('participantJoined', (name) => {
      console.log(`[Bot] ${name} joined the room`);
    });

    await bot.connect();

    autoExitTimer = setTimeout(async () => {
      console.log('[Bot] Auto-exiting after 90 minutes...');
      await stop();
    }, 90 * 60 * 1000);
  }

  return {
    start,
    stop,
  };
}

module.exports = { createBotSession };
