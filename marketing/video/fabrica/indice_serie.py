# indice_serie.py — arma SERIE-FUNCIONES.md (lista de los videos listos con su duración, texto para publicar y hashtags)
# y una hoja con el primer cuadro de cada video (salidas/_hoja-serie.png) para revisarlos de un vistazo.
import glob, json, os, subprocess
from PIL import Image, ImageDraw
AQUI = os.path.dirname(os.path.abspath(__file__))
specs = sorted(glob.glob(os.path.join(AQUI, 'specs', 'f-*.json')))
filas, hechos, miniaturas = [], 0, []
for s in specs:
    sp = json.load(open(s, encoding='utf-8')); mp4 = os.path.join(AQUI, 'salidas', f"{sp['id']}.mp4")
    if not os.path.exists(mp4): filas.append((sp, None, None)); continue
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4], capture_output=True, text=True).stdout.strip() or 0)
    filas.append((sp, dur, os.path.getsize(mp4) / 1048576)); hechos += 1
    png = os.path.join(AQUI, 'tmp', f"{sp['id']}-portada.png")
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', mp4, '-vf', 'select=eq(n\\,0),scale=270:-1', '-frames:v', '1', png]); miniaturas.append((sp['id'], png))
L = ['# Serie "una pantalla, un video"', '',
     f'{hechos} de {len(specs)} videos listos en `marketing/video/fabrica/salidas/` (vertical 1080x1920, voz de Rime Coda "abril", capturas reales de un negocio de ejemplo).',
     '', 'Cada video abre con el titular en el primer cuadro, explica lo que la pantalla hace hoy (fuente: `frontend/src/data/funciones.js`) y cierra con "Probalo gratis en akiracloud punto lat".',
     '', 'Para volver a armar uno: `python hacer_serie.py f-caja` (los que ya existen se saltean). Para cambiar un guion: editar `serie_funciones.py`, correr `python serie_funciones.py`, borrar el mp4 y volver a armarlo.', '',
     '| Video | Duración | Titular | Estado |', '|---|---|---|---|']
for sp, dur, mb in filas:
    L.append(f"| `{sp['id']}.mp4` | {f'{dur:.0f} s' if dur else '-'} | {' '.join(sp['titular'])} | {'listo' if dur else 'falta'} |")
L += ['', '## Texto para publicar', '']
for sp, dur, mb in filas:
    L += [f"### {sp['titulo']} (`{sp['id']}.mp4`)", '', sp['caption'], '', ' '.join(sp['hashtags']), '']
open(os.path.join(AQUI, 'SERIE-FUNCIONES.md'), 'w', encoding='utf-8').write('\n'.join(L))
if miniaturas:
    cols = 7; w, h = 270, 480; filas_n = (len(miniaturas) + cols - 1) // cols; hoja = Image.new('RGB', (cols * w, filas_n * (h + 22)), (12, 12, 12)); d = ImageDraw.Draw(hoja)
    for i, (id_, png) in enumerate(miniaturas):
        x, y = (i % cols) * w, (i // cols) * (h + 22); d.text((x + 6, y + 4), id_, fill=(0, 232, 123)); hoja.paste(Image.open(png).convert('RGB').resize((w, h)), (x, y + 22))
    hoja.save(os.path.join(AQUI, 'salidas', '_hoja-serie.png'))
print(hechos, 'videos en el índice')
