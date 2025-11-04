 // Initialize IndexedDB


const senderId = '<%= senderId %>';
const receiverId = '<%= receiverId %>';
const receiverName = '<%= receiverName %>';
const receiverProfilePhoto = '<%= receiverProfilePhoto %>';
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('roomId');
const socket = io({
    reconnection: true,         // Auto reconnect
    reconnectionAttempts: 20,    // Try 5 times before giving up
    reconnectionDelay: 1000     // Wait 1 second before next attempt
});
let aesKey = null;
socket.emit('joinRoom', { userId: senderId, roomId });
socket.on('disconnect', () => {
    console.log('Disconnected from server. Trying to reconnect...');
    setTimeout(() => {
        socket.emit('joinRoom', { userId: senderId, roomId });  // Force reconnect
    }, 1000);  // 1 second delay before reconnect
});

socket.on('reconnect', (attemptNumber) => {
    console.log('Reconnected to server after', attemptNumber, 'attempts');
}); socket.on('connect_error', (err) => {
    console.error('Connection Error:', err.message);
});
const receiverPublicKey = '<%= receiverPublicKey %>';
const senderPrivateKey = '<%= senderPrivateKey %>';

const input = document.getElementById('message-input');
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

// Function to focus the input box
const keepFocus = () => {
    // Focus sirf tabhi kare jab popup open na ho
    const popup = document.getElementById('disappearing-popup');
    if (!popup || popup.style.display === 'none') {
        input.focus();
    }
};



// Automatically focus when tab becomes active
window.addEventListener('focus', keepFocus);

// Initial focus on page load
keepFocus();

// Global settings management for chat app



function applyTheme(theme) {
    if (theme === "system") {
        theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }

    const themes = {
        dark: {
            '--background-color': '#121212',
            '--text-color': '#ffffff',
            '--header-bg': '#1e1e1e',
            '--header-text': '#ffffff',
            '--sent-msg-bg': '#263238',
            '--received-msg-bg': '#37474f'
        },
        light: {
            '--background-color': '#ffffff',
            '--text-color': '#333',
            '--header-bg': '#00796b',
            '--header-text': '#ffffff',
            '--sent-msg-bg': '#c8e6c9',
            '--received-msg-bg': '#ffffff'
        }
    };

    const selectedTheme = themes[theme] || themes.light;
    for (const [prop, value] of Object.entries(selectedTheme)) {
        document.documentElement.style.setProperty(prop, value);
    }
}
function setNotificationSound(value) {
    const sounds = ["ping", "tiptap", "beep"];
    if (!sounds.includes(value)) value = "ping";
    setSetting('notificationSound', value);
    console.log(`Notification sound updated to: ${value}`);
}





function addRoom(roomId, disappearingTimer = null) {
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

function saveKeyToDB(key, roomId) {
    const transaction = db.transaction("rooms", "readwrite");
    const store = transaction.objectStore("rooms");
    store.put({ roomId, aesKey: key, timestamp: Date.now(), receiverName, receiverId, receiverProfilePhoto });
}

function loadKeyFromDB(roomId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("rooms", "readonly");
        const store = transaction.objectStore("rooms");
        const request = store.get(roomId);
        request.onsuccess = (event) => {
            const room = event.target.result;
            if (room && Date.now() - room.timestamp < 24 * 60 * 60 * 1000) {
                // If the key is valid (within 24 hours)
                aesKey = room.aesKey;
                resolve(aesKey);
            } else {
                reject("Key expired");
            }
        };
    });
}
async function generateAESKey() {
    // Generate a 256-bit AES key
    const key = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 }, // Algorithm and key length
        true, // Whether the key is extractable (can be exported)
        ["encrypt", "decrypt"] // Allowed usages
    );

    // Export the key to raw format
    const exportedKey = await crypto.subtle.exportKey("raw", key);

    // Convert ArrayBuffer to hex string
    const aesKeyHex = Array.from(new Uint8Array(exportedKey))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");

    return aesKeyHex; // Return the AES key as a hex string
}
async function initAESKey() {
    const aesKey = await generateAESKey(); // Call the function to generate the key
    return aesKey; // Return if needed elsewhere
}
function scrollToBottom() {
    const chatBox = document.getElementById('chat-box');
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Call this function after loading the messages or after adding a new message
scrollToBottom();


// Save a message to the DB with roomId
function saveMessage(roomId, senderId, messageText, timestamp) {
    addRoom(roomId); // Ensure room exists
    const transaction = db.transaction("messages", "readwrite");
    const store = transaction.objectStore("messages");
    store.add({ roomId, senderId, messageText, timestamp });
}
function saveFileMessage(roomId, senderId, file, messageText, timestamp) {
    const reader = new FileReader();
    reader.onload = function () {
        const base64File = reader.result; // File content in Base64
        addRoom(roomId); // Ensure room exists
        const transaction = db.transaction("messages", "readwrite");
        const store = transaction.objectStore("messages");

        store.add({
            roomId,
            senderId,
            messageText: messageText || null, // Save messageText if available
            timestamp,
            fileName: file.name, // File name
            fileType: file.type, // MIME type (e.g., image/png)
            fileContent: base64File // Base64 content of the file
        });
    };

    reader.readAsDataURL(file); // Convert file to Base64
}

function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-US", {
        day: "2-digit",       // 2-digit day (e.g., 01, 02)
        month: "long",        // Full month name (e.g., January, February)
        year: "numeric"       // Year (e.g., 2024)
    });
}
// Load messages for the specific roomId
let lastLoadedTimestamp = null; // Latest loaded message timestamp
let firstLoadedTimestamp = null; // Earliest loaded message timestamp
const messagesLimit = 20; // Number of messages to load at a time

// Load initial messages (latest messages should appear at the bottom)

function loadMessages() {
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
            const currentDate = formatDate(message.timestamp);

            if (currentDate !== previousDate) {
                displayDateSeparator(currentDate);
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
    scrollToBottom();

    return messageElement;
}

async function processMessages(messages) {
    for (const message of messages) {
        if (message.fileContent) {
            // Create a media placeholder before loading the file
            const placeholder = displayMediaPlaceholder(message);

            // Convert Base64 content to blob and create URL
            const blob = await (await fetch(message.fileContent)).blob();
            const blobUrl = URL.createObjectURL(blob);

            // Replace the placeholder with the actual media message
            const fileMessage = {
                senderId: message.senderId,
                fileUrl: blobUrl,
                fileType: message.fileType,
                fileName: message.fileName,
                timestamp: message.timestamp,
                messageText: message.messageText,
                status: 'sent',
            };

            // Display the actual media message after loading
            displayFileMessage(fileMessage);

            // Optionally, remove the placeholder if needed
            placeholder.remove();
        } else {
            // Display text message
            displayMessage(message);
        }
    }
}

function displayDateSeparator(date) {
    const chatContainer = document.getElementById("chat-box"); // Your chat container element
    const dateElement = document.createElement("div");
    dateElement.className = "date-separator";
    dateElement.textContent = date;
    chatContainer.appendChild(dateElement);
}

socket.on('updateMessageStatus', ({ roomId, messageId, status }) => {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        updateStatus(messageElement, status);
    }
});

function updateStatus(messageElement, status) {
    const statusElement = messageElement.querySelector('.status');
    if (statusElement) {
        statusElement.innerHTML = getStatusIcon(status);
    }
}

function getStatusIcon(status) {
    switch (status) {
        case 'sending':
            return '⏳'; // Hourglass
        case 'sent':
            return '✔️'; // Single tick
        case 'seen':
            return '✔✔'; // Double blue tick
        default:
            return '';
    }
}

function displayMessage({ senderId, messageText, timestamp, TIMEstatus = 'sending' }) {
    const chatBox = document.getElementById('chat-box');
    const messageElement = document.createElement('div');

    const isSentMessage = senderId === '<%= senderId %>';
    messageElement.className = isSentMessage ? 'message sent' : 'message received';
    messageElement.setAttribute('data-message-id', timestamp); // Unique ID for the message

    messageElement.innerHTML = `
 <input type="checkbox" class="select-msg" >
<p>${messageText}</p>
<small>
    ${new Date(timestamp).toLocaleTimeString()}
    ${isSentMessage ? `<span class="status">${getStatusIcon(TIMEstatus)}</span>` : ''}
</small>`;

    chatBox.appendChild(messageElement);
    scrollToBottom();
    messageElement.addEventListener("click", () => {
const checkbox = messageElement.querySelector(".select-msg");
checkbox.checked = !checkbox.checked;
updateDeleteButton();
});
    return messageElement;
}
function displayFileMessage({ senderId, fileUrl, fileType, fileName, timestamp, messageText, status = 'sending' }) {
    const chatBox = document.getElementById('chat-box');
    const messageElement = document.createElement('div');
    const isSentMessage = senderId === '<%= senderId %>';
    messageElement.className = isSentMessage ? 'message sent' : 'message received';
    messageElement.setAttribute('data-message-id', timestamp); // Unique ID for the message

    // File Preview UI based on fileType
    let fileContent = '';
    if (fileType.startsWith("image")) {
        fileContent = `<img src="${fileUrl}" alt="${fileName}" class="file-preview image-preview" onclick="openImageModal('${fileUrl}')">`;
    } else if (fileType.startsWith('video')) {
        fileContent = `<video controls class="file-preview video-preview" onclick="openVideoModal('${fileUrl}', '${fileType}')">
                <source src="${fileUrl}" type="${fileType}">
                Your browser does not support the video tag.
               </video>`;
    } else if (fileType.startsWith('audio')) {
        fileContent = `<audio controls class="file-preview audio-preview">
                    <source src="${fileUrl}" type="${fileType}">
                    Your browser does not support the audio tag.
                </audio>`;
    } else {
        fileContent = `<a href="${fileUrl}" download class="file-preview document-preview">
                    📄 ${fileName}
                </a>`;
    }

    messageElement.innerHTML = `
<div class="file-container">
    ${fileContent}
${messageText ? messageText : ""}
</div>
<small>
    ${new Date(timestamp).toLocaleTimeString()}
    ${isSentMessage ? `<span class="status">${getStatusIcon(status)}</span>` : ''}
</small>`;

    chatBox.appendChild(messageElement);
    scrollToBottom();

    return messageElement;
}

function decryptMessage(encryptedMessage, aesKey, iv) {
    const key = CryptoJS.enc.Hex.parse(aesKey); // Parse the AES key from hex
    const ivParsed = CryptoJS.enc.Hex.parse(iv); // Parse the IV from hex
    const decrypted = CryptoJS.AES.decrypt(encryptedMessage, key, { iv: ivParsed }); // Decrypt Base64 message
    return Buffer.from(exportedKey);
}


async function generateAESKey() {
    const key = await window.crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
    const exportedKey = await window.crypto.subtle.exportKey("raw", key);
    return btoa(String.fromCharCode(...new Uint8Array(exportedKey))); // Return Base64 key
}
async function encryptMessage(message, aesKey) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12)); // Generate random IV
    const encodedMessage = new TextEncoder().encode(message);
    const keyBuffer = Uint8Array.from(atob(aesKey), c => c.charCodeAt(0)); // Convert AES key back to ArrayBuffer

    const cryptoKey = await window.crypto.subtle.importKey(
        "raw",
        keyBuffer,
        { name: "AES-GCM" },
        false,
        ["encrypt"]
    );

    const encryptedData = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        cryptoKey,
        encodedMessage
    );

    return { encryptedMessage: btoa(String.fromCharCode(...new Uint8Array(encryptedData))), iv: btoa(String.fromCharCode(...iv)) };
}


async function encryptFileAndText(file, messageText, aesKey) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12)); // Generate random IV
    const keyBuffer = Uint8Array.from(atob(aesKey), c => c.charCodeAt(0)); // Convert AES key back to ArrayBuffer

    const cryptoKey = await window.crypto.subtle.importKey(
        "raw",
        keyBuffer,
        { name: "AES-GCM" },
        false,
        ["encrypt"]
    );

    // Encrypt file (if present)
    let encryptedFile = null;
    if (file) {
        const fileBuffer = await file.arrayBuffer(); // Convert file to ArrayBuffer
        const encryptedFileData = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            cryptoKey,
            fileBuffer
        );

        // Convert encrypted data to Base64 using a stream-based approach
        encryptedFile = arrayBufferToBase64(encryptedFileData);
    }

    // Encrypt message text (if present)
    let encryptedText = null;
    if (messageText) {
        const encodedMessage = new TextEncoder().encode(messageText); // Convert text to Uint8Array
        const encryptedMessageData = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            cryptoKey,
            encodedMessage
        );
        encryptedText = btoa(String.fromCharCode(...new Uint8Array(encryptedMessageData))); // Base64 encode encrypted text
    }
    return {
        encryptedFile,
        encryptedText,
        iv: btoa(String.fromCharCode(...iv)) // Base64 encode IV for both
    };
}

// Helper function to convert ArrayBuffer to Base64 in a memory-efficient way
function arrayBufferToBase64(buffer) {
    const binary = [];
    const bytes = new Uint8Array(buffer);
    const chunkSize = 8192; // Process in chunks to avoid stack overflow

    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
    }

    return btoa(binary.join(""));
}

function pemToArrayBuffer(pem) {

    // Remove the '-----BEGIN RSAPUBLICKEY-----' and '-----END RSAPUBLICKEY-----' lines
    const cleanPem = pem
        .replace(/-----BEGIN.*KEY-----|-----END.*KEY-----|\s/g, '') // Clean PEM headers/footers and spaces
        .replace(/&#34;/g, '"') // Fix HTML-encoded double quotes
        .replace(/&#39;/g, "'")
        .trim(); // Fix HTML-encoded single quotes



    // Check if the cleaned PEM is now a valid Base64 string
    if (!/^[A-Za-z0-9+/=]+$/.test(cleanPem)) {
        throw new Error("Invalid Base64 string");
    }

    // Convert the cleaned PEM to binary string using atob
    const binaryString = atob(cleanPem);
    const binaryLen = binaryString.length;
    const bytes = new Uint8Array(binaryLen);

    // Convert binary string to Uint8Array
    for (let i = 0; i < binaryLen; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer; // Return ArrayBuffer
}


async function encryptAESKeyWithRSAOnBackend(aesKey, receiverId) {
    try {
        // Step 1: Send AES Key and Receiver ID to Backend
        const response = await fetch('/encryptAESKey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ aesKey, receiverId })
        });

        // Step 2: Get Encrypted AES Key from Backend
        const { encryptedAESKey } = await response.json();
        return encryptedAESKey; // Base64 Encoded
    } catch (error) {
        console.error("Error in encryptAESKeyWithRSAOnBackend function:", error);
        throw error;
    }
}


function saveMessageToSession({ roomId, senderId, messageText, timestamp, TIMEstatus = 'sending' }) {
let messages = JSON.parse(sessionStorage.getItem('secretChatMessages_' + roomId)) || [];

let disappearTime = parseInt(sessionStorage.getItem("disappearTimer_" + roomId)) || 0;

let message = { roomId, senderId, messageText, timestamp, TIMEstatus };
messages.push(message);

sessionStorage.setItem('secretChatMessages_' + roomId, JSON.stringify(messages));

// ✅ Set timeout to auto-delete message
if (disappearTime > 0) {
setTimeout(() => {
    deleteMessage(roomId, timestamp);
}, disappearTime * 1000);
}
}



function sendMessageDirectly(roomId, senderId, receiverId, encryptedMessage, timestamp, iv) {
    socket.emit("sendMessageDirectly", { roomId, senderId, receiverId, encryptedMessage, timestamp, iv });
}
function sendMessageWithRSA(roomId, senderId, receiverId, encryptedMessage, encryptedAESKey, timestamp, iv) {
    socket.emit("sendMessageWithRsa", { roomId, senderId, receiverId, encryptedMessage, encryptedAESKey, timestamp, iv })
}


document.getElementById("send-button").addEventListener("click", async () => {
    const messageText = document.getElementById("message-input").value.trim();
    isSecretChat = document.getElementById('secretChatToggle').checked;

    // Check if there's text or a media preview
    if (!messageText && !selectedFile) {
        return;
    }
    const timestamp = Date.now();
    if (messageText && (!selectedFile || selectedFile.length === 0)) {
        try {
            const aesKey = await loadKeyFromDB(roomId);
            const { encryptedMessage, iv } = await encryptMessage(messageText, aesKey);
            try {
                await Promise.resolve(sendMessageDirectly(roomId, senderId, receiverId, encryptedMessage, timestamp, iv))
                    .catch((err) => console.error("Silent error in sendMessageDirectly:", err));
            } catch (err) {
                console.error("Error in try block:", err);
            }
        } catch (err) {
            const aesKey = await generateAESKey();
            await saveKeyToDB(aesKey, roomId);
            await saveKeyToMongoDBOnBackend(aesKey, roomId, senderId);
            const { encryptedMessage, iv } = await encryptMessage(messageText, aesKey);
            const encryptedAESKey = await encryptAESKeyWithRSAOnBackend(aesKey, receiverId);
            sendMessageWithRSA(roomId, senderId, receiverId, encryptedMessage, encryptedAESKey, timestamp, iv);
        }

        displayMessage({ senderId, receiverId, messageText, timestamp });
        if (sessionStorage.getItem('isSecretChat_' + roomId) === 'true') {
            saveMessageToSession({ roomId, senderId, messageText, timestamp, TIMEstatus: 'sending' });
        }
        else { saveMessage(roomId, senderId, messageText, timestamp); }
        document.getElementById("message-input").value = "";
        return
    }
    else if (selectedFile.length > 0) {
        try {
            const aesKey = await loadKeyFromDB(roomId);
            for (const file of selectedFile) {
                await encryptFileAndText(file, messageText, aesKey);
            }


        } catch (err) {
            const aesKey = await generateAESKey();
            await saveKeyToDB(aesKey, roomId);
            await saveKeyToMongoDBOnBackend(aesKey, roomId, senderId);
            for (const file of selectedFile) {
                await encryptFileAndText(selectedFile, messageText, aesKey);
            }

            const encryptedAESKey = await encryptAESKeyWithRSAOnBackend(aesKey, receiverId);

        }
        for (const file of selectedFile) {
            const fileType = file.type;
            const fileName = file.name;
            const fileUrl = URL.createObjectURL(file);

            await displayFileMessage({
                senderId,
                fileUrl,
                fileType,
                fileName,
                timestamp,
                messageText,
                status: 'sending'
            });

            if (!isSecretChat) {
                await saveFileMessage(roomId, senderId, file, messageText, timestamp);
            }
        }

        // 🧹 **Cleanup after processing all files**
        document.getElementById("preview-container").innerHTML = '';
        selectedFile = []; // Array ko empty kar diya
        document.getElementById("message-input").value = "";
    }




});



async function saveKeyToMongoDBOnBackend(aesKey, roomId, senderId) {
    try {
        const response = await fetch('/saveKey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ aesKey, roomId, senderId }),
        });

        if (!response.ok) {
            throw new Error('Failed to save AES key to MongoDB.');
        }


    } catch (error) {
        console.error('Error saving AES key to backend:', error);
    }
}

const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
if (messageInput) {
    messageInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault(); // Prevent default form submission behavior
            sendButton.click(); // Trigger button click event
        }
    });
}

async function decryptAESKeyWithRSA(encryptedAESKey, receiverId) {
    try {

        // Backend Request
        const response = await fetch("/decryptAESKey", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ encryptedAESKey, receiverId }),
        });

        if (!response.ok) {
            throw new Error("Failed to decrypt AES key");
        }

        // Parse decrypted AES key from response
        const { decryptedAESKey } = await response.json();
        return decryptedAESKey; // Return decrypted key
    } catch (error) {
        console.error("Error in decryptAESKeyWithRSA:", error);
        throw error;
    }
}













async function decryptMessage(encryptedMessage, iv, aesKey) {
    try {
        // Decode Base64 IV, Encrypted Message, and AES Key
        const ivBuffer = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));
        const encryptedMessageBuffer = Uint8Array.from(atob(encryptedMessage), (c) => c.charCodeAt(0));
        const aesKeyBuffer = Uint8Array.from(atob(aesKey), (c) => c.charCodeAt(0));

        // Import AES Key
        const cryptoKey = await window.crypto.subtle.importKey(
            "raw",
            aesKeyBuffer.buffer,
            { name: "AES-GCM" },
            false,
            ["decrypt"]
        );

        // Decrypt the Message
        const decryptedData = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: ivBuffer },
            cryptoKey,
            encryptedMessageBuffer.buffer
        );

        // Convert Decrypted Data to String and Return
        return new TextDecoder().decode(decryptedData);
    } catch (error) {
        console.error("Error in decryptMessage:", error);
        throw error;
    }
}




socket.on("receiveMessageWithRsa", async (data) => {
    try {
        const { senderId, receiverId, encryptedMessage, encryptedAESKey, iv, timestamp } = data;

        // Decrypt AES Key
        const decryptedAESKey = await decryptAESKeyWithRSA(encryptedAESKey, receiverId);

        // Save AES Key to IndexedDB
        await saveKeyToDB(decryptedAESKey, roomId);
        await saveKeyToMongoDBOnBackend(decryptedAESKey, roomId, receiverId);
        socket.emit('aesKeySaved');
        // Decrypt Message
        const messageText = await decryptMessage(encryptedMessage, iv, decryptedAESKey);

        // Display and Save Message
        await displayMessage({ senderId, messageText, timestamp });
        await saveMessage(roomId, senderId, messageText, timestamp);
    } catch (error) {
        console.error("Error in message decryption flow:", error);
    }
});
socket.on("receiveMessageDirectly", async (data) => {
    try {
        const { roomId, senderId, receiverId, encryptedMessage, timestamp, iv } = data;
        const thisRoomId = await urlParams.get('roomId');

        let aesKey;

        // Try fetching AES key from IndexedDB
        try {
            aesKey = await loadKeyFromDB(thisRoomId);
        } catch (error) { }

        // Fallback to MongoDB if AES key is not found
        if (!aesKey) {
            try {
                aesKey = await fetchKeyFromMongoDB(roomId, senderId);
                if (aesKey) {
                    await saveKeyToDB(aesKey, thisRoomId);
                } else {
                    throw new Error("AES key missing in both IndexedDB and MongoDB.");
                }
            } catch (error) {
                throw error;
            }
        }

        // Decrypt the message
        const messageText = await decryptMessage(encryptedMessage, iv, aesKey);

        // Display and save the message
        await displayMessage({ senderId, messageText, timestamp });
        await saveMessage(thisRoomId, senderId, messageText, timestamp);
    } catch (error) {
        console.error("Error in message decryption process:", error);
    }
});

async function fetchKeyFromMongoDB(roomId, senderId) {
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
function openImageModal(imageUrl) {
    const modal = document.getElementById('media-modal');
    const modalImg = document.getElementById('modal-image');
    const modalVideo = document.getElementById('modal-video');

    modal.style.display = 'block';
    modalImg.src = imageUrl;
    modalImg.style.display = 'block';
    modalVideo.style.display = 'none';
}

function openVideoModal(videoUrl, videoType) {
    const modal = document.getElementById('media-modal');
    const modalVideo = document.getElementById('modal-video');
    const modalImg = document.getElementById('modal-image');

    modal.style.display = 'block';
    modalVideo.src = videoUrl;
    modalVideo.type = videoType;
    modalVideo.style.display = 'block';
    modalImg.style.display = 'none';
}

function closeModal() {
    const modal = document.getElementById('media-modal');
    const modalImg = document.getElementById('modal-image');
    const modalVideo = document.getElementById('modal-video');

    modal.style.display = 'none';
    modalImg.src = '';
    modalVideo.src = '';
}
function clearChatBox() {
    document.getElementById('chat-box').innerHTML = '';
}

function toggleSecretChat(isEnabled) {
    const roomId = urlParams.get('roomId');
    sessionStorage.setItem('isSecretChat_' + roomId, isEnabled);
    document.getElementById('secret-chat-label').style.display = isEnabled ? 'inline' : 'none';
    document.getElementById('set-timer-btn').style.display = "block";

    clearChatBox();

    if (isEnabled) {
        loadSecretMessages();
    } else {
        document.getElementById('set-timer-btn').style.display = "none";
        sessionStorage.removeItem('secretChatMessages_' + roomId);

        // ✅ Normal messages load karne se pehle check karo ki already call to nahi ho raha
        if (!document.getElementById("chat-box").hasAttribute("data-normal-loaded")) {
            document.getElementById("chat-box").setAttribute("data-normal-loaded", "true");
            setTimeout(() => {
                loadNormalMessages();
                document.getElementById("chat-box").removeAttribute("data-normal-loaded");
            }, 10);
        }
    }
}

function loadSecretMessages() {
    const roomId = urlParams.get('roomId');
    let messages = JSON.parse(sessionStorage.getItem('secretChatMessages_' + roomId)) || []; // ✅ Room-based key use karo
    messages.forEach(displayMessage);
}


function loadNormalMessages() {
    if (!isSecretChatEnabled()) {
        loadMessages();
    }
}

// ✅ Toggle Event
document.getElementById('secretChatToggle').addEventListener('change', function () {
    toggleSecretChat(this.checked);
});

// ✅ Page Load Handling
function isSecretChatEnabled() {
    const roomId = urlParams.get('roomId');
    return sessionStorage.getItem('isSecretChat_' + roomId) === 'true';
}

(function initializeChat() {
    const isSecretChat = isSecretChatEnabled();
    document.getElementById('secretChatToggle').checked = isSecretChat;
    toggleSecretChat(isSecretChat);
})();




setInterval(() => {
const roomId = urlParams.get('roomId'); // ✅ Current room ka ID
if (sessionStorage.getItem('isSecretChat_' + roomId) === 'true') { 
cleanupExpiredMessages(roomId);
}
}, 5000);

window.addEventListener("load", () => {
const roomId = urlParams.get('roomId');
cleanupExpiredMessages(roomId);
});

const deleteBtn = document.getElementById("delete-msg-btn");

function updateDeleteButton() {
const selectedMsgs = document.querySelectorAll(".select-msg:checked");
deleteBtn.style.display = selectedMsgs.length > 0 ? "block" : "none";
}

document.getElementById("delete-msg-btn").addEventListener("click", () => {
const selectedMsgs = document.querySelectorAll(".select-msg:checked");

selectedMsgs.forEach(msg => {
const msgElement = msg.closest(".message");
const msgTimestamp = Number(msgElement.dataset.messageId);
const roomId = urlParams.get('roomId');  // Current chat room ka ID lo

deleteMessageFromDB(roomId, msgTimestamp);
msgElement.remove(); // UI se bhi hatao
});

document.getElementById("delete-msg-btn").style.display = "none"; // Hide delete button
});



function deleteMessageFromDB(roomId, timestamp) {
const transaction = db.transaction("messages", "readwrite");
const store = transaction.objectStore("messages");
const index = store.index("roomId"); // Room ID index access karo

const request = index.openCursor(IDBKeyRange.only(roomId)); // Sirf specific room ke messages lo
request.onsuccess = (event) => {
const cursor = event.target.result;
if (cursor) {
    if (cursor.value.timestamp === timestamp) { // Check karo ki ye wahi message hai
        cursor.delete(); // Safe delete, jo sirf yahi specific message delete karega
    }
    cursor.continue(); // Next message check karne ke liye
}
};
}



// Initialize the DB
initDB();
