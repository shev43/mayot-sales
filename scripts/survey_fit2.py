import pdfplumber, json, math, re, numpy as np
PDF="/Users/s1/Downloads/Яремче_Вабрянка_500.pdf"
GRID=json.load(open("/Users/s1/family_resort/mayot-sales/data/heightgrid.json"))
PT=25.4/72/1000*500
with pdfplumber.open(PDF) as pdf:
    pg=pdf.pages[0]; W,H=pg.width,pg.height
    words=pg.extract_words(x_tolerance=1.2, y_tolerance=2)
P=np.array([((w['x0']-2)*PT,(H-w['bottom'])*PT,float(w['text'])) for w in words
            if re.fullmatch(r'\d{3,4}[.]\d{2}',w['text']) and 880<=float(w['text'])<=1040])
Hg=np.array([np.nan if v is None else v for v in GRID['data']],float).reshape(GRID['rows'],GRID['cols'])
ox,oz,st=GRID['originX'],GRID['originZ'],GRID['step']
cx,cy=P[:,0].mean(),P[:,1].mean()          # обертаємо навколо центроїда відміток
def sample(x,y):
    fx=(x-ox)/st; fz=(-y-oz)/st; i=np.floor(fx).astype(int); j=np.floor(fz).astype(int)
    ok=(i>=0)&(j>=0)&(i<GRID['cols']-1)&(j<GRID['rows']-1); out=np.full(len(x),np.nan)
    ii,jj=i[ok],j[ok]; tx=fx[ok]-ii; tz=fz[ok]-jj
    a=Hg[jj,ii]; b=Hg[jj,ii+1]; c=Hg[jj+1,ii]; d=Hg[jj+1,ii+1]
    out[ok]=(a*(1-tx)+b*tx)*(1-tz)+(c*(1-tx)+d*tx)*tz; return out
def score(dx,dy,rot,sc):
    r=math.radians(rot); c,s=math.cos(r),math.sin(r)
    x=sc*(c*(P[:,0]-cx)-s*(P[:,1]-cy))+cx+dx; y=sc*(s*(P[:,0]-cx)+c*(P[:,1]-cy))+cy+dy
    m=sample(x,y); ok=~np.isnan(m)
    if ok.sum()<len(P)*0.6: return 1e9,0,0
    d=P[ok,2]-m[ok]; dz=np.median(d); e=np.abs(d-dz)
    return np.median(e),dz,ok.sum()                       # робастно: медіана |похибки|
best=(1e9,)
for sc in (0.95,1.0,1.05):
    for rot in np.arange(0,360,5):
        for dx in np.arange(-150,151,6):
            for dy in np.arange(-150,151,6):
                r,dz,n=score(dx,dy,rot,sc)
                if r<best[0]: best=(r,dx,dy,rot,sc,dz,n)
print("груба:",f"MedAE {best[0]:.2f} м dx={best[1]:.0f} dy={best[2]:.0f} rot={best[3]:.0f}° sc={best[4]} dz={best[5]:.2f} n={best[6]}")
_,dx0,dy0,rot0,sc0,_,_=best
for sc in np.arange(sc0-0.04,sc0+0.041,0.01):
    for rot in np.arange(rot0-4,rot0+4.01,0.5):
        for dx in np.arange(dx0-8,dx0+8.01,1):
            for dy in np.arange(dy0-8,dy0+8.01,1):
                r,dz,n=score(dx,dy,rot,sc)
                if r<best[0]: best=(r,dx,dy,rot,sc,dz,n)
r,dx,dy,rot,sc,dz,n=best
rr=math.radians(rot); c,s=math.cos(rr),math.sin(rr)
x=sc*(c*(P[:,0]-cx)-s*(P[:,1]-cy))+cx+dx; y=sc*(s*(P[:,0]-cx)+c*(P[:,1]-cy))+cy+dy
m=sample(x,y); ok=~np.isnan(m); d=P[ok,2]-m[ok]-dz
print(f"точна: MedAE {r:.2f} м  RMS {np.sqrt(np.mean(d**2)):.2f} м  dx={dx:.1f} dy={dy:.1f} rot={rot:.1f}° scale={sc:.3f} dz={dz:.2f} м  n={n}/{len(P)}")
print(f"|похибка|<1 м: {np.mean(np.abs(d)<1)*100:.0f}%   <2 м: {np.mean(np.abs(d)<2)*100:.0f}%")
print(f"датум: модельна Z=0 = {dz:.2f} м н.р.м.; терен моделі {dz-39.02:.0f}..{dz+88.0:.0f} м (зйомка 898..1027)")
json.dump({'pt_to_m':PT,'sheet_size_m':[W*PT,H*PT],'n':int(len(P)),'medae_m':float(r),'rms_m':float(np.sqrt(np.mean(d**2))),
  'pivot_sheet_m':[float(cx),float(cy)],'sheet_to_model':{'dx':float(dx),'dy':float(dy),'rotDeg':float(rot),'scale':float(sc)},
  'model_z0_baltic_m':float(dz)}, open('etl_out/survey_fit.json','w'),indent=1)
