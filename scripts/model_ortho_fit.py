"""Дорожні стіни (scene XZ) <-> ортофото: повний пошук зсуву, rot 0, масштаб 1."""
import json, math, numpy as np
from PIL import Image, ImageDraw, ImageFilter
RES=0.5
G=json.load(open("/Users/s1/family_resort/mayot-sales/data/georef.json")); A,_,_,E,C,F=G['tfw']; Wpx,Hpx=G['width_px'],G['height_px']
meta=json.load(open('/Users/s1/family_resort/mayot-sales/data/meta.json')); bb=meta['scene_bbox']
roads=json.load(open('etl_out/road_walls.json'))
sw,sh=int((bb['max'][0]-bb['min'][0])/RES)+1,int((bb['max'][2]-bb['min'][2])/RES)+1     # scene X × Z (Z ≤ 0)
R=Image.new('L',(sw,sh),0); d=ImageDraw.Draw(R)
def px(x,z): return (x-bb['min'][0])/RES, (z-bb['min'][2])/RES        # рядок 0 = найпівденніший? ні: Z зростає вниз → ряд = (z - zmin)
# у сцені Z=-north; ортофото рядки зростають на південь. zmin = найпівнічніше (Z=-623) -> ряд 0 = північ. OK: ряд = (z - zmin)/RES
n=0
for w in roads:
    pts=[px(x,z) for x,z in w['plan_xz']]
    for x,y in pts: d.ellipse([x-4,y-4,x+4,y+4],fill=255); n+=1
print(f"растр доріг {sw}×{sh}, точок {n}")
Rm=np.asarray(R.filter(ImageFilter.GaussianBlur(2)),float)/255
o=Image.open("/Users/s1/family_resort/mayot-sales/public/terrain/ortho-4k.webp").convert('RGB')
ow,oh=int(Wpx*A/RES),int(Hpx*abs(E)/RES); o=o.resize((ow,oh),Image.LANCZOS)
hsv=np.asarray(o.convert('HSV'),float); Vv=hsv[:,:,2]/255; Sv=hsv[:,:,1]/255
cover=~((Vv>0.97)&(Sv<0.05)); cover=np.asarray(Image.fromarray((cover*255).astype('uint8')).filter(ImageFilter.MinFilter(9)),bool)
rl=np.clip((Vv-0.5)/0.3,0,1)*np.clip((0.5-Sv)/0.3,0,1); rl[~cover]=0
rl=np.asarray(Image.fromarray((rl*255).astype('uint8')).filter(ImageFilter.GaussianBlur(3)),float)/255
best=None
for rot in (0.0,):
    Sn=Rm-Rm.mean(); On=rl-rl.mean()
    corr=np.fft.irfft2(np.fft.rfft2(On,s=(oh,ow))*np.conj(np.fft.rfft2(Sn,s=(oh,ow))),s=(oh,ow))
    valid=np.full_like(corr,-np.inf); valid[:oh-sh+120,:ow-sw+120]=corr[:oh-sh+120,:ow-sw+120]
    flat=valid[np.isfinite(valid)]; j,i=np.unravel_index(np.argmax(valid),valid.shape); peak=valid[j,i]
    mask=np.ones_like(valid,bool); mask[max(0,j-40):j+40,max(0,i-40):i+40]=False; second=np.max(np.where(mask,valid,-np.inf)); j2,i2=np.unravel_index(np.argmax(np.where(mask,valid,-np.inf)),valid.shape)
    print(f"rot {rot}: пік @ ({i*RES:.1f} вправо, {j*RES:.1f} вниз) пік/2-й={peak/second:.3f} z={(peak-flat.mean())/flat.std():.1f}σ  2-й @ ({i2*RES:.1f},{j2*RES:.1f})")
    best=(peak/second,i,j)
_,i,j=best
# scene (x,z) -> CRS: E = C + (i*RES) + (x - xmin);  N = F - (j*RES) - (z - zmin)  =>  E = x + dx, N = -z + dy
dx=C+i*RES-bb['min'][0]; dy=F-j*RES+bb['min'][2]
print(f"georef застосунку: dx={dx:.2f} dy={dy:.2f} rot=0")
# звірка з решіткою аркуша: sheet = model - (fit dx,dy)
fit=json.load(open('etl_out/survey_fit.json')); lat=json.load(open('etl_out/lattice.json'))
E0=dx+fit['sheet_to_model']['dx']; N0=dy+fit['sheet_to_model']['dy']
print(f"звірка: аркуш LL → E {E0:.2f} (mod50 {E0%50:.2f}, треба {(-lat['x_mod50'])%50:.2f}), N {N0:.2f} (mod50 {N0%50:.2f}, треба {(-lat['y_mod50'])%50:.2f})")
json.dump({'peak_ratio':float(best[0]),'shift_m':[i*RES,j*RES],'app_georef':{'dx':dx,'dy':dy,'rotDeg':0.0,'scale':1.0},
  'sheet_ll_check':[E0,N0]},open('etl_out/model_ortho_fit.json','w'),indent=1)
ov=o.copy(); ov.paste(Image.new('RGB',(sw,sh),(255,40,40)),(i,j),R)
ov.crop((max(0,i-30),max(0,j-30),min(ow,i+sw+30),min(oh,j+sh+30))).save('etl_out/overlay_model_roads.png'); print("overlay збережено")
