// ui.js — DOM and UI helper functions (displayMessage/displayFileMessage/modal/etc.)
// Uses window.chatHelpers.cfg for senderId.

(function(){
  const cfg = window.chatHelpers?.cfg || {};
  const SENDER_ID = cfg.senderId;
  const RECEIVER_ID = cfg.receiverId;
  const roomId = cfg.roomId || urlParams.get('roomId');


  // Helper: scroll to bottom
  function scrollToBottom() {
    const chatBox = document.getElementById('chat-box');
    if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
  }

  // Toggle selection UI helpers
  let selectionMode = false;
  function toggleSelection(el) {
    const checkbox = el.querySelector(".select-msg");
    if (!checkbox) return;
    checkbox.checked = !checkbox.checked;
    el.classList.toggle("selected", checkbox.checked);
    updateactionBar();
  }

  function selectMessage(messageElement) {
    let longPressTimer = null;
    let hasLongPressed = false;

    messageElement.addEventListener("mousedown", () => {
      hasLongPressed = false;
      longPressTimer = setTimeout(() => {
        hasLongPressed = true;
        if (!selectionMode) selectionMode = true;
        toggleSelection(messageElement);
      }, 600);
    });

    messageElement.addEventListener("mouseup", () => {
      clearTimeout(longPressTimer);
    });

    messageElement.addEventListener("mouseleave", () => {
      clearTimeout(longPressTimer);
    });

    messageElement.addEventListener("click", () => {
      if (selectionMode && !hasLongPressed) {
        toggleSelection(messageElement);
      }
    });

    messageElement.addEventListener("touchstart", () => {
      hasLongPressed = false;
      longPressTimer = setTimeout(() => {
        hasLongPressed = true;
        if (!selectionMode) selectionMode = true;
        toggleSelection(messageElement);
      }, 600);
    });

    messageElement.addEventListener("touchend", () => {
      clearTimeout(longPressTimer);
    });
  }

            const deleteBtn = document.getElementById("delete-msg-btn");

            function updateactionBar() {
                const selectedMsgs = document.querySelectorAll(".select-msg:checked");
                const selectedCount = selectedMsgs.length;
                const actionBar = document.getElementById("action-bar");
                const replyBtn = document.getElementById("reply-btn");
                const pullBackBtn = document.getElementById("unsend");
                const editBtn = document.getElementById("edit-btn"); // 🎯 Add this line
                const copyBtn = document.getElementById("copy-btn");
                selectionMode = selectedCount > 0;
                actionBar.style.display = selectionMode ? "flex" : "none";

                replyBtn.style.display = selectedCount === 1 ? "block" : "none";
                copyBtn.style.display = selectedCount === 1 ? "block" : "none";
                let allSentByCurrentUser = true;
                let onlyOneSelectedByCurrentUser = false;

                if (selectedCount === 1) {
                    const msgElement = selectedMsgs[0].closest(".message");
                    const currentUserId = msgElement.dataset.senderId;
                    onlyOneSelectedByCurrentUser = currentUserId === SENDER_ID;
                }

                selectedMsgs.forEach(msg => {
                    const msgElement = msg.closest(".message");
                    const currentUserId = msgElement.dataset.senderId;
                    if (currentUserId !== SENDER_ID) {
                        allSentByCurrentUser = false;
                    }
                });

                pullBackBtn.style.display = allSentByCurrentUser ? "block" : "none";
                editBtn.style.display = onlyOneSelectedByCurrentUser ? "block" : "none"; // 🎯 Show only if 1 msg by user
            }


            document.getElementById("reply-btn").addEventListener("click", () => {
                const selectedMsg = document.querySelector(".select-msg:checked");
                const msgElement = selectedMsg.closest(".message");

                const msgText = msgElement.querySelector("p").innerText;

                // Create reply preview UI
                showReplyPreview(msgText);

                // Clear selection
                selectionMode = false;
                document.querySelectorAll(".message").forEach(msg => {
                    msg.classList.remove("selected");
                    msg.querySelector(".select-msg").checked = false;
                });

                document.getElementById("action-bar").style.display = "none";
            });

            function showReplyPreview(msgText) {
                const replyContainer = document.getElementById("reply-preview");
                replyContainer.innerHTML = `
    <div class="reply-box">
      <span class="reply-label">Replying to:</span>
      <span class="reply-content">${msgText}</span>
      <button class="cancel-reply-btn">✖</button>
    </div>
  `;
                replyContainer.style.display = "block";

                // Cancel button listener
                replyContainer.querySelector(".cancel-reply-btn").addEventListener("click", () => {
                    replyContainer.style.display = "none";
                    replyContainer.innerHTML = "";
                });
            }

            document.getElementById("delete-msg-btn").addEventListener("click", () => {
                const selectedMsgs = document.querySelectorAll(".select-msg:checked");

                selectedMsgs.forEach(msg => {
                    const msgElement = msg.closest(".message");
                    const msgTimestamp = Number(msgElement.dataset.messageId);
                     // Current chat room ka ID lo

                    deleteMessageFromDB(roomId, msgTimestamp);
                    msgElement.remove(); // UI se bhi hatao
                });

                document.getElementById("action-bar").style.display = "none";
            });



            function deleteMessageFromDB(roomId, timestamp) {
                const transaction = db.transaction("messages", "readwrite");
                const store = transaction.objectStore("messages");
                const index = store.index("roomId"); // Room ID index access karo

                const request = index.openCursor(IDBKeyRange.only(roomId)); // Sirf specific room ke messages lo
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        if (cursor.value.timestamp == timestamp) { // Check karo ki ye wahi message hai
                            const deleteRequest = cursor.delete();
                            deleteRequest.onsuccess = () => {
                                const msgElement = document.querySelector(`.message[data-message-id="${timestamp}"]`);
                                if (msgElement) msgElement.remove();
                            };
                            deleteRequest.onerror = (e) => {
                                console.error("Failed to delete message:", e.target.error);
                            }; // Safe delete, jo sirf yahi specific message delete karega
                        }

                        cursor.continue(); // Next message check karne ke liye
                    }
                };
            }
            document.getElementById("unsend").addEventListener("click", () => {
                const selectedMsgs = document.querySelectorAll(".select-msg:checked");

                selectedMsgs.forEach(msg => {
                    const msgElement = msg.closest(".message");
                    const msgTimestamp = Number(msgElement.dataset.messageId);
                   
                    // Emit unsend request
                    socket.emit("unsendMessage", {
                       roomId,
  senderId: SENDER_ID,
  receiverId: RECEIVER_ID,
  messageId: msgTimestamp
                    });
                    // Apne local DB se bhi turant delete karo
                    deleteMessageFromDB(roomId, msgTimestamp);
                    msgElement.remove();
                });

                document.getElementById("action-bar").style.display = "none";
            });

            socket.on("deleteMessage", ({ roomId, messageId }) => {
                deleteMessageFromDB(roomId, messageId);
                const msgElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
                if (msgElement) msgElement.remove();
            });
            let editingMessage = null;

            document.getElementById("edit-btn").addEventListener("click", () => {
                const selected = document.querySelector(".select-msg:checked");
                if (!selected) return;

                const msgElement = selected.closest(".message");
                if (!msgElement) return;

                const pElement = msgElement.querySelector("p");
                if (!pElement) {
                    console.warn("No <p> tag found in message");
                    return;
                }

                const msgText = pElement.innerText;
                const msgId = msgElement.dataset.messageId;
                const senderId = msgElement.dataset.senderId;
                const input = document.getElementById("message-input");
                input.value = msgText;
                input.focus();

                // Store editing state
                input.dataset.editing = "true";
                input.dataset.msgId = msgElement.dataset.messageId;
                editingMessage = {
                    msgId,
                    text: msgText,
                    senderId,
                    element: msgElement
                };

                document.getElementById("send-button").style.display = "none";
                document.getElementById("update-button").style.display = "inline-block";
                document.getElementById('update-button').classList.add("disabled");
                document.getElementById("editing-popup").style.display = "block";
                document.getElementById("action-bar").style.display = "none";
            });
            document.getElementById("cancel-edit").addEventListener("click", () => {
                const input = document.getElementById("message-input");
                input.value = "";
                input.removeAttribute("data-editing");
                input.removeAttribute("data-msg-id");
                document.getElementById("send-button").style.display = "inline-block";
                document.getElementById("update-button").style.display = "none";
                document.getElementById("editing-popup").style.display = "none";

                // Hide action bar if needed
                const actionBar = document.getElementById("action-bar");
                actionBar.style.display = "none";

                // Uncheck all selected messages
                document.querySelectorAll(".select-msg:checked").forEach(cb => cb.checked = false);
                editingMessage = null; // inside cancel handler or after update

            });
            document.getElementById("copy-btn").addEventListener("click", () => {
    const selected = document.querySelector(".select-msg:checked");
    if (!selected) return;

    const msgElement = selected.closest(".message");
    if (!msgElement) return;

    const pElement = msgElement.querySelector("p");
    if (!pElement) {
        console.warn("No <p> tag found in message");
        return;
    }

    const msgText = pElement.innerText;

    // Copy text to clipboard
    navigator.clipboard.writeText(msgText)
        .then(() => {
           showToast("Message copied!");
                document.getElementById("action-bar").style.display = "none";
       
        })
        .catch(err => {
            console.error("Failed to copy text:", err);
        });
});function showToast(message) {
    const toast = document.getElementById("copy-toast");
    toast.innerText = message;
    toast.style.display = "block";
    toast.style.opacity = "1";

    setTimeout(() => {
        toast.style.transition = "opacity 0.5s ease";
        toast.style.opacity = "0";
    }, 1000);

    setTimeout(() => {
        toast.style.display = "none";
        toast.style.transition = "";
    }, 1500);
}

 async function updateMessageInDB(roomId, timestamp, encryptedMessage, iv) {
    const aesKey = await window.chatMessages.loadKeyFromDB(roomId);
    const newText = await decryptMessage(encryptedMessage, iv, aesKey);
    const transaction = db.transaction("messages", "readwrite");
    const store = transaction.objectStore("messages");
    const index = store.index("roomId");

    const request = index.openCursor(IDBKeyRange.only(roomId));

    request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
            if (cursor.value.timestamp == timestamp) {
                const updatedMsg = { ...cursor.value, messageText: newText, edited: true };

                const updateRequest = cursor.update(updatedMsg);

                updateRequest.onsuccess = () => {
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
}

         

  function getStatusIcon(status) {
    switch (status) {
      case 'sending': return '⏳';
      case 'sent': return '✔️';
      case 'seen': return '✔✔';
      default: return '';
    }
  }

  // Display plain text message (senderId / timestamp)
  function displayMessage({ senderId, messageText, timestamp, TIMEstatus = 'sending' }) {
    const chatBox = document.getElementById('chat-box');
    if (!chatBox) return null;

    const messageElement = document.createElement('div');
    const isSentMessage = senderId === SENDER_ID;
    messageElement.className = isSentMessage ? 'message sent' : 'message received';
    messageElement.setAttribute('data-message-id', timestamp);
    messageElement.setAttribute('data-sender-id', senderId);

    messageElement.innerHTML = `
      <input type="checkbox" class="select-msg" hidden>
      <p>${escapeHtml(messageText || '')}</p>
      <small>
        ${new Date(timestamp).toLocaleTimeString()}
        ${isSentMessage ? `<span class="status">${getStatusIcon(TIMEstatus)}</span>` : ''}
      </small>
    `;

    chatBox.appendChild(messageElement);
    scrollToBottom();
    selectMessage(messageElement);
    return messageElement;
  }

// Display file message (images, videos, audio, docs)
// Keeps preview-from-db, hasContent check, download-on-tap, and modal-opening behaviour.
async function displayFileMessage({
  senderId,
  fileUrl,
  fileType,
  fileName,
  timestamp,
  messageText,
  status = 'sending',
  fileId = null,
  roomId = null,
  iv,
  preview = null
}) {
  const chatBox = document.getElementById('chat-box');
  if (!chatBox) return null;

  const messageElement = document.createElement('div');
  const runtimeSenderId = (typeof SENDER_ID !== 'undefined') ? SENDER_ID : '<%= senderId %>';
  const isSentMessage = senderId === runtimeSenderId;
  messageElement.className = isSentMessage ? 'message sent' : 'message received';
  messageElement.setAttribute('data-message-id', timestamp);
  messageElement.setAttribute('data-sender-id', senderId);

  const fileContainer = document.createElement('div');
  fileContainer.className = 'file-container';

  let previewElement;
  let previewUrl = null;

  // 1) If preview param is a data URI or direct url, prefer it.
  try {
    if (preview) {
      if (typeof preview === 'string' && preview.startsWith('data:')) {
        previewUrl = preview; // base64/dataURL
      } else if (typeof preview === 'string' && /^https?:\/\//.test(preview)) {
        previewUrl = preview; // already a URL
      } else {
        // fallback: try to read preview blob from DB (previous behaviour)
        // getPreviewBlobFromDB should return a Blob or throw if not available
        const blob = await window.chatMessages.getPreviewBlobFromDB(roomId, timestamp).catch(() => null);
        if (blob) previewUrl = URL.createObjectURL(blob);
      }
    } else {
      // No preview param provided — try DB preview
      const blob = await window.chatMessages.getPreviewBlobFromDB(roomId, timestamp).catch(() => null);
      if (blob) previewUrl = URL.createObjectURL(blob);
    }
  } catch (err) {
    // If anything fails, just continue with fileUrl later.
    console.warn('preview preparation failed:', err);
    previewUrl = null;
  }

  // Create element by file type
  if (fileType && fileType.startsWith('image')) {
    previewElement = document.createElement('img');
    previewElement.src = previewUrl || fileUrl || '';
    previewElement.alt = fileName || 'image';
    previewElement.className = 'file-preview image-preview';
  } else if (fileType && fileType.startsWith('video')) {
    previewElement = document.createElement('video');
    previewElement.src = previewUrl || fileUrl || '';
    previewElement.controls = true;
    previewElement.className = 'file-preview video-preview';
    // Also add source fallback (helps some browsers)
    const src = document.createElement('source');
    src.src = fileUrl || '';
    if (fileType) src.type = fileType;
    previewElement.appendChild(src);
  } else if (fileType && fileType.startsWith('audio')) {
    previewElement = document.createElement('audio');
    previewElement.controls = true;
    previewElement.className = 'file-preview audio-preview';
    const src = document.createElement('source');
    src.src = fileUrl || '';
    if (fileType) src.type = fileType;
    previewElement.appendChild(src);
  } else {
    previewElement = document.createElement('div');
    previewElement.className = 'file-preview document-preview';
    previewElement.textContent = `📄 ${fileName || 'Document'}`;
    previewElement.style.cursor = 'pointer';
  }

  fileContainer.appendChild(previewElement);

  if (messageText) {
    // keep same behaviour as old code: append message text after preview
    fileContainer.appendChild(document.createTextNode(' ' + messageText));
  }

  const timeElement = document.createElement('small');
  timeElement.innerHTML = `
    ${new Date(timestamp).toLocaleTimeString()}
    ${isSentMessage ? `<span class="status">${getStatusIcon(status)}</span>` : ''}
  `;

  messageElement.appendChild(fileContainer);
  messageElement.appendChild(timeElement);
  chatBox.appendChild(messageElement);

  // Keep selection behaviour if you used it before
  try { selectMessage(messageElement); } catch (e) { /* ignore if not present */ }

  // Determine whether we already have file content saved locally (IndexedDB)
  let contentExists = false;
  try {
    if (typeof hasFileContent === 'function') {
      contentExists = await hasFileContent(roomId, timestamp);
    } else {
      // If helper missing, pessimistically assume false
      contentExists = false;
    }
  } catch (err) {
    console.warn('hasFileContent failed:', err);
    contentExists = false;
  }

  // Make images clickable cursor
  if (fileType && fileType.startsWith('image')) {
    previewElement.style.cursor = 'pointer';
  }

  // If content exists -> clicking should open modal (use previewUrl/fileUrl)
  if (contentExists) {
    const openUrl = previewUrl || fileUrl;
    previewElement.addEventListener('click', () => {
      openMediaModal(openUrl, fileType, fileName);
    });
  } else {
    // Not saved locally yet -> clicking should download, decrypt, save, then open
    previewElement.style.cursor = 'pointer';

    async function downloadAndBind() {
      try {
        // show UI feedback
        if (fileType && fileType.startsWith('image')) {
          // for images we can temporarily show a text-overlay or alt text
          previewElement.alt && (previewElement.alt = 'Downloading...');
        } else {
          previewElement.textContent = '📥 Downloading...';
        }
        previewElement.style.pointerEvents = 'none';

        // Only perform server download/decrypt for received files (not the sender's own already-saved file)
        if (!isSentMessage) {
          await window.chatMessages.handleFileTap(fileId, fileName, fileType, roomId, senderId, messageText, timestamp, iv);
        }

        // After saving, get blob from DB and create URL
        const blob = await window.chatMessages.getFileBlobFromDB(roomId, timestamp);
        const newUrl = URL.createObjectURL(blob);

        if (fileType && fileType.startsWith('image')) {
          previewElement.src = newUrl;
          // remove any textual content fallback
          previewElement.removeAttribute('alt');
          // replace click handler to open modal
          previewElement.addEventListener('click', () => openMediaModal(newUrl, fileType, fileName));
        } else if (fileType && (fileType.startsWith('video') || fileType.startsWith('audio'))) {
          // rewire src and enable play
          previewElement.src = newUrl;
          previewElement.load();
          previewElement.textContent = '';
          previewElement.addEventListener('click', () => openMediaModal(newUrl, fileType, fileName));
        } else {
          // document case: show filename and open modal to download / view
          previewElement.textContent = `📄 ${fileName}`;
          previewElement.addEventListener('click', () => openMediaModal(newUrl, fileType, fileName));
        }

        // re-enable pointer events and remove the one-time downloader
        previewElement.style.pointerEvents = 'auto';
        previewElement.removeEventListener('click', downloadAndBind);

        // attach persistent modal-opener (if not already attached)
        // ensure we do not attach duplicate handlers:
        previewElement.addEventListener('click', () => openMediaModal(newUrl, fileType, fileName));
      } catch (err) {
        console.error('downloadAndBind failed:', err);
        // restore UI so user can try again
        try {
          if (fileType && fileType.startsWith('image')) {
            previewElement.alt && (previewElement.alt = fileName || 'image');
          } else {
            previewElement.textContent = `📄 ${fileName || 'Document'}`;
          }
          previewElement.style.pointerEvents = 'auto';
        } catch (e) { /* ignore */ }
      }
    }

    // attach one-time downloader
    previewElement.addEventListener('click', downloadAndBind);
  }

  scrollToBottom();
  return messageElement;
}
async function displayAdMessage(timestamp = Date.now()) {
  const chatBox = document.getElementById('chat-box');
  if (!chatBox) return null;

  const messageElement = document.createElement('div');
  messageElement.className = 'message received ad-message';
  messageElement.setAttribute('data-message-id', timestamp);
  messageElement.setAttribute('data-sender-id', 'ad-system');

  const fileContainer = document.createElement('div');
  fileContainer.className = 'file-container ad-container';

  // Ad container div (id must match exactly what Adsterra gave you)
  const adDivId = "container-ae2f3ad2c705cf27954973b11c79c5dc";
  const adDiv = document.createElement('div');
  adDiv.id = adDivId;

  // "Ad" tag for compliance
  const adTag = document.createElement('span');
  adTag.innerText = 'Ad';
  adTag.className = 'ad-tag';

  fileContainer.appendChild(adDiv);
  fileContainer.appendChild(adTag);
  messageElement.appendChild(fileContainer);
  chatBox.appendChild(messageElement);

  // Dynamically inject the script
  const script = document.createElement('script');
  script.async = true;
  script.dataset.cfasync = "false";
  script.src = "//pl27760048.revenuecpmgate.com/ae2f3ad2c705cf27954973b11c79c5dc/invoke.js";
  document.body.appendChild(script); // must be added to DOM so it runs

  chatBox.scrollTop = chatBox.scrollHeight;
  return messageElement;
}

  // modal functions
  function openMediaModal(fileUrl, fileType, fileName = 'file') {
    const modal = document.getElementById('media-modal');
    const modalImg = document.getElementById('modal-image');
    const modalVideo = document.getElementById('modal-video');
    const modalAudio = document.getElementById('modal-audio');
    const modalDoc = document.getElementById('modal-document');
    const downloadBtn = document.getElementById('download-btn');

    // reset
    modalImg.style.display = 'none';
    modalVideo.style.display = 'none';
    modalAudio.style.display = 'none';
    modalDoc.style.display = 'none';

    modal.style.display = 'flex';

    if (!fileUrl) {
      console.warn('openMediaModal: no fileUrl');
      return;
    }

    if (fileType && fileType.startsWith("image")) {
      modalImg.src = fileUrl;
      modalImg.style.display = 'block';
    } else if (fileType && fileType.startsWith("video")) {
      modalVideo.src = fileUrl;
      modalVideo.style.display = 'block';
      modalImg.style.display = 'none';
    } else if (fileType && fileType.startsWith("audio")) {
      modalAudio.src = fileUrl;
      modalAudio.style.display = 'block';
      modalImg.style.display = 'none';
    } else {
      modalDoc.href = fileUrl;
      modalDoc.textContent = `📄 Open ${fileName}`;
      modalDoc.style.display = 'block';
    }

    downloadBtn.onclick = () => {
      const link = document.createElement('a');
      link.href = fileUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    document.getElementById('close-btn').onclick = () => {
      modal.style.display = 'none';
      modalVideo.pause?.();
      modalAudio.pause?.();
      modalImg.src = '';
      modalVideo.src = '';
      modalAudio.src = '';
    };
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
    const el = document.getElementById('chat-box');
    if (el) el.innerHTML = '';
  }

  // Secret chat toggles and loading
  function toggleSecretChat(isEnabled) {
    const roomId = (window.chatHelpers?.cfg?.roomId) || (new URLSearchParams(window.location.search)).get('roomId');
    sessionStorage.setItem('isSecretChat_' + roomId, isEnabled);
    document.getElementById('secret-chat-label').style.display = isEnabled ? 'inline' : 'none';
    document.getElementById('set-timer-btn').style.display = isEnabled ? 'block' : 'none';

    clearChatBox();

    if (isEnabled) {
      loadSecretMessages();
    } else {
      sessionStorage.removeItem('secretChatMessages_' + roomId);
      // load normal messages
      if (!document.getElementById('chat-box').hasAttribute('data-normal-loaded')) {
        document.getElementById('chat-box').setAttribute('data-normal-loaded', 'true');
        setTimeout(() => {
          if (typeof window.loadNormalMessages === 'function') window.loadNormalMessages();
          document.getElementById('chat-box').removeAttribute('data-normal-loaded');
        }, 10);
      }
    }
  }

  function loadSecretMessages() {
    const roomId = (window.chatHelpers?.cfg?.roomId) || (new URLSearchParams(window.location.search)).get('roomId');
    const messages = JSON.parse(sessionStorage.getItem('secretChatMessages_' + roomId) || '[]');
    messages.forEach(msg => {
      if (typeof displayMessage === 'function') displayMessage(msg);
    });
  }

  // small helpers
  function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-US", { day: "2-digit", month: "long", year: "numeric" });
  }

  function displayDateSeparator(date) {
    const chatContainer = document.getElementById("chat-box");
    const dateElement = document.createElement("div");
    dateElement.className = "date-separator";
    dateElement.textContent = date;
    chatContainer.appendChild(dateElement);
  }

  function getStatusIconLocal(status) {
    return getStatusIcon(status);
  }

  function updateStatus(messageElement, status) {
    const statusElement = messageElement.querySelector('.status');
    if (statusElement) statusElement.innerHTML = getStatusIcon(status);
  }

  function escapeHtml(unsafe) {
    return String(unsafe)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Expose functions
  window.chatUI = {
    displayMessage,
    displayFileMessage,
    displayAdMessage,
    openMediaModal,
    openVideoModal,
    closeModal,
    clearChatBox,
    toggleSecretChat,
    loadSecretMessages,
    displayDateSeparator,
    scrollToBottom,
    selectMessage,
    updateStatus,
    formatDate
  };

  // Auto-wire secret toggle (exists in markup)
  document.addEventListener('DOMContentLoaded', () => {
    const secretToggle = document.getElementById('secretChatToggle');
    if (secretToggle) {
      secretToggle.addEventListener('change', function() {
        toggleSecretChat(this.checked);
      });
      // init
      const roomId = (window.chatHelpers?.cfg?.roomId) || (new URLSearchParams(window.location.search)).get('roomId');
      const isSecret = sessionStorage.getItem('isSecretChat_' + roomId) === 'true';
      secretToggle.checked = isSecret;
      toggleSecretChat(isSecret);
    }
  });
  // === (INSERT INTO ui.js) ===
// Media button / file selection + preview integration with messages.js

document.addEventListener('DOMContentLoaded', () => {
  const mediaButton = document.getElementById('media-button');
  const mediaOptions = document.getElementById('media-options');
  const previewContainer = document.getElementById('preview-container');

  // toggle show/hide media options
  if (mediaButton && mediaOptions) {
    mediaButton.addEventListener('click', () => {
      mediaOptions.style.display = (mediaOptions.style.display === 'block') ? 'none' : 'block';
    });
  }

  // create file inputs (hidden) + wire option buttons
  const createFileInput = (accept) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.multiple = true;
    inp.style.display = 'none';
    document.body.appendChild(inp);
    return inp;
  };

  const imageInput = createFileInput('image/*');
  const videoInput = createFileInput('video/*');
  const audioInput = createFileInput('audio/*');
  const documentInput = createFileInput('.pdf,.doc,.docx,.txt');

  function makePreviewItem(file, type) {
    const previewItem = document.createElement('div');
    previewItem.className = 'preview-item';
    let content;
    if (type === 'image') {
      content = document.createElement('img');
      content.src = URL.createObjectURL(file);
      content.alt = file.name;
      content.className = 'preview-thumb';
      previewItem.appendChild(content);
    } else if (type === 'video') {
      content = document.createElement('video');
      content.src = URL.createObjectURL(file);
      content.controls = true;
      content.className = 'preview-thumb';
      previewItem.appendChild(content);
    } else {
      const span = document.createElement('span');
      span.textContent = file.name;
      previewItem.appendChild(span);
    }

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-btn';
    removeBtn.innerHTML = '&times;';
    previewItem.appendChild(removeBtn);

    removeBtn.addEventListener('click', () => {
      // remove from UI and from messages.js selectedFile
      const selectedFiles = window.chatMessages.getSelectedFiles();
      const idx = selectedFiles.findIndex(f => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified);
      if (idx !== -1) {
        window.chatMessages.removeSelectedFile(idx); // removes by index
      }
      previewItem.remove();
    });

    return previewItem;
  }

  function handleFileInput(e, type) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    // add to messages.js selectedFile
    window.chatMessages.addSelectedFiles(files);
    // create previews
    for (const file of files) {
      const item = makePreviewItem(file, type);
      previewContainer.appendChild(item);
    }
    // reset input so same file can be selected again if needed
    e.target.value = '';
  }

  // wire up media-buttons to inputs - check elements exist
  const sendImageBtn = document.getElementById('send-image');
  const sendVideoBtn = document.getElementById('send-video');
  const sendAudioBtn = document.getElementById('send-audio');
  const sendDocumentBtn = document.getElementById('send-document');

  if (sendImageBtn) sendImageBtn.addEventListener('click', () => { imageInput.click(); if (mediaOptions) mediaOptions.style.display = 'none'; });
  if (sendVideoBtn) sendVideoBtn.addEventListener('click', () => { videoInput.click(); if (mediaOptions) mediaOptions.style.display = 'none'; });
  if (sendAudioBtn) sendAudioBtn.addEventListener('click', () => { audioInput.click(); if (mediaOptions) mediaOptions.style.display = 'none'; });
  if (sendDocumentBtn) sendDocumentBtn.addEventListener('click', () => { documentInput.click(); if (mediaOptions) mediaOptions.style.display = 'none'; });

  imageInput.addEventListener('change', (e) => handleFileInput(e, 'image'));
  videoInput.addEventListener('change', (e) => handleFileInput(e, 'video'));
  audioInput.addEventListener('change', (e) => handleFileInput(e, 'audio'));
  documentInput.addEventListener('change', (e) => handleFileInput(e, 'document'));

  // optionally collapse mediaOptions if user taps outside
  document.addEventListener('click', (ev) => {
    if (!mediaOptions || !mediaButton) return;
    if (!mediaOptions.contains(ev.target) && ev.target !== mediaButton) {
      mediaOptions.style.display = 'none';
    }
  });

  // ---------------------- Timer popup UI wiring ----------------------
  const setTimerBtn = document.getElementById('set-timer-btn');
  const timerPopup = document.getElementById('timer-popup');
  const saveTimerBtn = document.getElementById('save-timer');
  const cancelTimerBtn = document.getElementById('cancel-timer'); // optional element, might not exist
  const timerOptionsSelect = document.getElementById('timer-options');

  function closeTimerPopup() {
    if (timerPopup) timerPopup.style.display = 'none';
  }

  function openTimerPopup() {
    if (timerPopup) timerPopup.style.display = 'block';
  }

  if (setTimerBtn) setTimerBtn.addEventListener('click', openTimerPopup);
  if (cancelTimerBtn) cancelTimerBtn.addEventListener('click', closeTimerPopup);

  // outside click to close popup - check presence of popup
  window.addEventListener('click', function(event) {
    if (!timerPopup) return;
    if (event.target === timerPopup) closeTimerPopup();
  });

  async function onSaveTimerClicked() {
    // robust: accept either the legacy select (#timer-options) or custom fields if those exist
    const roomIdLocal = (window.chatHelpers?.cfg?.roomId) || (new URLSearchParams(window.location.search)).get('roomId');

    let totalSeconds = 0;

    if (timerOptionsSelect && timerOptionsSelect.value && timerOptionsSelect.value !== 'none') {
      // support values like '10s', '30s', '1m', '5m' OR plain seconds
      const val = timerOptionsSelect.value;
      if (typeof val === 'string' && val.endsWith('s')) {
        totalSeconds = parseInt(val.slice(0, -1), 10) || 0;
      } else if (typeof val === 'string' && val.endsWith('m')) {
        totalSeconds = (parseInt(val.slice(0, -1), 10) || 0) * 60;
      } else {
        totalSeconds = parseInt(val, 10) || 0;
      }
    } else {
      // fallback: custom fields in popup: try multiple ids (supporting both variants you've used)
      const secs = document.getElementById('timer-seconds')?.value || document.getElementById('seconds')?.value || '0';
      const mins = document.getElementById('timer-minutes')?.value || document.getElementById('minutes')?.value || '0';
      const hrs  = document.getElementById('timer-hours')?.value   || document.getElementById('hours')?.value   || '0';
      const days = document.getElementById('timer-days')?.value    || document.getElementById('days')?.value    || '0';
      const s = parseInt(secs,10) || 0;
      const m = parseInt(mins,10) || 0;
      const h = parseInt(hrs,10)  || 0;
      const d = parseInt(days,10) || 0;
      totalSeconds = s + m*60 + h*3600 + d*86400;
    }

    try {
      if (!roomIdLocal) throw new Error('roomId missing');
      if (totalSeconds === 0) {
        await window.chatMessages.setDisappearingTimer(roomIdLocal, null);
        alert('Disappearing timer removed.');
      } else {
        await window.chatMessages.setDisappearingTimer(roomIdLocal, totalSeconds);
        alert(`Disappearing timer set to ${totalSeconds} seconds.`);
      }
    } catch (err) {
      console.error('Failed to save disappearing timer', err);
      alert('Failed to save timer. See console.');
    } finally {
      closeTimerPopup();
    }
  }

  if (saveTimerBtn) saveTimerBtn.addEventListener('click', onSaveTimerClicked);

});

})();
