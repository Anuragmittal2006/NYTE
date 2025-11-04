import { decryptMessage } from './utils/crypto.js';
import { loadKeyFromDB, saveKeyToDB, saveMessage, fetchKeyFromMongoDB } from './utils/indexedDB.js';


socket.on("receiveMessageDirectly", async (data) => {
    try {
        const { roomId, senderId, receiverId, encryptedMessage, timestamp, iv } = data;

        let aesKey;

        // Try IndexedDB first
        try {
            aesKey = await loadKeyFromDB(roomId);
        } catch (error) {}

        // Fallback to MongoDB
        if (!aesKey) {
            try {
                aesKey = await fetchKeyFromMongoDB(roomId, senderId);
                if (aesKey) {
                    await saveKeyToDB(aesKey, roomId);
                } else {
                    throw new Error("AES key missing in both IndexedDB and MongoDB.");
                }
            } catch (error) {
                throw error;
            }
        }

        const messageText = await decryptMessage(encryptedMessage, iv, aesKey);

        // Save to IndexedDB
        await saveMessage(roomId, senderId, messageText, timestamp);
        // Optional: Trigger custom event for notification system
        const event = new CustomEvent("newChatMessage", {
            detail: { senderId, messageText, timestamp, roomId }
        });
        window.dispatchEvent(event);
// After window.dispatchEvent(event);

try {
    await fetch("http://localhost:3000/notify", {
        method: "POST",
        body: JSON.stringify({
            title: "New message",
            message: messageText,
            roomId: roomId
        }),
        headers: { "Content-Type": "application/json" }
    });
} catch (e) {
    console.error("Failed to send push:", e);
}

           const chatEl = document.querySelector(`[data-room-id="${roomId}"]`);
    if (chatEl) {
        const lastMsgEl = chatEl.querySelector('.last-msg');
        if (lastMsgEl) {
            lastMsgEl.textContent = messageText || '[Media]';
        }
    }

    } catch (error) {
        console.error("Error processing received message globally:", error);
    }
});
  window.addEventListener("newChatMessage", (event) => {
    const { senderId, messageText, timestamp, roomId } = event.detail;

    // 👇 Notification API use karna ho to
    if (document.hidden && Notification.permission === "granted") {
        new Notification("New message", {
            body: messageText || "[Media]",
            icon: "/notification-icon.png", // optional
        });
    }

    // 👇 Otherwise use in-app toast
    showToast(messageText || "[Media]", roomId);
});
function showToast(message, roomId) {
    const toast = document.createElement("div");
    toast.textContent = message;
    toast.style.position = "fixed";
    toast.style.bottom = "20px";
    toast.style.right = "20px";
    toast.style.padding = "10px 15px";
    toast.style.backgroundColor = "black";
    toast.style.color = "white";
    toast.style.borderRadius = "5px";
    toast.style.zIndex = "9999";
       toast.onclick = () => {
        window.location.href = `/chat?roomId=${roomId}`;
    };
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}