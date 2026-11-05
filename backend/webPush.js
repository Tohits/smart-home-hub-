const webpush = require('web-push');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const keysFilePath = path.join(__dirname, 'vapid_keys.json');

let vapidPublic = process.env.VAPID_PUBLIC_KEY;
let vapidPrivate = process.env.VAPID_PRIVATE_KEY;

function loadOrGenerateVapidKeys() {
  if (vapidPublic && vapidPrivate && !vapidPublic.includes('YOUR_VAPID') && !vapidPublic.includes('AUTO') && vapidPublic.length > 30) {
    return { publicKey: vapidPublic, privateKey: vapidPrivate };
  }

  // Check persistent file on disk
  if (fs.existsSync(keysFilePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(keysFilePath, 'utf8'));
      if (data.publicKey && data.privateKey) {
        return data;
      }
    } catch (e) {}
  }

  // Generate permanent cryptographically valid P-256 VAPID keypair
  console.log('[WebPush] Generating permanent VAPID keypair...');
  const keys = webpush.generateVAPIDKeys();
  try {
    fs.writeFileSync(keysFilePath, JSON.stringify(keys, null, 2));
    console.log('[WebPush] Saved permanent VAPID keys to vapid_keys.json');
  } catch (e) {
    console.warn('[WebPush] Could not write vapid_keys.json:', e.message);
  }
  return keys;
}

const activeKeys = loadOrGenerateVapidKeys();
vapidPublic = activeKeys.publicKey;
vapidPrivate = activeKeys.privateKey;

try {
  webpush.setVapidDetails(
    'mailto:admin@smarthomehub.local',
    vapidPublic,
    vapidPrivate
  );
  console.log('[WebPush] VAPID details set successfully.');
} catch (err) {
  console.error('[WebPush] VAPID configuration notice:', err.message);
}

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

    console.log(`[WebPush] Dispatching notification "${title}" to ${subscriptions.length} subscribers...`);

    const sendPromises = subscriptions.map(sub => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      };

      return webpush.sendNotification(pushSubscription, payload).catch(err => {
        console.warn(`[WebPush] Push result for endpoint (${sub.endpoint.substring(0, 30)}...): status ${err.statusCode || err.message}`);
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
