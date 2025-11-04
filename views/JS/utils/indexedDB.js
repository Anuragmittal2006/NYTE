 export async function loadKeyFromDB(roomId) {
                return new Promise((resolve, reject) => {
                    const transaction = db.transaction("rooms", "readonly");
                    const store = transaction.objectStore("rooms");
                    const request = store.get(roomId);
                    request.onsuccess = (event) => {
                        const room = event.target.result;
                        if (room && Date.now() - room.timestamp < 24 * 60 * 60 * 1000) {
                            // If the key is valid (within 24 hours)
                          const aesKey = room.aesKey;
                          
                            resolve(aesKey);
                        } else {
                            reject("Key expired");
                        }
                    };
                });
            }

         export async function fetchKeyFromMongoDB(roomId, senderId) {
                try {
                    const response = await fetch('/getKey', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ roomId, senderId }),
                    });

                    if (!response.ok) {
                        throw new Error("Failed to fetch AES key from backend.");
                    }

                    const { aesKey } = await response.json();
                    return aesKey;
                } catch (error) {
                    console.error("Error fetching AES key from backend:", error);
                    return null;
                }
            }
            export async function saveKeyToDB(key, roomId) {
                const transaction = db.transaction("rooms", "readwrite");
                const store = transaction.objectStore("rooms");
                store.put({ roomId, aesKey: key, timestamp: Date.now(), receiverName, receiverId, receiverProfilePhoto });
            }
          export async function addRoom(roomId, disappearingTimer = null) {
                const transaction = db.transaction("rooms", "readwrite");
                const store = transaction.objectStore("rooms");

                store.get(roomId).onsuccess = (event) => {
                    if (!event.target.result) {
                        store.add({
                            roomId,
                            receiverName,
                            receiverId,
                            receiverProfilePhoto,
                            disappearingTimer // Add timer
                        });
                    } else {
                        // Update existing room with new timer
                        const existingRoom = event.target.result;
                        existingRoom.disappearingTimer = disappearingTimer;
                        store.put(existingRoom);
                    }
                };
            }
               export async function saveMessage(roomId, senderId, messageText, timestamp) {
                            addRoom(roomId); // Ensure room exists
                            const transaction = db.transaction("messages", "readwrite");
                            const store = transaction.objectStore("messages");
                            store.add({ roomId, senderId, messageText, timestamp });
                        }