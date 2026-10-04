#!/usr/bin/env python3
"""Generate a printable beer-can mug holder ('mugg') with 'MUSE SPARK' embossed.
Outputs binary STL in mm. No dependencies beyond numpy + Pillow.
"""
import numpy as np
import struct
import argparse
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ap = argparse.ArgumentParser(description="Beer-can mug holder ('mugg') STL generator")
ap.add_argument("--name", default="MUSE SPARK", help="embossed main line (max ~12 chars)")
ap.add_argument("--sub", default="BEER MUGG", help="embossed sub line")
ap.add_argument("--out", default="muse-spark-beer-mugg-holder.stl", help="output file")
args = ap.parse_args()
NAME, SUB = args.name.upper()[:12], args.sub.upper()[:14]

# ---- dimensions (mm) ----
R_OUT = 39.0      # outer radius (78 mm diameter)
R_IN = 34.0       # inner cavity radius (68 mm -> fits 66 mm cans + clearance)
H = 105.0         # total height
BASE = 6.0        # floor thickness
EMBOSS = 2.0      # text relief height
N = 720           # radial segments
M = 64            # outer-wall vertical rows

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# ---- text mask (supersampled) ----
W, Hh = 2880, 512
img = Image.new("L", (W, Hh), 0)
d = ImageDraw.Draw(img)
def fit_font(text, target_px, start=200):
    size = start
    while size > 10:
        f = ImageFont.truetype(FONT_BOLD, size)
        bb = ImageDraw.Draw(Image.new("L", (8, 8))).textbbox((0, 0), text, font=f)
        if bb[2] - bb[0] <= target_px:
            return f
        size -= 4
    return ImageFont.truetype(FONT_BOLD, 10)

f1 = fit_font(NAME, 720)   # ~90 degrees of the circumference
f2 = fit_font(SUB, 420)    # ~52 degrees
cx = W // 4  # theta = +Z (front); handle sits at theta = 0 (+X)
d.text((cx, int((1 - 69 / H) * Hh)), NAME, font=f1, anchor="mm", fill=255)
d.text((cx, int((1 - 43 / H) * Hh)), SUB, font=f2, anchor="mm", fill=255)
img = img.filter(ImageFilter.GaussianBlur(2))
mask = np.asarray(img, dtype=np.float32) / 255.0

def relief(theta, z):
    x = (theta / (2 * np.pi) * W) % W
    # Mirror about the text centre (W/4, front +Z): viewed from outside,
    # increasing theta runs right-to-left on screen, so sample the mask
    # flipped or the print would read backwards.
    x = (W / 2 - x) % W
    y = np.clip((1 - z / H) * Hh, 0, Hh - 1)
    return mask[int(y), int(x) % W] * EMBOSS

tris = []

def add_tri(a, b, c):
    tris.append((a, b, c))

# ---- outer wall with embossed text ----
thetas = np.linspace(0, 2 * np.pi, N, endpoint=False)
zs = np.linspace(0, H, M + 1)
grid = np.zeros((M + 1, N))
for j, z in enumerate(zs):
    for i, th in enumerate(thetas):
        grid[j, i] = R_OUT + relief(th, z)

def P(r, th, z):
    return (r * np.cos(th), z, r * np.sin(th))

for j in range(M):
    for i in range(N):
        i2 = (i + 1) % N
        p00 = P(grid[j, i], thetas[i], zs[j])
        p10 = P(grid[j, i2], thetas[i2], zs[j])
        p11 = P(grid[j + 1, i2], thetas[i2], zs[j + 1])
        p01 = P(grid[j + 1, i], thetas[i], zs[j + 1])
        # wound for OUTWARD (+r) normals
        add_tri(p00, p11, p10)
        add_tri(p00, p01, p11)

# ---- top rim (outer edge at z=H has no text -> radius R_OUT) ----
for i in range(N):
    i2 = (i + 1) % N
    o1 = P(R_OUT, thetas[i], H); o2 = P(R_OUT, thetas[i2], H)
    q1 = P(R_IN, thetas[i], H); q2 = P(R_IN, thetas[i2], H)
    add_tri(o1, q1, q2); add_tri(o1, q2, o2)

# ---- inner wall (normals face cavity) ----
for i in range(N):
    i2 = (i + 1) % N
    a = P(R_IN, thetas[i], H); b = P(R_IN, thetas[i2], H)
    c = P(R_IN, thetas[i2], BASE); e = P(R_IN, thetas[i], BASE)
    add_tri(a, c, b); add_tri(a, e, c)

# ---- inner floor (z=BASE) + outer floor (z=0) ----
for i in range(N):
    i2 = (i + 1) % N
    add_tri((0, BASE, 0), P(R_IN, thetas[i2], BASE), P(R_IN, thetas[i], BASE))
    add_tri((0, 0, 0), P(R_OUT, thetas[i], 0), P(R_OUT, thetas[i2], 0))

# ---- handle: cubic bezier tube in the y-x plane at z=0 side (+X) ----
p0 = np.array([R_OUT - 3, 82.0, 0.0])
p1 = np.array([R_OUT + 27, 78.0, 0.0])
p2 = np.array([R_OUT + 27, 30.0, 0.0])
p3 = np.array([R_OUT - 3, 26.0, 0.0])
SEG, SIDES, TUBE_R = 48, 16, 6.0
curve = np.array([((1 - t) ** 3) * p0 + 3 * ((1 - t) ** 2) * t * p1
                  + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3
                  for t in np.linspace(0, 1, SEG + 1)])
rings = []
for k in range(SEG + 1):
    tan = curve[min(k + 1, SEG)] - curve[max(k - 1, 0)]
    tan /= np.linalg.norm(tan)
    up = np.array([0.0, 0.0, 1.0])  # plane normal -> binormal in-plane
    n1 = np.cross(tan, up); n1 /= np.linalg.norm(n1)
    n2 = np.cross(tan, n1)
    rings.append([curve[k] + TUBE_R * (np.cos(a) * n1 + np.sin(a) * n2)
                  for a in np.linspace(0, 2 * np.pi, SIDES, endpoint=False)])
for k in range(SEG):
    for s in range(SIDES):
        s2 = (s + 1) % SIDES
        add_tri(tuple(rings[k][s]), tuple(rings[k + 1][s]), tuple(rings[k + 1][s2]))
        add_tri(tuple(rings[k][s]), tuple(rings[k + 1][s2]), tuple(rings[k][s2]))
for cap, flip in ((rings[0], True), (rings[-1], False)):  # end caps (buried in wall)
    c = tuple(np.mean(cap, axis=0))
    for s in range(SIDES):
        s2 = (s + 1) % SIDES
        add_tri(c, tuple(cap[s2]), tuple(cap[s])) if flip else add_tri(c, tuple(cap[s]), tuple(cap[s2]))

# ---- write binary STL ----
T = np.array(tris, dtype=np.float64)
v1 = T[:, 1] - T[:, 0]; v2 = T[:, 2] - T[:, 0]
n = np.cross(v1, v2)
ln = np.linalg.norm(n, axis=1, keepdims=True); ln[ln == 0] = 1
n /= ln
assert np.isfinite(T).all() and np.isfinite(n).all()
out = args.out
with open(out, "wb") as f:
    f.write(b"\x00" * 80)
    f.write(struct.pack("<I", len(T)))
    for normal, tri in zip(n, T):
        f.write(struct.pack("<12fH", *normal, *tri[0], *tri[1], *tri[2], 0))
mn, mx = T.reshape(-1, 3).min(0), T.reshape(-1, 3).max(0)
print(f"triangles: {len(T)}, size: {mx - mn} mm, file: {out}")
