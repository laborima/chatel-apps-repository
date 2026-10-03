#define STR_(x) #x
#define STR(x) STR_(x)
#include "console.h"
#include "config.h"
#include "turret.h"
#include "water_gun.h"
#include "ps5_input.h"
#include "link.h"
#include "net.h"

/* One line buffer per input: the serial port and the telnet console can type at the same time */
struct LineBuf {
    char   buf[96];
    size_t len;
};
static LineBuf serialLine = {}, netLine = {};

static void help() {
    Log.println(
        "Commands:\n"
        "  show                          calibration + current position\n"
        "  cal on|off                    calibration mode (raw pulse drive)\n"
        "  pan <us> | tilt <us>          drive a servo to a pulse width (enters cal mode)\n"
        "  pan +|- | tilt +|-            step by 'step' us\n"
        "  step <us>                     calibration step (default " STR(CAL_STEP_US) ")\n"
        "  mark pan|tilt low|high <deg>  current pulse = that stop, at that real angle\n"
        "  speed <deg/s>                 slew limit\n"
        "  save | load | reset           calibration in NVS\n"
        "  angle <pan> <tilt>            go to angles (deg)\n"
        "  center                        home position\n"
        "  arm | disarm | pump on|off    water gun\n"
        "  fire [ms] | fx                burst / laser sound only\n"
        "  leds on|off | laser on|off    green LEDs (relay 4) / aiming laser (relay 3)\n"
        "  pew                           blaster on the P4 speaker, no water (link test)\n"
        "  scan [s]                      list visible Bluetooth devices (diagnostic)\n"
        "  forget                        forget the paired controller\n"
        "  net                           WiFi, OTA, heap, uptime, controller link\n"
        "  crash [clear]                 last panic (core dump in flash)\n"
        "  reboot                        safe everything and restart");
}

static Axis parseAxis(const char *s, bool &ok) {
    ok = true;
    if (!strcmp(s, "pan")) return AXIS_PAN;
    if (!strcmp(s, "tilt")) return AXIS_TILT;
    ok = false;
    return AXIS_PAN;
}

static void execute(char *cmd) {
    char *argv[5] = { nullptr };
    int argc = 0;
    for (char *tok = strtok(cmd, " \t"); tok && argc < 5; tok = strtok(nullptr, " \t")) argv[argc++] = tok;
    if (argc == 0) return;
    const char *c = argv[0];
    static int step = CAL_STEP_US;

    if (!strcmp(c, "help") || !strcmp(c, "?")) { help(); return; }
    if (!strcmp(c, "show")) {
        turretPrint(Log);
        Log.printf("[GUN] %s, pump %s, LEDs %s, laser %s, shots %lu | PS5 %s\n",
                      gunArmed() ? "ARMED" : "disarmed", gunPumpOn() ? "on" : "off",
                      gunLedsOn() ? "on" : "off", gunLaserOn() ? "on" : "off", (unsigned long)gunShots(),
                      ps5InputConnected() ? "connected" : "not connected");
        Log.printf("[LNK] Camera orders: %s\n", linkAutoAllowed() ? "allowed" : "refused (controller connected)");
        netPrintStatus(Log);
        return;
    }
    if (!strcmp(c, "cal") && argc >= 2) { turretCalMode(!strcmp(argv[1], "on")); return; }

    bool isAxis;
    Axis a = parseAxis(c, isAxis);
    if (isAxis && argc >= 2) {
        if (!strcmp(argv[1], "+"))      turretRawStep(a,  step);
        else if (!strcmp(argv[1], "-")) turretRawStep(a, -step);
        else                            turretRawUs(a, atoi(argv[1]));
        return;
    }
    if (!strcmp(c, "step") && argc >= 2) { step = constrain(atoi(argv[1]), 1, 200); Log.printf("[TUR] step %d us\n", step); return; }
    if (!strcmp(c, "mark") && argc >= 4) {
        a = parseAxis(argv[1], isAxis);
        if (!isAxis) { Log.println("mark pan|tilt low|high <deg>"); return; }
        turretMark(a, !strcmp(argv[2], "high"), atof(argv[3]));
        return;
    }
    if (!strcmp(c, "speed") && argc >= 2) { TurretCal tc = turretGetCal(); tc.maxSpeedDegS = atof(argv[1]); turretSetCal(tc); turretPrint(Log); return; }
    if (!strcmp(c, "save"))  { turretSaveCal(); return; }
    if (!strcmp(c, "load"))  { Log.println(turretLoadCal() ? "[TUR] Loaded" : "[TUR] Nothing saved in NVS"); turretPrint(Log); return; }
    if (!strcmp(c, "reset")) { turretResetCal(); turretPrint(Log); return; }
    if (!strcmp(c, "angle") && argc >= 3) { turretCalMode(false); turretSetAngles(atof(argv[1]), atof(argv[2])); return; }
    if (!strcmp(c, "center")) { turretCalMode(false); turretCenter(); return; }

    if (!strcmp(c, "arm"))    { gunSetArmed(true);  return; }
    if (!strcmp(c, "disarm")) { gunSetArmed(false); return; }
    if (!strcmp(c, "pump") && argc >= 2) { gunPump(!strcmp(argv[1], "on")); return; }
    if (!strcmp(c, "fire"))   { gunFire(argc >= 2 ? atoi(argv[1]) : FIRE_TAP_MS); return; }
    if (!strcmp(c, "fx"))     { gunLaserFx(); return; }
    if (!strcmp(c, "pew"))    { linkSendFire(0); Log.println("[LNK] FIRE sent to the detection node"); return; }
    if (!strcmp(c, "leds") && argc >= 2)  { gunLeds(!strcmp(argv[1], "on")); return; }
    if (!strcmp(c, "laser") && argc >= 2) { gunLaser(!strcmp(argv[1], "on")); return; }
    if (!strcmp(c, "scan"))   { ps5InputScan(argc >= 2 ? (uint8_t)atoi(argv[1]) : 8); return; }
    if (!strcmp(c, "forget")) { ps5InputForget(); return; }
    if (!strcmp(c, "net"))    { netPrintStatus(Log); ps5InputPrintStatus(Log); return; }
    if (!strcmp(c, "crash"))  { netPrintCrash(Log, argc >= 2 && !strcmp(argv[1], "clear")); return; }
    if (!strcmp(c, "reboot")) { gunAllOff(); Log.println("[SYS] Rebooting"); delay(200); ESP.restart(); }

    Log.printf("Unknown command '%s' – type help\n", c);
}

void consoleBegin() {
    Log.println("[CON] Serial console ready – type 'help'");
}

static void feed(LineBuf &l, int ch) {
    if (ch == '\r') return;
    if (ch == '\n') {
        l.buf[l.len] = 0;
        l.len = 0;
        execute(l.buf);
    } else if (l.len < sizeof(l.buf) - 1) {
        l.buf[l.len++] = (char)ch;
    }
}

void consoleLoop() {
    while (Serial.available()) feed(serialLine, Serial.read());
    int ch;
    while ((ch = netConsoleRead()) >= 0) feed(netLine, ch);
}
