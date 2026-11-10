import React, { useState, useEffect } from 'react';
import { Calendar, Sun, Moon, Plus, Trash2, Clock, Repeat, Zap, Edit2, Check, X } from 'lucide-react';
import axios from 'axios';

// Convert 12h + AM/PM to 24h HH:MM string for backend
const convert12to24 = (hour12, minute, ampm) => {
  let h = parseInt(hour12, 10);
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  const hh = h.toString().padStart(2, '0');
  const mm = minute.toString().padStart(2, '0');
  return `${hh}:${mm}`;
};

// Format 24h HH:MM string to 12h AM/PM for display
const format24to12 = (time24) => {
  if (!time24) return '';
  const parts = time24.split(':');
  if (parts.length < 2) return time24;
  let h = parseInt(parts[0], 10);
  const m = parts[1];
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h.toString().padStart(2, '0')}:${m} ${ampm}`;
};

// Parse 24h HH:MM string to 12h picker components
const parse24to12 = (time24) => {
  if (!time24) return { hour12: '07', minute: '00', ampm: 'AM' };
  const parts = time24.split(':');
  if (parts.length < 2) return { hour12: '07', minute: '00', ampm: 'AM' };
  let h = parseInt(parts[0], 10);
  const m = parts[1].padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  const hour12 = h.toString().padStart(2, '0');
  return { hour12, minute: m, ampm };
};

export default function ScheduleManager({ backendUrl, relays = [], isDayMode }) {
  const [schedules, setSchedules] = useState([]);
  const [channel, setChannel] = useState(1);
  const [action, setAction] = useState('OFF');
  const [scheduleType, setScheduleType] = useState('time'); // 'time' or 'solar'
  const [repeatDaily, setRepeatDaily] = useState(true);

  // 12-Hour AM/PM Picker States
  const [hour12, setHour12] = useState('07');
  const [minute, setMinute] = useState('00');
  const [ampm, setAmpm] = useState('AM');
  const [solarEvent, setSolarEvent] = useState('sunrise');

  // Editing Schedule States
  const [editingId, setEditingId] = useState(null);
  const [editChannel, setEditChannel] = useState(1);
  const [editAction, setEditAction] = useState('OFF');
  const [editScheduleType, setEditScheduleType] = useState('time');
  const [editHour12, setEditHour12] = useState('07');
  const [editMinute, setEditMinute] = useState('00');
  const [editAmpm, setEditAmpm] = useState('AM');
  const [editSolarEvent, setEditSolarEvent] = useState('sunrise');
  const [editRepeatDaily, setEditRepeatDaily] = useState(true);

  useEffect(() => {
    fetchSchedules();
  }, [backendUrl]);

  const fetchSchedules = async () => {
    try {
      const baseUrl = backendUrl || '';
      const res = await axios.get(`${baseUrl}/api/schedules`);
      setSchedules(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const getRelayName = (channelNum) => {
    const r = relays.find((item) => Number(item.channel) === Number(channelNum));
    return r && r.name ? r.name : `Channel ${channelNum}`;
  };

  const handleAddSchedule = async (e) => {
    e.preventDefault();
    try {
      const baseUrl = backendUrl || '';
      const timeCron24 = scheduleType === 'time' ? convert12to24(hour12, minute, ampm) : null;

      await axios.post(`${baseUrl}/api/schedules`, {
        deviceId: 'nodemcu_home_1',
        channel: parseInt(channel, 10),
        timeCron: timeCron24,
        solarEvent: scheduleType === 'solar' ? solarEvent : null,
        action,
        repeatDaily
      });
      fetchSchedules();
    } catch (err) {
      console.error(err);
    }
  };

  const handleStartEdit = (item) => {
    setEditingId(item.id);
    setEditChannel(item.channel);
    setEditAction(item.action || 'OFF');
    setEditScheduleType(item.solar_event ? 'solar' : 'time');
    setEditSolarEvent(item.solar_event || 'sunrise');
    setEditRepeatDaily(item.repeat_daily !== false);

    if (item.time_cron) {
      const parsed = parse24to12(item.time_cron);
      setEditHour12(parsed.hour12);
      setEditMinute(parsed.minute);
      setEditAmpm(parsed.ampm);
    }
  };

  const handleSaveEdit = async (id) => {
    try {
      const baseUrl = backendUrl || '';
      const timeCron24 = editScheduleType === 'time' ? convert12to24(editHour12, editMinute, editAmpm) : null;

      await axios.put(`${baseUrl}/api/schedules/${id}`, {
        deviceId: 'nodemcu_home_1',
        channel: parseInt(editChannel, 10),
        timeCron: timeCron24,
        solarEvent: editScheduleType === 'solar' ? editSolarEvent : null,
        action: editAction,
        repeatDaily: editRepeatDaily
      });

      setEditingId(null);
      fetchSchedules();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    setSchedules((prev) => prev.filter((s) => s.id !== id));

    try {
      const baseUrl = backendUrl || '';
      await axios.delete(`${baseUrl}/api/schedules/${id}`);
      fetchSchedules();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className={`border rounded-2xl p-5 shadow-xl transition-colors duration-300 ${
      isDayMode ? 'bg-white border-slate-200' : 'bg-gray-900 border-gray-800'
    }`}>
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="w-5 h-5 text-blue-500" />
        <h2 className={`text-lg font-semibold ${isDayMode ? 'text-slate-900' : 'text-white'}`}>
          Automation & Schedules (12-Hour AM/PM IST)
        </h2>
      </div>

      {/* Add New Schedule Form */}
      <form onSubmit={handleAddSchedule} className={`grid grid-cols-1 md:grid-cols-7 gap-3 mb-6 p-4 rounded-xl border ${
        isDayMode ? 'bg-slate-50 border-slate-200' : 'bg-gray-950/60 border-gray-800'
      }`}>
        <div>
          <label className={`block text-xs font-medium mb-1 ${isDayMode ? 'text-slate-500' : 'text-gray-400'}`}>
            Relay Channel
          </label>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className={`w-full border text-xs rounded-lg p-2 focus:outline-none ${
              isDayMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-gray-900 border-gray-700 text-white'
            }`}
          >
            {[1, 2, 3, 4].map((chNum) => {
              const name = getRelayName(chNum);
              return (
                <option key={chNum} value={chNum}>
                  Channel {chNum} ({name})
                </option>
              );
            })}
          </select>
        </div>

        <div>
          <label className={`block text-xs font-medium mb-1 ${isDayMode ? 'text-slate-500' : 'text-gray-400'}`}>
            Action
          </label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className={`w-full border text-xs rounded-lg p-2 focus:outline-none ${
              isDayMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-gray-900 border-gray-700 text-white'
            }`}
          >
            <option value="OFF">Turn OFF 🔴</option>
            <option value="ON">Turn ON 🟢</option>
          </select>
        </div>

        <div>
          <label className={`block text-xs font-medium mb-1 ${isDayMode ? 'text-slate-500' : 'text-gray-400'}`}>
            Trigger Mode
          </label>
          <select
            value={scheduleType}
            onChange={(e) => setScheduleType(e.target.value)}
            className={`w-full border text-xs rounded-lg p-2 focus:outline-none ${
              isDayMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-gray-900 border-gray-700 text-white'
            }`}
          >
            <option value="time">Clock Time (AM/PM)</option>
            <option value="solar">Solar (Sunrise/Sunset)</option>
          </select>
        </div>

        {/* 12-Hour AM/PM Time Selector */}
        {scheduleType === 'time' ? (
          <div className="md:col-span-2">
            <label className={`block text-xs font-medium mb-1 ${isDayMode ? 'text-slate-500' : 'text-gray-400'}`}>
              Select Time (HH : MM AM/PM)
            </label>
            <div className="flex gap-1">
              <select
                value={hour12}
                onChange={(e) => setHour12(e.target.value)}
                className={`flex-1 border text-xs rounded-lg p-2 focus:outline-none ${
                  isDayMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-gray-900 border-gray-700 text-white'
                }`}
              >
                {Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0')).map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>

              <span className={`self-center font-bold ${isDayMode ? 'text-slate-400' : 'text-gray-400'}`}>:</span>

              <select
                value={minute}
                onChange={(e) => setMinute(e.target.value)}
                className={`flex-1 border text-xs rounded-lg p-2 focus:outline-none ${
                  isDayMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-gray-900 border-gray-700 text-white'
                }`}
              >
                {Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0')).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>

              <select
                value={ampm}
                onChange={(e) => setAmpm(e.target.value)}
                className={`border font-bold text-xs rounded-lg px-2 focus:outline-none ${
                  isDayMode
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'bg-blue-950 border-blue-600 text-blue-300'
                }`}
              >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </div>
          </div>
        ) : (
          <div className="md:col-span-2">
            <label className={`block text-xs font-medium mb-1 ${isDayMode ? 'text-slate-500' : 'text-gray-400'}`}>
              Trigger Event
            </label>
            <select
              value={solarEvent}
              onChange={(e) => setSolarEvent(e.target.value)}
              className={`w-full border text-xs rounded-lg p-2 focus:outline-none ${
                isDayMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-gray-900 border-gray-700 text-white'
              }`}
            >
              <option value="sunrise">Sunrise (🌅)</option>
              <option value="sunset">Sunset (<ctrl42>)</option>
            </select>
          </div>
        )}

        {/* Repeat Every Day Toggle Switch */}
        <div>
          <label className={`block text-xs font-medium mb-1 ${isDayMode ? 'text-slate-500' : 'text-gray-400'}`}>
            Repeat Mode
          </label>
          <button
            type="button"
            onClick={() => setRepeatDaily(!repeatDaily)}
            className={`w-full flex items-center justify-center gap-1 py-2 px-2 rounded-lg text-xs font-semibold border transition ${
              repeatDaily
                ? isDayMode
                  ? 'bg-blue-50 text-blue-600 border-blue-200'
                  : 'bg-blue-600/20 text-blue-400 border-blue-500/40'
                : isDayMode
                  ? 'bg-amber-50 text-amber-600 border-amber-200'
                  : 'bg-amber-600/20 text-amber-400 border-amber-500/40'
            }`}
          >
            {repeatDaily ? <Repeat className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
            {repeatDaily ? 'Every Day' : 'One-Time'}
          </button>
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-2 px-3 rounded-lg transition shadow-lg shadow-blue-600/20"
          >
            <Plus className="w-4 h-4" /> Add Trigger
          </button>
        </div>
      </form>

      {/* Schedules List */}
      <div className="space-y-3">
        {schedules.length === 0 ? (
          <p className={`text-xs text-center py-4 ${isDayMode ? 'text-slate-400' : 'text-gray-500'}`}>
            No active schedules configured.
          </p>
        ) : (
          schedules.map((item) => (
            <div key={item.id} className={`rounded-xl border transition-all duration-300 ${
              isDayMode ? 'bg-slate-50 border-slate-200' : 'bg-gray-950/40 border-gray-800/60'
            }`}>
              {editingId === item.id ? (
                /* Inline Edit Schedule Form */
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between border-b pb-2 mb-2">
                    <span className="text-xs font-bold text-blue-500 uppercase tracking-wider">Edit Schedule</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(item.id)}
                        className="p-1.5 bg-emerald-600/20 text-emerald-500 border border-emerald-500/30 rounded-lg hover:bg-emerald-600/30 flex items-center gap-1 text-xs font-semibold px-2"
                      >
                        <Check className="w-3.5 h-3.5" /> Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="p-1.5 bg-red-600/20 text-red-500 border border-red-500/30 rounded-lg hover:bg-red-600/30 flex items-center gap-1 text-xs font-semibold px-2"
                      >
                        <X className="w-3.5 h-3.5" /> Cancel
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                    <div>
                      <label className={`block text-[10px] font-medium mb-1 ${isDayMode ? 'text-slate-500' : 'text-gray-400'}`}>Relay Channel</label>
                      <select
                        value={editChannel}
                        onChange={(e) => setEditChannel(e.target.value)}
                        className={`w-full border text-xs rounded-lg p-1.5 focus:outline-none ${
                          isDayMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-gray-900 border-gray-700 text-white'
                        }`}
                      >
                        {[1, 2, 3, 4].map((chNum) => (
                          <option key={chNum} value={chNum}>
                            Channel {chNum} ({getRelayName(chNum)})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className={`block text-[10px] font-medium mb-1 ${isDayMode ? 'text-slate-500' : 'text-gray-400'}`}>Action</label>
                      <select
                        value={editAction}
                        onChange={(e) => setEditAction(e.target.value)}
                        className={`w-full border text-xs rounded-lg p-1.5 focus:outline-none ${
                          isDayMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-gray-900 border-gray-700 text-white'
                        }`}
                      >
                        <option value="OFF">Turn OFF 🔴</option>
                        <option value="ON">Turn ON 🟢</option>
                      </select>
                    </div>

                    <div>
                      <label className={`block text-[10px] font-medium mb-1 ${isDayMode ? 'text-slate-500' : 'text-gray-400'}`}>Trigger Mode</label>
                      <select
                        value={editScheduleType}
                        onChange={(e) => setEditScheduleType(e.target.value)}
                        className={`w-full border text-xs rounded-lg p-1.5 focus:outline-none ${
                          isDayMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-gray-900 border-gray-700 text-white'
                        }`}
                      >
                        <option value="time">Clock Time (AM/PM)</option>
                        <option value="solar">Solar (Sunrise/Sunset)</option>
                      </select>
                    </div>

                    {editScheduleType === 'time' ? (
                      <div className="md:col-span-2">
                        <label className={`block text-[10px] font-medium mb-1 ${isDayMode ? 'text-slate-500' : 'text-gray-400'}`}>Select Time</label>
                        <div className="flex gap-1">
                          <select
                            value={editHour12}
                            onChange={(e) => setEditHour12(e.target.value)}
                            className={`flex-1 border text-xs rounded-lg p-1.5 focus:outline-none ${
                              isDayMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-gray-900 border-gray-700 text-white'
                            }`}
                          >
                            {Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0')).map((h) => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                          <span className={`self-center font-bold ${isDayMode ? 'text-slate-400' : 'text-gray-400'}`}>:</span>
                          <select
                            value={editMinute}
                            onChange={(e) => setEditMinute(e.target.value)}
                            className={`flex-1 border text-xs rounded-lg p-1.5 focus:outline-none ${
                              isDayMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-gray-900 border-gray-700 text-white'
                            }`}
                          >
                            {Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0')).map((m) => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                          <select
                            value={editAmpm}
                            onChange={(e) => setEditAmpm(e.target.value)}
                            className={`border font-bold text-xs rounded-lg px-2 focus:outline-none ${
                              isDayMode ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-blue-950 border-blue-600 text-blue-300'
                            }`}
                          >
                            <option value="AM">AM</option>
                            <option value="PM">PM</option>
                          </select>
                        </div>
                      </div>
                    ) : (
                      <div className="md:col-span-2">
                        <label className={`block text-[10px] font-medium mb-1 ${isDayMode ? 'text-slate-500' : 'text-gray-400'}`}>Trigger Event</label>
                        <select
                          value={editSolarEvent}
                          onChange={(e) => setEditSolarEvent(e.target.value)}
                          className={`w-full border text-xs rounded-lg p-1.5 focus:outline-none ${
                            isDayMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-gray-900 border-gray-700 text-white'
                          }`}
                        >
                          <option value="sunrise">Sunrise (🌅)</option>
                          <option value="sunset">Sunset (🌆)</option>
                        </select>
                      </div>
                    )}

                    <div>
                      <label className={`block text-[10px] font-medium mb-1 ${isDayMode ? 'text-slate-500' : 'text-gray-400'}`}>Repeat Mode</label>
                      <button
                        type="button"
                        onClick={() => setEditRepeatDaily(!editRepeatDaily)}
                        className={`w-full flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-semibold border transition ${
                          editRepeatDaily
                            ? isDayMode ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-blue-600/20 text-blue-400 border-blue-500/40'
                            : isDayMode ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-amber-600/20 text-amber-400 border-amber-500/40'
                        }`}
                      >
                        {editRepeatDaily ? <Repeat className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                        {editRepeatDaily ? 'Every Day' : 'One-Time'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Regular Schedule Item Display */
                <div className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {item.solar_event ? (
                      item.solar_event === 'sunrise' ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-purple-400" />
                    ) : (
                      <Clock className="w-4 h-4 text-blue-500" />
                    )}
                    <div>
                      <div className={`text-sm font-semibold ${isDayMode ? 'text-slate-900' : 'text-white'}`}>
                        Channel {item.channel} ({getRelayName(item.channel)}) ➔ <span className={item.action === 'ON' ? 'text-emerald-500 font-bold' : 'text-red-500 font-bold'}>{item.action}</span>
                      </div>
                      <div className={`text-xs flex items-center gap-1.5 mt-0.5 ${isDayMode ? 'text-slate-500' : 'text-gray-400'}`}>
                        <span>{item.solar_event ? `Solar Event: ${item.solar_event.toUpperCase()}` : `Time: ${format24to12(item.time_cron)} IST`}</span>
                        {item.repeat_daily !== false ? (
                          <span className={`text-[10px] border px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1 ${
                            isDayMode
                              ? 'bg-blue-50 text-blue-600 border-blue-200'
                              : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                          }`}>
                            <Repeat className="w-2.5 h-2.5" /> Repeats Daily
                          </span>
                        ) : (
                          <span className={`text-[10px] border px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1 ${
                            isDayMode
                              ? 'bg-amber-50 text-amber-600 border-amber-200'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}>
                            <Zap className="w-2.5 h-2.5" /> One-Time Run
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleStartEdit(item)}
                      className={`p-1.5 transition ${isDayMode ? 'text-slate-400 hover:text-blue-600' : 'text-gray-500 hover:text-blue-400'}`}
                      title="Edit Schedule"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className={`p-1.5 transition ${isDayMode ? 'text-slate-400 hover:text-red-500' : 'text-gray-500 hover:text-red-400'}`}
                      title="Delete Schedule"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
