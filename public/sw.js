self.addEventListener('push', event => {
    const data = event.data.json();

    self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/icon.png',
        data: { fileUrl: data.fileUrl },
        requireInteraction: true // Keeps the notification visible until user interacts
    });
});

self.addEventListener('notificationclick', event => {
    console.log('Notification clicked!');
    event.notification.close(); // Close the notification panel

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            for (const client of clientList) {
                if (client.url === '/test.html' && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(event.notification.data.fileUrl);
            }
        })
    );
});
