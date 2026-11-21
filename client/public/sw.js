// Service worker — Web Push notifications for Devin Lottery (virtual credits, education only)
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: event.data ? event.data.text() : 'Devin Lottery' }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Devin Lottery', {
    body: data.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    data: { link: data.link || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) { c.navigate(link); return c.focus(); }
      }
      return clients.openWindow(link);
    })
  );
});
