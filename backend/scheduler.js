const cron = require('node-cron');
const SunCalc = require('suncalc');
const db = require('./database');
const mqttService = require('./mqttService');

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

        // 3. Log event
        await db.query(
          'INSERT INTO activity_logs (id, event_type, details, source) VALUES ($1, $2, $3, $4)',
          [Date.now().toString(), 'SCHEDULE_TRIGGER', `Schedule ${schedule.id} turned Relay CH${schedule.channel} ${actionStr}`, 'scheduler']
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
