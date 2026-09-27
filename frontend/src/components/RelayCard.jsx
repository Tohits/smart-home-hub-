import React, { useState } from 'react';
import { Lightbulb, Fan, Wind, Moon, Power, Edit2, Check, X } from 'lucide-react';
import axios from 'axios';

const ICON_MAP = {
  lightbulb: Lightbulb,
  fan: Fan,
  wind: Wind,
  moon: Moon,
  power: Power
};

export default function RelayCard({ relay, onToggle }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(relay.name);
  const [iconKey, setIconKey] = useState(relay.icon || 'power');

  const IconComponent = ICON_MAP[iconKey] || Power;
  const isOn = relay.state;

  const handleSave = async () => {
    try {
      await axios.put(`/api/relays/${relay.id}`, { name, icon: iconKey });
      relay.name = name;
      relay.icon = iconKey;
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to update relay', err);
    }
  };

  return (
    <div className={`relative p-5 rounded-2xl border transition-all duration-300 shadow-lg ${
      isOn
        ? 'bg-gradient-to-br from-blue-950/40 via-gray-900 to-gray-900 border-blue-500/50 shadow-blue-500/10'
        : 'bg-gray-900/80 border-gray-800 hover:border-gray-700'
    }`}>
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-xl border ${
          isOn
            ? 'bg-blue-500/20 text-blue-400 border-blue-500/30 ring-4 ring-blue-500/10'
            : 'bg-gray-800 text-gray-400 border-gray-700'
        }`}>
          <IconComponent className="w-6 h-6" />
        </div>

        <div className="flex items-center gap-2">
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="p-1.5 text-gray-500 hover:text-gray-300 transition"
              title="Edit Name & Icon"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={() => onToggle(relay.channel, !isOn)}
            className={`w-14 h-8 rounded-full p-1 transition-colors duration-300 focus:outline-none ${
              isOn ? 'bg-blue-600' : 'bg-gray-700'
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
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-2.5 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
          />
          <div className="flex items-center justify-between">
            <select
              value={iconKey}
              onChange={(e) => setIconKey(e.target.value)}
              className="bg-gray-950 border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-300 focus:outline-none"
            >
              <option value="lightbulb">Lightbulb</option>
              <option value="fan">Fan</option>
              <option value="wind">AC / Wind</option>
              <option value="moon">Moon / Lamp</option>
              <option value="power">Power</option>
            </select>

            <div className="flex items-center gap-1">
              <button onClick={handleSave} className="p-1 text-emerald-400 hover:text-emerald-300">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={() => setIsEditing(false)} className="p-1 text-red-400 hover:text-red-300">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <h3 className="font-semibold text-white text-base">{relay.name}</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Channel {relay.channel} • Pin {['D1', 'D2', 'D5', 'D6'][relay.channel - 1] || 'D1'}
          </p>
        </div>
      )}
    </div>
  );
}
