// messages.js
// encryption, IDB, file upload/download, queueing, send/receive handlers

(async function(){
  const helpers = window.chatHelpers || {};
  const cfg = helpers.cfg || {};
  const socket = helpers.socket || window.socket;
  const urlParams = new URLSearchParams(window.location.search || '');
  const roomId = cfg.roomId || urlParams.get('roomId');
  const senderId = cfg.senderId;
  const receiverId = cfg.receiverId;
  const receiverPublicKey = cfg.receiverPublicKey || null;
let globalMessageCount = 0;
  // -------------------------
  // IndexedDB: init
  // -------------------------

  function initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("ChatDB", 1);
      request.onupgradeneeded = function(event) {
        const idb = event.target.result;
        if (!idb.objectStoreNames.contains("rooms")) {
          const rooms = idb.createObjectStore("rooms", { keyPath: "roomId" });
        }
        if (!idb.objectStoreNames.contains("messages")) {
          const msgs = idb.createObjectStore("messages", { keyPath: "id", autoIncrement: true });
          msgs.createIndex("roomId", "roomId", { unique: false });
          msgs.createIndex("fileId", "fileId", { unique: false });
        }
        if (!idb.objectStoreNames.contains("outgoingMessages")) {
          const q = idb.createObjectStore("outgoingMessages", { keyPath: "timestamp" });
          q.createIndex("roomId", "roomId", { unique: false });
        }
      };
      request.onsuccess = function() {
        db = request.result;
        resolve(db);
      };
      request.onerror = function(e) {
        reject(e);
      };
    });
  }

  function addRoom(roomIdLocal, disappearingTimer = null) {
    if (!db) return;
    const transaction = db.transaction("rooms", "readwrite");
    const store = transaction.objectStore("rooms");
    store.get(roomIdLocal).onsuccess = (event) => {
      if (!event.target.result) {
        store.add({
          roomId: roomIdLocal,
          receiverName: cfg.receiverName,
          receiverId: cfg.receiverId,
          receiverProfilePhoto: cfg.receiverProfilePhoto,
          disappearingTimer
        });
      } else {
        const existingRoom = event.target.result;
        existingRoom.disappearingTimer = disappearingTimer;
        store.put(existingRoom);
      }
    };
  }

  function saveKeyToDB(key, roomIdLocal) {
    if (!db) return;
    const transaction = db.transaction("rooms", "readwrite");
    const store = transaction.objectStore("rooms");
    store.put({ roomId: roomIdLocal, aesKey: key, timestamp: Date.now(), receiverName: cfg.receiverName, receiverId: cfg.receiverId, receiverProfilePhoto: cfg.receiverProfilePhoto });
  }

  function loadKeyFromDB(roomIdLocal) {
    return new Promise((resolve, reject) => {
      if (!db) return reject('DB not initialized');
      const transaction = db.transaction("rooms", "readonly");
      const store = transaction.objectStore("rooms");
      const request = store.get(roomIdLocal);
      request.onsuccess = (event) => {
        const room = event.target.result;
        if (room && Date.now() - room.timestamp < 24 * 60 * 60 * 1000) {
          resolve(room.aesKey);
        } else {
          reject("Key expired");
        }
      };
      request.onerror = () => reject("loadKey error");
    });
  }

  // -------------------------
  // Queue DB (background sync)
  // -------------------------
  async function openQueueDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("ChatQueueDB", 1);
      request.onupgradeneeded = (event) => {
        const dbq = event.target.result;
        if (!dbq.objectStoreNames.contains("outgoingMessages")) {
          const store = dbq.createObjectStore("outgoingMessages", { keyPath: "timestamp" });
          store.createIndex("roomId", "roomId", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function addMessageToQueue(msgObj) {
    const qdb = await openQueueDB();
    const tx = qdb.transaction("outgoingMessages", "readwrite");
    tx.objectStore("outgoingMessages").put(msgObj);
    // Try to register background sync if possible
    if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(reg => {
        try {
          reg.sync.register('sendQueuedMessages').then(() => {
            console.log("✅ Background Sync registered");
          }).catch(err => console.error("SW sync register failed", err));
        } catch (e) {
          // some browsers disallow sync.register without HTTPS etc.
        }
      });
    }
    return tx.complete;
  }

  async function getAllQueuedMessages() {
    const qdb = await openQueueDB();
    return new Promise((resolve) => {
      const tx = qdb.transaction("outgoingMessages", "readonly");
      const store = tx.objectStore("outgoingMessages");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result.sort((a,b) => a.timestamp - b.timestamp));
    });
  }

  async function deleteMessageFromQueue(timestamp) {
    const qdb = await openQueueDB();
    const tx = qdb.transaction("outgoingMessages", "readwrite");
    tx.objectStore("outgoingMessages").delete(timestamp);
    return tx.complete;
  }

  async function flushMessageQueue() {
    const queuedMessages = await getAllQueuedMessages();
    for (const msg of queuedMessages) {
      try {
        if (msg.type === "direct") {
          await sendMessageDirectly(msg.roomId, msg.senderId, msg.receiverId, msg.encryptedMessage, msg.timestamp, msg.iv);
        } else if (msg.type === "rsa") {
          await sendMessageWithRSA(msg.roomId, msg.senderId, msg.receiverId, msg.encryptedMessage, msg.encryptedAESKey, msg.timestamp, msg.iv);
        }
        await deleteMessageFromQueue(msg.timestamp);
      } catch (err) {
        console.error("Retry failed for queued message:", err);
      }
    }
  }

  // -------------------------
  // Crypto helpers
  // -------------------------
  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function base64ToArrayBuffer(base64) {
    const binary_string = atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
  }

  async function generateAESKey() {
    // generate AES-GCM 256-bit and export as base64
    const key = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const exported = await window.crypto.subtle.exportKey("raw", key);
    return arrayBufferToBase64(exported);
  }

  async function encryptMessage(message, aesKeyBase64) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(message);
    const keyBuffer = base64ToArrayBuffer(aesKeyBase64);
    const cryptoKey = await window.crypto.subtle.importKey("raw", keyBuffer, { name: "AES-GCM" }, false, ["encrypt"]);
    const encrypted = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, encoded);
    return { encryptedMessage: arrayBufferToBase64(encrypted), iv: arrayBufferToBase64(iv.buffer) };
  }

  async function decryptMessage(encryptedMessageBase64, ivBase64, aesKeyBase64) {
    try {
      const iv = new Uint8Array(base64ToArrayBuffer(ivBase64));
      const encryptedBuf = base64ToArrayBuffer(encryptedMessageBase64);
      const keyBuffer = base64ToArrayBuffer(aesKeyBase64);
      const cryptoKey = await window.crypto.subtle.importKey("raw", keyBuffer, { name: "AES-GCM" }, false, ["decrypt"]);
      const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, encryptedBuf);
      return new TextDecoder().decode(decrypted);
    } catch (err) {
      throw err;
    }
  }

  // encryption for file + text
  async function encryptFileAndText(file, messageText, aesKeyBase64) {
    // compress if image
    try {
      if (file && file.type && file.type.startsWith("image/") && typeof imageCompression === 'function') {
        try {
          file = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1280, initialQuality: 0.7, useWebWorker: true });
        } catch (err) {
          console.warn("Image compression failed, proceeding with original file", err);
        }
      }
    } catch (e) {
      /* ignore */
    }

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const keyBuffer = base64ToArrayBuffer(aesKeyBase64);
    const cryptoKey = await window.crypto.subtle.importKey("raw", keyBuffer, { name: "AES-GCM" }, false, ["encrypt"]);

    let encryptedFile = null;
    if (file) {
      const fileBuffer = await file.arrayBuffer();
      const encryptedFileBuffer = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, fileBuffer);
      encryptedFile = arrayBufferToBase64(encryptedFileBuffer);
    }

    let encryptedText = null;
    if (messageText) {
      const encodedMessage = new TextEncoder().encode(messageText);
      const encryptedTextBuffer = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, encodedMessage);
      encryptedText = arrayBufferToBase64(encryptedTextBuffer);
    }

    return { encryptedFile, encryptedText, iv: arrayBufferToBase64(iv.buffer) };
  }

  // decrypt file + text
  async function decryptFileAndText(encryptedFileBase64, encryptedTextBase64 = null, ivBase64, aesKeyBase64) {
    try {
      const keyBuffer = base64ToArrayBuffer(aesKeyBase64);
      const iv = new Uint8Array(base64ToArrayBuffer(ivBase64));
      const cryptoKey = await window.crypto.subtle.importKey("raw", keyBuffer, { name: "AES-GCM" }, false, ["decrypt"]);

      let decryptedText = null;
      if (encryptedTextBase64) {
        const encryptedTextBytes = base64ToArrayBuffer(encryptedTextBase64);
        const decryptedTextBuffer = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, encryptedTextBytes);
        decryptedText = new TextDecoder().decode(decryptedTextBuffer);
      }

      let decryptedFileBlob = null;
      if (encryptedFileBase64) {
        const byteCharacters = atob(encryptedFileBase64);
        const byteArrays = [];
        for (let i = 0; i < byteCharacters.length; i += 512) {
          const slice = byteCharacters.slice(i, i + 512);
          const byteNumbers = new Array(slice.length);
          for (let j = 0; j < slice.length; j++) {
            byteNumbers[j] = slice.charCodeAt(j);
          }
          byteArrays.push(new Uint8Array(byteNumbers));
        }
        const encryptedBlob = new Blob(byteArrays);
        const encryptedBuffer = await encryptedBlob.arrayBuffer();

        const decryptedBuffer = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, encryptedBuffer);
        decryptedFileBlob = new Blob([decryptedBuffer]);
      }

      return { decryptedText, decryptedFileBlob };
    } catch (err) {
      console.error('[decrypt] Error during decryption:', err);
      throw err;
    }
  }

  // PEM -> ArrayBuffer helper used for RSA-based flows
  function pemToArrayBuffer(pem) {
    const cleanPem = pem.replace(/-----BEGIN.*KEY-----|-----END.*KEY-----|\s/g, '').replace(/&#34;/g, '"').replace(/&#39;/g, "'").trim();
    const binary = atob(cleanPem);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  // -------------------------
  // backend RSA wrappers
  // -------------------------
  async function encryptAESKeyWithRSAOnBackend(aesKeyBase64, receiverIdLocal) {
    try {
      const res = await fetch('/encryptAESKey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aesKey: aesKeyBase64, receiverId: receiverIdLocal })
      });
      if (!res.ok) throw new Error('encryptAESKey failed');
      const data = await res.json();
      return data.encryptedAESKey;
    } catch (err) {
      console.error('encryptAESKeyWithRSAOnBackend error', err);
      throw err;
    }
  }

  async function decryptAESKeyWithRSA(encryptedAESKeyBase64, receiverIdLocal) {
    try {
      const response = await fetch('/decryptAESKey', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ encryptedAESKey: encryptedAESKeyBase64, receiverId: receiverIdLocal }),
      });
      if (!response.ok) throw new Error('Failed to decrypt AES key');
      const { decryptedAESKey } = await response.json();
      return decryptedAESKey;
    } catch (err) {
      console.error('decryptAESKeyWithRSA error', err);
      throw err;
    }
  }

  async function saveKeyToMongoDBOnBackend(aesKeyBase64, roomIdLocal, senderIdLocal) {
    try {
      const response = await fetch('/saveKey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aesKey: aesKeyBase64, roomId: roomIdLocal, senderId: senderIdLocal }),
      });
      if (!response.ok) throw new Error('Failed to save AES key to backend');
    } catch (err) {
      console.error('saveKeyToMongoDBOnBackend', err);
    }
  }

  async function fetchKeyFromMongoDB(roomIdLocal, senderIdLocal) {
    try {
      const response = await fetch('/getKey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: roomIdLocal, senderId: senderIdLocal })
      });
      if (!response.ok) throw new Error('Failed to fetch AES key from backend');
      const data = await response.json();
      return data.aesKey;
    } catch (err) {
      console.error('fetchKeyFromMongoDB error', err);
      return null;
    }
  }

  // -------------------------
  // File upload helper
  // -------------------------
  async function uploadEncryptedFileToBackend(file, encryptedFileBase64, roomIdLocal, senderIdLocal) {
    const formData = new FormData();

    // convert base64 into blob
    const byteCharacters = atob(encryptedFileBase64);
    const byteArrays = [];
    for (let i = 0; i < byteCharacters.length; i += 512) {
      const slice = byteCharacters.slice(i, i + 512);
      const byteNumbers = new Array(slice.length);
      for (let j = 0; j < slice.length; j++) {
        byteNumbers[j] = slice.charCodeAt(j);
      }
      byteArrays.push(new Uint8Array(byteNumbers));
    }
    const encryptedBlob = new Blob(byteArrays, { type: file.type });

    formData.append('file', encryptedBlob, file.name);
    formData.append('roomId', roomIdLocal);
    formData.append('senderId', senderIdLocal);

    const res = await fetch('/upload', { method: 'POST', body: formData });
    if (!res.ok) throw new Error('File upload failed');
    const data = await res.json();
    return data.fileId;
  }

  // -------------------------
  // Message DB ops (messages object store)
  // -------------------------
  function saveMessage(roomIdLocal, senderIdLocal, messageText, timestamp) {
    if (!db) return;
    addRoom(roomIdLocal);
    const tx = db.transaction("messages", "readwrite");
    const store = tx.objectStore("messages");
    store.add({ roomId: roomIdLocal, senderId: senderIdLocal, messageText, timestamp });
  }

  function saveFileMetadata(roomIdLocal, senderIdLocal, fileId, fileName, fileType, messageText, timestamp, preview) {
    if (!db) return;
    addRoom(roomIdLocal);
    const tx = db.transaction("messages", "readwrite");
    const store = tx.objectStore("messages");
    store.add({ roomId: roomIdLocal, senderId: senderIdLocal, messageText: messageText || null, timestamp, fileName, fileType, fileId, preview, fileContent: null });
  }

  function saveFileMessage(roomIdLocal, senderIdLocal, fileOrMeta, messageText, timestamp, preview = null, isMetadataOnly = false, iv) {
    return new Promise((resolve, reject) => {
      addRoom(roomIdLocal);
      const tx = db.transaction("messages", "readwrite");
      const store = tx.objectStore("messages");

      if (isMetadataOnly) {
        const request = store.add({
          roomId: roomIdLocal,
          senderId: senderIdLocal,
          messageText: messageText || null,
          timestamp,
          fileName: fileOrMeta.fileName,
          fileType: fileOrMeta.fileType,
          fileId: fileOrMeta.fileId,
          preview,
          iv,
          fileContent: null
        });
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
      } else {
        const reader = new FileReader();
reader.onload = function() {
  const base64File = reader.result;

  const tx2 = db.transaction("messages", "readwrite");
  const store2 = tx2.objectStore("messages");

  const getRequest = store2.index("fileId").get(fileOrMeta.fileId);
  getRequest.onsuccess = function(e) {
    const existing = e.target.result;
    if (existing) {
      const updated = Object.assign({}, existing, { preview: null, fileContent: base64File, iv });
      const updateReq = store2.put(updated);
      updateReq.onsuccess = () => resolve();
      updateReq.onerror = (ev) => reject(ev.target.error);
    } else {
      const addReq = store2.add({
        roomId: roomIdLocal,
        senderId: senderIdLocal,
        messageText: messageText || null,
        timestamp,
        fileName: fileOrMeta.name || fileOrMeta.fileName,
        fileType: fileOrMeta.type || fileOrMeta.fileType,
        fileContent: base64File,
        fileId: fileOrMeta.fileId || null,
        iv
      });
      addReq.onsuccess = () => resolve();
      addReq.onerror = (ev) => reject(ev.target.error);
    }
  };
  getRequest.onerror = (e) => reject(e.target.error);
};
reader.onerror = (e) => reject(e.target.error);
reader.readAsDataURL(fileOrMeta.file || fileOrMeta);
}
    });
  }

  async function getFileBlobFromDB(roomIdLocal, timestamp) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("messages", "readonly");
      const store = tx.objectStore("messages");
      const index = store.index("roomId");
      const request = index.getAll(IDBKeyRange.only(roomIdLocal));
      request.onsuccess = function() {
        const result = request.result.find(msg => msg.timestamp === timestamp && msg.fileContent);
        if (result) {
          const byteString = atob(result.fileContent.split(',')[1]);
          const mimeString = result.fileContent.split(',')[0].split(':')[1].split(';')[0];
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
          resolve(new Blob([ab], { type: mimeString }));
        } else {
          reject('File not found in DB');
        }
      };
      request.onerror = () => reject('Failed to fetch file from DB');
    });
  }

  async function getPreviewBlobFromDB(roomIdLocal, timestamp) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("messages", "readonly");
      const store = tx.objectStore("messages");
      const index = store.index("roomId");
      const request = index.getAll(IDBKeyRange.only(roomIdLocal));
      request.onsuccess = function() {
        const result = request.result.find(msg => msg.timestamp === timestamp && msg.preview);
        if (result) {
          const byteString = atob(result.preview.split(',')[1]);
          const mimeString = result.preview.split(',')[0].split(':')[1].split(';')[0];
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
          resolve(new Blob([ab], { type: mimeString }));
        } else {
          reject('Preview not found in DB');
        }
      };
      request.onerror = () => reject('Failed to fetch preview from DB');
    });
  }

  // update message content when edited
async function updateMessageInDB(roomIdLocal, timestamp, encryptedMessage, iv) {
  try {
    // Step 1: decrypt before starting transaction
    const aesKey = await loadKeyFromDB(roomIdLocal);
    const newText = await decryptMessage(encryptedMessage, iv, aesKey);

    // Step 2: transaction open
    const tx = db.transaction("messages", "readwrite");
    const store = tx.objectStore("messages");
    const index = store.index("roomId");
    const request = index.openCursor(IDBKeyRange.only(roomIdLocal));

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if (cursor.value.timestamp == timestamp) {
          const updatedMsg = { ...cursor.value, messageText: newText, edited: true };
          const updateRequest = cursor.update(updatedMsg);

          updateRequest.onsuccess = () => {
            // ✅ Update UI instantly
            const msgElement = document.querySelector(`.message[data-message-id="${timestamp}"]`);
            if (msgElement) {
              const pTag = msgElement.querySelector("p");
              if (pTag) pTag.innerText = newText;

              let smallTag = msgElement.querySelector("small");
              if (!smallTag) {
                smallTag = document.createElement("small");
                msgElement.appendChild(smallTag);
              }
              smallTag.innerText = "(edited)";
              smallTag.style.fontSize = "10px";
              smallTag.style.marginLeft = "5px";
              smallTag.style.color = "#888";
            }
          };

          updateRequest.onerror = (e) => {
            console.error("Failed to update message:", e.target.error);
          };
        }
        cursor.continue();
      }
    };
  } catch (err) {
    console.error("updateMessageInDB error:", err);
  }
}



  function deleteMessageFromDB(roomIdLocal, timestamp) {
    const tx = db.transaction("messages", "readwrite");
    const store = tx.objectStore("messages");
    const index = store.index("roomId");
    const request = index.openCursor(IDBKeyRange.only(roomIdLocal));
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if (cursor.value.timestamp == timestamp) {
          const delReq = cursor.delete();
          delReq.onsuccess = () => {
            const msgEl = document.querySelector(`.message[data-message-id="${timestamp}"]`);
            if (msgEl) msgEl.remove();
          };
        }
        cursor.continue();
      }
    };
  }

  // -------------------------
  // File preview tiny
  // -------------------------
  function createBlurPreview(file) {
    return new Promise((resolve) => {
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = function(e) {
          const img = new Image();
          img.src = e.target.result;
          img.onload = function() {
            const canvas = document.createElement('canvas');
            canvas.width = 20; canvas.height = 20;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const tinyBase64 = canvas.toDataURL('image/jpeg', 0.6);
            resolve(tinyBase64);
          };
        };
        reader.readAsDataURL(file);
      } else if (file.type.startsWith("video/")) {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.src = URL.createObjectURL(file);
        video.muted = true;
        video.playsInline = true;
        video.onloadeddata = function() {
          const canvas = document.createElement('canvas');
          canvas.width = 20; canvas.height = 20;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const tinyBase64 = canvas.toDataURL('image/jpeg', 0.5);
          URL.revokeObjectURL(video.src);
          resolve(tinyBase64);
        };
        video.onerror = function() { resolve(null); };
      } else {
        resolve(null);
      }
    });
  }

  // -------------------------
  // Socket emit wrappers
  // -------------------------
  function sendMessageDirectly(roomIdLocal, senderIdLocal, receiverIdLocal, encryptedMessage, timestamp, iv) {
    socket.emit("sendMessageDirectly", { roomId: roomIdLocal, senderId: senderIdLocal, receiverId: receiverIdLocal, encryptedMessage, timestamp, iv });
  }

  function sendMessageWithRSA(roomIdLocal, senderIdLocal, receiverIdLocal, encryptedMessage, encryptedAESKey, timestamp, iv) {
    socket.emit("sendMessageWithRsa", { roomId: roomIdLocal, senderId: senderIdLocal, receiverId: receiverIdLocal, encryptedMessage, encryptedAESKey, timestamp, iv });
  }

  // queue-aware sends
  async function sendMessageWithQueueDirect(roomIdLocal, senderIdLocal, receiverIdLocal, timestamp, iv, encryptedMessage) {
    if (navigator.onLine) {
      try {
        sendMessageDirectly(roomIdLocal, senderIdLocal, receiverIdLocal, encryptedMessage, timestamp, iv);
      } catch (err) {
        console.error("Send failed (direct), queued instead:", err);
        await addMessageToQueue({ type: "direct", roomId: roomIdLocal, senderId: senderIdLocal, receiverId: receiverIdLocal, timestamp, iv, encryptedMessage });
      }
    } else {
      await addMessageToQueue({ type: "direct", roomId: roomIdLocal, senderId: senderIdLocal, receiverId: receiverIdLocal, timestamp, iv, encryptedMessage });
    }
  }

  async function sendMessageWithQueueRSA(roomIdLocal, senderIdLocal, receiverIdLocal, timestamp, iv, encryptedMessage, encryptedAESKey) {
    if (navigator.onLine) {
      try {
        sendMessageWithRSA(roomIdLocal, senderIdLocal, receiverIdLocal, encryptedMessage, encryptedAESKey, timestamp, iv);
      } catch (err) {
        console.error("Send failed (RSA), queued instead:", err);
        await addMessageToQueue({ type: "rsa", roomId: roomIdLocal, senderId: senderIdLocal, receiverId: receiverIdLocal, timestamp, iv, encryptedMessage, encryptedAESKey });
      }
    } else {
      await addMessageToQueue({ type: "rsa", roomId: roomIdLocal, senderId: senderIdLocal, receiverId: receiverIdLocal, timestamp, iv, encryptedMessage, encryptedAESKey });
    }
  }

  // -------------------------
  // Incoming socket handlers
  // -------------------------
  socket.on("receiveMessageWithRsa", async (data) => {
    try {
      const { senderId: sid, receiverId: rid, encryptedMessage, encryptedAESKey, iv, timestamp } = data;
      const decryptedAESKey = await decryptAESKeyWithRSA(encryptedAESKey, rid);
      await saveKeyToDB(decryptedAESKey, roomId);
      await saveKeyToMongoDBOnBackend(decryptedAESKey, roomId, rid);
      socket.emit('aesKeySaved');
      const messageText = await decryptMessage(encryptedMessage, iv, decryptedAESKey);
      await window.chatUI.displayMessage({ senderId: sid, messageText, timestamp });
      await saveMessage(roomId, sid, messageText, timestamp);
       globalMessageCount++;
  if (globalMessageCount % 8 === 0) {
    window.chatUI.displayAdMessage({
      adImageUrl: '/views/default-profile.png',
      adClickUrl: 'https://example.com'
    });
  }
    } catch (err) {
      console.error('Error in message decryption flow (RSA):', err);
    }
  });

  socket.on("receiveMessageDirectly", async (data) => {
    try {
      const { roomId: rId, senderId: sid, receiverId: rid, encryptedMessage, timestamp, iv } = data;
      const thisRoomId = roomId;
      let aesKey;
      try { aesKey = await loadKeyFromDB(rId); } catch(e) { /* fallback */ }
      if (!aesKey) {
        aesKey = await fetchKeyFromMongoDB(rId, sid);
        if (aesKey) await saveKeyToDB(aesKey, rId);
        else throw new Error("AES key missing");
      }
      const messageText = await decryptMessage(encryptedMessage, iv, aesKey);
      if (thisRoomId === rId) await window.chatUI.displayMessage({ senderId: sid, messageText, timestamp });
      await saveMessage(rId, sid, messageText, timestamp);
  // Ad display logic
    const lastAdTime = Number(sessionStorage.getItem('lastAdTimestamp')) || 0;
    const sessionAdCount = Number(sessionStorage.getItem('sessionAdCount')) || 0;
    const now = Date.now();
    const TEN_MINUTES = 10 * 1000;

    if ((now - lastAdTime >= TEN_MINUTES) && (sessionAdCount < 6)) {
        window.chatUI.displayAdMessage();
        sessionStorage.setItem('lastAdTimestamp', now);
        sessionStorage.setItem('sessionAdCount', sessionAdCount + 1);
    }
    } catch (err) {
      console.error("Error in message decryption process:", err);
    }
  });

  socket.on("receiveFile", async (data) => {
    try {
      const { senderId: sid, fileId, fileType, fileName, timestamp, messageText, preview, iv, roomId: rId } = data;
      const fileUrl = `/api/get-encrypted-file/${fileId}`;
      await saveFileMessage(rId, sid, { fileId, fileName, fileType }, messageText, timestamp, preview, true, iv);
      await window.chatUI.displayFileMessage({
        senderId: sid,
        fileUrl,
        fileType,
        fileName,
        timestamp,
        messageText,
        fileId,
        roomId: rId,
        status: 'received',
        iv,
        preview
      });



       globalMessageCount++;
  if (globalMessageCount % 8 === 0) {
    window.chatUI.displayAdMessage({
      adImageUrl: '/views/default-profile.png',
      adClickUrl: 'https://example.com'
    });
  }


    } catch (err) {
      console.error('receiveFile handler error', err);
    }
  });

  // file download tap handler (used in UI interactions)
  async function handleFileTap(fileId, fileName, fileType, roomIdLocal, senderIdLocal, messageText, timestamp, iv) {
    // Fetch encrypted file from backend
    // backend endpoint should return base64 encrypted content: { encryptedFileBase64 }
    try {
      const res = await fetch(`/api/get-encrypted-file/${fileId}`);
      console.log("fetching file")
    const encryptedFileBlob = await res.blob();
        const base64 = await blobToBase64(encryptedFileBlob);

      // get AES key
      let aesKey;
      try { aesKey = await loadKeyFromDB(roomIdLocal); } catch(e) {}
      if (!aesKey) {
        aesKey = await fetchKeyFromMongoDB(roomIdLocal, senderIdLocal);
        if (aesKey) await saveKeyToDB(aesKey, roomIdLocal);
      }
      if (!aesKey) throw new Error('AES key unavailable');

      const { decryptedFileBlob, decryptedText } = await decryptFileAndText(base64, null, iv, aesKey);
      // Save decryptedFileBlob to IndexedDB for future
      await saveFileMessage(roomIdLocal, senderIdLocal, { fileId, name: fileName, type: fileType, file: decryptedFileBlob }, messageText, timestamp, null, false, iv);
    } catch (err) {
      console.error('handleFileTap error', err);
    }
  }
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64data = reader.result.split(',')[1]; // Remove "data:*/*;base64,"
            resolve(base64data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
  // Expose these as part of window.chatMessages for potential debug/use
  window.chatMessages = {
    createBlurPreview,
    uploadEncryptedFileToBackend,
    encryptFileAndText,
    decryptFileAndText,
    saveFileMessage,
    saveMessage,
    handleFileTap,
    flushMessageQueue,
    getFileBlobFromDB,
    getPreviewBlobFromDB
  };

  // -------------------------
  // Outgoing send-button wiring & edit/cancel etc.
  // -------------------------
 let selectedFile = window.chatMessages.selectedFile || []; // file input selections handled externally or via preview UI
  let isSecretChat = false;
  let editingMessage = null;

  if (cfg.plan === "premium") {
    document.getElementById("vanish-btn").style.display = "block";
} else {
    document.getElementById("vanish-btn").style.display = "block"; // dikhana hai but with lock
    document.getElementById("vanish-btn").classList.add("locked"); 
}

document.getElementById("vanish-btn").addEventListener("click", async () => {
  if (!confirm("Are you sure you want to remotely log out your partner?")) return;

  // check plan from server (fast, JWT verify only)
  try {
    const r = await fetch("/api/check-plan", { method: "GET", credentials: "include" });
    if (!r.ok) throw new Error("Auth failed");
    const { allowed, plan } = await r.json();

    if (!allowed) {
      alert("This is a premium feature. Please upgrade.");
      return;
    }

    socket.emit("triggerDisintegrate", { from: senderId, to: receiverId });
  } catch (err) {
    console.error(err);
    alert("Could not verify subscription. Try again.");
  }
});


              // Listener for being forced out
            socket.on("forceLogout", () => {
                window.location.href = "/forceLogout";
            });


  function setupSendHandlers() {
    const sendBtn = document.getElementById('send-button');
    const updateBtn = document.getElementById('update-button');
    const input = document.getElementById('message-input');

    if (sendBtn) {
      sendBtn.addEventListener('click', async () => {
        const messageText = input.value.trim();
        isSecretChat = document.getElementById('secretChatToggle')?.checked || false;
        if (!messageText && (!selectedFile || selectedFile.length === 0)) return;
        const timestamp = Date.now();

        // Sending text only
        if (messageText && (!selectedFile || selectedFile.length === 0)) {
          try {
            const aesKey = await loadKeyFromDB(roomId);
            const { encryptedMessage, iv } = await encryptMessage(messageText, aesKey);
            await sendMessageWithQueueDirect(roomId, senderId, receiverId, timestamp, iv, encryptedMessage);
          } catch (err) {
            // generate key fallback
            const aesKey = await generateAESKey();
            await saveKeyToDB(aesKey, roomId);
            await saveKeyToMongoDBOnBackend(aesKey, roomId, senderId);
            const { encryptedMessage, iv } = await encryptMessage(messageText, aesKey);
            const encryptedAESKey = await encryptAESKeyWithRSAOnBackend(aesKey, receiverId);
            await sendMessageWithQueueRSA(roomId, senderId, receiverId, timestamp, iv, encryptedMessage, encryptedAESKey);
          }

          window.chatUI.displayMessage({ senderId, messageText, timestamp });
          if (sessionStorage.getItem('isSecretChat_' + roomId) === 'true') {
            saveMessageToSession({ roomId, senderId, messageText, timestamp, TIMEstatus: 'sending' });
          } else {
            saveMessage(roomId, senderId, messageText, timestamp);
          }
          input.value = '';
          return;
        }

        // sending files
        if (selectedFile && selectedFile.length > 0) {
          const fileMeta = [];
          try {
            const aesKey = await loadKeyFromDB(roomId);
            for (const file of selectedFile) {
              const fileClone = new File([await file.arrayBuffer()], file.name, { type: file.type, lastModified: file.lastModified });
              const { encryptedFile, encryptedText, iv } = await encryptFileAndText(fileClone, messageText, aesKey);
              const fileId = await uploadEncryptedFileToBackend(file, encryptedFile, roomId, senderId);
              const blurPreview = await createBlurPreview(fileClone);
              socket.emit("sendFile", { roomId, senderId, receiverId, fileId, fileName: file.name, fileType: file.type, messageText, timestamp, iv, preview: blurPreview });
              fileMeta.push({ file, fileId });
            }
          } catch (err) {
            // generate AES fallback then encrypt and upload
            const aesKey = await generateAESKey();
            await saveKeyToDB(aesKey, roomId);
            await saveKeyToMongoDBOnBackend(aesKey, roomId, senderId);
            const encryptedAESKey = await encryptAESKeyWithRSAOnBackend(aesKey, receiverId);
            for (const file of selectedFile) {
              const fileClone = new File([await file.arrayBuffer()], file.name, { type: file.type, lastModified: file.lastModified });
              const { encryptedFile, encryptedText, iv } = await encryptFileAndText(fileClone, messageText, aesKey);
              const fileId = await uploadEncryptedFileToBackend(file, encryptedFile, roomId, senderId);
              const blurPreview = await createBlurPreview(fileClone);
              socket.emit("sendFile", { roomId, senderId, receiverId, fileId, fileName: file.name, fileType: file.type, messageText, timestamp, iv, preview: blurPreview });
              fileMeta.push({ file, fileId });
            }
          }

          for (const {file, fileId} of fileMeta) {
            const fileType = file.type;
            const fileName = file.name;
            const fileUrl = URL.createObjectURL(file);
            await window.chatUI.displayFileMessage({ senderId, fileUrl, fileType, fileName, timestamp, messageText, status: 'sending', fileId, roomId });
            if (!isSecretChat) {
              await saveFileMessage(roomId, senderId, { fileId, name: file.name, type: file.type, file }, messageText, timestamp);
            }
          }

          document.getElementById('preview-container').innerHTML = '';
          selectedFile = [];
          document.getElementById('message-input').value = '';
        }
      });
    }

    // update (edit) handler
    const cancelEdit = document.getElementById('cancel-edit');
    if (cancelEdit) {
      cancelEdit.addEventListener('click', () => {
        const inputEl = document.getElementById('message-input');
        inputEl.value = '';
        inputEl.removeAttribute('data-editing');
        inputEl.removeAttribute('data-msg-id');
        document.getElementById('send-button').style.display = 'inline-block';
        document.getElementById('update-button').style.display = 'none';
        document.getElementById('editing-popup').style.display = 'none';
        document.querySelectorAll('.select-msg:checked').forEach(cb => cb.checked = false);
        editingMessage = null;
      });
    }

    const updateButton = document.getElementById('update-button');
    if (updateButton) {
      updateButton.addEventListener('click', async () => {
        const inputEl = document.getElementById('message-input');
        const newText = inputEl.value.trim();
        if (!inputEl.dataset.msgId) return;
        const msgTimestamp = Number(inputEl.dataset.msgId);

        // encrypt new text with AES
        try {
          const aesKey = await loadKeyFromDB(roomId);
          const { encryptedMessage, iv } = await encryptMessage(newText, aesKey);
          // emit edit action to server
          socket.emit('editMessage', { roomId, senderId, receiverId, messageId: msgTimestamp, encryptedMessage, iv });
          // update in DB/display locally
          updateMessageInDB(roomId, msgTimestamp, encryptedMessage, iv);
          inputEl.value = '';
          inputEl.removeAttribute('data-editing');
          inputEl.removeAttribute('data-msg-id');
          document.getElementById('send-button').style.display = 'inline-block';
          document.getElementById('update-button').style.display = 'none';
          document.getElementById('editing-popup').style.display = 'none';
          document.querySelectorAll('.select-msg:checked').forEach(cb => cb.checked = false);
          editingMessage = null;
        } catch (err) {
          console.error('Update (edit) failed', err);
        }
      });
    }
  }
     socket.on("editMessageReceive", (data) => {
    const { roomId, messageId, encryptedMessage, iv } = data;
    updateMessageInDB(roomId, messageId, encryptedMessage, iv);
    });

  // Save secret messages in sessionStorage
  function saveMessageToSession({ roomId: rid, senderId: sid, messageText, timestamp, TIMEstatus = 'sending' }) {
    let messages = JSON.parse(sessionStorage.getItem('secretChatMessages_' + rid) || '[]');
    let disappearTime = parseInt(sessionStorage.getItem("disappearTimer_" + rid)) || 0;
    messages.push({ roomId: rid, senderId: sid, messageText, timestamp, TIMEstatus });
    sessionStorage.setItem('secretChatMessages_' + rid, JSON.stringify(messages));
    if (disappearTime > 0) {
      setTimeout(() => { deleteMessage(rid, timestamp); }, disappearTime * 1000);
    }
  }

  // delete message helper used by UI unsend
  function deleteMessage(roomIdLocal, timestamp) {
    socket.emit('unsendMessage', { roomId: roomIdLocal, senderId, receiverId, messageId: timestamp });
    deleteMessageFromDB(roomIdLocal, timestamp);
  }
     async function loadMessages() {


                const transaction = db.transaction("messages", "readonly");
                const store = transaction.objectStore("messages");
                const index = store.index("roomId");  // Accessing the roomId index
                let previousDate = null; // Store previous message date
                const messages = [];
                const request = index.openCursor(IDBKeyRange.only(roomId)); // Only fetch messages for the current roomId
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        const message = cursor.value;

                        // Extract date from timestamp
                        const currentDate = window.chatUI.formatDate(message.timestamp);

                        if (currentDate !== previousDate) {
                            window.chatUI.displayDateSeparator(currentDate);
                            previousDate = currentDate;
                        }

                        messages.push(message); // Collect messages
                        cursor.continue();
                    } else {
                        // Process messages after transaction finishes
                        processMessages(messages);
                    }
                };
            }

            // Process messages and handle file blobs
            // Function to display a media placeholder
            function displayMediaPlaceholder(message) {
                const chatBox = document.getElementById('chat-box');
                const messageElement = document.createElement('div');
                messageElement.className = 'message loading'; // Optional: Add a 'loading' class for styling

                // Create a placeholder for media
                messageElement.innerHTML = `
        <div class="media-placeholder">
            <div class="loading-spinner">🔄</div>
        </div>
        <small>
            ${new Date(message.timestamp).toLocaleTimeString()}
        </small>
    `;

                chatBox.appendChild(messageElement);
                window.chatUI.scrollToBottom();

                return messageElement;
            }

          async function processMessages(messages) {
    for (const message of messages) {
        if (message.fileName) {
            const placeholder = displayMediaPlaceholder(message);

            const fileMessage = {
                senderId: message.senderId,
                fileType: message.fileType,
                fileName: message.fileName,
                timestamp: message.timestamp,
                fileId: message.fileId,
                messageText: message.messageText,
                status: 'sent',
                roomId,
                preview: message.preview,
                iv: message.iv,
            };

            // Only generate blob URL if fileContent exists
          if (message.fileContent) {
    let blob;

    if (message.fileContent instanceof Blob) {
        // Already a Blob—use it directly
        blob = message.fileContent;
    } else if (typeof message.fileContent === "string" && message.fileContent.startsWith("blob:")) {
        // Already an Object URL—use as is
        fileMessage.fileUrl = message.fileContent;
    } else if (typeof message.fileContent === "string" && message.fileContent.startsWith("http")) {
        // It's a remote URL—fetch it
        blob = await (await fetch(message.fileContent)).blob();
    } else {
        // Fallback: assume it's Base64
        const byteCharacters = atob(message.fileContent.split(",")[1]);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        blob = new Blob([byteArray]);
    }

    if (blob) {
        const blobUrl = URL.createObjectURL(blob);
        fileMessage.fileUrl = blobUrl;
    }
}


           await window.chatUI.displayFileMessage(fileMessage);
            placeholder.remove();
        } else {
            window.chatUI.displayMessage(message);
        }
    }
} document.getElementById("message-input").addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault(); // Prevents newline on Enter

        const input = event.target;
        const isEditing = input.dataset.editing === "true";

        if (isEditing) {
            document.getElementById("update-button").click(); // Trigger update
        } else {
            document.getElementById("send-button").click(); // Trigger send
        }
    }
});

// === (INSERT INTO messages.js) ===
// Put near other helpers / DB functions

// ensure we have the `db` variable used by other IDB ops (messages.js already does this)
window.chatMessages = window.chatMessages || {};

// local array already used by send flow — keep it here

window.chatMessages.selectedFile = selectedFile;

// helper: add files (array) to selectedFile and return current array
function addSelectedFiles(files) {
  for (const f of files) selectedFile.push(f);
  return selectedFile;
}

// helper: remove single file by reference (or index)
function removeSelectedFile(predicate) {
  if (typeof predicate === 'number') {
    selectedFile.splice(predicate, 1);
  } else {
    selectedFile = selectedFile.filter(f => f !== predicate);
  }
  window.chatMessages.selectedFile = selectedFile;
  return selectedFile;
}

function clearSelectedFiles() {
  selectedFile = [];
  window.chatMessages.selectedFile = selectedFile;
}

// expose helpers
window.chatMessages.addSelectedFiles = addSelectedFiles;
window.chatMessages.removeSelectedFile = removeSelectedFile;
window.chatMessages.clearSelectedFiles = clearSelectedFiles;
window.chatMessages.getSelectedFiles = () => selectedFile.slice(); // copy

// ---------------------- Disappearing timer persistence ----------------------
// store timer value (seconds) in rooms object store of ChatDB
async function setDisappearingTimer(roomIdLocal, timerSecondsOrNull) {
  if (!db) {
    console.warn("DB not initialized; cannot set disappearing timer. Attempting to init DB...");
    try { await initDB(); } catch(e){ console.error("DB init failed", e); return; }
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction("rooms", "readwrite");
    const store = tx.objectStore("rooms");
    const getReq = store.get(roomIdLocal);
    getReq.onsuccess = (ev) => {
      const room = ev.target.result;
      if (room) {
        room.disappearingTimer = timerSecondsOrNull;
        room.updatedAt = Date.now();
        const putReq = store.put(room);
        putReq.onsuccess = () => {
          // also keep in sessionStorage for quick access (used by secret logic)
          if (timerSecondsOrNull === null || typeof timerSecondsOrNull === 'undefined') {
            sessionStorage.removeItem('disappearTimer_' + roomIdLocal);
          } else {
            sessionStorage.setItem('disappearTimer_' + roomIdLocal, String(timerSecondsOrNull));
          }
          resolve(true);
        };
        putReq.onerror = () => reject(putReq.error);
      } else {
        // create room entry with timer
        const newRoom = {
          roomId: roomIdLocal,
          receiverName: cfg.receiverName,
          receiverId: cfg.receiverId,
          receiverProfilePhoto: cfg.receiverProfilePhoto,
          disappearingTimer: timerSecondsOrNull,
          timestamp: Date.now()
        };
        const addReq = store.add(newRoom);
        addReq.onsuccess = () => {
          if (timerSecondsOrNull === null) sessionStorage.removeItem('disappearTimer_' + roomIdLocal);
          else sessionStorage.setItem('disappearTimer_' + roomIdLocal, String(timerSecondsOrNull));
          resolve(true);
        };
        addReq.onerror = () => reject(addReq.error);
      }
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

// expose
window.chatMessages.setDisappearingTimer = setDisappearingTimer;

// ---------------------- session-based secret chat helpers ----------------------

// delete message from session secret store and refresh UI
function deleteSecretMessage(roomIdLocal, timestamp) {
  const key = 'secretChatMessages_' + roomIdLocal;
  let messages = JSON.parse(sessionStorage.getItem(key) || '[]');
  messages = messages.filter(msg => msg.timestamp !== timestamp);
  sessionStorage.setItem(key, JSON.stringify(messages));
  // refresh UI via chatUI
  if (window.chatUI) {
    window.chatUI.clearChatBox();
    (messages || []).forEach(m => window.chatUI.displayMessage(m));
  }
  return messages;
}
window.chatMessages.deleteSecretMessage = deleteSecretMessage;

// cleanup expired session messages using sessionStorage timer
function cleanupExpiredMessages(roomIdLocal) {
  try {
    const key = 'secretChatMessages_' + roomIdLocal;
    let messages = JSON.parse(sessionStorage.getItem(key) || '[]');
    const disappearTime = parseInt(sessionStorage.getItem('disappearTimer_' + roomIdLocal) || '0', 10) || 0;
    const currentTime = Date.now();
    if (disappearTime > 0) {
      messages = messages.filter(msg => (currentTime - msg.timestamp) < (disappearTime * 1000));
      sessionStorage.setItem(key, JSON.stringify(messages));
    }
    if (window.chatUI) {
      window.chatUI.clearChatBox();
      messages.forEach(m => window.chatUI.displayMessage(m));
    }
    return messages;
  } catch (err) {
    console.error('cleanupExpiredMessages error', err);
    return [];
  }
}
window.chatMessages.cleanupExpiredMessages = cleanupExpiredMessages;

// run cleanup on DOMContentLoaded for current room (useful when page loads)
document.addEventListener('DOMContentLoaded', () => {
  try {
    const roomIdLocal = (window.chatHelpers?.cfg?.roomId) || (new URLSearchParams(window.location.search)).get('roomId');
    if (roomIdLocal) cleanupExpiredMessages(roomIdLocal);
  } catch(e) { /* ignore */ }
});
    function isSecretChatEnabled() {
                const roomId = urlParams.get('roomId');
                return sessionStorage.getItem('isSecretChat_' + roomId) === 'true';
            }

  // -------------------------
  // Flush queue on load / online
  // -------------------------
 window.addEventListener('load', async () => {
  try {
    await initDB();
    loadMessages();

    // ✅ Attach socket listener only if NOT in secret chat mode
    if (!isSecretChatEnabled()) {
      socket.off("processPendingAction"); // prevent duplicate binding

      socket.on("processPendingAction", (action) => {
        switch (action.actionType) {
          case "unsend":
            deleteMessageFromDB(action.roomId, action.messageId);
            break;

          case "edit":
            updateMessageInDB(action.roomId, action.messageId, action.encryptedMessage, action.iv);
            break;

          case "react":
            // TODO: handle react later
            break;

          case "none":
            loadMessages();
            break;

          default:
            console.warn("⚠️ Unknown pending action received:", action);
        }
      });
    }

  } catch (e) {
    console.error('❌ DB init failed:', e);
  }

  // ✅ Send any queued messages if back online
  if (navigator.onLine) await flushMessageQueue();
});

  window.addEventListener('online', async () => { await flushMessageQueue(); });

  // register SW for background sync if available
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(err => console.error('SW registration failed', err));
  }

  // init DB and send handlers
  initDB().then(() => {
    setupSendHandlers();
  }).catch(err => console.error('initDB error', err));

  // Expose some functions for debug
  window.chatMessages._internals = {
    encryptMessage, decryptMessage, generateAESKey, loadKeyFromDB, saveKeyToDB
  };

            
            let selectedSearchImage = null;

document.getElementById("search-button").onclick = () => {
  document.getElementById("search-modal").style.display = "block";
};

document.getElementById("close-modal").onclick = () => {
  document.getElementById("search-modal").style.display = "none";
};

document.getElementById("search-go").onclick = async () => {
  const q = document.getElementById("search-input").value.trim();
  if (!q) return;

  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  const data = await res.json();

  const container = document.getElementById("search-results");
  container.innerHTML = "";
  data.results.forEach((img) => {
    const el = document.createElement("img");
    el.src = img.thumb || img.url;
    el.style.width = "120px";
    el.style.cursor = "pointer";
    el.onclick = () => {
      selectedSearchImage = img.url;
      document.getElementById("preview-img").src = img.url;
      document.getElementById("preview-box").style.display = "block";
    };
    container.appendChild(el);
  });
};

document.getElementById("cancel-preview").onclick = () => {
  selectedSearchImage = null;
  document.getElementById("preview-box").style.display = "none";
};

document.getElementById("send-selected").onclick = async () => {
  if (!selectedSearchImage) return;

  // Convert image URL → File
  const resp = await fetch(selectedSearchImage);
  const blob = await resp.blob();
  const file = new File([blob], "search-image.jpg", { type: blob.type });

  // Inject into your chat flow
  selectedFile = [file]; 
  document.getElementById("send-button").click();

  // Cleanup
  selectedSearchImage = null;
  document.getElementById("preview-box").style.display = "none";
  document.getElementById("search-modal").style.display = "none";
};

})();

