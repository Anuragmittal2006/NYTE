self.addEventListener("push", function (event) {
  const data = event.data.json();
  const options = {
    body: data.message,
    icon: "/notification-icon.png",
    data: { url: `/chat?roomId=${data.roomId}` },
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});
// service-worker.js
importScripts('/views/JS/queue.js'); // Queue functions load

console.log("✅ Service Worker loaded");
self.addEventListener('sync', event => {
  if (event.tag === 'sendQueuedMessages') {
    event.waitUntil((async () => {
      const msgs = await getAllQueuedMessages();
      for (const msg of msgs) {
         try {
      const url = msg.type === "direct" ? "/sendDirectHTTP" : "/sendRSAHTTP";
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msg)
      });
      await deleteMessageFromQueue(msg.timestamp);
      console.log("✅ Sent via HTTP:", msg.timestamp);
    } catch (err) {
      console.error("Retry failed:", err);
    }
      }
    })());
  }
});

