import React, { useState, useEffect } from 'react';
import { Wifi, Cpu, Clock, BellRing, RefreshCw, Download, Timer, Settings, CalendarClock, Sun, Moon } from 'lucide-react';
import axios from 'axios';

export default function TelemetryHeader({ status, telemetry, isConnected, onRestart, backendUrl, onSaveBackendUrl, isDayMode, onToggleTheme }) {
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [inputUrl, setInputUrl] = useState(backendUrl || '');
  const [clockTime, setClockTime] = useState(new Date());

  // Live 1-second Digital Clock
  useEffect(() => {
    const timer = setInterval(() => {
      setClockTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setInputUrl(backendUrl || '');
  }, [backendUrl]);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleSaveUrl = (e) => {
    e.preventDefault();
    onSaveBackendUrl(inputUrl.trim());
    setShowSettings(false);
  };

  const handleInstallPwa = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      alert('To install, tap your browser menu (⋮ or Share icon) and select "Add to Home Screen" or "Install App".');
    }
  };

  const handleSubscribePush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Push notifications are not supported by your browser.');
      return;
    }

    try {
      setSubscribing(true);
      const baseUrl = backendUrl || '';
      const res = await axios.get(`${baseUrl}/api/push/vapid-key`);
      const publicKey = res.data?.publicKey;

      if (!publicKey) {
        throw new Error('Please click "Backend Config" and enter your Render Backend URL first.');
      }

      const reg = await navigator.serviceWorker.ready;
      const existingSub = await reg.pushManager.getSubscription();
      if (existingSub) {
        await existingSub.unsubscribe();
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      await axios.post(`${baseUrl}/api/push/subscribe`, sub.toJSON());
      setPushSubscribed(true);
      alert('VAPID Web Push Notifications enabled!');
    } catch (err) {
      console.error(err);
      alert('Push subscription notice: ' + (err.response?.data?.error || err.message));
    } finally {
      setSubscribing(false);
    }
  };

  const urlBase64ToUint8Array = (base64String) => {
    if (!base64String || typeof base64String !== 'string') {
      throw new Error('VAPID public key string is invalid.');
    }
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const formatTimeRemaining = (seconds) => {
    if (!isOnline || seconds === undefined || seconds === null) {
      return 'N/A';
    }
    if (seconds <= 0) return 'Rebooting...';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hrs}h ${mins}m`;
  };

  const isOnline = status === 'online';

  return (
    <div className={`border rounded-2xl p-4 md:p-6 mb-6 shadow-xl backdrop-blur-md transition-all duration-300 ${
      isDayMode
        ? 'bg-white/90 border-slate-200 shadow-slate-200/50 text-slate-800'
        : 'bg-gray-900/90 border-gray-800 text-gray-100'
    }`}>
      <div className={`flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b pb-4 mb-4 ${
        isDayMode ? 'border-slate-200' : 'border-gray-800'
      }`}>
        <div>
          <div className="flex items-center gap-3">
            <h1 className={`text-xl md:text-2xl font-bold tracking-tight ${isDayMode ? 'text-slate-900' : 'text-white'}`}>
              Smart Home Hub
            </h1>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
              isOnline ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30' : 'bg-red-500/10 text-red-600 border border-red-500/30'
            }`}>
              {isOnline ? '● Online' : '○ Offline'}
            </span>
          </div>
          <p className={`text-xs mt-1 ${isDayMode ? 'text-slate-500' : 'text-gray-400'}`}>
            NodeMCU ESP8266 v1.5.0 • Device ID: {telemetry.id || 'nodemcu_home_1'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Day / Night Theme Toggle Button */}
          <button
            onClick={onToggleTheme}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 border rounded-xl transition ${
              isDayMode
                ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                : 'bg-gray-800 text-amber-400 border-gray-700 hover:bg-gray-700'
            }`}
            title="Toggle Day / Night Mode"
          >
            {isDayMode ? <Sun className="w-3.5 h-3.5 text-amber-600" /> : <Moon className="w-3.5 h-3.5 text-amber-400" />}
            {isDayMode ? 'Day Mode' : 'Night Mode'}
          </button>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 border rounded-xl transition ${
              isDayMode ? 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200' : 'bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700'
            }`}
            title="Configure Render Backend URL"
          >
            <Settings className="w-3.5 h-3.5 text-amber-500" />
            Backend Config
          </button>

          <button
            onClick={handleInstallPwa}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition shadow-lg shadow-emerald-600/20"
            title="Install App to Home Screen"
          >
            <Download className="w-3.5 h-3.5" />
            Install App
          </button>

          <button
            onClick={handleSubscribePush}
            disabled={pushSubscribed || subscribing}
            className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl transition ${
              pushSubscribed
                ? 'bg-blue-500/10 text-blue-600 border border-blue-500/30 cursor-default'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20'
            }`}
          >
            <BellRing className="w-3.5 h-3.5" />
            {pushSubscribed ? 'Alerts On' : subscribing ? 'Enabling...' : 'Push Alerts'}
          </button>

          <button
            onClick={onRestart}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 border rounded-xl transition ${
              isDayMode ? 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200' : 'bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reboot
          </button>
        </div>
      </div>

      {showSettings && (
        <form onSubmit={handleSaveUrl} className={`mb-4 p-3 border rounded-xl space-y-2 ${
          isDayMode ? 'bg-slate-50 border-amber-300' : 'bg-gray-950 border-amber-500/30'
        }`}>
          <label className="block text-xs font-semibold text-amber-600">
            Render Backend Server URL (e.g. https://smart-home-backend.onrender.com)
          </label>
          <div className="flex gap-2">
            <input
              type="url"
              required
              placeholder="https://smart-home-backend-xxxx.onrender.com"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              className={`flex-1 border text-xs rounded-lg p-2 focus:outline-none ${
                isDayMode ? 'bg-white border-slate-300 text-slate-900 focus:border-amber-500' : 'bg-gray-900 border-gray-700 text-white focus:border-amber-500'
              }`}
            />
            <button
              type="submit"
              className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
            >
              Connect
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Wi-Fi Network SSID Card */}
        <div className={`p-3 rounded-xl border ${isDayMode ? 'bg-slate-50 border-slate-200' : 'bg-gray-950/50 border-gray-800/80'}`}>
          <div className={`flex items-center gap-2 text-xs mb-1 ${isDayMode ? 'text-slate-500' : 'text-gray-400'}`}>
            <Wifi className="w-3.5 h-3.5 text-blue-500" /> Wi-Fi Network
          </div>
          <div className={`text-base font-semibold truncate ${isDayMode ? 'text-slate-900' : 'text-white'}`}>
            {isOnline && telemetry.ssid ? telemetry.ssid : 'Disconnected'}
          </div>
          <div className={`text-[10px] mt-0.5 ${isDayMode ? 'text-slate-400' : 'text-gray-400'}`}>
            {isOnline && telemetry.rssi ? `Signal: ${telemetry.rssi} dBm` : 'No Signal'}
          </div>
        </div>

        <div className={`p-3 rounded-xl border ${isDayMode ? 'bg-slate-50 border-slate-200' : 'bg-gray-950/50 border-gray-800/80'}`}>
          <div className={`flex items-center gap-2 text-xs mb-1 ${isDayMode ? 'text-slate-500' : 'text-gray-400'}`}>
            <Cpu className="w-3.5 h-3.5 text-emerald-500" /> Free Heap
          </div>
          <div className={`text-base font-semibold ${isDayMode ? 'text-slate-900' : 'text-white'}`}>
            {isOnline && telemetry.freeHeap ? `${(telemetry.freeHeap / 1024).toFixed(1)} KB` : 'N/A'}
          </div>
        </div>

        <div className={`p-3 rounded-xl border ${isDayMode ? 'bg-slate-50 border-slate-200' : 'bg-gray-950/50 border-gray-800/80'}`}>
          <div className={`flex items-center gap-2 text-xs mb-1 ${isDayMode ? 'text-slate-500' : 'text-gray-400'}`}>
            <Clock className="w-3.5 h-3.5 text-purple-500" /> Uptime
          </div>
          <div className={`text-base font-semibold ${isDayMode ? 'text-slate-900' : 'text-white'}`}>
            {isOnline && telemetry.uptime ? `${Math.floor(telemetry.uptime / 60)} mins` : 'N/A'}
          </div>
        </div>

        <div className={`p-3 rounded-xl border ${isDayMode ? 'bg-slate-50 border-slate-200' : 'bg-gray-950/50 border-gray-800/80'}`}>
          <div className={`flex items-center gap-2 text-xs mb-1 ${isDayMode ? 'text-slate-500' : 'text-gray-400'}`}>
            <Timer className="w-3.5 h-3.5 text-amber-500" /> Next Reboot
          </div>
          <div className="text-base font-semibold text-amber-600">
            {formatTimeRemaining(telemetry.nextRebootIn)}
          </div>
        </div>

        {/* Live Date & Clock Card */}
        <div className={`p-3 rounded-xl border ${isDayMode ? 'bg-slate-50 border-slate-200' : 'bg-gray-950/50 border-gray-800/80'}`}>
          <div className={`flex items-center gap-2 text-xs mb-1 ${isDayMode ? 'text-slate-500' : 'text-gray-400'}`}>
            <CalendarClock className="w-3.5 h-3.5 text-blue-500" /> Date & Time
          </div>
          <div className={`text-base font-semibold ${isDayMode ? 'text-slate-900' : 'text-white'}`}>
            {clockTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div className={`text-[10px] mt-0.5 ${isDayMode ? 'text-slate-400' : 'text-gray-400'}`}>
            {clockTime.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      </div>
    </div>
  );
}
