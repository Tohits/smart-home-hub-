const cron = require('node-cron');
const SunCalc = require('suncalc');
const db = require('./database');
const mqttService = require('./mqttService');
const webPush = require('./webPush');

const LATITUDE = parseFloat(process.env.LATITUDE || '28.6139');
const LONGITUDE = parseFloat(process.env.LONGITUDE || '77.2090');
const TIMEZONE = process.env.TIMEZONE || 'Asia/Kolkata';

function initScheduler() {
  console.log(`[Scheduler] Initializing engine for TZ: ${TIMEZONE}, LAT: ${LATITUDE}, LNG: ${LONGITUDE}...`);

  // Run every 1 minute to check schedules and solar triggers
  cron.schedule('* * * * *', async () => {
    await checkCronAndSolarSchedules();
  });
}

async function checkCronAndSolarSchedules() {
  try {
    const res = await db.query('SELECT * FROM schedules');
    const schedules = res.rows || [];

    const now = new Date();

    // Convert current UTC time to target timezone (Asia/Kolkata IST)
    const timeFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const currentStr = timeFormatter.format(now); // Formats as "HH:MM" in IST

    // Solar sunrise/sunset times
    const times = SunCalc.getTimes(now, LATITUDE, LONGITUDE);
    const sunriseStr = timeFormatter.format(times.sunrise);
    const sunsetStr  = timeFormatter.format(times.sunset);

    console.log(`[Scheduler Check] IST Time: ${currentStr} (Sunrise: ${sunriseStr}, Sunset: ${sunsetStr}) • Active Schedules: ${schedules.length}`);

    for (const schedule of schedules) {
      // Check if schedule is enabled (boolean true, 1, or string "true")
      const isEnabled = schedule.enabled === true || schedule.enabled === 1 || schedule.enabled === 'true' || schedule.enabled === '1' || schedule.enabled === undefined;
      if (!isEnabled) continue;

      let trigger = false;

      if (schedule.solar_event === 'sunrise' && currentStr === sunriseStr) {
        trigger = true;
      } else if (schedule.solar_event === 'sunset' && currentStr === sunsetStr) {
        trigger = true;
      } else if (schedule.time_cron && schedule.time_cron === currentStr) {
        trigger = true;
      }

      if (trigger) {
        const actionStr = (schedule.action || 'OFF').toUpperCase();
        const stateBool = (actionStr === 'ON');

        console.log(`[Scheduler Trigger] Executing schedule ${schedule.id}: Relay CH${schedule.channel} -> ${actionStr}`);

        // 1. Update database state
        await db.query(
          'UPDATE relays SET state = $1, updated_at = CURRENT_TIMESTAMP WHERE device_id = $2 AND channel = $3',
          [stateBool, schedule.device_id, schedule.channel]
        );

        // 2. Dispatch MQTT command to NodeMCU
        mqttService.setRelayState(schedule.device_id, schedule.channel, actionStr);

        // 3. Send Web Push Notification
        try {
          let rName = `Channel ${schedule.channel}`;
          const relayRes = await db.query('SELECT name FROM relays WHERE device_id = $1 AND channel = $2', [schedule.device_id, schedule.channel]);
          if (relayRes.rows && relayRes.rows[0] && relayRes.rows[0].name) {
            rName = relayRes.rows[0].name;
          }
          const actionText = stateBool ? 'turned ON 🟢' : 'turned OFF 🔴';

          webPush.sendNotificationToAll(
            '⏰ Scheduled Automation',
            `Automated schedule: ${rName} (Ch ${schedule.channel}) ${actionText}`,
            '/assets/icon-192.png',
            true
          );
        } catch (e) {
          console.error('[WebPush] Schedule notification error:', e.message);
        }

        // 4. Log event
        let relayName = `Channel ${schedule.channel}`;
        try {
          const relayRes = await db.query('SELECT name FROM relays WHERE device_id = $1 AND channel = $2', [schedule.device_id, schedule.channel]);
          if (relayRes.rows && relayRes.rows[0] && relayRes.rows[0].name) {
            relayName = `${relayRes.rows[0].name} (Channel ${schedule.channel})`;
          }
        } catch (e) {}

        const triggerInfo = schedule.solar_event ? `Solar ${schedule.solar_event.toUpperCase()}` : `${schedule.time_cron} IST`;

        await db.query(
          'INSERT INTO activity_logs (id, event_type, details, source, created_at) VALUES ($1, $2, $3, $4, $5)',
          [
            Date.now().toString(),
            'SCHEDULE_TRIGGER',
            `Automated schedule turned ${relayName} ${actionStr} [Scheduled: ${triggerInfo}]`,
            'scheduler',
            new Date().toISOString()
          ]
        );
      }
    }
  } catch (err) {
    console.error('[Scheduler] Error checking schedules:', err.message);
  }
}

module.exports = {
  initScheduler
};
