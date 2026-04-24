const form = document.getElementById('join-form');
const roomInput = document.getElementById('room-name');
const joinButton = document.getElementById('join-button');
const leaveButton = document.getElementById('leave-button');
const statusBadge = document.getElementById('status-badge');
const sessionMessage = document.getElementById('session-message');
const activeRoom = document.getElementById('active-room');
const serverUrl = document.getElementById('server-url');

function updateUI(state) {
  const status = state.status || 'idle';
  statusBadge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  statusBadge.className = `badge ${status}`;
  sessionMessage.textContent = state.message || 'Ready to join a Jitsi room.';
  activeRoom.textContent = state.roomName ? state.roomName : 'No room connected yet.';
  serverUrl.textContent = state.serverURL || 'Unknown server';

  const isBusy = status === 'connecting';
  const hasActiveSession = status === 'connected' || status === 'connecting';

  joinButton.disabled = isBusy || hasActiveSession;
  leaveButton.disabled = !hasActiveSession;
  roomInput.disabled = isBusy || status === 'connected';
}

async function fetchState() {
  const response = await fetch('/api/status');
  const state = await response.json();
  updateUI(state);
}

async function postJson(url, payload = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const state = await response.json();
  updateUI(state);

  if (!response.ok) {
    throw new Error(state.message || state.error || 'Request failed.');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const roomName = roomInput.value.trim();

  if (!roomName) {
    sessionMessage.textContent = 'Enter a room name first.';
    return;
  }

  updateUI({
    status: 'connecting',
    roomName,
    message: `Joining ${roomName}...`,
    serverURL: serverUrl.textContent,
  });

  try {
    await postJson('/api/join', { roomName });
  } catch (error) {
    sessionMessage.textContent = error.message;
  }
});

leaveButton.addEventListener('click', async () => {
  try {
    await postJson('/api/leave');
  } catch (error) {
    sessionMessage.textContent = error.message;
  }
});

fetchState().catch(() => {
  sessionMessage.textContent = 'Could not load the current bot status.';
});
