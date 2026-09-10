"""Витягти план 21 «дорожньої стіни» з оригінальної DXF -> road_walls.json (scene-метри)."""
import json, time, numpy as np
SRC="/Users/s1/Downloads/Модель family resort 2.dxf"
G={l.strip() for l in open('road_walls.txt') if l.strip()}
NAMES={('Стена_'+g).encode('cp1251') for g in G}
meta=json.load(open('/Users/s1/family_resort/mayot-sales/data/meta.json')); O=meta['origin_dxf_mm']
t0=time.time(); f=open(SRC,'rb'); rl=f.readline
walls={}; cur=None; rec=[]; code0=None; code2=None; gn=False
def flush():
    global cur
    if not rec: return
    if code0==b'BLOCK':
        cur=code2 if code2 in NAMES else None
    elif code0==b'ENDBLK': cur=None
    elif cur and code0==b'VERTEX':
        d={}
        for i in range(0,len(rec)-1,2): d.setdefault(rec[i].strip(),rec[i+1].strip())
        if int(d.get(b'70',b'0')) & 64:
            walls.setdefault(cur.decode('cp1251'),[]).append((float(d[b'10']),float(d[b'20']),float(d[b'30'])))
while True:
    c=rl()
    if not c: break
    v=rl()
    if not v: break
    cs=c.strip()
    if cs==b'0': flush(); rec=[c,v]; code0=v.strip(); code2=None
    else:
        rec.append(c); rec.append(v)
        if cs==b'2' and code2 is None: code2=v.strip()
flush()
print(f"{time.time()-t0:.0f}s  знайдено стін: {len(walls)}")
out=[]
for n,vs in walls.items():
    V=np.array(vs); z0=V[:,2].min(); base=V                                   # усі вершини: слід дороги
    pts=[[float((x-O[0])/1000), float(-(y-O[1])/1000)] for x,y,z in base]   # scene X, Z
    out.append({'name':n[6:14],'n':len(V),'zmin_m':float((z0-O[2])/1000),'zmax_m':float((V[:,2].max()-O[2])/1000),'plan_xz':pts})
    print(f"  {n[6:14]}  вершин {len(V):>3}  z {out[-1]['zmin_m']:.1f}..{out[-1]['zmax_m']:.1f} м  точок у плані {len(pts)}")
json.dump(out,open('etl_out/road_walls.json','w'))
