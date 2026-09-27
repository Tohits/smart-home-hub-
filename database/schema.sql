-- Smart Home Hub Production Database Schema
-- Compatible with SQLite and PostgreSQL

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  username VARCHAR(64) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(32) DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS relays (
  id VARCHAR(64) PRIMARY KEY,
  device_id VARCHAR(64) NOT NULL,
  channel INTEGER NOT NULL,
  name VARCHAR(128) NOT NULL,
  state BOOLEAN DEFAULT FALSE,
  icon VARCHAR(64) DEFAULT 'power',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(device_id, channel)
);

CREATE TABLE IF NOT EXISTS schedules (
  id VARCHAR(64) PRIMARY KEY,
  relay_id VARCHAR(64) NOT NULL,
  device_id VARCHAR(64) NOT NULL,
  channel INTEGER NOT NULL,
  time_cron VARCHAR(64),
  solar_event VARCHAR(32), -- 'sunrise', 'sunset', or NULL
  action VARCHAR(10) NOT NULL, -- 'ON' or 'OFF'
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id VARCHAR(64) PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id VARCHAR(64) PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,
  details TEXT NOT NULL,
  source VARCHAR(64) DEFAULT 'system',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Initial default relays setup
INSERT INTO relays (id, device_id, channel, name, state, icon)
VALUES
  ('nodemcu_home_1_ch1', 'nodemcu_home_1', 1, 'Main Light', false, 'lightbulb'),
  ('nodemcu_home_1_ch2', 'nodemcu_home_1', 2, 'Ceiling Fan', false, 'fan'),
  ('nodemcu_home_1_ch3', 'nodemcu_home_1', 3, 'AC Unit', false, 'wind'),
  ('nodemcu_home_1_ch4', 'nodemcu_home_1', 4, 'Night Lamp', false, 'moon')
ON CONFLICT DO NOTHING;
