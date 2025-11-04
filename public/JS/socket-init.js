// socket-init.js
// Initializes window.chatConfig and window.socket and handles basic socket lifecycle.
// Must be loaded first (defer) so other scripts can use window.chatHelpers

(function(){
  // Parse server-provided config
  const cfgEl = document.getElementById('chat-config');
  if (!cfgEl) {
    console.error('chat-config not found!');
    window.chatConfig = {};
  } else {
    try {
      window.chatConfig = JSON.parse(cfgEl.textContent || '{}');
    } catch (err) {
      console.error('Failed to parse chat-config', err);
      window.chatConfig = {};
    }
  }

  // fallback to query param for roomId if server didn't include it
  const urlParams = new URLSearchParams(window.location.search || '');
  if (!window.chatConfig.roomId) {
    window.chatConfig.roomId = urlParams.get('roomId');
  }
  // convenience
  const cfg = window.chatConfig || {};

  // init socket (socket.io client must already be loaded)
  window.socket = io({
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1000
  });

  // Join room on connect
  window.socket.on('connect', () => {
    try {
      if (cfg.senderId && cfg.roomId) {
        window.socket.emit('joinRoom', { userId: cfg.senderId, roomId: cfg.roomId });
      }
    } catch (err) {
      console.error('joinRoom emit failed', err);
    }
  });

  window.socket.on('disconnect', () => {
    console.warn('socket disconnected — will try to rejoin automatically');
    // attempt to re-join after short delay
    setTimeout(() => {
      if (cfg.senderId && cfg.roomId && window.socket && window.socket.connected) {
        window.socket.emit('joinRoom', { userId: cfg.senderId, roomId: cfg.roomId });
      }
    }, 1000);
  });

  window.socket.on('reconnect', (attemptNumber) => {
    console.log('socket reconnected after', attemptNumber, 'attempt(s)');
    if (cfg.senderId && cfg.roomId) {
      window.socket.emit('joinRoom', { userId: cfg.senderId, roomId: cfg.roomId });
    }
  });

  window.socket.on('connect_error', (err) => {
    console.error('Connection Error:', err && err.message ? err.message : err);
  });
  
  const receiverId = cfg.receiverId;
 function checkReceiverStatus() {
                socket.emit('getStatus', receiverId, (status) => {
                    // Update the status dynamically on the frontend
                    const statusElement = document.getElementById('status');
                    if (status === 'online') {
                        statusElement.innerText = 'Online';
                        statusElement.style.color = 'red';
                    } else {
                        statusElement.innerText = 'Offline';
                        statusElement.style.color = 'black';
                    }
                });
            }

            // Call the status check every 5 seconds
            setInterval(checkReceiverStatus, 500);
  // export helpers
  window.chatHelpers = { cfg: window.chatConfig, socket: window.socket };
})();
