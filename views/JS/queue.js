// queue.js

function openQueueDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("ChatDB", 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("outgoingMessages")) {
        const store = db.createObjectStore("outgoingMessages", { keyPath: "timestamp" });
        store.createIndex("roomId", "roomId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function addMessageToQueue(msgObj) {
  const db = await openQueueDB();
  const tx = db.transaction("outgoingMessages", "readwrite");
  tx.objectStore("outgoingMessages").put(msgObj);
  await tx.complete;
}

async function getAllQueuedMessages() {
  const db = await openQueueDB();
  return new Promise((resolve) => {
    const tx = db.transaction("outgoingMessages", "readonly");
    const store = tx.objectStore("outgoingMessages");
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => a.timestamp - b.timestamp));
  });
}

async function deleteMessageFromQueue(timestamp) {
  const db = await openQueueDB();
  const tx = db.transaction("outgoingMessages", "readwrite");
  tx.objectStore("outgoingMessages").delete(timestamp);
  await tx.complete;
}

async function flushMessageQueue() {
  const queuedMessages = await getAllQueuedMessages();
  console.log("Flushing queue from SW:", queuedMessages);
  for (const msg of queuedMessages) {
    try {
      if (msg.type === "direct") {
        await fetch("/sendDirect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(msg)
        });
      } else if (msg.type === "rsa") {
        await fetch("/sendRSA", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(msg)
        });
      }
      await deleteMessageFromQueue(msg.timestamp);
      console.log("✅ Sent & removed:", msg.timestamp);
    } catch (err) {
      console.error("Retry failed:", err);
    }
  }
}
