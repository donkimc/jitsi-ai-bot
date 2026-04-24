/**
 * AudioPipeline — Speech-to-Text and Text-to-Speech
 *
 * STT options: 'groq' (via Whisper, fast + accurate)
 * TTS options: 'browser' (via Web Speech API in Puppeteer page)
 */

const Groq = require('groq-sdk');

class AudioPipeline {
  constructor({ sttProvider = 'groq', ttsProvider = 'browser', page = null } = {}) {
    this.sttProvider = sttProvider;
    this.ttsProvider = ttsProvider;
    this.page = page;  // Puppeteer page reference for Web Speech API

    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  /**
   * Transcribe an audio buffer → string transcript
   * audioChunk: Buffer of raw PCM or WebM audio from Jitsi
   */
  async transcribe(audioChunk) {
    if (this.sttProvider === 'groq') {
      return this._transcribeGroq(audioChunk);
    }
    throw new Error(`Unknown STT provider: ${this.sttProvider}`);
  }

  /**
   * Convert text → audio via browser Web Speech API
   * Note: Web Speech API outputs audio directly to speakers, not a buffer.
   * Returns null (speech is handled by browser, not returned as buffer).
   */
  async synthesize(text) {
    if (this.ttsProvider === 'browser') {
      return this._synthesizeBrowser(text);
    }
    throw new Error(`Unknown TTS provider: ${this.ttsProvider}`);
  }

  // ─── STT implementations ─────────────────────────────────────────

  async _transcribeGroq(audioBuffer) {
    try {
      // Convert buffer to file-like object for Groq API
      const response = await this.groq.audio.transcriptions.create({
        file:  new File([audioBuffer], 'audio.webm', { type: 'audio/webm' }),
        model: 'whisper-large-v3-turbo',  // fast + accurate
      });
      return response.text?.trim() || null;
    } catch (err) {
      console.error('[STT] Groq Whisper error:', err.message);
      return null;
    }
  }

  // ─── TTS implementations ─────────────────────────────────────────

  async _synthesizeBrowser(text) {
    if (!this.page) {
      console.error('[TTS] No Puppeteer page reference set. Cannot use Web Speech API.');
      return null;
    }
    try {
      // Use browser's native Web Speech API to speak text
      // Speech output goes directly to browser/system speakers
      await this.page.evaluate((textToSpeak) => {
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.rate = 0.9;      // slightly slower for learners
        utterance.lang = 'en-US';
        speechSynthesis.speak(utterance);
      }, text);
      return null;  // Web Speech API handles audio output, no buffer returned
    } catch (err) {
      console.error('[TTS] Browser Web Speech API error:', err.message);
      return null;
    }
  }
}

module.exports = { AudioPipeline };
