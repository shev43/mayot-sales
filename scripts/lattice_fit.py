import pdfplumber, json, math, numpy as np
from PIL import Image, ImageDraw, ImageFilter
PDF="/Users/s1/Downloads/Яремче_Вабрянка_500.pdf"; PT=25.4/72/1000*500; RES=0.5
G=json.load(open("/Users/s1/family_resort/mayot-sales/data/georef.json")); A,_,_,E,C,F=G['tfw']; Wpx,Hpx=G['width_px'],G['height_px']
lat=json.load(open('etl_out/lattice.json')); xm,ym=lat['x_mod50'],lat['y_mod50']
with pdfplumber.open(PDF) as pdf:
    pg=pdf.pages[0]; W,H=pg.width,pg.height; sw,sh=int(W*PT/RES)+1,int(H*PT/RES)+1
    col=lambda o: tuple(round(v,2) for v in (o.get('stroking_color') or (9,9,9))[:3])
    segs=[o for o in pg.lines if col(o)==(0.0,0.0,0.0) and round(o.get('linewidth',0),1)==2.0 and 1.5<math.dist((o['x0'],o['y0']),(o['x1'],o['y1']))*PT<40]
    R=Image.new('L',(sw,sh),0); d=ImageDraw.Draw(R)
    for o in segs: d.line([(o['x0']*PT/RES,(H-o['y0'])*PT/RES),(o['x1']*PT/RES,(H-o['y1'])*PT/RES)],fill=255,width=7)
    par=[o for o in pg.curves if col(o)==(0.5,0.0,0.5)]
    P=Image.new('L',(sw,sh),0); dp=ImageDraw.Draw(P)
    for o in par: dp.line([(x*PT/RES,(H-y)*PT/RES) for x,y in o['pts']],fill=255,width=3)
    pxs=[p[0]*PT for o in par for p in o['pts']]; pys=[(H-p[1])*PT for o in par for p in o['pts']]
    pbox=(min(pxs),max(pxs),min(pys),max(pys))
Rm=np.asarray(Image.fromarray(np.asarray(R)).filter(ImageFilter.GaussianBlur(2)),float)/255
o=Image.open("/Users/s1/family_resort/mayot-sales/public/terrain/ortho-4k.webp").convert('RGB')
ow,oh=int(Wpx*A/RES),int(Hpx*abs(E)/RES); o=o.resize((ow,oh),Image.LANCZOS)
hsv=np.asarray(o.convert('HSV'),float); Vv=hsv[:,:,2]/255; Sv=hsv[:,:,1]/255
cover=~((Vv>0.97)&(Sv<0.05)); cover=np.asarray(Image.fromarray((cover*255).astype('uint8')).filter(ImageFilter.MinFilter(9)),bool)
rl=np.clip((Vv-0.5)/0.3,0,1)*np.clip((0.5-Sv)/0.3,0,1); rl[~cover]=0
rl=np.asarray(Image.fromarray((rl*255).astype('uint8')).filter(ImageFilter.GaussianBlur(3)),float)/255
Sn=Rm-Rm.mean(); On=rl-rl.mean()
corr=np.fft.irfft2(np.fft.rfft2(On,s=(oh,ow))*np.conj(np.fft.rfft2(Sn,s=(oh,ow))),s=(oh,ow))
px0,px1=int(pbox[0]/RES),int(pbox[1]/RES); py0,py1=int((H*PT-pbox[3])/RES),int((H*PT-pbox[2])/RES)
# вузли решітки: E0 = C + i*RES  з E0 ≡ -xm (mod 50);  N0 = F - j*RES - sh*RES  з N0 ≡ -ym (mod 50)
E0need=(-xm)%50; N0need=(-ym)%50
cands=[]
for i in range(0,ow-px1):
    E0=C+i*RES
    if abs(((E0-E0need)+25)%50-25)>RES/2: continue
    for j in range(0,oh-py1):
        N0=F-j*RES-sh*RES
        if abs(((N0-N0need)+25)%50-25)>RES/2: continue
        ok=cover[j+py0,i+px0]&cover[j+py1,i+px1]&cover[j+py0,i+px1]&cover[j+py1,i+px0]
        if not ok: continue
        # бал: середнє road-like під штрихами (вікно), нормовано
        cands.append((corr[j,i],i,j,E0,N0))
cands.sort(reverse=True)
print(f"вузлів у покритті: {len(cands)}")
vals=np.array([c[0] for c in cands]); 
for r,(v,i,j,E0,N0) in enumerate(cands[:6]):
    print(f"  #{r+1} corr={v:.1f} ({(v-vals.mean())/vals.std():+.2f}σ)  зсув ({i*RES:.1f},{j*RES:.1f})  LL E {E0:.2f} N {N0:.2f}")
print(f"  відрив #1 від #2: {cands[0][0]/cands[1][0]:.3f}")
fit=json.load(open('etl_out/survey_fit.json')); dx,dy=fit['sheet_to_model']['dx'],fit['sheet_to_model']['dy']
out=[]
for r,(v,i,j,E0,N0) in enumerate(cands[:3]):
    app={'dx':E0-dx,'dy':N0-dy,'rotDeg':0.0,'scale':1.0}
    out.append({'rank':r+1,'corr':float(v),'sheet_ll_crs':[E0,N0],'app_georef':app})
    ov=o.copy(); ov.paste(Image.new('RGB',(sw,sh),(255,30,30)),(i,j),R); ov.paste(Image.new('RGB',(sw,sh),(180,0,220)),(i,j),P)
    ov.crop((max(0,i-20),max(0,j-20),min(ow,i+sw+20),min(oh,j+sh+20))).save(f'etl_out/overlay_lattice_{r+1}.png')
json.dump(out,open('etl_out/lattice_fit.json','w'),indent=1); print("overlays 1-3 збережено")
