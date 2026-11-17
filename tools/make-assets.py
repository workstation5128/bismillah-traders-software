"""
Regenerates every logo asset from the two source files in assets-src/.
Needs: Python 3, Pillow, numpy, scipy.   Run:  python tools/make-assets.py
 - assets-src/emblem-original.png   (the owner's supplied logo, untouched)
 - assets-src/ico/monogram-*.png    (BT monogram rendered from src/renderer/assets/bt-monogram.svg)
"""
import struct, io, os
import numpy as np
from PIL import Image, ImageFilter, ImageOps
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets-src'); OUT = os.path.join(ROOT, 'src', 'renderer', 'assets'); BUILD = os.path.join(ROOT, 'build')
os.makedirs(OUT, exist_ok=True); os.makedirs(BUILD, exist_ok=True)

# 1) Cut the emblem out of its off-white background (only background connected to the image border is removed,
#    so white lettering and highlights inside the artwork are preserved).
im = Image.open(os.path.join(SRC, 'emblem-original.png')).convert('RGB')
a = np.asarray(im).astype(int)
mn, mx = a.min(axis=2), a.max(axis=2)
lab, _ = ndi.label((mn >= 232) & ((mx - mn) <= 22))
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
bg = np.isin(lab, list(border))
mask = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.0))
emblem = im.convert('RGBA'); emblem.putalpha(mask)
bbox = emblem.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
emblem = emblem.crop(bbox)

def save_w(img, w, name):
    h = round(img.height * w / img.width)
    img.resize((w, h), Image.LANCZOS).save(os.path.join(OUT, name), optimize=True)
save_w(emblem, 1000, 'logo-emblem.png')      # login screen, reports, A4 invoice
save_w(emblem, 480,  'logo-emblem-md.png')   # dashboard banner
save_w(emblem, 240,  'logo-emblem-sm.png')   # small placements

# 2) Black-and-white receipt logos for thermal printers (1-bit, error-diffusion dithered).
def receipt(width, name):
    flat = Image.new('RGB', emblem.size, (255, 255, 255)); flat.paste(emblem, mask=emblem.getchannel('A'))
    g = ImageOps.autocontrast(flat.convert('L'), cutoff=2)
    h = round(g.height * width / g.width)
    g = g.resize((width, h), Image.LANCZOS).filter(ImageFilter.UnsharpMask(1.2, 120, 2))
    g.convert('1', dither=Image.FLOYDSTEINBERG).save(os.path.join(OUT, name), optimize=True)
receipt(300, 'logo-receipt-58.png')   # 58 mm paper (about 384 printable dots)
receipt(420, 'logo-receipt-80.png')   # 80 mm paper (about 576 printable dots)

# 3) Monogram PNGs
for s in (128, 512):
    Image.open(os.path.join(SRC, 'ico', f'monogram-{s}.png')).save(os.path.join(OUT, f'bt-monogram-{s}.png'), optimize=True)
Image.open(os.path.join(SRC, 'ico', 'monogram-512.png')).save(os.path.join(BUILD, 'icon.png'))

# 4) Windows .ico with hand-picked sizes (PNG-compressed entries, supported by Windows 10)
sizes = [16, 24, 32, 48, 64, 128, 256]
blobs = []
for s in sizes:
    b = io.BytesIO(); Image.open(os.path.join(SRC, 'ico', f'monogram-{s}.png')).convert('RGBA').save(b, 'PNG'); blobs.append(b.getvalue())
hdr = struct.pack('<HHH', 0, 1, len(sizes)); off = 6 + 16 * len(sizes); ent = b''
for s, blob in zip(sizes, blobs):
    ent += struct.pack('<BBBBHHII', 0 if s == 256 else s, 0 if s == 256 else s, 0, 0, 1, 32, len(blob), off); off += len(blob)
with open(os.path.join(BUILD, 'icon.ico'), 'wb') as f:
    f.write(hdr + ent + b''.join(blobs))
print('assets written to', OUT, 'and', BUILD)
