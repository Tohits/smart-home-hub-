# Smart Home Hub — Production GitHub, Vercel & Render Deployment Guide

A production-grade, multi-platform IoT Smart Home Automation solution with React PWA Frontend, Node.js + Socket.IO + MQTT.js Persistent Backend, PostgreSQL/SQLite Database, and NodeMCU ESP8266 Firmware v1.5.0.

---

## 📁 Repository Structure

```text
smart-home-hub/
├── .gitignore                   # Complete root ignore file
├── README.md                    # Deployment & Architecture Documentation
├── backend/
│   ├── package.json             # Express, MQTT.js, Socket.IO, Web-Push, SunCalc
│   ├── .env.example             # Safe template for production secrets
│   ├── render.yaml              # Render Persistent Web Service Blueprint
│   ├── server.js                # Express REST API, JWT Auth & Socket.IO Gateway
│   ├── database.js              # PostgreSQL / SQLite DB Client & Schema Manager
│   ├── mqttService.js           # 24/7 HiveMQ TLS MQTT Service & Push Engine
│   ├── scheduler.js             # Persistent IST Cron & Solar Sunrise/Sunset Engine
│   └── webPush.js               # VAPID Web Push Engine & Quiet Hours
├── frontend/
│   ├── package.json             # React, Vite, Tailwind CSS, Socket.IO Client
│   ├── vercel.json              # Vercel SPA Routing & PWA Headers
│   ├── index.html               # PWA Meta, Theme & App Icons
│   ├── public/
│   │   ├── manifest.webmanifest # PWA Web Manifest (Smart Home Hub)
│   │   ├── service-worker.js    # Background Web Push & Caching Engine
│   │   ├── offline.html         # Offline Fallback UI
│   │   └── assets/              # App Icons & Favicon
│   └── src/                     # React Components & Dashboard Pages
├── database/
│   └── schema.sql               # PostgreSQL / SQLite Database Schema
└── firmware/
    └── nodemcu-esp8266/
        └── NodeMCU_SmartHome.ino # Complete ESP8266 C++ Firmware v1.5.0
```

---

## 🔐 Environment Variables Summary

> [!IMPORTANT]
> **NEVER COMMIT `.env` FILES OR SECRETS TO GITHUB.**
> Configure these variables inside Vercel Dashboard and Render Environment Settings:

### Backend Variables (Render / Host)

| Variable | Recommended Production Value | Description |
| :--- | :--- | :--- |
| `PORT` | `5000` | HTTP server binding port. |
| `MQTT_HOST` | `93bad3def29641e399de9a7b9c676613.s1.eu.hivemq.cloud` | HiveMQ Cloud TLS host address. |
| `MQTT_PORT` | `8883` | HiveMQ TLS Port. |
| `MQTT_USER` | `tohits` | HiveMQ MQTT Username. |
| `MQTT_PASS` | `YourHiveMqPassword` | HiveMQ MQTT Password. |
| `JWT_SECRET` | `Random64CharString` | Secret key for signing JWT tokens. |
| `OTA_SECRET_KEY` | `Random64CharString` | HMAC-SHA256 signature key for OTA binaries. |
| `TIMEZONE` | `Asia/Kolkata` | System timezone for schedules and logs. |
| `LATITUDE` | `28.6139` | Latitude for sunrise/sunset calculations. |
| `LONGITUDE` | `77.2090` | Longitude for sunrise/sunset calculations. |
| `VAPID_PUBLIC_KEY` | Generated Base64 Key | Public Web Push Key. |
| `VAPID_PRIVATE_KEY` | Generated Base64 Key | Private Web Push Key (Secret). |
| `DATABASE_URL` | `postgresql://...` | Optional: Managed PostgreSQL connection string. |

---

## 🚀 Step 1: Push Code to GitHub

1. Open your terminal in the root directory:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Complete Smart Home Hub Production Code"
   ```
2. Create a new **Private Repository** on [GitHub](https://github.com/).
3. Link and push your repository:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/smart-home-hub.git
   git branch -M main
   git push -u origin main
   ```

---

## ☁️ Step 2: Deploy Backend to Render (24/7 Persistent Worker)

> [!NOTE]
> Render keeps your Node.js server running 24/7 to monitor MQTT messages, execute IST schedules, and dispatch VAPID Web Push Notifications even when the PWA is closed.

1. Sign in to [Render](https://render.com/).
2. Click **New +** → **Web Service**.
3. Connect your `smart-home-hub` GitHub repository.
4. Set the following settings:
   - **Name**: `smart-home-backend`
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Under **Environment Variables**, add all variables listed in the **Backend Variables** table above.
6. Click **Create Web Service**.
7. Note your deployed Backend URL (e.g., `https://smart-home-backend.onrender.com`).

---

## ⚡ Step 3: Deploy Frontend PWA to Vercel

1. Sign in to [Vercel](https://vercel.com/).
2. Click **Add New...** → **Project**.
3. Import your `smart-home-hub` GitHub repository.
4. Configure Project Settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Click **Deploy**.
6. Vercel will automatically build and deploy your PWA to `https://your-app.vercel.app`.
7. Future commits to `main` branch will trigger automatic deployments on Vercel and Render!

---

## 📦 Step 4: Firmware OTA Hosting & Deployment

To trigger remote WAN OTA firmware updates:
1. Export binary in Arduino IDE (**Sketch** → **Export Compiled Binary**).
2. Upload `NodeMCU_SmartHome.ino.bin` to GitHub Releases or Cloudflare R2 / AWS S3.
3. In the PWA Dashboard (OTA Manager), input:
   - **Firmware Version**: `1.5.0`
   - **File Size**: Exact byte size of `.bin` file
   - **HTTPS Binary URL**: `https://raw.githubusercontent.com/.../firmware.bin`
   - **SHA-256 Checksum**: SHA256 string generated from file
4. Click **Sign & Push Firmware Update**.
