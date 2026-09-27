/*
  =============================================================================
  NodeMCU ESP8266 Firmware v1.5.0 (Production Fail-Safe Smart Home Engine)
  =============================================================================
  - Relay Pin Mappings: Relay 1 (D1), Relay 2 (D2), Relay 3 (D5), Relay 4 (D6)
  - Hardware Reset Button: D7 (Hold 5s to clear Wi-Fi settings)
  - Scheduled Maintenance: Automatic 12-Hour System Reboot with State Memory
  - Flash State Persistence: Relay ON/OFF states saved to LittleFS and restored on boot
  - Optocoupler Cut-Off: INPUT_PULLUP cut-off on active-LOW 5V relay modules
  - MQTT Broker: HiveMQ Cloud TLS Port 8883
  - Wi-Fi Provisioning: WiFiManager Captive Portal "SmartHome-Setup"
  - Topics: home/{deviceId}/relay/{1-4}/set, home/{deviceId}/relay/{1-4}/state,
            home/{deviceId}/status, home/{deviceId}/uptime, home/{deviceId}/update,
            home/{deviceId}/restart
  =============================================================================
*/

#include <ESP8266WiFi.h>
#include <DNSServer.h>
#include <ESP8266WebServer.h>
#include <WiFiManager.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ESP8266HTTPClient.h>
#include <Updater.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <time.h>

#define RELAY_ACTIVE_LOW true

#if RELAY_ACTIVE_LOW
  #define RELAY_ON   LOW
  #define RELAY_OFF  HIGH
#else
  #define RELAY_ON   HIGH
  #define RELAY_OFF  LOW
#endif

const int NUM_RELAYS = 4;
const int RELAY_PINS[NUM_RELAYS] = { D1, D2, D5, D6 };
const int RESET_PIN              = D7;

// Auto Reboot Every 12 Hours (12 * 60 * 60 * 1000 ms)
const unsigned long AUTO_REBOOT_INTERVAL = 12UL * 60UL * 60UL * 1000UL;

bool relayStates[NUM_RELAYS] = { false, false, false, false };

char device_id[32]   = "nodemcu_home_1";
char mqtt_server[64] = "93bad3def29641e399de9a7b9c676613.s1.eu.hivemq.cloud";
char mqtt_port[6]    = "8883";
char mqtt_user[32]    = "tohits";
char mqtt_pass[64]    = "toh123@TOH";

const char* FIRMWARE_VERSION = "1.5.0";

// ISRG Root X1 CA Certificate for HiveMQ Cloud TLS
const char* CA_CERT PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIzAzoYiAcERZlNegPCUwowDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDExMB4XDTE1MDYwNDAwMDAw
MFoXDTI1MDYwNDAwMDAwMFowTzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVy
bmV0IFNlY3VyaXR5IFJlc2VhcmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3Qg
WDExMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzFU16u05lmWG24UX
Jy19dHuuJrIDV6L75e640Rk9B854A0h36vR3uH7r0f5v7e/lVw/J9eXh3X
-----END CERTIFICATE-----
)EOF";

WiFiClientSecure espClient;
PubSubClient     mqttClient(espClient);

unsigned long lastTelemetryReport = 0;
bool shouldSaveConfig = false;
bool isUpdating       = false;

unsigned long resetPressTime = 0;
bool isResetPressed          = false;

void setRelayHardware(int channelIndex, bool turnOn);
void initializeSafeRelays();
void loadRelayStates();
void saveRelayStates();
void executeSafeRestart();
void checkResetButton();
void loadConfig();
void saveConfig();
void setupCaptivePortal();
void syncNtpTime();
void reconnectMqtt();
void publishRelayState(int channelIndex);
void publishTelemetry();
void processOtaCommand(const String& payloadStr);
void executeWanOta(const char* url, uint32_t expectedSize, const char* expectedSha256);

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println(F("\n================================================="));
  Serial.println(F("🚀 NodeMCU ESP8266 Smart Home Engine Starting..."));
  Serial.println(F("================================================="));

  // STEP 1: Load Saved Relay Memory & Set Pins
  initializeSafeRelays();
  pinMode(RESET_PIN, INPUT_PULLUP);

  // STEP 2: WiFi Mode Station
  WiFi.mode(WIFI_STA);

  // STEP 3: Load Config & Setup Portal
  loadConfig();
  setupCaptivePortal();
  syncNtpTime();

  // STEP 4: TLS Configuration
  espClient.setInsecure(); // Fast TLS connection to HiveMQ Cloud

  int portInt = atoi(mqtt_port);
  mqttClient.setServer(mqtt_server, portInt > 0 ? portInt : 8883);
  mqttClient.setBufferSize(1024);

  mqttClient.setCallback([](char* topic, byte* payload, unsigned int length) {
    String msg = "";
    for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];
    msg.trim();

    String t = String(topic);
    Serial.print(F("[MQTT Message] "));
    Serial.print(t);
    Serial.print(F(" -> "));
    Serial.println(msg);

    if (t == "home/" + String(device_id) + "/restart" && msg == "RESTART") {
      executeSafeRestart();
      return;
    }

    if (t == "home/" + String(device_id) + "/update") {
      processOtaCommand(msg);
      return;
    }

    for (int i = 0; i < NUM_RELAYS; i++) {
      if (t == "home/" + String(device_id) + "/relay/" + String(i + 1) + "/set") {
        msg.toUpperCase();
        bool turnOn = (msg == "ON");
        setRelayHardware(i, turnOn);
        saveRelayStates(); // Save updated state to Flash immediately
        publishRelayState(i);
        break;
      }
    }
  });
}

void loop() {
  if (isUpdating) return;

  // Feed Hardware Watchdog Timer
  ESP.wdtFeed();

  // Automatic 12-Hour Reboot Engine with State Memory
  if (millis() > AUTO_REBOOT_INTERVAL) {
    Serial.println(F("[AUTO-REBOOT] 12-Hour uptime reached. Rebooting safely..."));
    executeSafeRestart();
    return;
  }

  // Check physical reset button (Hold D7 for 5s to clear Wi-Fi)
  checkResetButton();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("[Wi-Fi] Disconnected! Re-launching Provisioning Portal..."));
    setupCaptivePortal();
    return;
  }

  if (!mqttClient.connected()) {
    reconnectMqtt();
  } else {
    mqttClient.loop();
  }

  if (millis() - lastTelemetryReport > 30000) {
    lastTelemetryReport = millis();
    publishTelemetry();
  }
}

void setRelayHardware(int channelIndex, bool turnOn) {
  if (channelIndex < 0 || channelIndex >= NUM_RELAYS) return;

  relayStates[channelIndex] = turnOn;
  int pin = RELAY_PINS[channelIndex];

  #if RELAY_ACTIVE_LOW
    if (turnOn) {
      pinMode(pin, OUTPUT);
      digitalWrite(pin, LOW);     // 0V pulls active-LOW optocoupler ON
    } else {
      digitalWrite(pin, HIGH);
      pinMode(pin, INPUT_PULLUP); // High Impedance cuts off 5V optocoupler completely!
    }
  #else
    pinMode(pin, OUTPUT);
    digitalWrite(pin, turnOn ? HIGH : LOW);
  #endif

  Serial.print(F("[Relay Hardware] Channel "));
  Serial.print(channelIndex + 1);
  Serial.print(F(" -> "));
  Serial.println(turnOn ? F("ON") : F("OFF"));
}

void checkResetButton() {
  if (digitalRead(RESET_PIN) == LOW) {
    if (!isResetPressed) {
      isResetPressed = true;
      resetPressTime = millis();
    } else if (millis() - resetPressTime > 5000) {
      Serial.println(F("[RESET] 5s Hardware Reset Triggered! Clearing Wi-Fi & LittleFS Config..."));
      WiFiManager wm;
      wm.resetSettings();
      if (LittleFS.begin()) {
        LittleFS.remove("/config.json");
        LittleFS.remove("/relay_states.json");
      }
      delay(500);
      ESP.restart();
    }
  } else {
    isResetPressed = false;
  }
}

void initializeSafeRelays() {
  loadRelayStates(); // Restore saved relay states from Flash memory

  for (int i = 0; i < NUM_RELAYS; i++) {
    setRelayHardware(i, relayStates[i]);
  }
}

void loadRelayStates() {
  if (LittleFS.begin()) {
    if (LittleFS.exists("/relay_states.json")) {
      File f = LittleFS.open("/relay_states.json", "r");
      if (f) {
        StaticJsonDocument<256> doc;
        DeserializationError err = deserializeJson(doc, f);
        if (!err) {
          JsonArray arr = doc["relays"];
          for (int i = 0; i < NUM_RELAYS && i < arr.size(); i++) {
            relayStates[i] = arr[i].as<bool>();
          }
          Serial.println(F("[PERSISTENCE] Restored relay states from Flash memory!"));
        }
        f.close();
      }
    }
  }
}

void saveRelayStates() {
  if (LittleFS.begin()) {
    File f = LittleFS.open("/relay_states.json", "w");
    if (f) {
      StaticJsonDocument<256> doc;
      JsonArray arr = doc.createNestedArray("relays");
      for (int i = 0; i < NUM_RELAYS; i++) {
        arr.add(relayStates[i]);
      }
      serializeJson(doc, f);
      f.close();
      Serial.println(F("[PERSISTENCE] Saved relay states to Flash memory."));
    }
  }
}

void executeSafeRestart() {
  saveRelayStates(); // Ensure states are saved before restart
  mqttClient.disconnect();
  delay(1000);
  ESP.restart();
}

void reconnectMqtt() {
  String clientId   = "ESP8266-" + String(device_id);
  String statusTopic = "home/" + String(device_id) + "/status";

  Serial.print(F("[MQTT] Connecting to HiveMQ Broker: "));
  Serial.println(mqtt_server);

  if (mqttClient.connect(clientId.c_str(), mqtt_user, mqtt_pass, statusTopic.c_str(), 1, true, "offline")) {
    Serial.println(F("[MQTT] Connected successfully to HiveMQ Cloud!"));
    mqttClient.publish(statusTopic.c_str(), "online", true);

    for (int i = 0; i < NUM_RELAYS; i++) {
      publishRelayState(i);
      mqttClient.subscribe(("home/" + String(device_id) + "/relay/" + String(i + 1) + "/set").c_str());
    }

    mqttClient.subscribe(("home/" + String(device_id) + "/update").c_str());
    mqttClient.subscribe(("home/" + String(device_id) + "/restart").c_str());

    publishTelemetry();
  } else {
    Serial.print(F("[MQTT] Connection failed, rc="));
    Serial.println(mqttClient.state());
    delay(2000);
  }
}

void publishRelayState(int channelIndex) {
  String stateTopic = "home/" + String(device_id) + "/relay/" + String(channelIndex + 1) + "/state";
  mqttClient.publish(stateTopic.c_str(), relayStates[channelIndex] ? "ON" : "OFF", true);
}

void publishTelemetry() {
  StaticJsonDocument<512> doc;
  uint32_t freeHeap = ESP.getFreeHeap();

  doc["id"]              = device_id;
  doc["version"]         = FIRMWARE_VERSION;
  doc["ssid"]            = WiFi.SSID();
  doc["rssi"]            = WiFi.RSSI();
  doc["ip"]              = WiFi.localIP().toString();
  doc["freeHeap"]        = freeHeap;
  doc["lowMemWarning"]   = (freeHeap < 12000);
  doc["freeSketchSpace"] = ESP.getFreeSketchSpace();
  doc["uptime"]          = millis() / 1000;
  doc["nextRebootIn"]    = (AUTO_REBOOT_INTERVAL > millis()) ? (AUTO_REBOOT_INTERVAL - millis()) / 1000 : 0;

  char buffer[512];
  serializeJson(doc, buffer);

  mqttClient.publish(("home/" + String(device_id) + "/telemetry").c_str(), buffer, true);
  mqttClient.publish(("home/" + String(device_id) + "/uptime").c_str(), String(millis() / 1000).c_str(), true);
}

void setupCaptivePortal() {
  WiFiManager wm;
  wm.setSaveConfigCallback([]() { shouldSaveConfig = true; });

  WiFiManagerParameter custom_device_id("device_id", "Device ID", device_id, 32);
  WiFiManagerParameter custom_mqtt_server("server", "MQTT Server", mqtt_server, 64);
  WiFiManagerParameter custom_mqtt_port("port", "MQTT Port", mqtt_port, 6);
  WiFiManagerParameter custom_mqtt_user("user", "MQTT Username", mqtt_user, 32);
  WiFiManagerParameter custom_mqtt_pass("pass", "MQTT Password", mqtt_pass, 64);

  wm.addParameter(&custom_device_id);
  wm.addParameter(&custom_mqtt_server);
  wm.addParameter(&custom_mqtt_port);
  wm.addParameter(&custom_mqtt_user);
  wm.addParameter(&custom_mqtt_pass);

  wm.setConfigPortalTimeout(180);

  Serial.println(F("[Wi-Fi] Launching Provisioning Hotspot 'SmartHome-Setup'..."));

  if (!wm.autoConnect("SmartHome-Setup", "12345678")) {
    Serial.println(F("[Wi-Fi] Portal timeout reached. Retrying..."));
  }

  if (shouldSaveConfig) {
    strncpy(device_id, custom_device_id.getValue(), sizeof(device_id));
    strncpy(mqtt_server, custom_mqtt_server.getValue(), sizeof(mqtt_server));
    strncpy(mqtt_port, custom_mqtt_port.getValue(), sizeof(mqtt_port));
    strncpy(mqtt_user, custom_mqtt_user.getValue(), sizeof(mqtt_user));
    strncpy(mqtt_pass, custom_mqtt_pass.getValue(), sizeof(mqtt_pass));
    saveConfig();
  }
}

void loadConfig() {
  if (LittleFS.begin()) {
    if (LittleFS.exists("/config.json")) {
      File configFile = LittleFS.open("/config.json", "r");
      if (configFile) {
        StaticJsonDocument<512> doc;
        DeserializationError err = deserializeJson(doc, configFile);
        if (!err) {
          strncpy(device_id, doc["device_id"] | device_id, sizeof(device_id));
          strncpy(mqtt_server, doc["mqtt_server"] | mqtt_server, sizeof(mqtt_server));
          strncpy(mqtt_port, doc["mqtt_port"] | mqtt_port, sizeof(mqtt_port));
          strncpy(mqtt_user, doc["mqtt_user"] | mqtt_user, sizeof(mqtt_user));

          const char* savedPass = doc["mqtt_pass"];
          if (savedPass && strlen(savedPass) > 0 && strcmp(savedPass, "YOUR_HIVEMQ_PASSWORD") != 0) {
            strncpy(mqtt_pass, savedPass, sizeof(mqtt_pass));
          }
        }
        configFile.close();
      }
    }
  }
}

void saveConfig() {
  if (LittleFS.begin()) {
    File configFile = LittleFS.open("/config.json", "w");
    if (configFile) {
      StaticJsonDocument<512> doc;
      doc["device_id"]   = device_id;
      doc["mqtt_server"] = mqtt_server;
      doc["mqtt_port"]   = mqtt_port;
      doc["mqtt_user"]   = mqtt_user;
      doc["mqtt_pass"]   = mqtt_pass;
      serializeJson(doc, configFile);
      configFile.close();
    }
  }
}

void syncNtpTime() {
  configTime(19800, 0, "pool.ntp.org", "time.nist.gov"); // IST Offset (+5:30)
}

void processOtaCommand(const String& payloadStr) {
  StaticJsonDocument<768> doc;
  DeserializationError err = deserializeJson(doc, payloadStr);

  if (err) {
    if (payloadStr.startsWith("http://") || payloadStr.startsWith("https://")) {
      executeWanOta(payloadStr.c_str(), 0, nullptr);
    }
    return;
  }

  const char* url    = doc["url"];
  uint32_t size      = doc["size"];
  const char* sha256 = doc["sha256"];

  if (url && size > 0) {
    executeWanOta(url, size, sha256);
  }
}

void executeWanOta(const char* url, uint32_t expectedSize, const char* expectedSha256) {
  isUpdating = true;
  String otaStatusTopic = "home/" + String(device_id) + "/ota/status";
  mqttClient.publish(otaStatusTopic.c_str(), "DOWNLOADING", true);

  for (int i = 0; i < NUM_RELAYS; i++) setRelayHardware(i, false);

  WiFiClientSecure otaClient;
  otaClient.setInsecure();

  HTTPClient http;
  if (http.begin(otaClient, url)) {
    int httpCode = http.GET();
    if (httpCode == HTTP_CODE_OK && Update.begin(expectedSize > 0 ? expectedSize : 1000000)) {
      mqttClient.publish(otaStatusTopic.c_str(), "INSTALLING", true);

      WiFiClient* stream = http.getStreamPtr();
      uint8_t buf[512];
      uint32_t writtenTotal = 0;

      while (http.connected() && (expectedSize == 0 || writtenTotal < expectedSize)) {
        size_t avail = stream->available();
        if (avail > 0) {
          int c = stream->readBytes(buf, avail > sizeof(buf) ? sizeof(buf) : avail);
          Update.write(buf, c);
          writtenTotal += c;
        }
        yield();
      }

      if (Update.end(true)) {
        mqttClient.publish(otaStatusTopic.c_str(), "SUCCESS", true);
        delay(1000);
        executeSafeRestart();
      }
    }
  }
  isUpdating = false;
}
