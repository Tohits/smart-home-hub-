const webpush = require('web-push');
const db = require('./database');

let vapidPublic = process.env.VAPID_PUBLIC_KEY;
let vapidPrivate = process.env.VAPID_PRIVATE_KEY;

if (!vapidPublic || !vapidPrivate || vapidPublic.includes('YOUR_VAPID')) {
  console.log('[WebPush] Generating transient VAPID keys for session...');
  const vapidKeys = webpush.generateVAPIDKeys();
  vapidPublic = vapidKeys.publicKey;
  vapidPrivate = vapidKeys.privateKey;
  console.log(`[WebPush] Transient Public Key: ${vapidPublic}`);
}

webpush.setVapidDetails(
  'mailto:admin@smarthomehub.local',
  vapidPublic,
  vapidPrivate
);

async function sendNotificationToAll(title, body, icon = '/assets/icon-192.png', quietHoursAllowed = false) {
  // Check Quiet Hours (e.g. 11 PM to 6 AM) unless quietHoursAllowed is true
  const now = new Date();
  const currentHour = now.getHours();
  if (!quietHoursAllowed && (currentHour >= 23 || currentHour < 6)) {
    console.log('[WebPush] Skipping push notification during Quiet Hours (11 PM - 6 AM)');
    return;
  }

  try {
    const res = await db.query('SELECT * FROM push_subscriptions');
    const subscriptions = res.rows || [];

    const payload = JSON.stringify({ title, body, icon, timestamp: Date.now() });

    const sendPromises = subscriptions.map(sub => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      };

      return webpush.sendNotification(pushSubscription, payload).catch(err => {
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`[WebPush] Removing expired subscription endpoint: ${sub.endpoint}`);
          db.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
        } else {
          console.error('[WebPush] Send error:', err.message);
        }
      });
    });

    await Promise.all(sendPromises);
  } catch (err) {
    console.error('[WebPush] Error fetching subscriptions:', err.message);
  }
}

module.exports = {
  vapidPublicKey: vapidPublic,
  sendNotificationToAll
};
