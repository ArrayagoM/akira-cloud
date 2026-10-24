# preparar_capturas.py — recorta cada captura al contenido de la pantalla (sin menú lateral ni márgenes vacíos), para que en el video
# ocupe todo el ancho del marco y el texto se lea en el celular.   Entrada: ../../capturas-nuevas/*.png   Salida: ../../capturas-video/*.png
import os
from PIL import Image, ImageChops

AQUI = os.path.dirname(os.path.abspath(__file__))
ENTRADA = os.path.normpath(os.path.join(AQUI, '..', '..', 'capturas-nuevas')); SALIDA = os.path.normpath(os.path.join(AQUI, '..', '..', 'capturas-video'))
os.makedirs(SALIDA, exist_ok=True)
MENU, ENCABEZADO, BORDE_DER = 224, 58, 18     # ancho del menú lateral, alto de la barra superior y barra de desplazamiento
ANCHO_MIN, RELLENO = 760, 28
for n in sorted(f for f in os.listdir(ENTRADA) if f.endswith('.png')):
    im = Image.open(os.path.join(ENTRADA, n)).convert('RGB'); W, H = im.size
    zona = im.crop((MENU, ENCABEZADO, W - BORDE_DER, H))
    fondo = Image.new('RGB', zona.size, zona.getpixel((zona.width - 6, zona.height - 6)))
    dif = ImageChops.difference(zona, fondo).convert('L').point(lambda p: 255 if p > 14 else 0); bb = dif.getbbox() or (0, 0, zona.width, zona.height)
    x0, y0, x1, y1 = max(0, bb[0] - RELLENO), max(0, bb[1] - RELLENO), min(zona.width, bb[2] + RELLENO), min(zona.height, bb[3] + RELLENO)
    if x1 - x0 < ANCHO_MIN:   # contenido angosto: se ensancha alrededor del centro para no ampliar de más
        c = (x0 + x1) // 2; x0, x1 = max(0, c - ANCHO_MIN // 2), min(zona.width, c + ANCHO_MIN // 2)
    out = zona.crop((x0, y0, x1, y1)); out.save(os.path.join(SALIDA, n)); print(f'{n:26s} {W}x{H} -> {out.width}x{out.height}')
