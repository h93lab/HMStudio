"""Synthesizes the royalty-free default audio kit (no dependencies): music bed + transition SFX.
Run: python3 scripts/make-audio.py   (writes public/music/ambient-pulse.wav, public/sfx/whoosh.wav, public/sfx/pop.wav)
"""
import math, random, struct, wave, os

SR = 44100
ROOT = os.path.join(os.path.dirname(__file__), '..', 'public')

def write(path, left, right=None):
    right = right or left
    peak = max(1e-9, max(max(abs(x) for x in left), max(abs(x) for x in right)))
    g = 0.89 / peak  # normalize to about -1 dBFS
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(b''.join(struct.pack('<hh', int(l * g * 32767), int(r * g * 32767)) for l, r in zip(left, right)))

def music(seconds=32):
    # Am - F - C - G, 4s each; a 16s cycle so the 32s file loops seamlessly.
    chords = [[110, 220, 261.63, 329.63], [87.31, 174.61, 220, 261.63], [130.81, 196, 261.63, 329.63], [98, 196, 246.94, 293.66]]
    n = SR * seconds
    left, right = [0.0] * n, [0.0] * n
    random.seed(7)
    for i in range(n):
        t = i / SR
        p = t % 16
        k = int(p // 4)
        local = p - 4 * k
        # equal-power crossfade into the next chord over the last 0.5s of each bar
        fade = min(1.0, max(0.0, (local - 3.5) / 0.5))
        a, b = math.cos(fade * math.pi / 2), math.sin(fade * math.pi / 2)
        swell = 0.75 + 0.25 * math.sin(2 * math.pi * t / 8)
        padl = padr = 0.0
        for amp_set, chord in ((a, chords[k]), (b, chords[(k + 1) % 4])):
            if amp_set < 1e-4: continue
            for j, f in enumerate(chord):
                amp = (0.10 if j == 0 else 0.065) * amp_set
                padl += amp * math.sin(2 * math.pi * f * t)
                padr += amp * math.sin(2 * math.pi * f * 1.004 * t)  # detune right channel for width
        beat = t % 0.5
        kick = 0.30 * math.sin(2 * math.pi * 52 * beat) * math.exp(-beat * 11)
        off = (t + 0.25) % 0.5
        shaker = 0.02 * (random.random() * 2 - 1) * math.exp(-off * 45)
        left[i] = padl * swell + kick + shaker
        right[i] = padr * swell + kick + shaker
    # one-pole lowpass to soften the pad
    for ch in (left, right):
        y = 0.0
        for i in range(n):
            y += 0.18 * (ch[i] - y)
            ch[i] = y
    return left, right

def whoosh(seconds=0.7):
    random.seed(3)
    n = int(SR * seconds)
    out, lp, hp_prev, hp = [], 0.0, 0.0, 0.0
    for i in range(n):
        t = i / SR
        env = t / 0.32 if t < 0.32 else max(0.0, (seconds - t) / (seconds - 0.32))
        cutoff = 0.05 + 0.35 * (t / seconds)  # brighten over time: the "swoosh"
        x = random.random() * 2 - 1
        lp += cutoff * (x - lp)
        hp = 0.95 * (hp + lp - hp_prev); hp_prev = lp
        out.append(hp * env ** 1.5)
    return out

def pop(seconds=0.25):
    n = int(SR * seconds)
    return [math.sin(2 * math.pi * (900 + 500 * math.exp(-i / SR * 30)) * i / SR) * math.exp(-i / SR * 25) for i in range(n)]

if __name__ == '__main__':
    write(os.path.join(ROOT, 'music', 'ambient-pulse.wav'), *music())
    write(os.path.join(ROOT, 'sfx', 'whoosh.wav'), whoosh())
    write(os.path.join(ROOT, 'sfx', 'pop.wav'), pop())
    print('audio kit written')
