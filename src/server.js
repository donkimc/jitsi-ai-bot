const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const config = require('../config/config');
const { createBotSession } = require('./bot-session');

const publicDir = path.resolve(__dirname, '..', 'public');
const port = Number(process.env.PORT || 3000);

let activeSession = null;
let sessionState = {
  status: 'idle',
  roomName: null,
  message: 'Ready to join a Jitsi room.',
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      sendJson(res, 500, { error: 'Could not load page asset.' });
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
}

function sanitizeRoomName(value) {
  const cleaned = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_ ]/g, '')
    .replace(/\s+/g, '-');

  return cleaned.slice(0, 80);
}

function getPublicState() {
  return {
    ...sessionState,
    serverURL: config.jitsi.serverURL,
  };
}

async function joinRoom(roomName) {
  const normalizedRoom = sanitizeRoomName(roomName);

  if (!normalizedRoom) {
    return { ok: false, statusCode: 400, message: 'Enter a valid Jitsi room name.' };
  }

  if (activeSession) {
    return {
      ok: false,
      statusCode: 409,
      message: `Already connected to "${sessionState.roomName}". Leave the current room first.`,
    };
  }

  sessionState = {
    status: 'connecting',
    roomName: normalizedRoom,
    message: `Joining ${normalizedRoom}...`,
  };

  const session = createBotSession({ roomName: normalizedRoom });
  activeSession = session;

  try {
    await session.start();
    sessionState = {
      status: 'connected',
      roomName: normalizedRoom,
      message: `Connected to ${normalizedRoom}.`,
    };
    return { ok: true, statusCode: 200, message: sessionState.message };
  } catch (error) {
    activeSession = null;
    sessionState = {
      status: 'error',
      roomName: normalizedRoom,
      message: error.message || 'Could not join the Jitsi room.',
    };
    return { ok: false, statusCode: 500, message: sessionState.message };
  }
}

async function leaveRoom() {
  if (!activeSession) {
    sessionState = {
      status: 'idle',
      roomName: null,
      message: 'No active room to leave.',
    };
    return { ok: true, statusCode: 200, message: sessionState.message };
  }

  try {
    await activeSession.stop();
    activeSession = null;
    sessionState = {
      status: 'idle',
      roomName: null,
      message: 'Left the Jitsi room.',
    };
    return { ok: true, statusCode: 200, message: sessionState.message };
  } catch (error) {
    sessionState = {
      status: 'error',
      roomName: sessionState.roomName,
      message: error.message || 'Could not leave the Jitsi room cleanly.',
    };
    return { ok: false, statusCode: 500, message: sessionState.message };
  }
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error('Request body too large.'));
      }
    });

    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Request body must be valid JSON.'));
      }
    });

    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/') {
    sendFile(res, path.join(publicDir, 'index.html'), 'text/html; charset=utf-8');
    return;
  }

  if (req.method === 'GET' && url.pathname === '/styles.css') {
    sendFile(res, path.join(publicDir, 'styles.css'), 'text/css; charset=utf-8');
    return;
  }

  if (req.method === 'GET' && url.pathname === '/app.js') {
    sendFile(res, path.join(publicDir, 'app.js'), 'application/javascript; charset=utf-8');
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/status') {
    sendJson(res, 200, getPublicState());
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/join') {
    try {
      const body = await readRequestBody(req);
      const result = await joinRoom(body.roomName);
      sendJson(res, result.statusCode, {
        ...getPublicState(),
        ok: result.ok,
        message: result.message,
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/leave') {
    const result = await leaveRoom();
    sendJson(res, result.statusCode, {
      ...getPublicState(),
      ok: result.ok,
      message: result.message,
    });
    return;
  }

  sendJson(res, 404, { error: 'Not found.' });
});

server.listen(port, () => {
  console.log(`[Web] Dashboard ready at http://localhost:${port}`);
});
