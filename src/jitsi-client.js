/**
 * JitsiMeetBot — Joins Jitsi via headless Chrome (Puppeteer)
 *
 * Audio: SpeechRecognition for input, SpeechSynthesis for output.
 * Echo prevention: recognition is aborted while speaking and restarted
 * only after a delay, ensuring Alex never hears herself.
 */

const puppeteer    = require('puppeteer');
const EventEmitter = require('events');

class JitsiMeetBot extends EventEmitter {
  constructor({ roomName, serverURL, displayName }) {
    super();
    this.roomName    = roomName;
    this.serverURL   = serverURL;
    this.displayName = displayName;
    this.browser     = null;
    this.page        = null;
  }

  async connect() {
    console.log('[Jitsi] Launching headless browser...');

    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--use-fake-ui-for-media-stream',
        '--use-file-for-fake-audio-capture=/dev/null',
        '--allow-running-insecure-content',
        '--disable-web-security',
        '--disable-features=WebRtcHideLocalIpsWithMdns',
        '--audio-output-channels=2',
      ],
    });

    this.page = await this.browser.newPage();

    this.page.on('console', msg => {
      const text = msg.text();
      if (text.startsWith('[bot]')) console.log('[Page]', text);
    });

    await this.page.exposeFunction('__sendTranscript', async (speakerName, transcript) => {
      console.log(`[STT] ${speakerName}: "${transcript}"`);
      this.emit('audioReceived', transcript, speakerName);
    });

    await this.page.evaluateOnNewDocument(AUDIO_BRIDGE_SCRIPT);

    const url = `${this.serverURL}/${this.roomName}` +
      `#config.startWithAudioMuted=true` +
      `&config.startWithVideoMuted=true` +
      `&config.stereo=true` +
      `&userInfo.displayName="${this.displayName}"`;

    console.log(`[Jitsi] Navigating to: ${url}`);
    await this.page.goto(url, { waitUntil: 'networkidle2' });

    await this.page.waitForFunction(
      () => typeof window.JitsiMeetJS !== 'undefined',
      { timeout: 30000 }
    );

    await this.page.screenshot({ path: 'debug-prejoin.png' });

    // Click join button
    let joined = false;
    const joinSelectors = [
      '[data-testid="prejoin.joinMeeting"]',
      '[data-testid="prejoin-join-button"]',
      '[data-testid="join-meeting"]',
    ];
    for (const sel of joinSelectors) {
      try {
        await this.page.waitForSelector(sel, { timeout: 4000 });
        await this.page.click(sel);
        console.log(`[Jitsi] Clicked join button: ${sel}`);
        joined = true;
        break;
      } catch (_) {}
    }
    if (!joined) {
      const clicked = await this.page.evaluate(() => {
        const el = Array.from(document.querySelectorAll('button, div[role=button], div'))
          .find(e => e.innerText.trim().toLowerCase() === 'join meeting');
        if (el) { el.click(); return true; }
        return false;
      });
      if (clicked) { console.log('[Jitsi] Clicked join by text'); }
    }

    try {
      await this.page.waitForFunction(
        () => document.querySelector('.new-toolbox')     !== null ||
              document.querySelector('#new-toolbox')     !== null ||
              document.querySelector('.toolbox-content') !== null,
        { timeout: 30000 }
      );
      console.log('[Jitsi] Inside the meeting room!');
    } catch (e) {
      console.log('[Jitsi] Could not confirm join — continuing anyway');
      await this.page.screenshot({ path: 'debug-inside.png' });
    }

    await this.page.evaluate(() => window.__botStartCapture());
    this.emit('connected');
  }

  async speak(text) {
    if (!text || !this.page) return;
    console.log(`[Jitsi] Alex will say: "${text}"`);
    await this.page.evaluate((t) => window.__botSpeak(t), text);
  }

  async disconnect() {
    if (this.page) {
      try {
        await this.page.evaluate(() => {
          const btn =
            document.querySelector('[data-testid="toolbar-button-hangup"]') ||
            Array.from(document.querySelectorAll('button'))
              .find(b => b.title && b.title.toLowerCase().includes('hang'));
          if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 2000));
      } catch (_) {}
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page    = null;
    }
  }
}

// ─── Audio bridge (runs inside Chrome page) ───────────────────────────────────
const AUDIO_BRIDGE_SCRIPT = `
(function() {
  let recognition      = null;
  let isSpeaking       = false;
  let restartTimer     = null;
  let pendingTranscript = '';
  let pendingTimer     = null;

  // How long to wait after speech ends before listening again.
  // This is reduced to improve responsiveness while still avoiding speech tail pickup.
  const RESTART_DELAY_MS = 1200;
  const SILENCE_WAIT_MS = 700;

  // ── Start / restart recognition ───────────────────────────────────
  function startRecognition() {
    if (isSpeaking) return;          // never start while speaking
    if (recognition) {
      try { recognition.abort(); } catch(_) {}
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { console.log('[bot] SpeechRecognition not available'); return; }

    recognition = new SR();
    recognition.continuous      = true;  // keep listening across longer participant turns
    recognition.interimResults  = true;  // wait for a short silence before sending transcript
    recognition.lang            = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => console.log('[bot] Listening...');

    recognition.onresult = (event) => {
      if (isSpeaking) return;  // safety: ignore if somehow fired during speech
      const result     = event.results[event.results.length - 1];
      const transcript = result[0].transcript.trim();
      const confidence = result[0].confidence;

      console.log('[bot] Heard: ' + transcript + ' (' + confidence.toFixed(2) + ')');

      if (confidence < 0.6) {
        console.log('[bot] Low confidence — ignored');
        return;
      }

      // Accumulate successive results into one transcript and wait for a short silence.
      if (transcript) {
        pendingTranscript = pendingTranscript
          ? pendingTranscript + ' ' + transcript
          : transcript;

        clearTimeout(pendingTimer);
        pendingTimer = setTimeout(() => {
          if (pendingTranscript) {
            window.__sendTranscript('participant', pendingTranscript.trim());
            pendingTranscript = '';
          }
        }, SILENCE_WAIT_MS);
      }
    };

    recognition.onerror = (e) => {
      if (e.error === 'aborted' || e.error === 'no-speech') return; // expected
      console.log('[bot] Recognition error: ' + e.error);
    };

    recognition.onend = () => {
      if (isSpeaking) return; // don't restart — speak handler will restart
      // Restart immediately for next utterance
      setTimeout(startRecognition, 300);
    };

    try {
      recognition.start();
    } catch(e) {
      console.log('[bot] Could not start recognition: ' + e.message);
    }
  }

  // ── Speak via Web Speech API ───────────────────────────────────────
  window.__botSpeak = function(text) {
    if (!text) return;

    // 1. Stop listening IMMEDIATELY before speaking
    isSpeaking = true;
    clearTimeout(restartTimer);
    clearTimeout(pendingTimer);
    pendingTranscript = '';
    if (recognition) {
      try { recognition.abort(); } catch(_) {}
      recognition = null;
    }

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang  = 'en-US';
    utter.rate  = 0.92;
    utter.pitch = 1.05;

    function doSpeak() {
      const voices    = speechSynthesis.getVoices();
      const preferred = voices.find(v =>
        v.name === 'Samantha' ||
        v.name === 'Alex' ||
        v.name.includes('Google US English') ||
        (v.lang === 'en-US' && v.localService)
      );
      if (preferred) utter.voice = preferred;

      utter.onend = () => {
        console.log('[bot] Done speaking');
        // 2. Wait RESTART_DELAY_MS before listening again
        //    This gap prevents mic from catching audio reverb/tail
        restartTimer = setTimeout(() => {
          isSpeaking = false;
          startRecognition();
          console.log('[bot] Resumed listening');
        }, RESTART_DELAY_MS);
      };

      utter.onerror = () => {
        isSpeaking = false;
        restartTimer = setTimeout(startRecognition, RESTART_DELAY_MS);
      };

      speechSynthesis.cancel(); // clear any queued speech
      speechSynthesis.speak(utter);
      console.log('[bot] Speaking: ' + text.slice(0, 80));
    }

    if (speechSynthesis.getVoices().length > 0) {
      doSpeak();
    } else {
      speechSynthesis.onvoiceschanged = doSpeak;
    }
  };

  // ── Boot ──────────────────────────────────────────────────────────
  window.__botStartCapture = function() {
    console.log('[bot] Audio bridge starting...');
    setTimeout(startRecognition, 2000); // short delay for Jitsi to settle
  };

  window.__botIsSpeaking = false;
  console.log('[bot] Audio bridge initialized');
})();
`;

module.exports = { JitsiMeetBot };