#!/usr/bin/env python3
"""10 sellable 3D-print designs -> STL. Only needs numpy. All dims in mm (y-up)."""
import numpy as np
import struct
import os

OUT = "/home/runner/work/PlayGround/PlayGround/shop/stl"
os.makedirs(OUT, exist_ok=True)

# ---------------- toolkit ----------------
def _orient(a, b, c, inside):
    n = np.cross(np.subtract(b, a), np.subtract(c, a))
    if np.dot(n, np.subtract(np.mean([a, b, c], axis=0), inside)) < 0:
        return (a, c, b)
    return (a, b, c)

def quad(tris, a, b, c, d, inside):
    a, b, c, d = map(lambda p: tuple(map(float, p)), (a, b, c, d))
    tris.append(_orient(a, b, c, inside))
    tris.append(_orient(a, c, d, inside))

def box(tris, sx, sy, sz, center=(0, 0, 0), rot=(0, 0, 0)):
    """Axis-aligned or euler-rotated (deg, XYZ order) solid box."""
    cx, cy, cz = center
    rx, ry, rz = np.radians(rot)
    Rx = np.array([[1, 0, 0], [0, np.cos(rx), -np.sin(rx)], [0, np.sin(rx), np.cos(rx)]])
    Ry = np.array([[np.cos(ry), 0, np.sin(ry)], [0, 1, 0], [-np.sin(ry), 0, np.cos(ry)]])
    Rz = np.array([[np.cos(rz), -np.sin(rz), 0], [np.sin(rz), np.cos(rz), 0], [0, 0, 1]])
    R = Rz @ Ry @ Rx
    c = np.array([cx, cy, cz])
    v = {}
    for sxn in (-1, 1):
        for syn in (-1, 1):
            for szn in (-1, 1):
                v[(sxn, syn, szn)] = tuple(c + R @ (np.array([sxn * sx, syn * sy, szn * sz]) / 2))
    inside = tuple(c)
    quads = [
        [(1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1)],
        [(-1, -1, -1), (-1, -1, 1), (-1, 1, 1), (-1, 1, -1)],
        [(-1, 1, -1), (-1, 1, 1), (1, 1, 1), (1, 1, -1)],
        [(-1, -1, -1), (1, -1, -1), (1, -1, 1), (-1, -1, 1)],
        [(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)],
        [(-1, -1, -1), (-1, 1, -1), (1, 1, -1), (1, -1, -1)],
    ]
    # fix key order: dict keys are (sxn,syn,szn); quads above list (x,y,z) sign triples
    for q in quads:
        pts = [v[(s[0], s[1], s[2])] for s in q]
        quad(tris, *pts, inside)

def cyl(tris, r_top, r_bot, h, center=(0, 0, 0), seg=48):
    cx, cy, cz = center
    th = np.linspace(0, 2 * np.pi, seg, endpoint=False)
    for i in range(seg):
        j = (i + 1) % seg
        ob = (cx + r_bot * np.cos(th[i]), cy - h / 2, cz + r_bot * np.sin(th[i]))
        ob2 = (cx + r_bot * np.cos(th[j]), cy - h / 2, cz + r_bot * np.sin(th[j]))
        ot = (cx + r_top * np.cos(th[i]), cy + h / 2, cz + r_top * np.sin(th[i]))
        ot2 = (cx + r_top * np.cos(th[j]), cy + h / 2, cz + r_top * np.sin(th[j]))
        quad(tris, ob, ob2, ot2, ot, (cx, cy, cz))
    for i in range(seg):  # top cap (+y)
        j = (i + 1) % seg
        a = (cx, cy + h / 2, cz)
        b = (cx + r_top * np.cos(th[i]), cy + h / 2, cz + r_top * np.sin(th[i]))
        c = (cx + r_top * np.cos(th[j]), cy + h / 2, cz + r_top * np.sin(th[j]))
        tris.append(_orient(a, b, c, (cx, cy - h, cz)))
    for i in range(seg):  # bottom cap (-y)
        j = (i + 1) % seg
        a = (cx, cy - h / 2, cz)
        b = (cx + r_bot * np.cos(th[i]), cy - h / 2, cz + r_bot * np.sin(th[i]))
        c = (cx + r_bot * np.cos(th[j]), cy - h / 2, cz + r_bot * np.sin(th[j]))
        tris.append(_orient(a, b, c, (cx, cy + h, cz)))

def ring(tris, r_out, r_in, y0, y1, center=(0, 0), seg=64):
    """Flat annular rim (coaster rim, vase lip...)."""
    cx, cz = center
    th = np.linspace(0, 2 * np.pi, seg, endpoint=False)
    for i in range(seg):
        j = (i + 1) % seg
        co = lambda r, a, y: (cx + r * np.cos(a), y, cz + r * np.sin(a))
        o0, o1 = co(r_out, th[i], y0), co(r_out, th[j], y0)
        o2, o3 = co(r_out, th[i], y1), co(r_out, th[j], y1)
        q0, q1 = co(r_in, th[i], y0), co(r_in, th[j], y0)
        q2, q3 = co(r_in, th[i], y1), co(r_in, th[j], y1)
        mid = ((r_out + r_in) / 2 * np.cos(th[i]) + cx, (y0 + y1) / 2, (r_out + r_in) / 2 * np.sin(th[i]) + cz)
        quad(tris, o0, o1, o3, o2, (cx, (y0 + y1) / 2, cz))          # outer wall
        quad(tris, q0, q2, q3, q1, mid)                              # inner wall (faces hole)
        quad(tris, o2, o3, q3, q2, mid)                              # top face
        quad(tris, o0, q0, q1, o1, mid)                              # bottom face

def cup(tris, r_out_top, r_out_bot, r_in, h, base, N=160, rows=8,
        lobe_amp=0.0, lobe_k=0, twist_deg=0.0, belly=0.0,
        lip_out=0.0, lip_h=0.0):
    """Open-top vessel (planter, pen cup, vase). Lobed/twisted/bellied outer wall optional.
    lip_out/lip_h add a rolled-lip flare into the SAME shell (stays watertight)."""
    th = np.linspace(0, 2 * np.pi, N, endpoint=False)
    tw = np.radians(twist_deg)
    def ro(t, z):
        f = min(z / h, 1.0)
        r = r_out_bot + (r_out_top - r_out_bot) * f + belly * np.sin(np.pi * f) ** 1.2
        if lobe_amp:
            r += lobe_amp * np.cos(lobe_k * (t + tw * f))
        return r
    def P(r, t, z):
        return (r * np.cos(t), z, r * np.sin(t))
    top_y = h + lip_h
    r_lip = ro(0, h) + lip_out  # NOTE: lobes make ro vary with t; lip uses per-t radius below
    zs = np.linspace(0, h, rows + 1)
    for j in range(rows):
        for i in range(N):
            i2 = (i + 1) % N
            t0, t1 = th[i], th[i2]
            p00 = P(ro(t0, zs[j]), t0, zs[j])
            p10 = P(ro(t1, zs[j]), t1, zs[j])
            p11 = P(ro(t1, zs[j + 1]), t1, zs[j + 1])
            p01 = P(ro(t0, zs[j + 1]), t0, zs[j + 1])
            quad(tris, p00, p10, p11, p01, (0, zs[j] + h * 0.02, 0))
    if lip_out > 0 and lip_h > 0:
        for i in range(N):  # flared lip band (wall continuation, per-t radius)
            i2 = (i + 1) % N
            t0, t1 = th[i], th[i2]
            r0, r1 = ro(t0, h) + lip_out, ro(t1, h) + lip_out
            w0, w1 = P(ro(t0, h), t0, h), P(ro(t1, h), t1, h)
            u0, u1 = P(r0, t0, top_y), P(r1, t1, top_y)
            quad(tris, w0, w1, u1, u0, (0, h, 0))      # flares outward going up
            rlip = (ro(t0, h) + ro(t1, h)) / 2 + lip_out
    else:
        rlip = None
    for i in range(N):  # rim (from outer/lip top edge to inner top edge)
        i2 = (i + 1) % N
        if rlip is None:
            o1 = P(ro(th[i], h), th[i], h)
            o2 = P(ro(th[i2], h), th[i2], h)
        else:
            o1 = P(ro(th[i], h) + lip_out, th[i], top_y)
            o2 = P(ro(th[i2], h) + lip_out, th[i2], top_y)
        q1 = P(r_in, th[i], top_y)
        q2 = P(r_in, th[i2], top_y)
        tris.append(_orient(o1, q1, q2, (0, top_y - 1, 0)))
        tris.append(_orient(o1, q2, o2, (0, top_y - 1, 0)))
    for i in range(N):  # inner wall (plain) — inside-pt must sit in the WALL material
        i2 = (i + 1) % N
        tm = (th[i] + th[i2]) / 2
        rm = (r_in + ro(tm, (h + base) / 2)) / 2
        mat = (rm * np.cos(tm), (h + base) / 2, rm * np.sin(tm))
        a = P(r_in, th[i], top_y)
        b = P(r_in, th[i2], top_y)
        c = P(r_in, th[i2], base)
        e = P(r_in, th[i], base)
        quad(tris, a, b, c, e, mat)   # corners in order -> true diagonal split
    for i in range(N):  # floors (outer floor follows lobed wall footprints)
        i2 = (i + 1) % N
        # inner floor: material is BELOW -> inside-pt below
        tris.append(_orient((0, base, 0), P(r_in, th[i2], base), P(r_in, th[i], base), (0, base - 2, 0)))
        f0, f1 = P(ro(th[i], 0), th[i], 0), P(ro(th[i2], 0), th[i2], 0)
        tris.append(_orient((0, 0, 0), f0, f1, (0, 5, 0)))

def write_stl(path, tris):
    T = np.array(tris, dtype=np.float64)
    v1 = T[:, 1] - T[:, 0]
    v2 = T[:, 2] - T[:, 0]
    n = np.cross(v1, v2)
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    ln[ln == 0] = 1
    n /= ln
    assert np.isfinite(T).all()
    with open(path, "wb") as f:
        f.write(b"\x00" * 80)
        f.write(struct.pack("<I", len(T)))
        for normal, tr in zip(n, T):
            f.write(struct.pack("<12fH", *normal, *tr[0], *tr[1], *tr[2], 0))
    mn, mx = T.reshape(-1, 3).min(0), T.reshape(-1, 3).max(0)
    area = np.linalg.norm(np.cross(v1, v2), axis=1) / 2
    print(f"{os.path.basename(path)}: {len(T)} tris, {tuple(round(float(v),1) for v in mx-mn)} mm, degen={int((area<1e-9).sum())}")

# ---------------- the 10 products ----------------
def m_phone_stand():
    t = []
    box(t, 90, 8, 70, (0, 4, 0))                    # base
    box(t, 90, 115, 8, (0, 58, -24), rot=(-20, 0, 0))  # backrest leaning back
    box(t, 37, 14, 10, (-20.5, 15, 26))             # front lip L (cable gap middle)
    box(t, 37, 14, 10, (20.5, 15, 26))              # front lip R
    box(t, 90, 6, 12, (0, 11, -30))                 # heel stop
    return t

def m_cable_holder():
    t = []
    box(t, 110, 10, 30, (0, 5, 0))
    for x in (-46, -15.3, 15.3, 46):
        box(t, 9, 24, 26, (x, 20, 0))               # 4 posts -> 3 slots
    box(t, 110, 4, 34, (0, 2, 0))                   # grippy foot flange
    return t

def m_hook_rack():
    t = []
    box(t, 170, 90, 8, (0, 45, 0))                   # wall plate
    box(t, 170, 10, 14, (0, 95, 0))                 # top cap shelf
    for x in (-60, -20, 20, 60):
        t_peg = []
        cyl(t_peg, 6, 6, 46, (0, 0, 0), seg=20)
        # rotate to Z axis: (x,y,z) -> (x+xpeg, z+45, -y+27); det=+1 so winding kept
        for tri in t_peg:
            t.append(tuple((p[0] + x, p[2] + 45, -p[1] + 27) for p in tri))
        box(t, 14, 14, 8, (x, 45, 50))              # peg end knob
    return t

def m_tube_squeezer():
    t = []
    box(t, 26, 8, 60, (0, 4, 0))                     # handle
    box(t, 5, 12, 60, (-13.5, 12, 0))                # rail L
    box(t, 5, 12, 60, (13.5, 12, 0))                # rail R (6mm... gap ~22 wide slot)
    box(t, 32, 5, 60, (0, 20.5, 0))                 # bridge
    pin = []
    cyl(pin, 5, 5, 30, (0, 0, 0), seg=20)           # winding pin across slot (along X)
    for tri in pin:                                 # (x,y,z)->(y,-x,z), det=+1
        t.append(tuple((p[1], -p[0] + 12, p[2]) for p in tri))
    return t

def m_bag_clip():
    t = []
    box(t, 90, 6, 26, (0, 3, 0))                     # lower jaw
    for i in range(3):                               # grip teeth
        box(t, 90, 4, 3, (0, 8, -8 + i * 8))
    box(t, 90, 12, 10, (0, 9, -16))                  # hinge block
    box(t, 90, 6, 26, (0, 20, -3), rot=(8, 0, 0))     # upper jaw, sprung open
    box(t, 30, 10, 6, (0, 26, 8))                    # thumb tab
    return t

def m_soap_dish():
    t = []
    box(t, 110, 6, 75, (0, 9, 0))                    # tray
    for i in range(6):                               # drain ribs
        box(t, 100, 8, 6, (0, 16, -30 + i * 12))
    for x in (-45, 45):
        for z in (-28, 28):
            box(t, 14, 6, 14, (x, 3, z))             # feet
    return t

def m_planter():
    t = []
    cup(t, 55, 42, 47, 90, 8, N=180, rows=10, lip_out=3, lip_h=6)  # tapered pot + flared lip
    return t

def m_pen_holder():
    t = []
    cup(t, 45, 45, 39, 100, 8, N=6, rows=4)          # hex cup
    box(t, 76, 84, 4, (0, 50, 0))                   # divider A
    box(t, 4, 84, 76, (0, 50, 0))                   # divider B (4 compartments)
    return t

def m_hex_coaster():
    t = []
    cyl(t, 50, 50, 6, (0, 3, 0), seg=6)              # hex base
    ring(t, 50, 44, 4, 10, seg=6)                   # raised rim, sunk 2mm into base
    cyl(t, 14, 14, 3, (0, 7.5, 0), seg=24)           # center medallion
    return t

def m_twist_vase():
    t = []
    cup(t, 34, 30, 22, 140, 10, N=300, rows=70,
        lobe_amp=4, lobe_k=6, twist_deg=60, belly=14,
        lip_out=5, lip_h=5)
    return t

BUILDERS = {
    "01_phone_stand": m_phone_stand,
    "02_cable_holder": m_cable_holder,
    "03_hook_rack": m_hook_rack,
    "04_tube_squeezer": m_tube_squeezer,
    "05_bag_clip": m_bag_clip,
    "06_soap_dish": m_soap_dish,
    "07_planter_pot": m_planter,
    "08_pen_holder": m_pen_holder,
    "09_hex_coaster": m_hex_coaster,
    "10_twist_vase": m_twist_vase,
}

if __name__ == "__main__":
    for name, fn in BUILDERS.items():
        write_stl(os.path.join(OUT, name + ".stl"), fn())
