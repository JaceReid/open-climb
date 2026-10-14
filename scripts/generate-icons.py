"""Derive every app icon from assets/images/icon.png (the single source).

icon.png is a teal circle with a white glyph on a black square. Android launchers
mask icons into their own shapes, so this makes:

  assets/images/icon-round.png    the circle with transparent corners
                                  (legacy Android icon, splash screen, favicon)
  assets/images/adaptive-icon.png the white glyph on transparent, sized to the
                                  adaptive-icon safe zone (foreground + monochrome
                                  layer; the background is the teal colour)

It prints the teal it found, for app.json's adaptiveIcon.backgroundColor.
Run after changing icon.png:  python3 scripts/generate-icons.py  (needs Pillow)
"""

from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent / "assets" / "images"
SIZE = 1024
# Adaptive icons are 108dp with a 66dp circle that is always visible. Keep the
# glyph inside that circle with a little breathing room.
SAFE_RADIUS = SIZE * (66 / 108) / 2 * 0.92

src = Image.open(ROOT / "icon.png").convert("RGB")
r, g, b = src.split()

# The teal is the most common colour that is neither white nor black.
teal = max(
    (count, rgb)
    for count, rgb in src.getcolors(src.width * src.height)
    if 40 < min(rgb[1], rgb[2]) and rgb[0] < 120
)[1]
print("background #%02X%02X%02X" % teal)


def ramp(channel, lo, hi):
    """Map a channel linearly so lo -> 0 and hi -> 255 (anti-aliased alpha)."""
    return channel.point(lambda v: max(0, min(255, round((v - lo) * 255 / (hi - lo)))))


# Round icon: alpha from the green channel (black -> teal), so edges stay smooth.
round_alpha = ramp(g, 0, teal[1])
round_icon = src.copy()
round_icon.putalpha(round_alpha)
round_icon = round_icon.crop(round_alpha.getbbox())
side = max(round_icon.size)
square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
square.paste(round_icon, ((side - round_icon.width) // 2, (side - round_icon.height) // 2))
square.resize((SIZE, SIZE), Image.LANCZOS).save(ROOT / "icon-round.png")

# Glyph: alpha from the red channel (teal -> white), ignoring the black outside.
glyph_alpha = ImageChops.multiply(ramp(r, teal[0], 255), ramp(g, 0, teal[1]))
bbox = glyph_alpha.point(lambda v: 255 if v > 24 else 0).getbbox()
glyph_alpha = glyph_alpha.crop(bbox)

# Scale so the glyph's farthest pixel from its centre sits on SAFE_RADIUS.
w, h = glyph_alpha.size
cx, cy = w / 2, h / 2
px = glyph_alpha.load()
far = max(
    ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
    for y in range(0, h, 2)
    for x in range(0, w, 2)
    if px[x, y] > 24
)
scale = SAFE_RADIUS / far
glyph_alpha = glyph_alpha.resize((round(w * scale), round(h * scale)), Image.LANCZOS)

fg = Image.new("RGBA", (SIZE, SIZE), (255, 255, 255, 0))
layer = Image.new("RGBA", glyph_alpha.size, (255, 255, 255, 255))
layer.putalpha(glyph_alpha)
fg.paste(layer, ((SIZE - layer.width) // 2, (SIZE - layer.height) // 2), layer)
fg.save(ROOT / "adaptive-icon.png")
print("wrote icon-round.png, adaptive-icon.png")
