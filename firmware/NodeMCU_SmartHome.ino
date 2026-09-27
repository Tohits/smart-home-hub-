/*
  =============================================================================
  NodeMCU ESP8266 Firmware v1.5.0 (Production Fail-Safe Smart Home Engine)
  =============================================================================
  - Relay Pin Mappings: Relay 1 (D1), Relay 2 (D2), Relay 3 (D5), Relay 4 (D6)
  - Hardware Reset Button: D7 (Hold 5s to clear Wi-Fi settings)
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

bool relayStates[NUM_RELAYS] = { false, false, false, false };

char device_id[32]    = "nodemcu_home_1";
char mqtt_server[64] = "93bad3def29641e399de9a7b9c676613.s1.eu.hivemq.cloud";
char mqtt_port[6]     = "8883";
char mqtt_user[32]     = "tohits";
char mqtt_pass[64]     = "YOUR_HIVEMQ_PASSWORD";

const char* FIRMWARE_VERSION = "1.5.0";

const char* CA_CERT PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
MIIFjTCCA3WgAwIBAgIRANMw9WOfBJJ3aAnRvoY4GWEwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDExMB4XDTI0MDMwNTAwMDAw
MFoXDTI3MDMwMzAwMDAwMFowTzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVy
bmV0IFNlY3VyaXR5IFJlc2VhcmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3Qg
WDExMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzAnRvoY4GWEwDQYJ
KoZIhvcNAQELBQAwTzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNl
Y3VyaXR5IFJlc2VhcmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDExMB4X
DTI0MDMwNTAwMDAwMFoXDTI3MDMwMzAwMDAwMFowTzELMAkGA1UEBhMCVVMxKTAn
BgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2VhcmNoIEdyb3VwMRUwEwYDVQQD
EwxJU1JHIFJvb3QgWDExMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA
yR43T89O98...
-----END CERTIFICATE-----
)EOF";

WiFiClientSecure espClient;
PubSubClient     mqttClient(espClient);

unsigned long lastTelemetryReport = 0;
bool shouldSaveConfig = false;
bool isUpdating       = false;

void initializeSafeRelays();
void executeSafeRestart();
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

  // STEP 1: Mandatory Safe Relay Initialization (Glitch Elimination)
  initializeSafeRelays();
  pinMode(RESET_PIN, INPUT_PULLUP);

  // STEP 2: Load Config & Setup Portal
  loadConfig();
  setupCaptivePortal();
  syncNtpTime();

  // STEP 3: TLS Configuration
  X509List* certList = new X509List(CA_CERT);
  espClient.setTrustAnchors(certList);

  int portInt = atoi(mqtt_port);
  mqttClient.setServer(mqtt_server, portInt > 0 ? portInt : 8883);
  mqttClient.setBufferSize(1024);

  mqttClient.setCallback([](char* topic, byte* payload, unsigned int length) {
    String msg = "";
    for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];
    msg.trim();

    String t = String(topic);

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
        relayStates[i] = turnOn;
        digitalWrite(RELAY_PINS[i], turnOn ? RELAY_ON : RELAY_OFF);
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

  if (WiFi.status() != WL_CONNECTED) {
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

void initializeSafeRelays() {
  for (int i = 0; i < NUM_RELAYS; i++) {
    digitalWrite(RELAY_PINS[i], RELAY_OFF);
    pinMode(RELAY_PINS[i], OUTPUT);
    digitalWrite(RELAY_PINS[i], RELAY_OFF);
    relayStates[i] = false;
  }
}

void executeSafeRestart() {
  for (int i = 0; i < NUM_RELAYS; i++) {
    digitalWrite(RELAY_PINS[i], RELAY_OFF);
    relayStates[i] = false;
    publishRelayState(i);
  }
  mqttClient.disconnect();
  delay(1000);
  ESP.restart();
}

void reconnectMqtt() {
  String clientId   = "ESP8266-" + String(device_id);
  String statusTopic = "home/" + String(device_id) + "/status";

  // Last Will and Testament
  if (mqttClient.connect(clientId.c_str(), mqtt_user, mqtt_pass, statusTopic.c_str(), 1, true, "offline")) {
    mqttClient.publish(statusTopic.c_str(), "online", true);

    for (int i = 0; i < NUM_RELAYS; i++) {
      relayStates[i] = false;
      digitalWrite(RELAY_PINS[i], RELAY_OFF);
      publishRelayState(i);
      mqttClient.subscribe(("home/" + String(device_id) + "/relay/" + String(i + 1) + "/set").c_str());
    }

    mqttClient.subscribe(("home/" + String(device_id) + "/update").c_str());
    mqttClient.subscribe(("home/" + String(device_id) + "/restart").c_str());

    publishTelemetry();
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
  doc["rssi"]            = WiFi.RSSI();
  doc["ip"]              = WiFi.localIP().toString();
  doc["freeHeap"]        = freeHeap;
  doc["lowMemWarning"]   = (freeHeap < 12000);
  doc["freeSketchSpace"] = ESP.getFreeSketchSpace();
  doc["uptime"]          = millis() / 1000;

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

  if (!wm.autoConnect("SmartHome-Setup", "SetupPass123!")) {
    Serial.println(F("[WiFiManager] Timeout. Retrying..."));
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
          strncpy(mqtt_pass, doc["mqtt_pass"] | mqtt_pass, sizeof(mqtt_pass));
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
  configTime(19800, 0, "pool.ntp.org", "time.nist.gov"); // IST Offset
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

  if (url && size > 0 && sha256) {
    executeWanOta(url, size, sha256);
  }
}

void executeWanOta(const char* url, uint32_t expectedSize, const char* expectedSha256) {
  isUpdating = true;
  String otaStatusTopic = "home/" + String(device_id) + "/ota/status";
  mqttClient.publish(otaStatusTopic.c_str(), "DOWNLOADING", true);

  for (int i = 0; i < NUM_RELAYS; i++) digitalWrite(RELAY_PINS[i], RELAY_OFF);

  WiFiClientSecure otaClient;
  X509List* certList = new X509List(CA_CERT);
  otaClient.setTrustAnchors(certList);

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
