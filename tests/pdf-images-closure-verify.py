#!/usr/bin/env python3
"""Independent ZIP directory/CRC verifier and Pillow pixel decoder."""
import sys, zipfile, io
from pathlib import Path
from PIL import Image
out=Path(sys.argv[1])
def image(b):
    im=Image.open(io.BytesIO(b)).convert('RGB')
    w,h=im.size
    return w,h,lambda x,y: im.getpixel((x,y))
for fmt,ext in [('png','png'),('jpeg','jpg')]:
    with zipfile.ZipFile(out/f'crop-{fmt}.zip') as z:
        assert z.testzip() is None
        assert z.namelist()==[f'halaman-{i:03}.{ext}' for i in range(1,5)]
        expected=[[(0,0,255),(255,255,0),(255,0,0),(0,255,0)],[(255,0,0),(0,0,255),(0,255,0),(255,255,0)],[(0,255,0),(255,0,0),(255,255,0),(0,0,255)],[(255,255,0),(0,255,0),(0,0,255),(255,0,0)]]
        for i,n in enumerate(z.namelist()):
            w,h,at=image(z.read(n));assert (w,h)==([(120,80),(80,120)]*2)[i]
            got=[at(w//4,h//4),at(3*w//4,h//4),at(w//4,3*h//4),at(3*w//4,3*h//4)]
            assert all(abs(a-b)<=10 for pix,exp in zip(got,expected[i]) for a,b in zip(pix,exp)),(n,got,expected[i])
    print('PASS independent ZIP CRC/dimensions/crop quadrant pixels',fmt)
with zipfile.ZipFile(out/'30.zip') as z:
    assert z.testzip() is None and z.namelist()==[f'halaman-{i:03}.png' for i in range(1,31)]
    for i,n in enumerate(z.namelist()):
        w,h,at=image(z.read(n));assert (w,h)==(20,12)
        expected=(round(i*255/29),round((29-i)*255/29),round((i%3)*255/2))
        assert all(abs(a-b)<=2 for a,b in zip(at(10,6),expected)),(n,at(10,6),expected)
print('PASS 30 entries CRC/order/all decoded center colors')
