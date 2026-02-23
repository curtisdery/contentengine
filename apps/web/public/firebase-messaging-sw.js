/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCiutH86MsgXcl_8BAc68mg7k8CK1cQlxI',
  authDomain: 'pandocast-af179.firebaseapp.com',
  projectId: 'pandocast-af179',
  storageBucket: 'pandocast-af179.firebasestorage.app',
  messagingSenderId: '158506638234',
  appId: '1:158506638234:web:a0ddd9e41acf0456ff7823',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  const notificationTitle = payload.notification?.title || 'Pandocast';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: payload.data,
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  const url = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
