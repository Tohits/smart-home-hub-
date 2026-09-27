import React, { useState } from 'react';
import { DownloadCloud, ShieldAlert, CheckCircle2 } from 'lucide-react';
import axios from 'axios';

export default function OtaManager({ otaStatus }) {
  const [url, setUrl] = useState('');
  const [size, setSize] = useState('');
  const [sha256, setSha256] = useState('');
  const [dispatching, setDispatching] = useState(false);
  const [resultMsg, setResultMsg] = useState('');

  const handleDispatchOta = async (e) => {
    e.preventDefault();
    if (!url) return;

    try {
      setDispatching(true);
      setResultMsg('');
      const res = await axios.post('/api/system/ota', {
        deviceId: 'nodemcu_home_1',
        url,
        size: size ? parseInt(size, 10) : 0,
        sha256
      });
      setResultMsg(res.data.message || 'OTA Broadcast sent!');
    } catch (err) {
      setResultMsg('OTA Error: ' + (err.response?.data?.error || err.message));
    } finally {
      setDispatching(false);
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-xl">
      <div className="flex items-center gap-2 mb-4">
        <DownloadCloud className="w-5 h-5 text-purple-400" />
        <h2 className="text-lg font-semibold text-white">Firmware WAN OTA Manager</h2>
      </div>

      {otaStatus && (
        <div className="mb-4 bg-purple-950/40 border border-purple-500/30 p-3 rounded-xl flex items-center gap-2 text-xs text-purple-300">
          <CheckCircle2 className="w-4 h-4 text-purple-400" />
          <span>Live Device OTA Status: <b>{otaStatus}</b></span>
        </div>
      )}

      <form onSubmit={handleDispatchOta} className="space-y-3 bg-gray-950/60 p-4 rounded-xl border border-gray-800">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">HTTPS Binary Firmware URL (.bin)</label>
          <input
            type="url"
            required
            placeholder="https://raw.githubusercontent.com/.../firmware.bin"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 text-white text-xs rounded-lg p-2.5 focus:outline-none focus:border-purple-500"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">File Size (Bytes, Optional)</label>
            <input
              type="number"
              placeholder="485120"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 text-white text-xs rounded-lg p-2.5 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">SHA-256 Checksum (Optional)</label>
            <input
              type="text"
              placeholder="a1b2c3d4..."
              value={sha256}
              onChange={(e) => setSha256(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 text-white text-xs rounded-lg p-2.5 focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={dispatching}
          className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold py-2.5 px-4 rounded-xl transition shadow-lg shadow-purple-600/20 flex items-center justify-center gap-2"
        >
          <DownloadCloud className="w-4 h-4" />
          {dispatching ? 'Broadcasting OTA Payload...' : 'Sign & Dispatch OTA Firmware Update'}
        </button>

        {resultMsg && (
          <p className="text-xs text-center text-emerald-400 font-medium mt-2">{resultMsg}</p>
        )}
      </form>
    </div>
  );
}
