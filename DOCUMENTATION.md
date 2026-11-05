# Smart Home Hub — Production System Documentation & Deployment Guide v1.5.0

> **Comprehensive Technical Guide**  
> Complete documentation for Firmware, Hardware Pinouts, HiveMQ Cloud TLS MQTT, Render Backend, Vercel React PWA Frontend, Database Schema, and Troubleshooting Procedures.

---

## 📌 1. System Overview & Architecture

The **Smart Home Hub** is a 4-channel IoT automation system that provides real-time control, scheduled automation, and telemetry monitoring across WAN/Internet connections.

```text
[ 📱 React PWA Web Dashboard ] 
    │ (Vercel: https://smart-home-hub-omega.vercel.app/)
    │
    ├── ⚡ Real-time Link (WebSockets / Socket.IO)
    ├── 🌐 REST API & WAN OTA Uploads
    ▼
[ 🖥️ Node.js + Express Backend ] 
    │ (Render: https://smart-home-backend-16eu.onrender.com)
    │
    ├── 🔒 TLS MQTT Connection (Port 8883)
    ├── ⏱️ IST Cron & Solar Sunrise/Sunset Automation Engine
    ├── 🔔 VAPID Web Push Notification Engine
    ▼
[ ☁️ HiveMQ Cloud MQTT Broker ]
    │ Host: 93bad3def29641e399de9a7b9c676613.s1.eu.hivemq.cloud
    ▼
[ 🔌 NodeMCU ESP8266 Firmware v1.5.0 ]
    └── 4-Channel Relays (D1, D2, D5, D6), Hardware Reset (D7), Flash Memory Persistence
```

---

## 🔌 2. Hardware Pinout & Circuit Wiring

### NodeMCU ESP8266 Pin Mappings

| Component | NodeMCU Pin | GPIO Pin | Voltage / Active Mode | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Relay Channel 1** | `D1` | GPIO 5 | Active-HIGH / LOW | Appliance 1 (Main Light) |
| **Relay Channel 2** | `D2` | GPIO 4 | Active-HIGH / LOW | Appliance 2 (Ceiling Fan) |
| **Relay Channel 3** | `D5` | GPIO 14 | Active-HIGH / LOW | Appliance 3 (AC Unit) |
| **Relay Channel 4** | `D6` | GPIO 12 | Active-HIGH / LOW | Appliance 4 (Night Lamp) |
| **Hardware Reset** | `D7` | GPIO 13 | INPUT_PULLUP | Hold **5 seconds to GND** to wipe Wi-Fi settings |
| **UART Serial** | `TX / RX` | GPIO 1/3 | 115200 Baud | Serial Monitor Debugging |

### ⚡ 5V Optocoupler Cut-Off Fix (`setRelayHardware`)
To prevent 5V active-LOW relay optocouplers from staying partially energized due to 3.3V GPIO voltage drop (`5V VCC - 3.3V GPIO = 1.7V`), the firmware uses high-impedance mode when turned OFF:

```cpp
void setRelayHardware(int channelIndex, bool turnOn) {
  int pin = RELAY_PINS[channelIndex];
  relayStates[channelIndex] = turnOn;
  pinMode(pin, OUTPUT);
  digitalWrite(pin, turnOn ? RELAY_ON : RELAY_OFF);
}
```
> **Relay Polarity Note:** If your relay module turns OFF when clicking ON and ON when clicking OFF, change line 22 in `NodeMCU_SmartHome.ino`:
> `#define RELAY_ACTIVE_LOW false` (Active-HIGH) or `true` (Active-LOW).

---

## 📶 3. Firmware Flashing & Wi-Fi Provisioning

### Sketch Path
- Arduino IDE Sketch: [`firmware/NodeMCU_SmartHome/NodeMCU_SmartHome.ino`](file:///C:/Users/Tohids/Desktop/github/smart-home-hub/firmware/NodeMCU_SmartHome/NodeMCU_SmartHome.ino)

### HiveMQ Cloud MQTT Credentials Configured in Code
- **MQTT Broker Host:** `93bad3def29641e399de9a7b9c676613.s1.eu.hivemq.cloud`
- **MQTT TLS Port:** `8883`
- **MQTT Username:** `tohits`
- **MQTT Password:** `toh123@TOH`
- **Device ID:** `nodemcu_home_1`

### Wi-Fi Provisioning Portal (First Boot or Reset)
1. Power on NodeMCU. It launches a Wi-Fi Access Point named **`SmartHome-Setup`**.
2. Connect your phone/laptop to `SmartHome-Setup` (Password: `12345678`).
3. Captive portal opens automatically (`http://192.168.4.1`). Select your home Wi-Fi SSID, enter your Wi-Fi password, and tap **Save**.
4. NodeMCU saves credentials to Flash memory (`LittleFS`) and connects automatically!

---

## ⏰ 4. Flash State Memory & 12-Hour Auto Reboot

### 1. Flash Relay Memory (`/relay_states.json`)
- Every time a relay is toggled (via web app or scheduled automation), its state is written to LittleFS flash memory.
- Upon power loss or reboot, `loadRelayStates()` reads Flash memory and **restores exact relay states** before connecting to Wi-Fi!

### 2. Scheduled 12-Hour Maintenance Reboot
- To prevent memory fragmentation on ESP8266, the firmware automatically reboots every **12 hours** of uptime.
- States are saved to Flash memory immediately before rebooting so connected appliances experience zero disturbance.
- The remaining time until the next reboot is broadcast to the web dashboard (`nextRebootIn`).

---

## 🖥️ 5. Render Backend Server Setup

- **Live Render URL:** `https://smart-home-backend-16eu.onrender.com`
- **Root Directory:** `backend`
- **Build Command:** `npm install`
- **Start Command:** `npm start`

### Render Environment Variables

| Variable | Value | Description |
| :--- | :--- | :--- |
| `PORT` | `5000` | HTTP Server Binding Port |
| `NODE_ENV` | `production` | Environment mode |
| `MQTT_HOST` | `93bad3def29641e399de9a7b9c676613.s1.eu.hivemq.cloud` | HiveMQ TLS Host |
| `MQTT_PORT` | `8883` | HiveMQ TLS Port |
| `MQTT_USER` | `tohits` | HiveMQ Username |
| `MQTT_PASS` | `toh123@TOH` | HiveMQ Password |
| `JWT_SECRET` | *Random String* | Signing key for JWT Auth |
| `TIMEZONE` | `Asia/Kolkata` | System timezone |
| `LATITUDE` | `28.6139` | Latitude for sunrise/sunset solar triggers |
| `LONGITUDE` | `77.2090` | Longitude for sunrise/sunset solar triggers |

---

## 📱 6. React PWA Web Dashboard (Vercel)

- **Live Production URL:** **[https://smart-home-hub-omega.vercel.app/](https://smart-home-hub-omega.vercel.app/)**
- **Framework:** React 18, Vite 5, Tailwind CSS, Socket.IO Client, Lucide React

### Dashboard Features
1. **Dynamic Day & Night Theme Engine:**
   - Automatically switches between **Day Mode** ☀️ (6 AM – 6 PM) and **Night Mode** 🌙 (6 PM – 6 AM).
   - Includes a 3-way toggle button (`Auto ➔ Day ➔ Night`) on the header.
2. **Dynamic Live Wi-Fi Status Bar:**
   - Displays real-time connected Wi-Fi Network Name (e.g., `1+10R`), Signal Strength (`dBm`), Free Heap, Uptime, Live Digital Clock with Seconds, and **Next Reboot** countdown (`11h 45m`).
3. **PWA Installation:**
   - Tap **Install App** button to install as a native, full-screen mobile app on Android or iPhone.
4. **Local Storage & Auto-Polling:**
   - Saves relay states and custom names/icons locally.
   - Automatically polls `/api/system/status` every 8 seconds for guaranteed freshness.
5. **Direct WAN OTA Binary File Upload:**
   - In the WAN OTA Manager tab, tap **Browse .bin File** to pick a compiled `.bin` file from your phone or PC.
   - It calculates the SHA-256 hash, uploads it to Render (`/uploads/firmware.bin`), and dispatches the update to NodeMCU wirelessly over MQTT!

---

## 🔍 7. Troubleshooting Guide

### Issue 1: NodeMCU Serial Monitor shows `[MQTT] Connection failed, rc=5`
- **Cause:** `rc=5` stands for `MQTT_CONNECT_UNAUTHORIZED` (Invalid MQTT password).
- **Fix:** Connect your phone to `SmartHome-Setup` Wi-Fi (`12345678`), open `http://192.168.4.1`, type `toh123@TOH` into the MQTT Password box, and tap **Save**. Or ground pin **D7** for 5 seconds to wipe stored `/config.json`.

### Issue 2: Clicking ON turns relay OFF / Clicking OFF turns relay ON
- **Cause:** Inverted relay module hardware logic.
- **Fix:** Open `NodeMCU_SmartHome.ino` and change line 22 to `#define RELAY_ACTIVE_LOW false` (or `true`), then re-flash.

### Issue 3: Relay states turn OFF after browser page refresh
- **Cause:** `localStorage` persistence missing or REST API toggle endpoint not saving to DB.
- **Fix:** Already resolved in v1.5.0! `localStorage` holds states locally and `/api/relays/toggle` updates the database immediately on click.

### Issue 4: Dashboard shows `○ Offline`
- **Fix:** Click **Backend Config** on the top right of the dashboard, enter `https://smart-home-backend-16eu.onrender.com`, and click **Connect**.

---

## 📜 8. Git Operations & Repository Commands

### Commit & Push Updates to GitHub
```bash
cd C:\Users\Tohids\Desktop\github\smart-home-hub
git add .
git commit -m "Update system configuration"
git push origin main
```

---
*Documentation updated & generated on November 5, 2026 for Smart Home Hub v1.5.0.*
