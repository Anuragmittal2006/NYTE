const defaultSettings = {
    theme: "system",
    notificationSound: "ping",
    // Add more default settings here as needed
};


function setSetting(key, value) {
    if (defaultSettings[key] !== value) {
        saveSetting(key, value);
    }
}

function saveSetting(key, value) {
    if (!db) return;
    const tx = db.transaction("settings", "readwrite");
    const store = tx.objectStore("settings");
    store.put({ key, value });
}

function loadSetting(key) {
    return new Promise((resolve) => {
        if (!db) return resolve(null);
        const tx = db.transaction("settings", "readonly");
        const store = tx.objectStore("settings");
        const request = store.get(key);

        request.onsuccess = () => {
            resolve(request.result ? request.result.value : null);
        };
        request.onerror = () => resolve(null);
    });
}

async function applySettings() {
    for (const [key, defaultValue] of Object.entries(defaultSettings)) {
        const value = await loadSetting(key) || defaultValue;
        if (key === 'theme') applyTheme(value);
       
    }
}

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

function setTheme(theme) {
    applyTheme(theme);
    saveSetting("theme", theme);
}

function loadSettings() {
    loadSetting("theme", (theme) => {
        if (theme) {
            applyTheme(theme);
        } else {
            setTheme("system"); // Default to system if no theme is saved
        }
    });
}
applySettings();