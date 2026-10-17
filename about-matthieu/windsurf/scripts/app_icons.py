"""App icons (PWA, iPhone home screen): a windsurf sail on the dark site colours. python app_icons.py -> site/public/icons/"""
import os
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "site", "public", "icons")

def icon(size, maskable=False):
    S = 1024; im = Image.new("RGBA", (S, S), (10, 10, 10, 255)); d = ImageDraw.Draw(im)
    k = 0.72 if maskable else 0.86                    # maskable icons keep the drawing in the safe circle
    P = lambda x, y: (S / 2 + (x - 0.5) * S * k, S / 2 + (y - 0.5) * S * k)
    # a soft blue glow behind the sail (the site's accent), blended on the dark background
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([P(0.12, 0.18), P(0.88, 0.94)], fill=(9, 120, 190, 150))
    im = Image.alpha_composite(im, glow.filter(ImageFilter.GaussianBlur(S * 0.09))); d = ImageDraw.Draw(im)
    # sail: luff along the mast (right), square head, leech curving down to the clew (left), window and swoosh
    sail = [P(0.62, 0.10), P(0.44, 0.13), P(0.20, 0.66), P(0.30, 0.74), P(0.64, 0.80)]
    d.polygon(sail, fill=(22, 176, 214, 255))
    d.polygon([P(0.60, 0.50), P(0.40, 0.46), P(0.29, 0.70), P(0.62, 0.77)], fill=(226, 236, 244, 255))
    d.line([P(0.60, 0.48), P(0.40, 0.45), P(0.28, 0.70), P(0.62, 0.78), P(0.60, 0.48)], fill=(214, 236, 31, 255), width=22, joint="curve")
    d.line([P(0.56, 0.16), P(0.47, 0.36), P(0.35, 0.56), P(0.24, 0.68)], fill=(74, 34, 181, 255), width=38, joint="curve")
    d.line([P(0.63, 0.08), P(0.66, 0.84)], fill=(240, 240, 240, 255), width=16)      # mast
    d.line([P(0.65, 0.52), P(0.27, 0.64)], fill=(200, 205, 210, 255), width=12)      # boom
    d.ellipse([P(0.18, 0.82), P(0.86, 0.90)], fill=(245, 90, 40, 255))               # board
    if not maskable:                                                                  # rounded corners for "any"
        m = Image.new("L", (S, S), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 0.2, fill=255)
        im.putalpha(m)
    return im.resize((size, size), Image.LANCZOS)

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for n in (192, 512): icon(n).save(f"{OUT}/icon-{n}.png", optimize=True)
    icon(512, maskable=True).save(f"{OUT}/icon-maskable-512.png", optimize=True)
    icon(180, maskable=True).convert("RGB").save(f"{OUT}/apple-touch-icon.png", optimize=True)   # iOS adds its own corners
    icon(32).save(f"{OUT}/favicon-32.png", optimize=True)
    print("icons in", OUT)
