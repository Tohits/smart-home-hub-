const webpush = require('web-push');
const db = require('./database');

let vapidPublic = process.env.VAPID_PUBLIC_KEY;
let vapidPrivate = process.env.VAPID_PRIVATE_KEY;

function initVapid() {
  try {
    if (!vapidPublic || !vapidPrivate || vapidPublic.includes('YOUR_VAPID') || vapidPublic.length < 30) {
      throw new Error('VAPID keys missing or invalid');
    }
    webpush.setVapidDetails(
      'mailto:admin@smarthomehub.local',
      vapidPublic,
      vapidPrivate
    );
    console.log('[WebPush] VAPID details configured successfully.');
  } catch (err) {
    console.warn('[WebPush] Auto-generating valid session VAPID keypair fallback:', err.message);
    const keys = webpush.generateVAPIDKeys();
    vapidPublic = keys.publicKey;
    vapidPrivate = keys.privateKey;
    webpush.setVapidDetails(
      'mailto:admin@smarthomehub.local',
      vapidPublic,
      vapidPrivate
    );
  }
}

initVapid();

async function sendNotificationToAll(title, body, icon = '/assets/icon-192.png', quietHoursAllowed = false) {
  const now = new Date();
  const currentHour = now.getHours();
  if (!quietHoursAllowed && (currentHour >= 23 || currentHour < 6)) {
    console.log('[WebPush] Skipping push notification during Quiet Hours');
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
          db.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
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
