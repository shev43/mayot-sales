"""PDF (візуалізації, мудборд) -> gallery/*.webp + gallery.json"""
import os, sys, json, io
from pypdf import PdfReader
from PIL import Image
OUT=sys.argv[1] if len(sys.argv)>1 else "etl_out"; G=f"{OUT}/gallery"; os.makedirs(G,exist_ok=True)
items=[]
for src,prefix,maxw in (("/Users/s1/Downloads/Візуалізації.pdf","render",1800),("/Users/s1/Downloads/К1 Муд.pdf","mood",1200)):
    r=PdfReader(src)
    for pi,page in enumerate(r.pages):
        for ii,img in enumerate(page.images):
            try: im=img.image
            except Exception as e: print("skip",src,pi,ii,e); continue
            if im.width<400 or im.height<300: continue
            im=im.convert('RGB')
            if im.width>maxw: im=im.resize((maxw,int(im.height*maxw/im.width)),Image.LANCZOS)
            name=f"{prefix}-{pi+1:02d}{('-'+str(ii+1)) if len(page.images)>1 else ''}.webp"
            im.save(f"{G}/{name}",'WEBP',quality=84)
            items.append({'file':name,'source':os.path.basename(src),'page':pi+1,'w':im.width,'h':im.height})
json.dump(items,open(f"{G}/gallery.json","w"),ensure_ascii=False,indent=1)
print(f"збережено {len(items)} зображень; рендерів {sum(1 for i in items if i['file'].startswith('render'))}, мудборд {sum(1 for i in items if i['file'].startswith('mood'))}")
print("розмір галереї:", sum(os.path.getsize(f'{G}/{i["file"]}') for i in items)//1024, "КБ")
