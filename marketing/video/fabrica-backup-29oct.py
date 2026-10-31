# fabrica.py — fábrica de videos cortos (vertical 1080x1920) de Akira Cloud.
# Toma un guion (spec .json: frases + qué se ve en cada frase), genera la voz con Rime Coda (mejor de varias tomas), dibuja el video
# cuadro por cuadro con las pantallas reales del programa y lo deja listo para subir (menos de 10 MB).
#
#   python fabrica.py backlog:horas            → arma el video del tema "horas" del backlog.json
#   python fabrica.py ruta/al/spec.json        → arma un video desde un guion propio
#   python fabrica.py backlog:horas --vista    → solo imágenes fijas de prueba (sin voz ni video)
#
# La clave de Rime sale de la variable RIME_API_KEY o del archivo %USERPROFILE%\.akira-marketing\rime.key (fuera de cualquier repositorio).
import json, math, os, subprocess, sys, wave
from multiprocessing import Pool
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

AQUI = os.path.dirname(os.path.abspath(__file__)); MOTOR = os.path.join(AQUI, 'motor'); sys.path.insert(0, MOTOR)
import render as R          # fuentes, colores, fondo vertical, ventana, teléfono
import render3 as R3        # figuras: chat, comprobante, lista de chequeos, cuenta de tiempo, notificaciones
from render import (VERDE, VERDE_OSC, BLANCO, GRIS, GRIS2, F, NEGRITA, REG, SEMI, BLACK, ease_out, ease_io, ease_back, lerp, fade, redondeada, texto_en, envolver, LOGO)
from pausas import pausa_despues

W, H, FPS = 1080, 1920, 30
SOLO_VISTA = '--vista' in sys.argv
LEAD, PAD_FINAL = 0.08, 1.6

def cargar_spec(arg):
    if arg.startswith('backlog:'):
        bl = json.load(open(os.path.join(AQUI, 'backlog.json'), encoding='utf-8'))
        return next(t for t in bl['temas'] if t['id'] == arg.split(':', 1)[1])
    return json.load(open(arg, encoding='utf-8'))
SPEC = cargar_spec(next(a for a in sys.argv[1:] if not a.startswith('--')))
ID = SPEC['id']; FRASES = SPEC['frases']; VIS = SPEC['visuales']; assert len(FRASES) == len(VIS), 'frases y visuales deben tener la misma cantidad'
TMP = os.path.join(AQUI, 'tmp', ID); os.makedirs(TMP, exist_ok=True)

# ── voz ─────────────────────────────────────────────────────────────────────────
def leer16(wav):
    with wave.open(wav, 'rb') as w: return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
def puntaje(wav16):
    x = leer16(wav16); sr = 16000; fl, hop = int(0.04 * sr), int(0.01 * sr); hz = []; rms = []
    for i in range(0, len(x) - fl, hop):
        fr = x[i:i + fl]; e = float(np.sqrt(np.mean(fr ** 2)))
        if e < 0.02: continue
        rms.append(e); fr = fr - fr.mean(); ac = np.correlate(fr, fr, 'full')[fl - 1:]; ac = ac / (ac[0] + 1e-9); lo, hi = int(sr / 400), int(sr / 70); k = lo + int(np.argmax(ac[lo:hi]))
        if ac[k] > 0.45: hz.append(sr / k)
    if len(hz) < 25: return None
    st = 12 * np.log2(np.array(hz) / np.median(hz)); pad = np.pad(st, (2, 2), mode='edge'); st = np.array([np.median(pad[i:i + 5]) for i in range(len(st))])
    rango = np.percentile(st, 90) - np.percentile(st, 10)
    if rango > 22: return None
    return float(st.std() + 0.25 * rango + 2.0 * np.abs(np.diff(st)).mean() + 0.15 * (20 * np.log10(np.array(rms) + 1e-9)).std())
def generar_voz(voz='abril', tomas=3):
    clave = os.environ.get('RIME_API_KEY') or ''
    if not clave:
        ruta = os.path.join(os.path.expanduser('~'), '.akira-marketing', 'rime.key')
        if os.path.exists(ruta): clave = open(ruta, encoding='utf-8').read().strip()
    if not clave: raise SystemExit('Falta la clave de Rime: variable RIME_API_KEY o archivo ~/.akira-marketing/rime.key')
    env = dict(os.environ, RIME_API_KEY=clave, RIME_MODEL='coda', RIME_SR='44100', RIME_TSF='0.95'); out = []
    for n, frase in enumerate(FRASES):
        wav = os.path.join(TMP, f'f{n}.wav')
        if not os.path.exists(wav):
            mejores = []
            for k in range(tomas):
                mp3 = os.path.join(TMP, f'f{n}_t{k}.mp3'); w16 = os.path.join(TMP, f'f{n}_t{k}.16k.wav')
                r = subprocess.run(['node', os.path.join(MOTOR, 'tts.js'), voz, mp3, frase], env=env, capture_output=True, text=True)
                if r.returncode != 0: raise SystemExit('Falló la voz: ' + r.stderr.strip()[:300])
                subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', mp3, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', w16], check=True)
                mejores.append((puntaje(w16), mp3))
            validas = [m for m in mejores if m[0] is not None]; elegida = max(validas)[1] if validas else mejores[len(mejores) // 2][1]
            subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', elegida, '-af', 'silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.06,areverse',
                            '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', wav], check=True)
        d = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav], capture_output=True, text=True).stdout.strip())
        out.append((wav, d))
    return out

# ── línea de tiempo ─────────────────────────────────────────────────────────────
def armar_tiempos(duraciones):
    t = LEAD; filas = []
    for n, (wav, d) in enumerate(duraciones):
        filas.append({'t0': t, 'dur': d, 'texto': FRASES[n], 'wav': wav}); t += d + (0.7 * pausa_despues(FRASES[n], False) if n < len(FRASES) - 1 else 0)
    return filas, t + PAD_FINAL
if SOLO_VISTA:   # duraciones inventadas (≈ 0,36 s por palabra) para ver el diseño sin gastar voz
    TIEMPOS, TOTAL = armar_tiempos([('', max(1.5, 0.36 * len(f.split()))) for f in FRASES])
else:
    TIEMPOS, TOTAL = armar_tiempos(generar_voz(SPEC.get('voz', 'abril'), SPEC.get('tomas', 3)))

# ── piezas ──────────────────────────────────────────────────────────────────────
def idx(t):
    k = 0
    for n, f in enumerate(TIEMPOS):
        if t >= f['t0'] - 0.02: k = n
    return k
def pegar(im, sp, cx, cy, maxw=1000, maxh=1010, k=1.0, extra=1.0):
    e = min(maxw / sp.width, maxh / sp.height, 1.18) * extra
    sp = sp.resize((int(sp.width * e), int(sp.height * e)), Image.BILINEAR); im.alpha_composite(fade(sp, k), (int(cx - sp.width / 2), int(cy - sp.height / 2)))

def dibujar_karaoke(im, t):
    fr = next((f for f in TIEMPOS if f['t0'] - 0.05 <= t <= f['t0'] + f['dur'] + 0.15), None)
    if not fr: return
    toks = fr['texto'].split(); pesos = [len(w.strip('.,¡!¿?…:;')) + 2 + (7 if w[-1] in '.?!…' else 3 if w[-1] == ',' else 0) for w in toks]; tot = sum(pesos); a = fr['t0']; tiem = []
    for w, p in zip(toks, pesos): b = a + fr['dur'] * p / tot; tiem.append((a, b, w)); a = b
    k = next((i for i, (a, b, w) in enumerate(tiem) if a <= t < b), len(tiem) - 1 if t >= tiem[-1][1] else 0)
    trozos = []; act = []
    for i, (a, b, w) in enumerate(tiem):
        act.append(i)
        if len(act) >= 3 or w[-1] in '.?!…,': trozos.append(act); act = []
    if act: trozos.append(act)
    tz = next(z for z in trozos if k in z); fu = F(BLACK, 84); esp = fu.getlength(' '); lineas = [[]]; ancho = 0
    for i in tz:
        lw = fu.getlength(tiem[i][2])
        if lineas[-1] and ancho + esp + lw > 980: lineas.append([]); ancho = 0
        lineas[-1].append((i, lw)); ancho += (esp if len(lineas[-1]) > 1 else 0) + lw
    lh = 108; capa = Image.new('RGBA', (W, len(lineas) * lh + 30), (0, 0, 0, 0)); d = ImageDraw.Draw(capa)
    for n, ln in enumerate(lineas):
        x = (W - (sum(w for _, w in ln) + esp * (len(ln) - 1))) / 2
        for i, lw in ln: d.text((x, 15 + n * lh + lh / 2), tiem[i][2], font=fu, fill=VERDE if i == k else BLANCO, anchor='lm', stroke_width=9, stroke_fill=(0, 0, 0, 255)); x += lw + esp
    im.alpha_composite(capa, (0, 1640 - (len(lineas) * lh) // 2))

def titular(im, t):
    lin = SPEC.get('titular') or []
    if not lin: return
    a = 1.0; capa = Image.new('RGBA', (W, 330), (0, 0, 0, 0)); d = ImageDraw.Draw(capa)   # completo desde el cuadro 0: el primer segundo es lo que decide si se queda
    for j, l in enumerate(lin[:3]):
        tam = 86
        while tam > 44 and F(BLACK, tam).getlength(l) > 980: tam -= 2
        texto_en(d, (540, 70 + j * 100), l, F(BLACK, tam), BLANCO if j == 0 else VERDE, 'mm', True)
    im.alpha_composite(fade(capa, a), (0, int(150 + (1 - a) * 30)))

def visual(im, v, tl, f, t):
    """v: dict del guion. tl: segundos desde que empezó la frase. f: avance dentro de la frase (0 a 1)."""
    tipo = v['tipo']; cy = v.get('cy', 950); pop = 1.0 + 0.06 * max(0.0, 1 - tl / 0.2); ent = 1.0 if v.get('desde_el_inicio') else (ease_out(tl / 0.3) if not v.get('offset') else 1.0); tl = tl + v.get('offset', 0.0)
    if tipo == 'calculo': pegar(im, R3.cuenta_tiempo(0.1, tl), 540, cy, 1000, 1000, ent, pop)
    elif tipo == 'chat':
        items = [(it[0], it[1], it[2], it[3] if len(it) > 3 else '') for it in v['items']]
        pegar(im, R3.chat(items, tl, alto=v.get('alto', 820), titulo=v.get('titulo', 'Aurora Estudio')), 540, cy, 1000, 1010, ent, pop)
    elif tipo == 'ventana':
        ruta = os.path.join(R3.CAP if not v['archivo'].endswith('.png') else R3.MKT, v['archivo'])
        pegar(im, R3.ventana(ruta, 940, v.get('alto', 780), avance=ease_io(f), titulo=v.get('titulo', ''), escala=v.get('escala', 1.25), recorta_menu=v.get('recorta_menu', True)), 540, cy, 1010, v.get('maxh', 1010), ent, pop)
        if 'sello' in v:
            ss = R3.sello(v['sello'], tl)
            if ss: im.alpha_composite(ss, (int(540 - ss.width / 2) + 180, int(cy + 330)))
    elif tipo == 'notifs':
        n = min(5, 1 + int(tl / 0.55)); capa = Image.new('RGBA', (980, 900), (0, 0, 0, 0))
        for k in range(n):
            pos = n - 1 - k; a = ease_out((tl - k * 0.55) / 0.22); tj = fade(R3.tarjeta_notif(*R3.NOTIFS[k], f'03:{12 + k:02d}', ancho=960), a)
            capa.alpha_composite(tj, (int((1 - a) * 80), pos * 150 + int((1 - a) * 14)))
        pegar(im, capa, 540, cy - 80, 980, 900, 1.0, pop)
        d = ImageDraw.Draw(im); sh = int(5 * math.sin(tl * 40)) if n >= 4 else 0
        d.rounded_rectangle((200 + sh, cy + 330, 880 + sh, cy + 440), 55, fill=(244, 63, 94)); texto_en(d, (540 + sh, cy + 385), f'{min(12, n * 3)} sin responder', F(BLACK, 54), BLANCO, 'mm')
    elif tipo == 'comprobante':
        malo = v.get('malo', False); rec = R3.comprobante('$ 10.000' if malo else '$ 12.500'); e0 = v.get('espera', 0.6); T = [e0, e0 + 0.8, e0 + 1.6, e0 + 2.4]
        pegar(im, rec, 290, cy - 20, 520, 760, ent, pop)
        its = ([(1.2, 'El monto NO alcanza', 'Faltan $ 2.500', False), (2.2, 'Te avisa antes de confirmar', 'Revisalo antes de dar el pago', False)] if malo else
               [(T[0], 'Destino: tu cuenta', 'Coincide el CVU', True), (T[1], 'El monto alcanza', '$ 12.500 de $ 12.500', True), (T[2], 'Operación nueva', 'No se usó antes', True), (T[3], 'Fecha reciente', 'Hecha hoy', True)])
        pegar(im, R3.checklist(its, tl, ancho=640), 800, cy - 40, 480, 720, 1.0, 1.0)
    elif tipo == 'telefono':
        pegar(im, R.telefono(min(1.0, tl / max(0.5, v.get('dur', 6.0))), falla_en=v.get('falla', 0.55), alto=880), 540, cy - 10, 800, 1000, ent, pop)
    elif tipo == 'recordatorios':
        rec = [('24 horas antes', 'Mañana a las 17:30 tenés turno. ¿Confirmás?'), ('4 horas antes', 'Hoy a las 17:30 te esperamos.'), ('30 minutos antes', 'En media hora es tu turno. ¡Te esperamos!')]
        for n_, (hora, texto) in enumerate(rec):
            ap = ease_back((tl - 0.3 - n_ * 1.3) / 0.35)
            if ap <= 0: continue
            c = Image.new('RGBA', (960, 190), (0, 0, 0, 0)); d = ImageDraw.Draw(c); d.rounded_rectangle((0, 0, 959, 189), 36, fill=(30, 40, 46, 240), outline=(0, 232, 123, 140), width=3)
            d.ellipse((30, 40, 130, 140), fill=VERDE_OSC); texto_en(d, (80, 90), 'A', F(BLACK, 54), BLANCO, 'mm'); texto_en(d, (160, 40), f'Recordatorio · {hora}', F(NEGRITA, 38), VERDE)
            for j, l in enumerate(envolver(texto, F(REG, 34), 770)[:2]): texto_en(d, (160, 100 + j * 42), l, F(REG, 34), (214, 222, 220))
            e = max(0.01, ap); c = c.resize((int(960 * e), int(190 * e)), Image.LANCZOS); im.alpha_composite(c, (540 - c.width // 2, 560 + n_ * 230 + int((190 - c.height) / 2)))
    elif tipo == 'escudo':
        s_ = Image.new('RGBA', (900, 640), (0, 0, 0, 0)); d = ImageDraw.Draw(s_); d.rounded_rectangle((0, 0, 899, 639), 36, fill=(14, 26, 24, 245), outline=(0, 232, 123, 140), width=3)
        d.rounded_rectangle((340, 60, 560, 280), 36, fill=VERDE_OSC); d.rounded_rectangle((385, 150, 515, 240), 14, fill=VERDE); d.arc((400, 100, 500, 190), 180, 360, fill=VERDE, width=14)
        texto_en(d, (450, 350), 'Tus datos viven en tu PC', F(BLACK, 54), BLANCO, 'mm'); texto_en(d, (450, 425), 'Copias de seguridad cifradas', F(SEMI, 40), VERDE, 'mm'); texto_en(d, (450, 500), 'Nada de esto sale de tu computadora', F(REG, 32), GRIS, 'mm')
        pegar(im, s_, 540, cy, 1000, 900, ent, pop)
    elif tipo == 'texto':
        capa = Image.new('RGBA', (W, 700), (0, 0, 0, 0)); d = ImageDraw.Draw(capa); lin = v['lineas']
        for j, l in enumerate(lin):
            tam = v.get('tam', 120)
            while tam > 50 and F(BLACK, tam).getlength(l) > 980: tam -= 4
            texto_en(d, (540, 120 + j * (tam + 24)), l, F(BLACK, tam), BLANCO if j % 2 == 0 else VERDE, 'mm', True)
        im.alpha_composite(fade(capa, ent), (0, int(cy - 330 + (1 - ent) * 40)))
    elif tipo == 'cta':
        k = ease_back(tl / 0.5); s = max(0.01, k); lg = LOGO.resize((int(280 * s), int(280 * s)), Image.LANCZOS)
        halo = Image.new('RGBA', (620, 620), (0, 0, 0, 0)); ImageDraw.Draw(halo).ellipse((80, 80, 540, 540), fill=(0, 232, 123, 100)); halo = halo.filter(ImageFilter.GaussianBlur(60)); im.alpha_composite(halo, (230, 340))
        im.paste(lg, (540 - lg.width // 2, 600 - lg.height // 2), redondeada(lg.size, int(66 * s))); d = ImageDraw.Draw(im); a = ease_out((tl - 0.3) / 0.4)
        capa = Image.new('RGBA', (W, 900), (0, 0, 0, 0)); dc = ImageDraw.Draw(capa)
        texto_en(dc, (540, 40), 'Probalo gratis', F(BLACK, 110), BLANCO, 'mm', True); texto_en(dc, (540, 150), '7 días de uso · sin tarjeta', F(SEMI, 50), VERDE, 'mm')
        p = 0.5 + 0.5 * math.sin(t * 5); dc.rounded_rectangle((100, 260, 980, 400), 70, fill=(0, int(lerp(200, 232, p)), int(lerp(100, 123, p))))
        texto_en(dc, (540, 330), 'akiracloud.lat', F(BLACK, 88), (3, 30, 18), 'mm')
        for n_, c in enumerate(['Hecho en Argentina', 'En pesos', 'Con Mercado Pago']):
            fu = F(SEMI, 38); w = int(fu.getlength(c)) + 70; x = 540 - w // 2; y = 470 + n_ * 90
            dc.rounded_rectangle((x, y, x + w, y + 74), 37, fill=(18, 30, 36), outline=(0, 232, 123, 160), width=2); texto_en(dc, (540, y + 37), c, fu, BLANCO, 'mm')
        im.alpha_composite(fade(capa, a), (0, int(780 + (1 - a) * 40)))

def cuadro(tg):
    k = idx(tg); fr = TIEMPOS[k]; tl = tg - fr['t0']; v = VIS[k]; ult = (k == len(FRASES) - 1 and v['tipo'] == 'cta')
    im = R.fondo(tg); cont = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    if not ult: titular(cont, tg)
    visual(cont, v, max(0.0, tl), min(1.0, max(0.0, tl / max(0.5, fr['dur'] + 0.5))), tg)
    z = 1.0 + 0.07 * (1 - ease_out(tl / 0.2)) if tl >= 0 else 1.0
    if z > 1.002: cont = cont.resize((int(W * z), int(H * z)), Image.BILINEAR).crop((int((W * z - W) / 2), int((H * z - H) / 2), int((W * z - W) / 2) + W, int((H * z - H) / 2) + H))
    im.alpha_composite(cont)
    if 0 <= tl < 0.12 and k > 0: im.alpha_composite(Image.new('RGBA', (W, H), (220, 255, 235, int(70 * (1 - tl / 0.12)))))
    if not ult: dibujar_karaoke(im, tg)
    d = ImageDraw.Draw(im); d.rectangle((0, 0, W, 10), fill=(20, 40, 32)); d.rectangle((0, 0, int(W * tg / TOTAL), 10), fill=VERDE)
    ic = LOGO.resize((70, 70), Image.LANCZOS); im.paste(ic, (46, 52), redondeada((70, 70), 18)); fa = F(BLACK, 40)
    texto_en(d, (132, 86), 'Akira ', fa, BLANCO, 'lm'); texto_en(d, (132 + fa.getlength('Akira '), 86), 'Cloud', fa, VERDE, 'lm'); texto_en(d, (W - 46, 86), 'por TinchoDev', F(SEMI, 28), GRIS, 'rm')
    texto_en(d, (W // 2, 1868), 'akiracloud.lat   ·   Hecho en Argentina', F(SEMI, 30), GRIS2, 'mm')
    return im.convert('RGB')

# ── audio ───────────────────────────────────────────────────────────────────────
SR = 44100
def armar_audio(ruta):
    def leer(r):
        with wave.open(r, 'rb') as w: return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    def poner(buf, x, t0):
        o = int(t0 * SR)
        if o >= len(buf): return
        n = min(len(x), len(buf) - o); buf[o:o + n] += x[:n]
    def tono(f, dur, decay=7, arm=0.5): t = np.arange(int(dur * SR)) / SR; return (np.sin(2 * np.pi * f * t) + arm * np.sin(2 * np.pi * f * 2.01 * t)) * np.exp(-t * decay)
    n = int((TOTAL + 0.5) * SR); voz = np.zeros(n, dtype=np.float32)
    for f in TIEMPOS: poner(voz, leer(f['wav']), f['t0'])
    voz = voz / (np.abs(voz).max() or 1) * 0.92; musica = np.zeros(n, dtype=np.float32); beat = 60.0 / 108; rng = np.random.default_rng(11)
    for k in range(int(TOTAL / beat) + 2):
        tk = k * beat; kt = np.arange(int(0.22 * SR)) / SR; poner(musica, np.sin(2 * np.pi * (48 + 90 * np.exp(-kt * 28)) * kt) * np.exp(-kt * 11) * 0.8, tk)
        hat = rng.standard_normal(int(0.05 * SR)).astype(np.float32); poner(musica, np.diff(hat, prepend=0) * np.exp(-np.arange(len(hat)) / SR * 70) * 0.22, tk + beat / 2)
    for k, fq in enumerate([110.0, 164.81, 220.0, 261.63]):
        tt = np.arange(n) / SR; musica += np.sin(2 * np.pi * fq * tt) * 0.02 * (0.6 + 0.4 * np.sin(2 * np.pi * tt / 4 + k))
    musica = musica / (np.abs(musica).max() or 1); env = np.convolve(np.abs(voz), np.ones(int(0.12 * SR)) / (0.12 * SR), mode='same'); musica *= 1 - 0.7 * np.clip(env * 7, 0, 1)
    fx = np.zeros(n, dtype=np.float32); poner(fx, tono(880, 0.5, 8) * 0.2, 0.05)
    for k, f in enumerate(TIEMPOS):
        if k and VIS[k]['tipo'] != VIS[k - 1]['tipo']:
            L = int(0.35 * SR); r = rng.standard_normal(L).astype(np.float32); poner(fx, np.convolve(r, np.ones(30) / 30, mode='same') * np.sin(np.pi * np.linspace(0, 1, L)) ** 2 * 0.1, f['t0'] - 0.08)
        if VIS[k]['tipo'] == 'cta': poner(fx, (tono(784, 0.8, 4) + tono(988, 0.8, 4) + tono(1175, 0.8, 4)) * 0.13, f['t0'])
        if VIS[k]['tipo'] == 'notifs':
            for j in range(4): poner(fx, tono(1318.5, 0.3, 9) * 0.18, f['t0'] + j * 0.55)
    m = (voz * 0.95 + musica * 0.17 + fx)[:int(TOTAL * SR)]; fn = int(1.0 * SR); m[-fn:] *= np.linspace(1, 0, fn); m = np.clip(m, -0.98, 0.98)
    with wave.open(ruta, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((m * 32767).astype(np.int16).tobytes())

def _cuadro_bytes(k): return cuadro(k / FPS).tobytes()
if __name__ == '__main__':
    print(f'{ID}: {TOTAL:.1f} s, {len(FRASES)} frases', flush=True)
    if SOLO_VISTA:
        for k in range(len(FRASES)): cuadro(TIEMPOS[k]['t0'] + min(TIEMPOS[k]['dur'] * 0.7, 3.0)).save(os.path.join(TMP, f'vista-{k}.png'))
        print('vistas en', TMP); sys.exit(0)
    audio = os.path.join(TMP, 'mezcla.wav'); armar_audio(audio); crudo = os.path.join(TMP, 'crudo.mp4'); n_cuadros = int(TOTAL * FPS)
    cmd = ['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-i', audio, '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', crudo]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    with Pool(5) as pool:
        for n, b in enumerate(pool.imap(_cuadro_bytes, range(n_cuadros), chunksize=6)):
            p.stdin.write(b)
            if n % 150 == 0: print(f'  cuadro {n}/{n_cuadros}', flush=True)
    p.stdin.close(); p.wait()
    final = os.path.join(AQUI, 'salidas', f'{ID}.mp4')   # versión para subir: menos de 10 MB (límite del tool de Chrome)
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', crudo, '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-maxrate', '1600k', '-bufsize', '3200k', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', final], check=True)
    print(f'listo: {final} ({os.path.getsize(final) / 1048576:.1f} MB)')
