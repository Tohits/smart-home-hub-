import React, { useState } from 'react';
import { DownloadCloud, FileUp, CheckCircle2, ShieldCheck, HardDrive } from 'lucide-react';
import axios from 'axios';

export default function OtaManager({ otaStatus, isDayMode }) {
  const [url, setUrl] = useState('');
  const [size, setSize] = useState('');
  const [sha256, setSha256] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [resultMsg, setResultMsg] = useState('');

  // Handle Local .bin File Selection & Hash Calculation
  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSelectedFile(file);
    setSize(file.size);
    setResultMsg(`Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);

    try {
      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      setSha256(hashHex);
    } catch (err) {
      console.warn('SHA256 calculation notice:', err);
    }
  };

  // Upload Local File and Trigger OTA
  const handleUploadAndDispatch = async () => {
    if (!selectedFile) return;

    try {
      setUploading(true);
      setResultMsg('Uploading firmware .bin file to server...');

      const arrayBuffer = await selectedFile.arrayBuffer();
      const uploadRes = await axios.post('/api/system/ota-upload', arrayBuffer, {
        headers: { 'Content-Type': 'application/octet-stream' }
      });

      const uploadedUrl = uploadRes.data.url;
      setUrl(uploadedUrl);

      setResultMsg('Firmware uploaded! Dispatching OTA broadcast over MQTT...');

      // Dispatch OTA command
      const res = await axios.post('/api/system/ota', {
        deviceId: 'nodemcu_home_1',
        url: uploadedUrl,
        size: selectedFile.size,
        sha256
      });

      setResultMsg(res.data.message || 'OTA Update dispatched successfully!');
    } catch (err) {
      setResultMsg('Upload/OTA Error: ' + (err.response?.data?.error || err.message));
    } finally {
      setUploading(false);
    }
  };

  // Dispatch via Manual URL
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
      setResultMsg(res.data.message || 'OTA Broadcast dispatched!');
    } catch (err) {
      setResultMsg('OTA Error: ' + (err.response?.data?.error || err.message));
    } finally {
      setDispatching(false);
    }
  };

  return (
    <div className={`border rounded-2xl p-5 shadow-xl transition-colors duration-300 ${
      isDayMode ? 'bg-white border-slate-200' : 'bg-gray-900 border-gray-800'
    }`}>
      <div className="flex items-center gap-2 mb-4">
        <DownloadCloud className="w-5 h-5 text-purple-500" />
        <h2 className={`text-lg font-semibold ${isDayMode ? 'text-slate-900' : 'text-white'}`}>
          Firmware WAN OTA Manager
        </h2>
      </div>

      {otaStatus && (
        <div className={`mb-4 p-3 rounded-xl flex items-center gap-2 text-xs border ${
          isDayMode ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-purple-950/40 border-purple-500/30 text-purple-300'
        }`}>
          <CheckCircle2 className="w-4 h-4 text-purple-500" />
          <span>Live Device OTA Status: <b>{otaStatus}</b></span>
        </div>
      )}

      {/* Local .bin File Upload Section */}
      <div className={`mb-6 p-4 rounded-xl border ${
        isDayMode ? 'bg-slate-50 border-slate-200' : 'bg-gray-950/80 border-gray-800'
      }`}>
        <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-purple-500 uppercase tracking-wider">
          <HardDrive className="w-4 h-4" /> Direct File Picker (Arduino IDE .bin)
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 mt-3">
          <label className={`w-full sm:w-auto flex items-center justify-center gap-2 border text-xs font-semibold py-2.5 px-4 rounded-xl cursor-pointer transition ${
            isDayMode
              ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
              : 'bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700'
          }`}>
            <FileUp className="w-4 h-4 text-purple-500" />
            <span>Browse .bin File</span>
            <input type="file" accept=".bin" onChange={handleFileSelect} className="hidden" />
          </label>

          {selectedFile && (
            <button
              onClick={handleUploadAndDispatch}
              disabled={uploading}
              className="w-full sm:w-auto flex-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold py-2.5 px-4 rounded-xl transition shadow-lg shadow-purple-600/20 flex items-center justify-center gap-2"
            >
              <DownloadCloud className="w-4 h-4" />
              {uploading ? 'Uploading & Deploying...' : 'Upload & Send OTA Update'}
            </button>
          )}
        </div>
      </div>

      {/* Manual URL Form */}
      <form onSubmit={handleDispatchOta} className={`space-y-3 p-4 rounded-xl border ${
        isDayMode ? 'bg-slate-50 border-slate-200' : 'bg-gray-950/60 border-gray-800'
      }`}>
        <div className={`text-xs font-semibold uppercase tracking-wider mb-1 ${isDayMode ? 'text-slate-500' : 'text-gray-400'}`}>
          Or Enter Remote Firmware URL
        </div>

        <div>
          <label className={`block text-xs font-medium mb-1 ${isDayMode ? 'text-slate-500' : 'text-gray-400'}`}>
            HTTPS Binary Firmware URL (.bin)
          </label>
          <input
            type="url"
            placeholder="https://raw.githubusercontent.com/.../firmware.bin"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className={`w-full border text-xs rounded-lg p-2.5 focus:outline-none focus:border-purple-500 ${
              isDayMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-gray-900 border-gray-700 text-white'
            }`}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={`block text-xs font-medium mb-1 ${isDayMode ? 'text-slate-500' : 'text-gray-400'}`}>
              File Size (Bytes)
            </label>
            <input
              type="number"
              placeholder="485120"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className={`w-full border text-xs rounded-lg p-2.5 focus:outline-none focus:border-purple-500 ${
                isDayMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-gray-900 border-gray-700 text-white'
              }`}
            />
          </div>

          <div>
            <label className={`block text-xs font-medium mb-1 ${isDayMode ? 'text-slate-500' : 'text-gray-400'}`}>
              SHA-256 Checksum
            </label>
            <input
              type="text"
              placeholder="a1b2c3d4..."
              value={sha256}
              onChange={(e) => setSha256(e.target.value)}
              className={`w-full border text-xs rounded-lg p-2.5 focus:outline-none focus:border-purple-500 ${
                isDayMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-gray-900 border-gray-700 text-white'
              }`}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={dispatching || !url}
          className={`w-full text-xs font-semibold py-2.5 px-4 rounded-xl transition flex items-center justify-center gap-2 border ${
            isDayMode
              ? 'bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white border-slate-700'
              : 'bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white border-gray-700'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          {dispatching ? 'Broadcasting Payload...' : 'Dispatch OTA Payload via URL'}
        </button>

        {resultMsg && (
          <p className="text-xs text-center text-emerald-500 font-medium mt-2">{resultMsg}</p>
        )}
      </form>
    </div>
  );
}
