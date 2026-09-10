"""GeoTIFF -> ortho-4k.webp, ortho-1k.webp, georef.json (TFW + CRS)"""
import zipfile, json, os, sys, io
from PIL import Image
Image.MAX_IMAGE_PIXELS=None
ZIP="/Users/s1/Downloads/vabryanka_ortho.zip"; OUT=sys.argv[1] if len(sys.argv)>1 else "etl_out"; os.makedirs(OUT,exist_ok=True)
z=zipfile.ZipFile(ZIP); tif=[n for n in z.namelist() if n.lower().endswith('.tif')][0]; tfw=[n for n in z.namelist() if n.lower().endswith('.tfw')][0]
A,D,B,E,C,F=[float(x) for x in z.read(tfw).decode().split()]
tmp=f"{OUT}/_ortho.tif"
if not os.path.exists(tmp):
    with z.open(tif) as src, open(tmp,'wb') as dst:
        while True:
            chunk=src.read(64<<20)
            if not chunk: break
            dst.write(chunk)
im=Image.open(tmp); W,H=im.size; print("TIFF",W,H,im.mode)
im=im.convert('RGB')
r4=im.reduce(4); r4.save(f"{OUT}/ortho-4k.webp",'WEBP',quality=82,method=4); print("4k", r4.size, os.path.getsize(f"{OUT}/ortho-4k.webp")//1024,"КБ")
r1=im.reduce(16); r1.save(f"{OUT}/ortho-1k.webp",'WEBP',quality=80); print("1k", r1.size, os.path.getsize(f"{OUT}/ortho-1k.webp")//1024,"КБ")
json.dump({'crs':'UCS-2000 / LCS-26 Ivano-Frankivsk (modified)','pixel_m':A,'tfw':[A,D,B,E,C,F],
  'width_px':W,'height_px':H,'width_m':W*A,'height_m':H*abs(E),
  'corners_crs':{'ul':[C,F],'lr':[C+W*A,F+H*E]},
  'local_to_crs':{'dx':None,'dy':None,'rotDeg':None,'scale':1.0,'note':'калібрувати у /calibrate'}},
  open(f"{OUT}/georef.json","w"),indent=1)
os.remove(tmp); print("georef.json записано, tmp видалено")
