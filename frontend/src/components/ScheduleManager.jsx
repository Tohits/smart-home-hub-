import React, { useState, useEffect } from 'react';
import { Calendar, Sun, Moon, Plus, Trash2, Clock } from 'lucide-react';
import axios from 'axios';

export default function ScheduleManager() {
  const [schedules, setSchedules] = useState([]);
  const [channel, setChannel] = useState(1);
  const [action, setAction] = useState('ON');
  const [scheduleType, setScheduleType] = useState('time'); // 'time' or 'solar'
  const [timeStr, setTimeStr] = useState('07:00');
  const [solarEvent, setSolarEvent] = useState('sunrise');

  useEffect(() => {
    fetchSchedules();
  }, []);

  const fetchSchedules = async () => {
    try {
      const res = await axios.get('/api/schedules');
      setSchedules(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddSchedule = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/schedules', {
        deviceId: 'nodemcu_home_1',
        channel: parseInt(channel, 10),
        timeCron: scheduleType === 'time' ? timeStr : null,
        solarEvent: scheduleType === 'solar' ? solarEvent : null,
        action
      });
      fetchSchedules();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`/api/schedules/${id}`);
      fetchSchedules();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-xl">
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="w-5 h-5 text-blue-400" />
        <h2 className="text-lg font-semibold text-white">Automation & Schedules (IST)</h2>
      </div>

      <form onSubmit={handleAddSchedule} className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6 bg-gray-950/60 p-4 rounded-xl border border-gray-800">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Relay Channel</label>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 text-white text-xs rounded-lg p-2 focus:outline-none"
          >
            <option value="1">Channel 1 (Main Light)</option>
            <option value="2">Channel 2 (Ceiling Fan)</option>
            <option value="3">Channel 3 (AC Unit)</option>
            <option value="4">Channel 4 (Night Lamp)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Action</label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 text-white text-xs rounded-lg p-2 focus:outline-none"
          >
            <option value="ON">Turn ON</option>
            <option value="OFF">Turn OFF</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Trigger Mode</label>
          <select
            value={scheduleType}
            onChange={(e) => setScheduleType(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 text-white text-xs rounded-lg p-2 focus:outline-none"
          >
            <option value="time">Clock Time (HH:MM)</option>
            <option value="solar">Solar (Sunrise/Sunset)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Trigger Setting</label>
          {scheduleType === 'time' ? (
            <input
              type="time"
              value={timeStr}
              onChange={(e) => setTimeStr(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 text-white text-xs rounded-lg p-2 focus:outline-none"
            />
          ) : (
            <select
              value={solarEvent}
              onChange={(e) => setSolarEvent(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 text-white text-xs rounded-lg p-2 focus:outline-none"
            >
              <option value="sunrise">Sunrise (🌅)</option>
              <option value="sunset">Sunset (🌆)</option>
            </select>
          )}
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-2 px-3 rounded-lg transition"
          >
            <Plus className="w-4 h-4" /> Add Trigger
          </button>
        </div>
      </form>

      <div className="space-y-2">
        {schedules.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-4">No active schedules configured.</p>
        ) : (
          schedules.map((item) => (
            <div key={item.id} className="flex items-center justify-between bg-gray-950/40 p-3 rounded-xl border border-gray-800/60">
              <div className="flex items-center gap-3">
                {item.solar_event ? (
                  item.solar_event === 'sunrise' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-purple-400" />
                ) : (
                  <Clock className="w-4 h-4 text-blue-400" />
                )}
                <div>
                  <div className="text-sm font-medium text-white">
                    Channel {item.channel} ➔ <span className={item.action === 'ON' ? 'text-emerald-400' : 'text-red-400'}>{item.action}</span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {item.solar_event ? `Solar Event: ${item.solar_event.toUpperCase()}` : `Time: ${item.time_cron}`}
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleDelete(item.id)}
                className="p-1.5 text-gray-500 hover:text-red-400 transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
