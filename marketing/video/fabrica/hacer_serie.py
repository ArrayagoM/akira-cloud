# hacer_serie.py — arma uno por uno los videos de la serie (specs/f-*.json). Si un video ya existe en salidas/, lo saltea.
#   python hacer_serie.py            → todos los que falten
#   python hacer_serie.py f-caja     → solo ese
import os, subprocess, sys, time, glob
AQUI = os.path.dirname(os.path.abspath(__file__))
pedidos = [a for a in sys.argv[1:] if not a.startswith('--')]
specs = sorted(glob.glob(os.path.join(AQUI, 'specs', 'f-*.json')))
if pedidos: specs = [s for s in specs if os.path.splitext(os.path.basename(s))[0] in pedidos]
ok, mal = [], []
for s in specs:
    id_ = os.path.splitext(os.path.basename(s))[0]; salida = os.path.join(AQUI, 'salidas', f'{id_}.mp4')
    if os.path.exists(salida) and os.path.getsize(salida) > 100000: print('ya está', id_, flush=True); ok.append(id_); continue
    t0 = time.time(); print('==> armando', id_, flush=True)
    r = subprocess.run([sys.executable, os.path.join(AQUI, 'fabrica.py'), s], cwd=AQUI, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode == 0 and os.path.exists(salida): print(f'    listo {id_} en {time.time() - t0:.0f} s', flush=True); ok.append(id_)
    else: print(f'    FALLO {id_}: ' + (r.stderr or r.stdout)[-600:].replace('\n', ' | '), flush=True); mal.append(id_)
print(f'\nTERMINADO: {len(ok)} listos, {len(mal)} con error {mal}', flush=True)
