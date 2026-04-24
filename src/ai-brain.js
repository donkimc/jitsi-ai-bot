/**
 * AIBrain — powered by Groq
 */
 
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');

const DEFAULT_PROMPT_PATH = path.resolve(__dirname, '..', 'config', 'default-prompt.txt');
 
// Whisper hallucinations on silence — discard these
const WHISPER_HALLUCINATIONS = [
  'thank you', 'thank you.', 'thanks', 'thanks.',
  'you', 'the', '.', '..', '...', 'bye', 'bye.',
  'okay', 'ok', 'ok.', 'okay.', 'alright', 'alright.',
  'all right', 'all right.', 'right', 'sure', 'yes', 'no',
  'hmm', 'uh', 'um', 'i see', 'i know', 'conversation part.',
  'subtitles by', 'translated by', 'transcribed by',
];
 
const MIN_WORDS = 1;
 
class AIBrain {
  constructor({ model, triggerName, systemPrompt }) {
    this.client       = new Groq({ apiKey: process.env.GROQ_API_KEY });
    this.model        = model || 'llama-3.3-70b-versatile';
    this.triggerName  = (triggerName || 'Alex').toLowerCase();
    this.history      = [];
    this.systemPrompt = systemPrompt || this._loadSystemPrompt(triggerName || 'Alex');
  }
 
  async process(transcript, speakerName) {
    const cleaned = transcript.trim();
 
    // ── Pre-flight filters ────────────────────────────────────────
    if (cleaned.split(' ').length < MIN_WORDS) {
      console.log(`[AIBrain] Ignored (too short): "${cleaned}"`);
      return null;
    }
 
    if (WHISPER_HALLUCINATIONS.includes(cleaned.toLowerCase())) {
      console.log(`[AIBrain] Ignored (hallucination): "${cleaned}"`);
      return null;
    }
 
    // Duplicate check — Whisper sometimes repeats the same line
    // const last = this.history[this.history.length - 1];
    // if (last && last.content.includes(cleaned)) {
    //   console.log(`[AIBrain] Ignored (duplicate): "${cleaned}"`);
    //   return null;
    // }
 
    if (!this._shouldSpeak(cleaned)) {
      console.log(`[AIBrain] No trigger in: "${cleaned}"`);
      return null;
    }
 
    this.history.push({ role: 'user', content: `${speakerName}: ${cleaned}` });
    if (this.history.length > 20) this.history = this.history.slice(-20);
 
    try {
      const response = await this.client.chat.completions.create({
        model:      this.model,
        max_tokens: 300,
        messages: [
          { role: 'system', content: this.systemPrompt },
          ...this.history,
        ],
      });
 
      const raw = response.choices[0].message.content.trim();
      console.log(`[AIBrain] Raw: "${raw}"`);
      return this._parse(raw);
 
    } catch (err) {
      console.error('[AIBrain] LLM call failed:', err.message);
      return null;
    }
  }
 
  _shouldSpeak(transcript) {
    const lower = transcript.toLowerCase().trim();
 
    // Name trigger
    if (lower.includes(this.triggerName)) return true;
 
    // Question directed at no one — Alex can answer
    if (lower.endsWith('?')) return true;
 
    // Grammar issue detected
    if (this._hasGrammarIssue(lower)) return true;
 
    return false;
  }
 
  _hasGrammarIssue(text) {
    const patterns = [
      /\bi are\b|\byou is\b|\bhe are\b|\bshe are\b|\bthey is\b/,
      /\byesterday i go\b|\byesterday i come\b|\byesterday i eat\b/,
      /\bmore better\b|\bmore faster\b|\bmore easier\b/,
      /\bsince \d+ years\b|\bsince \d+ months\b/,
    ];
    return patterns.some(p => p.test(text));
  }
 
  _parse(raw) {
    if (raw.toUpperCase().trim() === 'SILENT') return null;
    const speakMatch   = raw.match(/SPEAK:\s*(.+?)(?=CORRECT:|$)/s);
    const correctMatch = raw.match(/CORRECT:\s*(.+)/s);
    return {
      text:       speakMatch   ? speakMatch[1].trim() : raw,
      correction: correctMatch ? correctMatch[1].trim() : null,
    };
  }

  _loadSystemPrompt(name) {
    const content = this._readPromptFile();
    if (content) {
      return content.replace(/{{BOT_NAME}}/g, name);
    }
    return this._defaultPrompt(name);
  }

  _readPromptFile() {
    try {
      return fs.readFileSync(DEFAULT_PROMPT_PATH, 'utf8');
    } catch (err) {
      console.warn('[AIBrain] Could not read default prompt file:', err.message);
      return null;
    }
  }

  _defaultPrompt(name) {
    return `You are ${name}, an AI English conversation partner in a small online English lesson.
 
Personality: direct, warm, concise. Speak like a native friend, not a teacher.
 
Your jobs:
1. Respond directly and clearly when someone calls your name
2. Gently correct grammar mistakes when you spot them

Rules:
- NEVER ask questions back
- NEVER say filler like "Great question!" or "Of course!"
- Maximum 1 sentence per response
- Be specific — if asked an opinion, give one clearly
- If asked "can you hear me", confirm and invite them to speak
 
Response format:
SPEAK: <exactly 1 sentence, direct and natural>
CORRECT: <only if grammar issue found, e.g: "It should be 'I went' not 'I go yesterday'">
 
Omit CORRECT if no grammar issue.
Reply SILENT if your name was not mentioned and there is no grammar issue.`;
  }
}
 
module.exports = { AIBrain };