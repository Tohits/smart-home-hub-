import React, { useState } from 'react';
import {
  Lightbulb, Fan, Wind, Moon, Power, Edit2, Check, X,
  Tv, Plug, Zap, Flame, Lock, Shield, Music, Droplets, Camera
} from 'lucide-react';
import axios from 'axios';

const ICON_MAP = {
  lightbulb: Lightbulb,
  fan: Fan,
  wind: Wind,
  moon: Moon,
  power: Power,
  tv: Tv,
  plug: Plug,
  zap: Zap,
  flame: Flame,
  lock: Lock,
  shield: Shield,
  music: Music,
  droplets: Droplets,
  camera: Camera
};

export default function RelayCard({ relay, onToggle, onUpdateRelay, backendUrl, isDayMode }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(relay.name);
  const [iconKey, setIconKey] = useState(relay.icon || 'power');

  const IconComponent = ICON_MAP[iconKey] || Power;
  const isOn = relay.state;

  const handleSave = async () => {
    try {
      const baseUrl = backendUrl || '';
      await axios.put(`${baseUrl}/api/relays/${relay.channel}`, { name, icon: iconKey });
    } catch (err) {
      console.warn('Backend icon update notice:', err);
    }

    if (onUpdateRelay) {
      onUpdateRelay(relay.channel, name, iconKey);
    }
    setIsEditing(false);
  };

  return (
    <div className={`relative p-5 rounded-2xl border transition-all duration-300 shadow-lg ${
      isDayMode
        ? isOn
          ? 'bg-gradient-to-br from-blue-50 to-white border-blue-400 shadow-blue-500/10'
          : 'bg-white border-slate-200 hover:border-slate-300 shadow-slate-200/50'
        : isOn
          ? 'bg-gradient-to-br from-blue-950/40 via-gray-900 to-gray-900 border-blue-500/50 shadow-blue-500/10'
          : 'bg-gray-900/80 border-gray-800 hover:border-gray-700'
    }`}>
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-xl border ${
          isOn
            ? 'bg-blue-500/20 text-blue-500 border-blue-500/30 ring-4 ring-blue-500/10'
            : isDayMode ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-gray-800 text-gray-400 border-gray-700'
        }`}>
          <IconComponent className="w-6 h-6" />
        </div>

        <div className="flex items-center gap-2">
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className={`p-1.5 transition ${isDayMode ? 'text-slate-400 hover:text-slate-600' : 'text-gray-500 hover:text-gray-300'}`}
              title="Edit Name & Icon"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={() => onToggle(relay.channel, !isOn)}
            className={`w-14 h-8 rounded-full p-1 transition-colors duration-300 focus:outline-none ${
              isOn ? 'bg-blue-600' : isDayMode ? 'bg-slate-300' : 'bg-gray-700'
            }`}
          >
            <div className={`w-6 h-6 rounded-full bg-white transition-transform duration-300 shadow-md ${
              isOn ? 'translate-x-6' : 'translate-x-0'
            }`} />
          </button>
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-3 mt-2">
          <div>
            <label className={`block text-[10px] mb-0.5 ${isDayMode ? 'text-slate-500' : 'text-gray-400'}`}>Appliance Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full border rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-blue-500 ${
                isDayMode ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-gray-950 border-gray-700 text-white'
              }`}
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex-1">
              <label className={`block text-[10px] mb-0.5 ${isDayMode ? 'text-slate-500' : 'text-gray-400'}`}>Choose Icon</label>
              <select
                value={iconKey}
                onChange={(e) => setIconKey(e.target.value)}
                className={`w-full border rounded-lg px-2 py-1 text-xs focus:outline-none ${
                  isDayMode ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-gray-950 border-gray-700 text-gray-300'
                }`}
              >
                <option value="lightbulb">💡 Light Bulb</option>
                <option value="fan">🌀 Ceiling / Exhaust Fan</option>
                <option value="wind">❄️ AC Unit / Cooler</option>
                <option value="moon">🌙 Night Lamp</option>
                <option value="tv">📺 Smart TV</option>
                <option value="plug">🔌 Wall Socket / Outlet</option>
                <option value="zap">⚡ High Power Appliance</option>
                <option value="flame">🔥 Water Heater / Geyser</option>
                <option value="lock">🔒 Door Lock</option>
                <option value="shield">🛡️ Security System</option>
                <option value="music">🎵 Audio / Speaker</option>
                <option value="droplets">💧 Water Pump / Sprinkler</option>
                <option value="camera">📹 CCTV Camera</option>
                <option value="power">🔌 General Power Switch</option>
              </select>
            </div>

            <div className="flex items-center gap-1 pt-3">
              <button onClick={handleSave} className="p-1.5 bg-emerald-600/20 text-emerald-500 border border-emerald-500/30 rounded-lg hover:bg-emerald-600/30">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={() => setIsEditing(false)} className="p-1.5 bg-red-600/20 text-red-500 border border-red-500/30 rounded-lg hover:bg-red-600/30">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <h3 className={`font-semibold text-base ${isDayMode ? 'text-slate-900' : 'text-white'}`}>{relay.name}</h3>
          <p className={`text-xs mt-0.5 ${isDayMode ? 'text-slate-500' : 'text-gray-400'}`}>
            Channel {relay.channel} • Pin {['D1', 'D2', 'D5', 'D6'][relay.channel - 1] || 'D1'}
          </p>
        </div>
      )}
    </div>
  );
}
