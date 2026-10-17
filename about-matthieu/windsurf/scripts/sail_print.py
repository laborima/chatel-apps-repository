"""Sail print for the windsurfer (the E_Pace 2025 look, C20 colours), painted in the sail's (u, v) space:
u from the luff (0) to the leech (1), v from the foot (0) to the head (1). No logos or lettering.
Run with any Python that has numpy and Pillow: python sail_print.py  ->  ../textures/sail_print.png"""
import math, os, numpy as np
from PIL import Image, ImageDraw

def paint_sail(W=1024, H=2048):
    """Turquoise film above, a clear x-ply window framed in lime below, a violet S-swoosh, violet lower leech and foot."""
    TURQ, VIOL, LIME, CLEAR = (22, 176, 214, 246), (74, 34, 181, 240), (214, 236, 31, 255), (226, 233, 240, 110)
    P = lambda pts: [(u * W, (1 - v) * H) for u, v in pts]
    im = Image.new("RGBA", (W, H), TURQ); d = ImageDraw.Draw(im)
    # clear window (lower body) framed in lime, the violet lower leech and foot
    win = [(0.07, 0.07), (0.07, 0.40), (0.50, 0.57), (0.84, 0.40), (0.84, 0.14), (0.62, 0.07)]
    d.polygon(P(win), fill=CLEAR)
    d.polygon(P([(0.84, 0.0), (0.84, 0.40), (0.72, 0.46), (1.0, 0.58), (1.0, 0.0)]), fill=VIOL)
    d.polygon(P([(0.0, 0.0), (1.0, 0.0), (1.0, 0.07), (0.62, 0.07), (0.0, 0.035)]), fill=VIOL)
    d.line(P(win + [win[0]]), fill=LIME, width=30, joint="curve")
    # violet swoosh: from the luff under the head, an S across the body down to the lower leech, edged in lime
    sw = [(0.12 + 0.88 * t + 0.10 * math.sin(2 * math.pi * t), 0.92 - 0.80 * t ** 0.9) for t in np.linspace(0, 1, 60)]
    d.line(P([(u + 0.03, v - 0.004) for u, v in sw]), fill=LIME, width=96, joint="curve")
    d.line(P(sw), fill=VIOL, width=76, joint="curve")
    # violet head patch, lime tape along the leech up high
    d.polygon(P([(0.30, 1.0), (1.0, 1.0), (1.0, 0.88), (0.60, 0.92)]), fill=VIOL)
    d.line(P([(0.985, 0.60), (0.985, 0.88)]), fill=LIME, width=16)
    # a fine woven grid on the violet panels (x-ply scrim), and soft film creases
    px = np.asarray(im).astype(np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    viol = (np.abs(px[..., 0] - VIOL[0]) < 8) & (np.abs(px[..., 2] - VIOL[2]) < 8)
    grid = ((xx + yy) % 22 < 2) | ((xx - yy) % 22 < 2)
    px[viol & grid, :3] *= 1.25
    rng = np.random.default_rng(3)
    crease = np.asarray(Image.fromarray((rng.random((H // 32, W // 32)) * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)).astype(np.float32) / 255
    px[..., :3] *= (0.94 + 0.08 * crease)[..., None]
    return Image.fromarray(np.clip(px, 0, 255).astype(np.uint8), "RGBA")

if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "textures", "sail_print.png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    paint_sail().save(out, optimize=True); print("wrote", out)
