const socket = io({
  reconnection: true,
  reconnectionAttempts: 20,
  reconnectionDelay: 1000,
});


socket.on("receiveMessageDirectly", async (data) => {
  console.log("📩 Message received globally:", data);

  const { roomId, senderId, receiverId, encryptedMessage, timestamp, iv } = data;

  let aesKey;
  try {
    aesKey = await loadKeyFromDB(roomId);
  } catch (err) {}

  if (!aesKey) {
    try {
      aesKey = await fetchKeyFromMongoDB(roomId, senderId);
      if (aesKey) {
        await saveKeyToDB(aesKey, roomId);
      } else {
        throw new Error("AES key missing");
      }
    } catch (err) {
      console.error("Failed to fetch key:", err);
      return;
    }
  }

  const messageText = await decryptMessage(encryptedMessage, iv, aesKey);
  await saveMessage(roomId, senderId, messageText, timestamp);

  // Chat page check
  const currentURL = window.location.href;
  if (currentURL.includes("/chat?roomId=" + roomId)) {
    displayMessage({ senderId, messageText, timestamp });
  } else {
    // Optional: show notification or update unread badge
    console.log("Not in chat, message saved silently.");
  }
});
