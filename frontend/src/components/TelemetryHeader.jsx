import React, { useState } from 'react';
import { Wifi, Cpu, Clock, ShieldCheck, BellRing, RefreshCw } from 'lucide-react';
import axios from 'axios';

export default function TelemetryHeader({ status, telemetry, isConnected, onRestart }) {
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  const handleSubscribePush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Push notifications are not supported by your browser.');
      return;
    }

    try {
      setSubscribing(true);
      const res = await axios.get('/api/push/vapid-key');
      const publicKey = res.data.publicKey;

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      await axios.post('/api/push/subscribe', sub.toJSON());
      setPushSubscribed(true);
      alert('VAPID Web Push Notifications enabled!');
    } catch (err) {
      console.error(err);
      alert('Push subscription error: ' + err.message);
    } finally {
      setSubscribing(false);
    }
  };

  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const isOnline = status === 'online';

  return (
    <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-4 md:p-6 mb-6 shadow-xl backdrop-blur-md">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-gray-800 pb-4 mb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">Smart Home Hub</h1>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
              isOnline ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'
            }`}>
              {isOnline ? '● Online' : '○ Offline'}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">NodeMCU ESP8266 v1.5.0 • Device ID: {telemetry.id || 'nodemcu_home_1'}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSubscribePush}
            disabled={pushSubscribed || subscribing}
            className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl transition ${
              pushSubscribed
                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30 cursor-default'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20'
            }`}
          >
            <BellRing className="w-3.5 h-3.5" />
            {pushSubscribed ? 'Alerts On' : subscribing ? 'Enabling...' : 'Enable Push Alerts'}
          </button>

          <button
            onClick={onRestart}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 rounded-xl transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reboot
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gray-950/50 p-3 rounded-xl border border-gray-800/80">
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
            <Wifi className="w-3.5 h-3.5 text-blue-400" /> Wi-Fi RSSI
          </div>
          <div className="text-base font-semibold text-white">
            {telemetry.rssi ? `${telemetry.rssi} dBm` : 'N/A'}
          </div>
        </div>

        <div className="bg-gray-950/50 p-3 rounded-xl border border-gray-800/80">
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
            <Cpu className="w-3.5 h-3.5 text-emerald-400" /> Free Heap
          </div>
          <div className="text-base font-semibold text-white">
            {telemetry.freeHeap ? `${(telemetry.freeHeap / 1024).toFixed(1)} KB` : 'N/A'}
          </div>
        </div>

        <div className="bg-gray-950/50 p-3 rounded-xl border border-gray-800/80">
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
            <Clock className="w-3.5 h-3.5 text-purple-400" /> Uptime
          </div>
          <div className="text-base font-semibold text-white">
            {telemetry.uptime ? `${Math.floor(telemetry.uptime / 60)} mins` : 'N/A'}
          </div>
        </div>

        <div className="bg-gray-950/50 p-3 rounded-xl border border-gray-800/80">
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" /> Real-time Link
          </div>
          <div className={`text-base font-semibold ${isConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
            {isConnected ? 'WebSocket Active' : 'Connecting...'}
          </div>
        </div>
      </div>
    </div>
  );
}
