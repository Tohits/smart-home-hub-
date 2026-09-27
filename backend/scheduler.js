const cron = require('node-cron');
const SunCalc = require('suncalc');
const db = require('./database');
const mqttService = require('./mqttService');

const LATITUDE = parseFloat(process.env.LATITUDE || '28.6139');
const LONGITUDE = parseFloat(process.env.LONGITUDE || '77.2090');

let activeCronJobs = [];

function initScheduler() {
  console.log(`[Scheduler] Initializing engine for LAT: ${LATITUDE}, LNG: ${LONGITUDE}...`);

  // Run every 1 minute to check schedules and solar triggers
  cron.schedule('* * * * *', async () => {
    await checkCronAndSolarSchedules();
  }, {
    timezone: process.env.TIMEZONE || 'Asia/Kolkata'
  });
}

async function checkCronAndSolarSchedules() {
  try {
    const res = await db.query('SELECT * FROM schedules WHERE enabled = true');
    const schedules = res.rows || [];

    const now = new Date();
    const times = SunCalc.getTimes(now, LATITUDE, LONGITUDE);

    const sunriseStr = `${times.sunrise.getHours().toString().padStart(2, '0')}:${times.sunrise.getMinutes().toString().padStart(2, '0')}`;
    const sunsetStr  = `${times.sunset.getHours().toString().padStart(2, '0')}:${times.sunset.getMinutes().toString().padStart(2, '0')}`;

    const currentStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    for (const schedule of schedules) {
      let trigger = false;

      if (schedule.solar_event === 'sunrise' && currentStr === sunriseStr) {
        trigger = true;
      } else if (schedule.solar_event === 'sunset' && currentStr === sunsetStr) {
        trigger = true;
      } else if (schedule.time_cron && schedule.time_cron === currentStr) {
        trigger = true;
      }

      if (trigger) {
        console.log(`[Scheduler] Executing schedule ${schedule.id}: Relay CH${schedule.channel} -> ${schedule.action}`);
        mqttService.setRelayState(schedule.device_id, schedule.channel, schedule.action);

        await db.query(
          'INSERT INTO activity_logs (id, event_type, details, source) VALUES ($1, $2, $3, $4)',
          [Date.now().toString(), 'SCHEDULE_TRIGGER', `Schedule ${schedule.id} turned Relay CH${schedule.channel} ${schedule.action}`, 'scheduler']
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
