#!/usr/bin/env python3
"""
Camera -> turret aiming calibration for Mostikator.

The turret's laser is moved to several tilt angles; at each one the P4 camera takes a picture with the
laser on and one with it off, and the red dot is found in their difference. Its position, converted to
camera angles with the same formula as the detector (pan = (x - 0.5) * hfov, tilt = (0.5 - y) * vfov),
gives a linear fit per axis
    turret = gain * camera + offset
which is saved on the P4 (POST /api/config aim_*), where the automatic mode uses it.

The detector is disarmed during the run (it would otherwise steer the turret) and re-armed afterwards.
Point the camera at a plain, matt background that the laser can reach, lights not too bright.

    tools/calibrate_aim.py                       # hosts and passwords read from the config.h files
    tools/calibrate_aim.py --tilts -10 0 10 20 30 --dry-run
    tools/calibrate_aim.py --p4 192.168.1.31 --turret 192.168.1.131

Without a pan servo (PIN_SERVO_PAN = -1) only the tilt is fitted; the horizontal gap between the laser
and the camera axis is printed so the turret can be turned by hand.
"""

import argparse
import io
import re
import socket
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
P4_DIR = HERE.parent
TURRET_DIR = P4_DIR.parent / "mostikator_turret_esp32"


def define(path, name):
    try:
        m = re.search(r'^#define\s+%s\s+"([^"]*)"' % name, path.read_text(), re.M)
        return m.group(1) if m else None
    except OSError:
        return None


class Turret:
    """Telnet console of the turret (first line = OTA_PASSWORD)."""

    def __init__(self, host, password):
        self.sock = socket.create_connection((host, 23), 5)
        time.sleep(0.4)
        self._drain(0.3)
        self.sock.sendall((password + "\r\n").encode())
        out = self._drain(1.5)
        if "unlocked" not in out and "log history" not in out:
            raise SystemExit("Turret console refused the password")

    def _drain(self, secs):
        self.sock.settimeout(0.2)
        out, end = b"", time.time() + secs
        while time.time() < end:
            try:
                data = self.sock.recv(8192)
                if not data:
                    break
                out += data
            except socket.timeout:
                pass
        return out.decode(errors="replace")

    def cmd(self, line, wait=0.3):
        self.sock.sendall((line + "\r\n").encode())
        return self._drain(wait)

    def close(self):
        self.sock.close()


class P4:
    def __init__(self, host, key):
        self.base = "http://%s/api" % host
        self.key = key

    def _req(self, path, data=None):
        req = urllib.request.Request(self.base + path, data=data)
        if self.key:
            req.add_header("X-Mostikator-Key", self.key)
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.read()

    def json(self, path, **params):
        import json
        data = None
        if params:
            data = "&".join("%s=%s" % kv for kv in params.items()).encode()
        return json.loads(self._req(path, data if data is not None else (b"" if path in ("/arm", "/disarm") else None)))

    def capture(self):
        return np.asarray(Image.open(io.BytesIO(self._req("/capture"))).convert("RGB"), dtype=np.int16)


def find_dot(on, off, min_strength):
    """Laser dot = biggest local brightness increase between the laser-on and laser-off pictures.
    All channels count: on a light background the dot saturates and barely changes the red channel alone."""
    diff = np.clip(on - off, 0, None).sum(axis=2).astype(np.float32)
    diff -= np.median(diff)   # exposure drift between the two pictures
    peak = float(diff.max())
    if peak < min_strength:
        return None, peak
    py, px = np.unravel_index(int(diff.argmax()), diff.shape)
    y0, y1, x0, x1 = max(py - 12, 0), py + 13, max(px - 12, 0), px + 13
    win = np.clip(diff[y0:y1, x0:x1] - peak * 0.5, 0, None)
    ys, xs = np.nonzero(win)
    w = win[ys, xs]
    h, wd = diff.shape
    return (float(((xs + x0) * w).sum() / w.sum() / wd), float(((ys + y0) * w).sum() / w.sum() / h)), peak


def fit(cam, tur, max_resid=2.0):
    """Least squares, dropping the worst point while it is off by more than max_resid degrees
    (a reflection or a speck of noise taken for the dot)."""
    cam, tur = list(cam), list(tur)
    while len(cam) >= 2 and np.ptp(cam) >= 1e-3:
        gain, offset = np.polyfit(cam, tur, 1)
        resid = np.abs(np.array(tur) - (gain * np.array(cam) + offset))
        worst = int(resid.argmax())
        if resid[worst] <= max_resid or len(cam) <= 3:
            return float(gain), float(offset), float(resid.max()), len(cam)
        print("  outlier dropped: camera tilt %+.1f / turret %+.1f (off by %.1f deg)" % (cam[worst], tur[worst], resid[worst]))
        del cam[worst], tur[worst]
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--p4", default=(define(P4_DIR / "config.h", "DEVICE_NAME") or "mostikator-p4-01") + ".local")
    ap.add_argument("--turret", default=(define(TURRET_DIR / "config.h", "DEVICE_NAME") or "mostikator-turret") + ".local")
    ap.add_argument("--turret-password", default=define(TURRET_DIR / "config.h", "OTA_PASSWORD"))
    ap.add_argument("--key", default=define(P4_DIR / "config.h", "CONTROL_PASSWORD"), help="P4 CONTROL_PASSWORD")
    ap.add_argument("--tilts", type=float, nargs="+", default=[-15, -5, 5, 15, 25, 35])
    ap.add_argument("--pan", type=float, default=0.0, help="pan angle held during the run")
    ap.add_argument("--settle", type=float, default=1.2, help="seconds for the servo + camera to settle")
    ap.add_argument("--min-strength", type=float, default=120, help="minimum brightness increase of the dot (sum of RGB, 0-765)")
    ap.add_argument("--save-images", type=Path, help="folder for the laser-on pictures (debug)")
    ap.add_argument("--dry-run", action="store_true", help="measure and print, do not save on the P4")
    args = ap.parse_args()
    if not args.turret_password:
        sys.exit("No turret password: --turret-password or OTA_PASSWORD in the turret config.h")

    p4 = P4(args.p4, args.key)
    cfg = p4.json("/config")
    det = cfg["detector"]
    hfov, vfov = det["hfov"], det["vfov"]
    was_armed = p4.json("/status")["detector"]["armed"]
    if was_armed:
        p4.json("/disarm")
    turret = Turret(args.turret, args.turret_password)
    if args.save_images:
        args.save_images.mkdir(parents=True, exist_ok=True)

    points = []
    try:
        for tilt in args.tilts:
            turret.cmd("angle %.1f %.1f" % (args.pan, tilt))
            turret.cmd("laser off")
            time.sleep(args.settle)
            off = p4.capture()
            turret.cmd("laser on")
            time.sleep(0.6)
            on = p4.capture()
            if args.save_images:
                Image.fromarray(on.astype(np.uint8)).save(args.save_images / ("tilt_%+05.1f.jpg" % tilt))
            dot, strength = find_dot(on, off, args.min_strength)
            if dot is None:
                print("tilt %+6.1f : no laser dot (strength %.0f)" % (tilt, strength))
                continue
            cam_pan = (dot[0] - 0.5) * hfov
            cam_tilt = (0.5 - dot[1]) * vfov
            points.append((tilt, dot, cam_pan, cam_tilt))
            print("tilt %+6.1f : dot at (%.3f, %.3f) -> camera pan %+6.1f tilt %+6.1f (strength %.0f)"
                  % (tilt, dot[0], dot[1], cam_pan, cam_tilt, strength))
    finally:
        turret.cmd("laser off")
        turret.cmd("center")
        turret.close()

    if len(points) < 2:
        if was_armed:
            p4.json("/arm")
        sys.exit("Not enough points (%d): is the laser dot inside the camera view?" % len(points))

    res = fit([p[3] for p in points], [p[0] for p in points])
    if res is None:
        if was_armed:
            p4.json("/arm")
        sys.exit("The dot did not move vertically in the picture: check the tilt servo")
    gain, offset, err, used = res
    mean_pan = float(np.mean([p[2] for p in points]))
    print()
    print("tilt : turret = %.3f x camera %+.2f   (max error %.2f deg over %d points)" % (gain, offset, err, used))
    print("pan  : laser %+.1f deg %s of the camera axis (x = %.3f)"
          % (abs(mean_pan), "right" if mean_pan > 0 else "left", float(np.mean([p[1][0] for p in points]))))

    if args.dry_run:
        print("Dry run: nothing saved")
    else:
        p4.json("/config", aim_tilt_gain="%.4f" % gain, aim_tilt_offset="%.3f" % offset,
                aim_pan_gain="1", aim_pan_offset="%.3f" % (args.pan - mean_pan))
        print("Saved on the P4 (aim_tilt_gain / aim_tilt_offset, aim_pan_offset)")
    if was_armed:
        p4.json("/arm")


if __name__ == "__main__":
    main()
