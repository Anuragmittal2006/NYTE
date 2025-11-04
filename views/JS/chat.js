document.getElementById("set-timer-btn").addEventListener("click", function () {
    document.getElementById("timer-popup").style.display = "block";
});

document.getElementById("cancel-timer").addEventListener("click", function () {
    document.getElementById("timer-popup").style.display = "none";
});

// ✅ Outside Click par Popup Close
window.addEventListener("click", function (event) {
    let popup = document.getElementById("timer-popup");
    if (event.target === popup) {
        popup.style.display = "none";
    }
});
  
// ✅ Timer Save Logic
document.getElementById("save-timer").addEventListener("click", function () {
    const roomId = urlParams.get('roomId');

    let seconds = parseInt(document.getElementById("timer-seconds").value) || 0;
    let minutes = parseInt(document.getElementById("timer-minutes").value) || 0;
    let hours = parseInt(document.getElementById("timer-hours").value) || 0;
    let days = parseInt(document.getElementById("timer-days").value) || 0;

    // Total seconds calculation
    let totalSeconds = seconds + minutes * 60 + hours * 3600 + days * 86400;

    if (totalSeconds === 0) {
        sessionStorage.removeItem("disappearTimer_" + roomId); // ✅ Remove if no timer set
        alert("Disappearing timer removed.");
    } else {
        sessionStorage.setItem("disappearTimer_" + roomId, totalSeconds);
        alert(`Disappearing timer set to ${totalSeconds} seconds.`);
    }

    document.getElementById("timer-popup").style.display = "none"; // ✅ Close popup
});

function deleteMessage(roomId, timestamp) {
    let messages = JSON.parse(sessionStorage.getItem('secretChatMessages_' + roomId)) || [];

    messages = messages.filter(msg => msg.timestamp !== timestamp); // ✅ Remove expired message

    sessionStorage.setItem('secretChatMessages_' + roomId, JSON.stringify(messages));

    // ✅ UI se bhi remove karo
    clearChatBox();
    messages.forEach(displayMessage);
}


function cleanupExpiredMessages(roomId) {
    let messages = JSON.parse(sessionStorage.getItem('secretChatMessages_' + roomId)) || [];
    let disappearTime = parseInt(sessionStorage.getItem("disappearTimer_" + roomId)) || 0;
    const currentTime = Date.now();

    if (disappearTime > 0) {
        messages = messages.filter(msg => currentTime - msg.timestamp < disappearTime * 1000);
        sessionStorage.setItem('secretChatMessages_' + roomId, JSON.stringify(messages));
    }
    clearChatBox();
        messages.forEach(displayMessage);
}
function openDisappearingPopup() {
    document.getElementById('disappearing-popup').style.display = 'block';
}

// Close Popup
function closeDisappearingPopup() {
    document.getElementById('disappearing-popup').style.display = 'none';
}

// Auto-fill Custom Fields if Predefined Selected
function updateCustomFields() {
    const value = document.getElementById('predefined-timers').value;
    if (value) {
        const seconds = parseInt(value, 10);
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        document.getElementById('days').value = days;
        document.getElementById('hours').value = hours;
        document.getElementById('minutes').value = minutes;
        document.getElementById('seconds').value = secs;
    }
}

// Save Button - Placeholder for Functionality
function saveDisappearingTimer() {
    const days = parseInt(document.getElementById('days').value) || 0;
    const hours = parseInt(document.getElementById('hours').value) || 0;
    const minutes = parseInt(document.getElementById('minutes').value) || 0;
    const seconds = parseInt(document.getElementById('seconds').value) || 0;

    const totalSeconds = days * 86400 + hours * 3600 + minutes * 60 + seconds;

    // Handle 'Never' Option
    const neverOption = document.getElementById('never').checked;

    if (neverOption || totalSeconds === 0) {
        setDisappearingTimer(roomId, null); // Never disappear
        alert(`Disappearing messages disabled (Never).`);
    } else if (totalSeconds > 0) {
        setDisappearingTimer(roomId, totalSeconds);
        alert(`Disappearing messages set for ${totalSeconds} seconds!`);
    } else {
        alert('Please enter a valid time.');
    }

    closeDisappearingPopup();
}


// Placeholder Function (to implement in IndexedDB later)
function setDisappearingTimer(roomId, timerValue) {
    const transaction = db.transaction("rooms", "readwrite");
    const store = transaction.objectStore("rooms");

    const request = store.get(roomId);
    request.onsuccess = () => {
        const room = request.result;
        if (room) {
            room.disappearingTimer = timerValue;
            store.put(room); // Update existing room with timer
            console.log(`Timer set for room ${roomId}: ${timerValue}ms`);
        } else {
            console.error(`Room ${roomId} not found!`);
        }
    };
    request.onerror = () => {
        console.error("Failed to update disappearing timer.");
    };
}
const mediaButton = document.getElementById('media-button');
const mediaOptions = document.getElementById('media-options');

mediaButton.addEventListener('click', () => {
    mediaOptions.style.display = mediaOptions.style.display === 'block' ? 'none' : 'block';
});

// Create hidden input elements for file selection
const imageInput = document.createElement('input');
imageInput.type = 'file';
imageInput.accept = 'image/*';
imageInput.multiple = true;

const videoInput = document.createElement('input');
videoInput.type = 'file';
videoInput.accept = 'video/*';
videoInput.multiple = true;

const audioInput = document.createElement('input');
audioInput.type = 'file';
audioInput.accept = 'audio/*';
audioInput.multiple = true;

const documentInput = document.createElement('input');
documentInput.type = 'file';
documentInput.accept = '.pdf,.doc,.docx,.txt';
documentInput.multiple = true;
// Event listeners for media option buttons
document.getElementById('send-image').addEventListener('click', () => {
    imageInput.click();
    mediaOptions.style.display = 'none'
});

document.getElementById('send-video').addEventListener('click', () => {
    videoInput.click();
    mediaOptions.style.display = 'none'
});

document.getElementById('send-audio').addEventListener('click', () => {
    audioInput.click();
    mediaOptions.style.display = 'none'
});

document.getElementById('send-document').addEventListener('click', () => {
    documentInput.click();
    mediaOptions.style.display = 'none'
});

const previewContainer = document.getElementById('preview-container');
let selectedFile = []; // Array banaya multiple files store karne ke liye

function handleFileInput(e, type) {
    const files = Array.from(e.target.files); // Sare files ko array me convert kiya

    if (files.length > 0) {
        files.forEach((file) => {
            selectedFile.push(file); // Har naye file ko array me add kiya

            const previewItem = document.createElement('div');
            previewItem.classList.add('preview-item');

            let content;
            if (type === 'image') {
                content = `<img src="${URL.createObjectURL(file)}" alt="${file.name}">`;
            } else if (type === 'video') {
                content = `<video src="${URL.createObjectURL(file)}" controls></video>`;
            } else {
                content = `<span>${file.name}</span>`;
            }

            previewItem.innerHTML = `
        ${content}
        <button class="remove-btn">&times;</button>
    `;
            previewContainer.appendChild(previewItem);

            // Remove button functionality
            previewItem.querySelector('.remove-btn').addEventListener('click', () => {
                selectedFile = selectedFile.filter(f => f !== file); // Array se file hatao
                previewItem.remove();
            });
        });

        e.target.value = ''; // Input reset kro taaki dubara select ho sake
    }
}


imageInput.addEventListener('change', (e) => handleFileInput(e, 'image'));
videoInput.addEventListener('change', (e) => handleFileInput(e, 'video'));
audioInput.addEventListener('change', (e) => handleFileInput(e, 'audio'));
documentInput.addEventListener('change', (e) => handleFileInput(e, 'document'));
