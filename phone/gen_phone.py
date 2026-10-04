#!/usr/bin/env python3
"""10 sellable phone accessories -> STL. Reuses the toolkit in shop/gen_all.py."""
import os, sys
import numpy as np
sys.path.insert(0, "/home/runner/work/PlayGround/PlayGround/shop")
import gen_all as G

OUT = "/home/runner/work/PlayGround/PlayGround/phone/stl"
os.makedirs(OUT, exist_ok=True)

def m_phone_stand():
    t = []
    G.box(t, 90, 8, 70, (0, 4, 0))
    G.box(t, 90, 115, 8, (0, 58, -24), rot=(-20, 0, 0))
    G.box(t, 37, 14, 10, (-20.5, 15, 26))
    G.box(t, 37, 14, 10, (20.5, 15, 26))
    G.box(t, 90, 6, 12, (0, 11, -30))
    return t

def m_ring_grip():
    t = []
    G.cyl(t, 24, 26, 5, (0, 2.5, 0), seg=48)          # base plate
    G.ring(t, 15, 9, 5, 13, seg=48)                   # finger ring wall
    return t

def m_car_vent_mount():
    t = []
    G.box(t, 70, 50, 8, (0, 60, 0))                   # phone back plate
    G.box(t, 70, 12, 20, (0, 42, -13), rot=(30, 0, 0))  # arm to vent
    for x in (-18, 18):                               # vent clip prongs
        G.box(t, 6, 26, 8, (x, 28, -16), rot=(30, 0, 0))
        G.box(t, 6, 10, 16, (x, 14, -10))             # prong foot
    G.box(t, 70, 10, 14, (0, 88, 6))                  # top jaw
    G.box(t, 12, 10, 14, (-29, 40, 6))                # bottom jaw L
    G.box(t, 12, 10, 14, (29, 40, 6))                 # bottom jaw R
    return t

def m_charging_dock():
    t = []
    G.box(t, 90, 10, 70, (0, 5, 0))                   # base
    G.box(t, 90, 95, 8, (0, 52, -26), rot=(-15, 0, 0))  # back support
    G.box(t, 90, 12, 26, (0, 14, 24))                 # front lip
    G.box(t, 16, 8, 28, (0, 14, 24))                  # cable notch (visual gap)
    return t

def m_headboard_shelf():
    t = []
    G.box(t, 130, 6, 55, (0, 3, 0))                   # shelf
    G.box(t, 130, 12, 6, (0, 10, 26))                 # back stop
    G.box(t, 130, 10, 6, (0, 8, -26))                 # phone slot front lip
    for x in (-50, 50):                               # C-hooks
        G.box(t, 8, 40, 8, (x, -17, 31))
        G.box(t, 8, 8, 16, (x, -34, 25))
        G.box(t, 8, 8, 8, (x, 6, 31))
    return t

def m_cable_clip():
    t = []
    G.box(t, 70, 8, 22, (0, 4, 0))
    for x in (-28, -9.3, 9.3, 28):
        G.box(t, 7, 18, 18, (x, 14, 0))               # 3 slots
    G.box(t, 70, 4, 26, (0, 2, 0))
    return t

def m_tripod_plate():
    t = []
    G.box(t, 90, 8, 50, (0, 40, 0))                   # phone plate
    G.box(t, 34, 12, 50, (0, 48, 0))                  # raised clamp
    G.box(t, 6, 20, 40, (-17, 44, 0))                 # clamp jaw L
    G.box(t, 6, 20, 40, (17, 44, 0))                  # clamp jaw R
    G.cyl(t, 11, 11, 22, (0, 22, 0), seg=24)          # 3/8" stub
    G.cyl(t, 16, 16, 6, (0, 9, 0), seg=24)            # boss
    return t

def m_wall_dock():
    t = []
    G.box(t, 90, 100, 8, (0, 50, 0))                  # back plate
    G.box(t, 90, 12, 40, (0, 8, 22))                  # pocket bottom
    G.box(t, 90, 26, 8, (0, 18, 40), rot=(25, 0, 0))  # pocket lean
    G.box(t, 90, 14, 10, (0, 102, 4))                 # top cap
    return t

def m_gamepad_clip():
    t = []
    G.box(t, 60, 60, 8, (0, 30, 0))                   # back plate
    G.box(t, 60, 16, 30, (0, 56, 15), rot=(-25, 0, 0))  # phone rest
    G.box(t, 76, 14, 8, (0, 4, 4), rot=(35, 0, 0))    # clip jaw
    G.box(t, 76, 10, 10, (0, -4, 12), rot=(35, 0, 0)) # jaw wedge
    return t

def m_mini_tripod():
    t = []
    G.cyl(t, 13, 13, 10, (0, 62, 0), seg=24)          # head
    G.cyl(t, 8, 8, 14, (0, 55, 0), seg=16)            # neck
    for k in range(3):                                # 3 splayed legs
        tr = []
        G.box(tr, 7, 52, 7, (0, 0, 0))
        a = np.radians(k * 120)
        Rx = np.array([[1, 0, 0], [0, np.cos(np.radians(28)), -np.sin(np.radians(28))], [0, np.sin(np.radians(28)), np.cos(np.radians(28))]])
        Ry = np.array([[np.cos(a), 0, np.sin(a)], [0, 1, 0], [-np.sin(a), 0, np.cos(a)]])
        R = Ry @ Rx
        for tri in tr:
            t.append(tuple(tuple(R @ np.array(p) + np.array([0, 30, 0])) for p in tri))
    return t

BUILDERS = {
    "01_phone_stand": m_phone_stand,
    "02_ring_grip": m_ring_grip,
    "03_car_vent_mount": m_car_vent_mount,
    "04_charging_dock": m_charging_dock,
    "05_headboard_shelf": m_headboard_shelf,
    "06_cable_clip": m_cable_clip,
    "07_tripod_plate": m_tripod_plate,
    "08_wall_dock": m_wall_dock,
    "09_gamepad_clip": m_gamepad_clip,
    "10_mini_tripod": m_mini_tripod,
}

if __name__ == "__main__":
    for name, fn in BUILDERS.items():
        G.write_stl(os.path.join(OUT, name + ".stl"), fn())
