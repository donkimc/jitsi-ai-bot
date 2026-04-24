# Jitsi AI English Tutor Bot

An AI participant that joins your Jitsi English learning session,
joins the conversation when called, and gently corrects grammar.

## Project structure

```
jitsi-ai-bot/
├── src/
│   ├── bot.js            ← Entry point, wires everything together
│   ├── jitsi-client.js   ← Joins Jitsi room via headless Chrome
│   ├── audio-pipeline.js ← STT (transcription) + TTS (voice)
│   └── ai-brain.js       ← LLM logic, trigger detection, grammar correction
├── config/
│   └── config.js         ← All settings in one place
├── .env.example          ← Copy to .env and fill in your keys
└── package.json
```

## Quick start

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
# Edit .env and add your API keys
```

You need at minimum:
- `GROQ_API_KEY` — from console.groq.com (for LLM and Whisper STT)

### 3. Start the bot

```bash
npm start
```

The bot will:
1. Launch a headless Chrome browser
2. Join your Jitsi room as "Alex (AI Tutor)"
3. Greet participants with a spoken welcome
4. Listen and respond when called by name or when it detects grammar issues

## Trigger modes

| Trigger | How to activate |
|---|---|
| Name call | Say "Alex, what do you think?" |
| Question | Ask a question — bot may chime in |
| Grammar | Use an incorrect expression — bot corrects gently |

## Customisation

### Change the bot's name or personality
Edit `BOT_NAME` and `BOT_TRIGGER` in `.env`.
Or edit the `DEFAULT_SYSTEM_PROMPT` function in `src/ai-brain.js`.

### STT & TTS providers
- **STT**: Uses Groq Whisper API (`whisper-large-v3-turbo`) — configured in `config/config.js`
- **TTS**: Uses browser Web Speech API — no additional API key needed, runs locally in Puppeteer

## Estimated cost per 1-hour session

| Service | Cost |
|---|---|
| Groq Whisper STT | ~$0.10 |
| Groq Llama 3.1 70B (LLM) | ~$0.05 |
| Browser Web Speech API (TTS) | Free |
| **Total** | **~$0.15** |

## Next steps (Step 2 & 3)

- Step 2: Improve audio capture using `AudioWorklet` inside the Puppeteer page
- Step 3: Add a simple web dashboard to control the bot (start/stop, see transcripts)
