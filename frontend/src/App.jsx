import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { LayoutDashboard, Calendar, DownloadCloud, Activity } from 'lucide-react';

import TelemetryHeader from './components/TelemetryHeader';
import RelayCard from './components/RelayCard';
import ScheduleManager from './components/ScheduleManager';
import OtaManager from './components/OtaManager';

const RENDER_BACKEND_URL = 'https://smart-home-backend-16eu.onrender.com';

const DEFAULT_RELAYS = [
  { id: 'nodemcu_home_1_ch1', channel: 1, name: 'Main Light', state: false, icon: 'lightbulb' },
  { id: 'nodemcu_home_1_ch2', channel: 2, name: 'Ceiling Fan', state: false, icon: 'fan' },
  { id: 'nodemcu_home_1_ch3', channel: 3, name: 'AC Unit', state: false, icon: 'wind' },
  { id: 'nodemcu_home_1_ch4', channel: 4, name: 'Night Lamp', state: false, icon: 'moon' }
];

const getSavedRelays = () => {
  try {
    const saved = localStorage.getItem('smarthome_relays');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length === 4) return parsed;
    }
  } catch (e) {}
  return DEFAULT_RELAYS;
};

export default function App() {
  const [backendUrl, setBackendUrl] = useState(() => localStorage.getItem('smarthome_backend_url') || RENDER_BACKEND_URL);
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem('smarthome_theme_mode') || 'auto'); // 'auto', 'day', 'night'
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours());
  const [deviceStatus, setDeviceStatus] = useState('offline');
  const [telemetry, setTelemetry] = useState({ id: 'nodemcu_home_1', rssi: -65, freeHeap: 24500, uptime: 120 });
  const [relays, setRelays] = useState(getSavedRelays);
  const [logs, setLogs] = useState([]);
  const [otaStatus, setOtaStatus] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');

  // Auto time check every 1 minute for automatic theme transition
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentHour(new Date().getHours());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Determine if Day Mode is active
  const isDayMode = (() => {
    if (themeMode === 'day') return true;
    if (themeMode === 'night') return false;
    // Auto mode: Day between 6:00 AM (6) and 6:00 PM (18)
    return currentHour >= 6 && currentHour < 18;
  })();

  const handleCycleTheme = () => {
    let nextMode = 'auto';
    if (themeMode === 'auto') nextMode = 'day';
    else if (themeMode === 'day') nextMode = 'night';
    else nextMode = 'auto';

    setThemeMode(nextMode);
    localStorage.setItem('smarthome_theme_mode', nextMode);
  };

  const handleSaveBackendUrl = (newUrl) => {
    let cleanUrl = newUrl;
    if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
    setBackendUrl(cleanUrl);
    localStorage.setItem('smarthome_backend_url', cleanUrl);
    window.location.reload();
  };

  useEffect(() => {
    localStorage.setItem('smarthome_relays', JSON.stringify(relays));
  }, [relays]);

  useEffect(() => {
    if (isDayMode) {
      document.body.style.backgroundColor = '#f1f5f9';
      document.body.style.color = '#0f172a';
    } else {
      document.body.style.backgroundColor = '#0b0f19';
      document.body.style.color = '#f3f4f6';
    }
  }, [isDayMode]);

  // Automatic background polling every 8 seconds
  useEffect(() => {
    fetchInitialData();

    const pollTimer = setInterval(() => {
      fetchInitialData();
    }, 8000);

    return () => clearInterval(pollTimer);
  }, [backendUrl]);

  useEffect(() => {
    try {
      const socketTarget = backendUrl || RENDER_BACKEND_URL;
      const socket = io(socketTarget, {
        transports: ['websocket', 'polling'],
        timeout: 5000
      });

      socket.on('connect', () => {
        setIsConnected(true);
      });

      socket.on('disconnect', () => {
        setIsConnected(false);
      });

      socket.on('device:state', (data) => {
        if (data.status) setDeviceStatus(data.status);
        if (data.telemetry) setTelemetry(data.telemetry);
      });

      socket.on('device:status', (data) => {
        setDeviceStatus(data.status);
      });

      socket.on('device:telemetry', (data) => {
        setTelemetry(data);
      });

      socket.on('relay:update', (data) => {
        setRelays((prevRelays) =>
          prevRelays.map((r) =>
            r.channel === data.channel ? { ...r, state: data.state } : r
          )
        );
      });

      socket.on('ota:status', (data) => {
        setOtaStatus(data.status);
      });

      return () => {
        socket.disconnect();
      };
    } catch (e) {
      console.warn('[Socket.IO] Notice:', e);
    }
  }, [backendUrl]);

  const fetchInitialData = async () => {
    try {
      const baseUrl = backendUrl || RENDER_BACKEND_URL;

      const statusRes = await axios.get(`${baseUrl}/api/system/status`);
      if (statusRes.data) {
        if (statusRes.data.status) setDeviceStatus(statusRes.data.status);
        if (statusRes.data.telemetry) setTelemetry(statusRes.data.telemetry);
      }

      const relayRes = await axios.get(`${baseUrl}/api/relays`);
      if (relayRes.data && Array.isArray(relayRes.data) && relayRes.data.length > 0) {
        setRelays(relayRes.data);
      }

      const logRes = await axios.get(`${baseUrl}/api/logs`);
      if (logRes.data && Array.isArray(logRes.data)) {
        setLogs(logRes.data);
      }
    } catch (err) {
      console.warn('[App] Initial data notice:', err.message);
    }
  };

  const handleToggleRelay = async (channel, newState) => {
    setRelays((prev) =>
      prev.map((r) => (r.channel === channel ? { ...r, state: newState } : r))
    );

    try {
      const baseUrl = backendUrl || RENDER_BACKEND_URL;
      await axios.post(`${baseUrl}/api/relays/toggle`, {
        deviceId: 'nodemcu_home_1',
        channel,
        state: newState
      });
    } catch (err) {
      console.warn('[App] Toggle notice:', err.message);
    }
  };

  const handleUpdateRelayMetadata = (channel, newName, newIcon) => {
    setRelays((prev) =>
      prev.map((r) =>
        r.channel === channel ? { ...r, name: newName, icon: newIcon } : r
      )
    );
  };

  const handleRebootDevice = async () => {
    if (!window.confirm('Are you sure you want to reboot the NodeMCU controller?')) return;
    try {
      const baseUrl = backendUrl || RENDER_BACKEND_URL;
      await axios.post(`${baseUrl}/api/system/restart`, { deviceId: 'nodemcu_home_1' });
      alert('Reboot command sent to NodeMCU.');
    } catch (err) {
      console.warn(err);
    }
  };

  return (
    <div className={`min-h-screen p-4 md:p-8 max-w-6xl mx-auto transition-colors duration-300 ${
      isDayMode ? 'bg-slate-100 text-slate-900' : 'bg-[#0b0f19] text-gray-100'
    }`}>
      {/* Telemetry Header */}
      <TelemetryHeader
        status={deviceStatus}
        telemetry={telemetry}
        isConnected={isConnected}
        onRestart={handleRebootDevice}
        backendUrl={backendUrl}
        onSaveBackendUrl={handleSaveBackendUrl}
        isDayMode={isDayMode}
        themeMode={themeMode}
        onToggleTheme={handleCycleTheme}
      />

      {/* Tab Navigation */}
      <div className={`flex items-center gap-2 mb-6 border-b pb-3 overflow-x-auto ${
        isDayMode ? 'border-slate-200' : 'border-gray-800'
      }`}>
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex items-center gap-2 text-xs font-semibold py-2 px-4 rounded-xl transition ${
            activeTab === 'dashboard'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
              : isDayMode ? 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200' : 'bg-gray-900 text-gray-400 hover:text-gray-200 hover:bg-gray-800 border border-gray-800'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" /> Relays & Controls
        </button>

        <button
          onClick={() => setActiveTab('automation')}
          className={`flex items-center gap-2 text-xs font-semibold py-2 px-4 rounded-xl transition ${
            activeTab === 'automation'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
              : isDayMode ? 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200' : 'bg-gray-900 text-gray-400 hover:text-gray-200 hover:bg-gray-800 border border-gray-800'
          }`}
        >
          <Calendar className="w-4 h-4" /> Schedules
        </button>

        <button
          onClick={() => setActiveTab('ota')}
          className={`flex items-center gap-2 text-xs font-semibold py-2 px-4 rounded-xl transition ${
            activeTab === 'ota'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
              : isDayMode ? 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200' : 'bg-gray-900 text-gray-400 hover:text-gray-200 hover:bg-gray-800 border border-gray-800'
          }`}
        >
          <DownloadCloud className="w-4 h-4" /> WAN OTA Manager
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 text-xs font-semibold py-2 px-4 rounded-xl transition ${
            activeTab === 'logs'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
              : isDayMode ? 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200' : 'bg-gray-900 text-gray-400 hover:text-gray-200 hover:bg-gray-800 border border-gray-800'
          }`}
        >
          <Activity className="w-4 h-4" /> Activity Logs
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'dashboard' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {relays.map((relay) => (
            <RelayCard
              key={relay.id || relay.channel}
              relay={relay}
              onToggle={handleToggleRelay}
              onUpdateRelay={handleUpdateRelayMetadata}
              backendUrl={backendUrl}
              isDayMode={isDayMode}
            />
          ))}
        </div>
      )}

      {activeTab === 'automation' && <ScheduleManager backendUrl={backendUrl} />}

      {activeTab === 'ota' && <OtaManager otaStatus={otaStatus} />}

      {activeTab === 'logs' && (
        <div className={`border rounded-2xl p-5 shadow-xl ${
          isDayMode ? 'bg-white border-slate-200' : 'bg-gray-900 border-gray-800'
        }`}>
          <h2 className={`text-lg font-semibold mb-4 ${isDayMode ? 'text-slate-900' : 'text-white'}`}>
            Activity Logs
          </h2>
          <div className="space-y-2">
            {logs.length === 0 ? (
              <p className={`text-xs py-4 text-center ${isDayMode ? 'text-slate-400' : 'text-gray-500'}`}>No logs recorded yet.</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                  isDayMode ? 'bg-slate-50 border-slate-200' : 'bg-gray-950/40 border-gray-800/60'
                }`}>
                  <div>
                    <span className="font-semibold text-blue-500">[{log.event_type}]</span> {log.details}
                  </div>
                  <span className={isDayMode ? 'text-slate-400' : 'text-gray-500'}>
                    {new Date(log.created_at || Date.now()).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
