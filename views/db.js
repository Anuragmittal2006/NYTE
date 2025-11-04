// db.js
let db;
const dbName = "ChatDB";
function initDB(callback) {
    let request = indexedDB.open(dbName, 1);

    request.onerror = (event) => console.error("DB error:", event);

    request.onsuccess = (event) => {
        db = event.target.result;
        if (callback) callback(db); // Jo kaam karna hai, wo callback me bhejo
    };

    request.onupgradeneeded = (event) => {
        db = event.target.result;

        if (!db.objectStoreNames.contains("rooms")) {
            db.createObjectStore("rooms", { keyPath: "roomId" });
        }
        if (!db.objectStoreNames.contains("messages")) {
            const messageStore = db.createObjectStore("messages", { keyPath: "id", autoIncrement: true });
            messageStore.createIndex("roomId", "roomId", { unique: false });
            messageStore.createIndex("fileId", "fileId", { unique: true });

        }
        if (!db.objectStoreNames.contains('users')) {
            db.createObjectStore("users", { keyPath: "email" });
        }
        if (!db.objectStoreNames.contains("settings")) {
            db.createObjectStore("settings", { keyPath: "key" });
        }
           if (!db.objectStoreNames.contains("outgoingMessages")) {
                const store = db.createObjectStore("outgoingMessages", { keyPath: "timestamp" });
                store.createIndex("roomId", "roomId", { unique: false });
            }
    };
}

// Isko call kar lo jab bhi app load ho
initDB();
