const webpush = require('web-push');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const keysFilePath = path.join(__dirname, 'vapid_keys.json');

function isValidVapidPublicKey(key) {
  if (!key || typeof key !== 'string') return false;
  if (key.length !== 87) return false;
  if (key.includes('+') || key.includes('/') || key.includes('=')) return false;
  if (!key.startsWith('B')) return false;
  return true;
}

function getValidVapidKeys() {
  const envPublic = process.env.VAPID_PUBLIC_KEY;
  const envPrivate = process.env.VAPID_PRIVATE_KEY;

  // 1. Check if Render env vars are valid 87-char keys
  if (isValidVapidPublicKey(envPublic) && envPrivate && envPrivate.length >= 40) {
    return { publicKey: envPublic, privateKey: envPrivate };
  }

  // 2. Check persistent disk file
  if (fs.existsSync(keysFilePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(keysFilePath, 'utf8'));
      if (isValidVapidPublicKey(data.publicKey) && data.privateKey) {
        return data;
      }
    } catch (e) {}
  }

  // 3. Generate fresh valid P-256 VAPID keypair
  console.log('[WebPush] Generating fresh 87-char valid VAPID keypair...');
  const keys = webpush.generateVAPIDKeys();
  try {
    fs.writeFileSync(keysFilePath, JSON.stringify(keys, null, 2));
    console.log('[WebPush] Saved valid VAPID keypair to vapid_keys.json');
  } catch (e) {
    console.warn('[WebPush] Notice writing vapid_keys.json:', e.message);
  }
  return keys;
}

const activeKeys = getValidVapidKeys();
const vapidPublic = activeKeys.publicKey;
const vapidPrivate = activeKeys.privateKey;

try {
  webpush.setVapidDetails(
    'mailto:admin@smarthomehub.local',
    vapidPublic,
    vapidPrivate
  );
  console.log('[WebPush] VAPID active public key (87 chars, starts with B):', vapidPublic);
} catch (err) {
  console.error('[WebPush] VAPID configuration notice:', err.message);
}

async function sendNotificationToAll(title, body, icon = '/assets/icon-192.png', quietHoursAllowed = true) {
  try {
    let subscriptions = [];
    try {
      const res = await db.query('SELECT * FROM push_subscriptions');
      subscriptions = res.rows || [];
    } catch (e) {}

    // Combine with persistent file backup so subscribers are never lost when PWA is closed
    if (db.getPushSubscriptionsBackup) {
      const backups = db.getPushSubscriptionsBackup();
      for (const bSub of backups) {
        if (!subscriptions.some(s => s.endpoint === bSub.endpoint)) {
          subscriptions.push(bSub);
        }
      }
    }

    if (subscriptions.length === 0) {
      console.log('[WebPush] No subscribers found in database or backup.');
      return;
    }

    const payload = JSON.stringify({ title, body, icon, timestamp: Date.now() });

    console.log(`[WebPush] Dispatching notification "${title}" to ${subscriptions.length} subscribers...`);

    const sendPromises = subscriptions.map(sub => {
      const p256dhKey = sub.p256dh || (sub.keys && sub.keys.p256dh);
      const authKey = sub.auth || (sub.keys && sub.keys.auth);

      if (!sub.endpoint || !p256dhKey || !authKey) {
        console.warn('[WebPush] Skipping incomplete subscription record:', sub.endpoint);
        return Promise.resolve();
      }

      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: p256dhKey,
          auth: authKey
        }
      };

      return webpush.sendNotification(pushSubscription, payload).catch(err => {
        console.warn(`[WebPush] Push result status: ${err.statusCode || err.message}`);
        if (err.statusCode === 410) {
          db.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
          if (db.removePushSubscriptionBackup) db.removePushSubscriptionBackup(sub.endpoint);
        }
      });
    });

    await Promise.all(sendPromises);
  } catch (err) {
    console.error('[WebPush] Error dispatching push notifications:', err.message);
  }
}

module.exports = {
  vapidPublicKey: vapidPublic,
  sendNotificationToAll
};
