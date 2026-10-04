#!/usr/bin/env python3
"""Product thumbnails with a real per-pixel z-buffer (handles intersecting parts)."""
import numpy as np
import struct
import os
from PIL import Image

STL_DIR = "/home/runner/work/PlayGround/PlayGround/phone/stl"
OUT_DIR = "/home/runner/work/PlayGround/PlayGround/phone/thumbs"
os.makedirs(OUT_DIR, exist_ok=True)

COLORS = {
    "01_phone_stand": (79, 127, 107),
    "02_ring_grip": (212, 165, 116),
    "03_car_vent_mount": (60, 64, 78),
    "04_charging_dock": (148, 110, 196),
    "05_headboard_shelf": (176, 125, 79),
    "06_cable_clip": (96, 130, 160),
    "07_tripod_plate": (110, 110, 110),
    "08_wall_dock": (200, 90, 90),
    "09_gamepad_clip": (70, 150, 120),
    "10_mini_tripod": (70, 90, 140),
}
VIEWS = {}
SS3 = {"02_ring_grip", "10_mini_tripod"}  # extra supersample for curved walls

def load_stl(path):
    raw = open(path, "rb").read()
    n = struct.unpack("<I", raw[80:84])[0]
    body = np.frombuffer(raw[84:], dtype=np.uint8).reshape(n, 50)
    tri = np.empty((n, 4, 3), dtype=np.float32)
    for k in range(4):
        tri[:, k, :] = np.frombuffer(body[:, k * 12:k * 12 + 12].tobytes(), dtype="<f4").reshape(n, 3)
    return tri[:, 0, :], tri[:, 1:, :]

def render(name, color, S=480, az=35.0, el=22.0, SS=2):
    Srey = S * SS  # supersampled render resolution
    normals, pts = load_stl(os.path.join(STL_DIR, name + ".stl"))
    a, e = np.radians(az), np.radians(el)
    Ry = np.array([[np.cos(a), 0, np.sin(a)], [0, 1, 0], [-np.sin(a), 0, np.cos(a)]])
    Rx = np.array([[1, 0, 0], [0, np.cos(e), -np.sin(e)], [0, np.sin(e), np.cos(e)]])
    R = Rx @ Ry
    pts = pts @ R.T
    normals = normals @ R.T
    # NOTE: cull only clearly-backfacing tris (nz <= -0.15). A tight threshold
    # punches half-quad holes at silhouettes; no culling shows interior
    # backfaces through openings. Kept tris resolve via the z-buffer.
    keep = normals[:, 2] > -0.15
    normals, pts = normals[keep], pts[keep]
    xs, ys, zs = pts[:, :, 0], pts[:, :, 1], pts[:, :, 2]
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    dx, dy = x1 - x0, y1 - y0
    x0 -= dx * 0.12; x1 += dx * 0.12; y0 -= dy * 0.12; y1 += dy * 0.12
    u = (xs - x0) / (x1 - x0) * (Srey - 1)
    vv = (1.0 - (ys - y0) / (y1 - y0)) * (Srey - 1)
    l1 = np.array([0.35, 0.5, 0.79]); l1 /= np.linalg.norm(l1)
    l2 = np.array([-0.7, 0.2, 0.5]); l2 /= np.linalg.norm(l2)
    nn = normals / (np.linalg.norm(normals, axis=1, keepdims=True) + 1e-9)
    shade = 0.35 + 0.6 * np.clip(np.abs(nn @ l1), 0, 1) + 0.3 * np.clip(np.abs(nn @ l2), 0, 1)
    base = np.array(color, dtype=float)
    cols = np.clip(base[None, :] * shade[:, None], 0, 255).astype(np.uint8)

    zbuf = np.full((Srey, Srey), -1e9)
    img = np.full((Srey, Srey, 3), (242, 237, 228), dtype=np.uint8)
    # ground shadow (behind model, drawn first)
    gy = int((1.0 - 0.02) * (Srey - 1))
    yy, xx = np.ogrid[:Srey, :Srey]
    shadow = ((xx - Srey / 2) / (Srey * 0.32)) ** 2 + ((yy - gy) / (14 * SS)) ** 2 < 1
    img[shadow] = (215, 205, 190)

    for t in range(len(pts)):
        pu, pv, pz = u[t], vv[t], zs[t]
        umin, umax = int(max(pu.min(), 0)), int(min(pu.max(), Srey - 1))
        vmin, vmax = int(max(pv.min(), 0)), int(min(pv.max(), Srey - 1))
        if umax < umin or vmax < vmin:
            continue
        gu, gv = np.meshgrid(np.arange(umin, umax + 1), np.arange(vmin, vmax + 1))
        # barycentric edge functions
        d = (pv[1] - pv[2]) * (pu[0] - pu[2]) + (pu[2] - pu[1]) * (pv[0] - pv[2])
        if abs(d) < 1e-12:
            continue
        l0 = ((pv[1] - pv[2]) * (gu - pu[2]) + (pu[2] - pu[1]) * (gv - pv[2])) / d
        l1b = ((pv[2] - pv[0]) * (gu - pu[2]) + (pu[0] - pu[2]) * (gv - pv[2])) / d
        l2b = 1 - l0 - l1b
        # generous edge epsilon: pixel centers on shared quad edges must be
        # claimed despite float rounding at high supersample coords
        m = (l0 >= -5e-3) & (l1b >= -5e-3) & (l2b >= -5e-3)
        if not m.any():
            continue
        z = l0 * pz[0] + l1b * pz[1] + l2b * pz[2]
        sub = zbuf[vmin:vmax + 1, umin:umax + 1]
        upd = m & (z > sub)
        sub[upd] = z[upd]
        img[vmin:vmax + 1, umin:umax + 1][upd] = cols[t]
    # downsample first, then fill at FINAL resolution: sub-pixel misses are
    # <=1px here, so pinhole/slit fills catch everything remaining
    img = np.array(Image.fromarray(img).resize((S, S), Image.LANCZOS))
    # tolerant background test: downsample-blurred gap pixels read near-bg;
    # treat them as holes so the fills below catch them
    mod = np.abs(img.astype(int) - np.array([242, 237, 228])).sum(axis=2) > 24
    # pinhole fill + 2 dilation passes: bg pixels mostly surrounded by model
    # pixels take the neighbour mean (kills sub-pixel cracks, bars, fringe)
    for thresh in (2, 4, 4):
        padded = np.pad(mod.astype(np.float32), 1)
        neigh = (padded[:-2, :-2] + padded[:-2, 1:-1] + padded[:-2, 2:] +
                 padded[1:-1, :-2] + padded[1:-1, 2:] +
                 padded[2:, :-2] + padded[2:, 1:-1] + padded[2:, 2:])
        fill = ~mod & (neigh >= 8 - thresh)
        if not fill.any():
            break
        for c in range(3):
            ch = img[:, :, c].astype(np.float32)
            p = np.pad(ch, 1)
            mean = (p[:-2, :-2] + p[:-2, 1:-1] + p[:-2, 2:] + p[1:-1, :-2] +
                    p[1:-1, 2:] + p[2:, :-2] + p[2:, 1:-1] + p[2:, 2:]) / 8.0
            ch[fill] = mean[fill]
            img[:, :, c] = ch.astype(np.uint8)
        mod[fill] = True  # filled counts as model for the next pass
    # slit fill: bg pixel with model on BOTH sides (horizontally or vertically)
    # within a narrow window = rasterizer fringe inside the silhouette
    W = 8
    left = np.zeros_like(mod)
    right = np.zeros_like(mod)
    up = np.zeros_like(mod)
    dn = np.zeros_like(mod)
    for k in range(1, W + 1):
        left[:, k:] |= mod[:, :-k]
        right[:, :-k] |= mod[:, k:]
        up[k:, :] |= mod[:-k, :]
        dn[:-k, :] |= mod[k:, :]
    slit = ~mod & ((left & right) | (up & dn))
    if slit.any():
        for c in range(3):
            ch = img[:, :, c].astype(np.float32)
            p = np.pad(ch, 1)
            mean = (p[:-2, :-2] + p[:-2, 1:-1] + p[:-2, 2:] + p[1:-1, :-2] +
                    p[1:-1, 2:] + p[2:, :-2] + p[2:, 1:-1] + p[2:, 2:]) / 8.0
            ch[slit] = mean[slit]
            img[:, :, c] = ch.astype(np.uint8)
    Image.fromarray(img).save(os.path.join(OUT_DIR, name + ".png"))
    print("thumb:", name)

if __name__ == "__main__":
    for name, color in COLORS.items():
        az, el = VIEWS.get(name, (35.0, 22.0))
        render(name, color, az=az, el=el, SS=3 if name in SS3 else 2)
