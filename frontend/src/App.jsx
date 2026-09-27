import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { LayoutDashboard, Calendar, DownloadCloud, Activity } from 'lucide-react';

import TelemetryHeader from './components/TelemetryHeader';
import RelayCard from './components/RelayCard';
import ScheduleManager from './components/ScheduleManager';
import OtaManager from './components/OtaManager';

export default function App() {
  const [deviceStatus, setDeviceStatus] = useState('offline');
  const [telemetry, setTelemetry] = useState({});
  const [relays, setRelays] = useState([]);
  const [logs, setLogs] = useState([]);
  const [otaStatus, setOtaStatus] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    fetchInitialData();

    const socket = io('/', {
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      console.log('[Socket.IO] Connected to backend gateway');
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
  }, []);

  const fetchInitialData = async () => {
    try {
      const relayRes = await axios.get('/api/relays');
      if (relayRes.data && relayRes.data.length > 0) {
        setRelays(relayRes.data);
      } else {
        // Fallback default relays if DB empty
        setRelays([
          { id: 'nodemcu_home_1_ch1', channel: 1, name: 'Main Light', state: false, icon: 'lightbulb' },
          { id: 'nodemcu_home_1_ch2', channel: 2, name: 'Ceiling Fan', state: false, icon: 'fan' },
          { id: 'nodemcu_home_1_ch3', channel: 3, name: 'AC Unit', state: false, icon: 'wind' },
          { id: 'nodemcu_home_1_ch4', channel: 4, name: 'Night Lamp', state: false, icon: 'moon' }
        ]);
      }

      const logRes = await axios.get('/api/logs');
      setLogs(logRes.data || []);
    } catch (err) {
      console.error('[App] Error fetching initial data:', err);
    }
  };

  const handleToggleRelay = async (channel, newState) => {
    // Optimistic UI update
    setRelays((prev) =>
      prev.map((r) => (r.channel === channel ? { ...r, state: newState } : r))
    );

    try {
      await axios.post('/api/relays/toggle', {
        deviceId: 'nodemcu_home_1',
        channel,
        state: newState
      });
    } catch (err) {
      console.error('[App] Toggle error:', err);
    }
  };

  const handleRebootDevice = async () => {
    if (!window.confirm('Are you sure you want to reboot the NodeMCU controller?')) return;
    try {
      await axios.post('/api/system/restart', { deviceId: 'nodemcu_home_1' });
      alert('Reboot command sent to NodeMCU.');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-gray-100 p-4 md:p-8 max-w-6xl mx-auto">
      {/* Telemetry Header */}
      <TelemetryHeader
        status={deviceStatus}
        telemetry={telemetry}
        isConnected={isConnected}
        onRestart={handleRebootDevice}
      />

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 mb-6 border-b border-gray-800 pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex items-center gap-2 text-xs font-semibold py-2 px-4 rounded-xl transition ${
            activeTab === 'dashboard'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
              : 'bg-gray-900 text-gray-400 hover:text-gray-200 hover:bg-gray-800'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" /> Relays & Controls
        </button>

        <button
          onClick={() => setActiveTab('automation')}
          className={`flex items-center gap-2 text-xs font-semibold py-2 px-4 rounded-xl transition ${
            activeTab === 'automation'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
              : 'bg-gray-900 text-gray-400 hover:text-gray-200 hover:bg-gray-800'
          }`}
        >
          <Calendar className="w-4 h-4" /> Schedules
        </button>

        <button
          onClick={() => setActiveTab('ota')}
          className={`flex items-center gap-2 text-xs font-semibold py-2 px-4 rounded-xl transition ${
            activeTab === 'ota'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
              : 'bg-gray-900 text-gray-400 hover:text-gray-200 hover:bg-gray-800'
          }`}
        >
          <DownloadCloud className="w-4 h-4" /> WAN OTA Manager
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 text-xs font-semibold py-2 px-4 rounded-xl transition ${
            activeTab === 'logs'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
              : 'bg-gray-900 text-gray-400 hover:text-gray-200 hover:bg-gray-800'
          }`}
        >
          <Activity className="w-4 h-4" /> Activity Logs
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'dashboard' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {relays.map((relay) => (
            <RelayCard key={relay.id || relay.channel} relay={relay} onToggle={handleToggleRelay} />
          ))}
        </div>
      )}

      {activeTab === 'automation' && <ScheduleManager />}

      {activeTab === 'ota' && <OtaManager otaStatus={otaStatus} />}

      {activeTab === 'logs' && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-xl">
          <h2 className="text-lg font-semibold text-white mb-4">Activity Logs</h2>
          <div className="space-y-2">
            {logs.length === 0 ? (
              <p className="text-xs text-gray-500 py-4 text-center">No logs recorded yet.</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="bg-gray-950/40 p-3 rounded-xl border border-gray-800/60 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-blue-400">[{log.event_type}]</span> {log.details}
                  </div>
                  <span className="text-gray-500">{new Date(log.created_at || Date.now()).toLocaleTimeString()}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
