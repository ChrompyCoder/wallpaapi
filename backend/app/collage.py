"""Collage rendering engine.

Templates:
  burst  - dense scattered polaroids, big in the centre, tiny confetti at the
           edges (Chainsmokers "Collage" cover style)
  mosaic - full-bleed irregular grid of images, edge to edge
  shape  - polaroids scattered to fill a silhouette (heart / star / circle /
           a custom polygon drawn by the user)
"""

import math
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def load_font(size, bold=False):
    try:
        return ImageFont.truetype(FONT_BOLD if bold else FONT_REGULAR, size)
    except OSError:
        return ImageFont.load_default(size)


def hex_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


# ---------------------------------------------------------------- background

def make_background(w, h, style, color1, color2):
    a, b = hex_rgb(color1), hex_rgb(color2)
    if style == "solid":
        return Image.new("RGB", (w, h), a)

    sw, sh = max(w // 8, 2), max(h // 8, 2)
    base = Image.new("RGB", (sw, sh))
    px = base.load()
    if style == "linear":
        for y in range(sh):
            t = y / (sh - 1)
            col = tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
            for x in range(sw):
                px[x, y] = col
    else:  # radial
        cx, cy = sw / 2, sh / 2
        maxd = math.hypot(cx, cy)
        for y in range(sh):
            for x in range(sw):
                t = min(math.hypot(x - cx, y - cy) / maxd, 1.0)
                px[x, y] = tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
    return base.resize((w, h), Image.BICUBIC)


# ------------------------------------------------------------------- pieces

def make_card(img, size, rotation, framed=True):
    """A single collage piece: optionally polaroid-framed, rotated, RGBA."""
    if framed:
        border = max(int(size * 0.07), 2)
        bottom = int(border * 2.2)
        inner = ImageOps.fit(img, (size, size))
        card = Image.new("RGB", (size + 2 * border, size + border + bottom),
                         (252, 250, 245))
        card.paste(inner, (border, border))
    else:
        card = ImageOps.fit(img, (size, size))
    card = card.convert("RGBA")
    if rotation:
        card = card.rotate(rotation, expand=True, resample=Image.BICUBIC)
    return card


def paste_card(layer, card, cx, cy, shadow=True):
    x = int(cx - card.width / 2)
    y = int(cy - card.height / 2)
    if shadow:
        alpha = card.getchannel("A")
        sh = Image.new("RGBA", card.size, (0, 0, 0, 0))
        sh.paste((0, 0, 0, 80), mask=alpha)
        sh = sh.filter(ImageFilter.GaussianBlur(max(card.width // 30, 2)))
        layer.alpha_composite(sh, (x + 3, y + 5))
    layer.alpha_composite(card, (x, y))


# --------------------------------------------------------------- placements

def burst_placements(w, h, density, rng):
    """(cx, cy, size, rotation) tuples, outer pieces first so the centre
    pieces end up on top."""
    m = min(w, h)
    cx, cy = w / 2, h / 2
    placements = []
    # rings: (count, size_min, size_max, radius_min, radius_max)
    rings = [
        (int(230 * density), 0.018, 0.042, 0.24, 0.55),
        (int(80 * density), 0.050, 0.080, 0.13, 0.30),
        (int(18 * density), 0.105, 0.165, 0.00, 0.15),
    ]
    for count, smin, smax, rmin, rmax in rings:
        for _ in range(max(count, 1)):
            ang = rng.uniform(0, 2 * math.pi)
            r = rng.uniform(rmin, rmax)
            x = cx + math.cos(ang) * r * w
            y = cy + math.sin(ang) * r * h
            size = int(rng.uniform(smin, smax) * m)
            placements.append((x, y, size, rng.uniform(-32, 32)))
    return placements


def mosaic_rects(w, h, n, rng):
    """Irregular full-bleed grid: list of (x, y, cw, ch) cells."""
    n = max(n, 1)
    rows = max(round(math.sqrt(n * h / w)), 1)
    per_row = max(math.ceil(n / rows), 1)
    row_weights = [rng.uniform(0.75, 1.3) for _ in range(rows)]
    total_rw = sum(row_weights)
    rects = []
    y = 0
    for ri, rw_ in enumerate(row_weights):
        ch = round(h * rw_ / total_rw) if ri < rows - 1 else h - y
        weights = [rng.uniform(0.7, 1.4) for _ in range(per_row)]
        total = sum(weights)
        x = 0
        for ci, wgt in enumerate(weights):
            cw = round(w * wgt / total) if ci < per_row - 1 else w - x
            rects.append((x, y, cw, ch))
            x += cw
        y += ch
    return rects


HEART_STEPS = 120


def shape_mask(w, h, shape, points):
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    m = min(w, h)
    cx, cy = w / 2, h / 2

    if shape == "custom" and points and len(points) >= 3:
        poly = [(p[0] * w, p[1] * h) for p in points]
        d.polygon(poly, fill=255)
    elif shape == "heart":
        pts = []
        for i in range(HEART_STEPS):
            t = 2 * math.pi * i / HEART_STEPS
            x = 16 * math.sin(t) ** 3
            y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
            pts.append((cx + x * m / 36, cy - y * m / 36 + m * 0.02))
        d.polygon(pts, fill=255)
    elif shape == "star":
        pts = []
        for i in range(10):
            r = m * (0.46 if i % 2 == 0 else 0.20)
            ang = -math.pi / 2 + i * math.pi / 5
            pts.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
        d.polygon(pts, fill=255)
    else:  # circle
        r = m * 0.44
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    return mask


def shape_placements(w, h, mask, density, rng):
    m = min(w, h)
    px = mask.load()
    placements = []
    target = int(280 * density)
    attempts = 0
    while len(placements) < target and attempts < target * 40:
        attempts += 1
        x = rng.uniform(0, w)
        y = rng.uniform(0, h)
        if px[int(x), int(y)] > 127:
            size = int(rng.uniform(0.035, 0.065) * m)
            placements.append((x, y, size, rng.uniform(-30, 30)))
    return placements


# --------------------------------------------------------------------- text

def draw_spaced(d, cx, y, text, font, fill, spacing):
    widths = [d.textlength(ch, font=font) for ch in text]
    total = sum(widths) + spacing * max(len(text) - 1, 0)
    x = cx - total / 2
    for ch, wd in zip(text, widths):
        d.text((x, y), ch, font=font, fill=fill)
        x += wd + spacing
    return total


def draw_center_text(img, cfg):
    title = (cfg.title or "").strip()
    subtitle = (cfg.subtitle or "").strip()
    if not title and not subtitle:
        return

    w, h = img.size
    m = min(w, h)
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)

    title_font = load_font(int(m * cfg.text_size * 0.10), bold=True)
    sub_font = load_font(int(m * cfg.text_size * 0.045))
    spacing = cfg.text_spacing * m * 0.01
    fill = hex_rgb(cfg.text_color) + (255,)

    def width_of(text, font):
        return (sum(d.textlength(ch, font=font) for ch in text)
                + spacing * max(len(text) - 1, 0))

    title_h = title_font.size if title else 0
    sub_h = sub_font.size if subtitle else 0
    gap = int(m * 0.03) if title and subtitle else 0
    text_w = max(width_of(title, title_font) if title else 0,
                 width_of(subtitle, sub_font) if subtitle else 0)
    pad_x, pad_y = m * 0.10, m * 0.09

    box_w = text_w + 2 * pad_x
    box_h = title_h + sub_h + gap + 2 * pad_y
    bx, by = (w - box_w) / 2, (h - box_h) / 2
    d.rectangle([bx, by, bx + box_w, by + box_h],
                fill=(255, 255, 255, int(cfg.text_box_opacity * 255)))

    y = by + pad_y
    if title:
        draw_spaced(d, w / 2, y, title, title_font, fill, spacing)
        y += title_h + gap
    if subtitle:
        draw_spaced(d, w / 2, y, subtitle, sub_font, fill, spacing)

    img.alpha_composite(overlay)


# ----------------------------------------------------------------- generate

def generate(cfg, load_image):
    rng = random.Random(cfg.seed)
    w, h = cfg.width, cfg.height

    bg = make_background(w, h, cfg.bg_style, cfg.bg_color1, cfg.bg_color2).convert("RGBA")
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))

    imgs = [load_image(p) for p in cfg.images]
    imgs = [i for i in imgs if i is not None]
    if not imgs:
        raise ValueError("no readable images selected")

    if cfg.template == "mosaic":
        rects = mosaic_rects(w, h, len(imgs) if not cfg.duplicate
                             else max(len(imgs), int(12 * cfg.density)), rng)
        pool = list(range(len(imgs)))
        rng.shuffle(pool)
        for i, (x, y, cw, ch) in enumerate(rects):
            img = imgs[pool[i % len(pool)]]
            cell = ImageOps.fit(img, (max(cw, 1), max(ch, 1)))
            layer.alpha_composite(cell.convert("RGBA"), (x, y))
    else:
        if cfg.template == "shape":
            mask = shape_mask(w, h, cfg.shape, cfg.shape_points)
            placements = shape_placements(w, h, mask, cfg.density, rng)
        else:
            placements = burst_placements(w, h, cfg.density, rng)

        if not cfg.duplicate and len(placements) > len(imgs):
            # keep the biggest (centre-most) pieces, one per image
            placements = placements[-len(imgs):]

        order = list(range(len(imgs)))
        rng.shuffle(order)
        for i, (x, y, size, rot) in enumerate(placements):
            img = imgs[order[i % len(order)]]
            card = make_card(img, size, rot, framed=cfg.polaroid)
            paste_card(layer, card, x, y, shadow=cfg.polaroid)

    if cfg.collage_opacity < 1.0:
        alpha = layer.getchannel("A").point(
            lambda v: int(v * cfg.collage_opacity))
        layer.putalpha(alpha)

    out = Image.alpha_composite(bg, layer)
    draw_center_text(out, cfg)
    return out.convert("RGB")
