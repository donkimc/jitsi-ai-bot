/**
 * Jitsi AI Participant Bot — Entry Point
 */

const { JitsiMeetBot } = require('./jitsi-client');
const { AIBrain }      = require('./ai-brain');
const config           = require('../config/config');

async function main() {
  console.log('[Bot] Starting AI English tutor participant...');

  const bot = new JitsiMeetBot({
    roomName:    config.jitsi.roomName,
    serverURL:   config.jitsi.serverURL,
    displayName: config.bot.displayName,
  });

  const brain = new AIBrain({
    model:        config.llm.model,
    triggerName:  config.bot.triggerName,
    systemPrompt: config.bot.systemPrompt,
  });

  // ── Single mutex — only ONE response at a time, ever ──────────────
  let isProcessing = false;
  let lastSpokenAt = 0;
  const COOLDOWN_MS = 4000; // ignore all input for 4s after Alex finishes speaking

  function isExitCommand(text) {
    if (!text) return false;
    const normalized = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const trigger = config.bot.triggerName.toLowerCase();
    return normalized.includes(`${trigger} exit conversation`) || normalized === `${trigger} exit conversation`;
  }

  bot.on('audioReceived', async (transcript, speakerName) => {
    if (!transcript || !transcript.trim()) return;

    const normalizedTranscript = transcript.trim().toLowerCase();
    if (isExitCommand(normalizedTranscript)) {
      console.log('[Bot] Exit command received. Shutting down...');
      await bot.disconnect();
      process.exit(0);
      return;
    }

    // Hard block: drop everything while processing or in cooldown
    if (isProcessing) {
      console.log(`[Bot] Busy — dropped: "${transcript}"`);
      return;
    }
    const msSinceSpoke = Date.now() - lastSpokenAt;
    if (msSinceSpoke < COOLDOWN_MS) {
      console.log(`[Bot] Cooldown (${msSinceSpoke}ms) — dropped: "${transcript}"`);
      return;
    }

    // Ignore audio from the bot itself
    if (speakerName.toLowerCase().includes('ai tutor')) return;
    if (speakerName.toLowerCase().includes(config.bot.triggerName.toLowerCase())) return;

    console.log(`[Heard] ${speakerName}: "${transcript}"`);

    // Claim the mutex immediately
    isProcessing = true;

    try {
      const response = await brain.process(transcript, speakerName);
      if (!response) { isProcessing = false; return; }

      console.log(`[Alex] Will say: "${response.text}"`);

      const fullText = response.correction
        ? `${response.text} ... By the way, ${response.correction}`
        : response.text;

      await bot.speak(fullText);
      lastSpokenAt = Date.now();

      // Release mutex after estimated speaking duration + buffer
      const speakDurationMs = Math.max(3000, fullText.length * 70);
      setTimeout(() => {
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
      const greeting =
        `Hello everyone! I'm ${config.bot.displayName}, your AI conversation partner. ` +
        `Just say my name to get my attention!`;
      await bot.speak(greeting);
      const greetDuration = Math.max(3000, greeting.length * 70);
      setTimeout(() => {
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

  // Auto-exit after 90 minutes
  setTimeout(async () => {
    console.log('[Bot] Auto-exiting after 90 minutes...');
    await bot.disconnect();
    process.exit(0);
  }, 90 * 60 * 1000);
}

main().catch(err => {
  console.error('[Bot] Fatal error:', err);
  process.exit(1);
});