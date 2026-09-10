"""DXF ескізу -> sketch.glb, terrain.glb, floorplates.json, heightgrid.json, meta.json
Сцена: метри, origin = min терену (DXF мм), Z-up -> Y-up: (x, z, -y)."""
import ezdxf, numpy as np, json, struct, math, os, sys, collections
SRC="/Users/s1/family_resort/resort2_structure.dxf"
OUT=sys.argv[1] if len(sys.argv)>1 else "etl_out"; os.makedirs(OUT,exist_ok=True)
STOREYS=[("ПАРКІНГ",-9.0),("ГП",-6.0),("ЗЙОМКА",-3.0),("1-й этаж",0.0),("2-й этаж",3.0),("3-й этаж",6.0),
 ("-3 ПОВЕРХ",9.3),("ПАРКІНГ_-2",12.6),("ПАРКІНГ_-1",15.9),("1 ПОВЕРХ",19.2),("2 ПОВЕРХ",22.5),
 ("3 ПОВЕРХ",25.8),("4 ПОВЕРХ",29.1),("5 ПОВЕРХ",32.4),("6 ПОВЕРХ",35.7),("Рівень +39.0",39.0)]
MAT={'concrete':([0.62,0.60,0.58,1],0.9,'OPAQUE'),'glass':([0.55,0.78,0.88,0.32],0.08,'BLEND'),
     'slab':([0.78,0.77,0.74,1],0.85,'OPAQUE'),'timber':([0.42,0.30,0.20,1],0.8,'OPAQUE'),
     'frame':([0.30,0.22,0.16,1],0.7,'OPAQUE'),'ground':([0.44,0.49,0.35,1],1.0,'OPAQUE')}
def kind_of(layer, block):
    if layer=='Конструктив - Колонны': return 'column','concrete'
    if layer=='Конструктив - Стены Несущие': return 'wall','glass'
    if layer=='Конструктив - Перекрытия': return 'slab','slab'
    if layer=='Конструктив - Балки': return 'beam','timber'
    if layer=='Конструктив - Навесные Стены': return ('cwpanel','glass') if block.startswith('Панель') else ('cwframe','frame')
    if layer in ('Местность - Рельеф','01РЕЛЬЄФ'): return 'terrain','ground'
    return None,None
doc=ezdxf.readfile(SRC)
tris=collections.defaultdict(list); terr=[]; slabs=[]
for b in doc.blocks:
    for e in b:
        if e.dxftype()!='POLYLINE' or not e.is_poly_face_mesh: continue
        kind,mat=kind_of(e.dxf.layer,b.name)
        if not kind: continue
        vs=[np.array([v.dxf.location.x,v.dxf.location.y,v.dxf.location.z]) for v in e.vertices if v.dxf.flags & 64]
        if len(vs)<3 or min(v[1] for v in vs)<0: continue          # 282 зміщені колони — геть
        fcs=[]
        for fr in [v for v in e.vertices if not (v.dxf.flags & 64)]:
            idx=[abs(fr.dxf.get(k,0)) for k in ('vtx0','vtx1','vtx2','vtx3')]
            p=[i-1 for i in idx if 0<i<=len(vs)]
            if len(p)>=3: fcs.append(p)
        if kind=='terrain': terr.append((vs,fcs))
        if kind=='slab': slabs.append((vs,fcs,b.name))
        for f in fcs:
            for k in range(1,len(f)-1): tris[mat].append((vs[f[0]],vs[f[k]],vs[f[k+1]]))
TV=np.array([v for vs,_ in terr for v in vs]); O=TV.min(0)
T=lambda p: (float((p[0]-O[0])/1000), float((p[2]-O[2])/1000), float(-(p[1]-O[1])/1000))
# ---------- GLB ----------
def write_glb(path, groups):
    buf=bytearray(); bv=[]; acc=[]; meshes=[]; nodes=[]; mats=[]
    for name,mat,tl in groups:
        pos=[]
        for a,b,c in tl: pos+= [*T(a),*T(b),*T(c)]
        while len(buf)%4: buf.append(0)
        off=len(buf); buf.extend(struct.pack('<%df'%len(pos),*pos))
        bv.append({'buffer':0,'byteOffset':off,'byteLength':len(pos)*4,'target':34962})
        acc.append({'bufferView':len(bv)-1,'componentType':5126,'count':len(pos)//3,'type':'VEC3',
                    'min':[min(pos[k::3]) for k in range(3)],'max':[max(pos[k::3]) for k in range(3)]})
        col,rough,am=MAT[mat]
        mats.append({'name':mat,'pbrMetallicRoughness':{'baseColorFactor':col,'metallicFactor':0.0,'roughnessFactor':rough},'alphaMode':am,'doubleSided':True})
        meshes.append({'name':name,'primitives':[{'attributes':{'POSITION':len(acc)-1},'material':len(mats)-1,'mode':4}]})
        nodes.append({'mesh':len(meshes)-1,'name':name})
    g={'asset':{'version':'2.0','generator':'mayot extract-sketch'},'scene':0,'scenes':[{'nodes':list(range(len(nodes)))}],
       'nodes':nodes,'meshes':meshes,'materials':mats,'accessors':acc,'bufferViews':bv,'buffers':[{'byteLength':len(buf)}]}
    js=json.dumps(g,separators=(',',':')).encode(); js+=b' '*((4-len(js)%4)%4)
    bn=bytes(buf); bn+=b'\0'*((4-len(bn)%4)%4)
    open(path,'wb').write(b'glTF'+struct.pack('<II',2,12+8+len(js)+8+len(bn))+struct.pack('<I',len(js))+b'JSON'+js+struct.pack('<I',len(bn))+b'BIN\0'+bn)
    return os.path.getsize(path), sum(len(tl) for _,_,tl in groups)
sz,n=write_glb(f"{OUT}/sketch.glb",[(k,k,v) for k,v in tris.items() if k!='ground'])
print(f"sketch.glb  {sz/1048576:.1f} МБ  {n:,} трикутників  групи {[k for k in tris if k!='ground']}")
sz,n=write_glb(f"{OUT}/terrain.glb",[('ground','ground',tris['ground'])])
print(f"terrain.glb {sz/1048576:.1f} МБ  {n:,} трикутників")
# ---------- плити ----------
def loops(vs,fcs):
    key=lambda i:(round(vs[i][0],3),round(vs[i][1],3)); zmax=max(v[2] for v in vs); top=[]
    for f in fcs:
        P=[vs[i] for i in f]; nrm=np.cross(P[1]-P[0],P[2]-P[0]); L=np.linalg.norm(nrm)
        if L>1e-9 and nrm[2]/L>0.9 and all(abs(p[2]-zmax)<1e-6 for p in P): top.append(f)
    if not top: return None
    cnt=collections.Counter()
    for f in top:
        for i in range(len(f)): cnt[frozenset((key(f[i]),key(f[(i+1)%len(f)])))]+=1
    adj=collections.defaultdict(list)
    for e,c in cnt.items():
        if c==1 and len(e)==2: a,b=tuple(e); adj[a].append(b); adj[b].append(a)
    seen=set(); ls=[]
    for st in adj:
        if st in seen: continue
        lp=[st]; seen.add(st); cur=st; prev=None
        while True:
            nx=[q for q in adj[cur] if q!=prev and q not in seen]
            if not nx: break
            prev,cur=cur,nx[0]; seen.add(cur); lp.append(cur)
        if len(lp)>=3: ls.append(lp)
    if not ls: return None
    ar=lambda L: abs(sum(L[i][0]*L[(i+1)%len(L)][1]-L[(i+1)%len(L)][0]*L[i][1] for i in range(len(L))))/2
    ls.sort(key=ar,reverse=True); return ls[0],ls[1:],zmax
def storey(zmm):
    z=zmm/1000; c=[s for s in STOREYS if s[1]<=z+0.05]; return c[-1] if c else STOREYS[0]
plates=[]
for vs,fcs,name in slabs:
    r=loops(vs,fcs)
    if not r: continue
    outer,holes,zt=r; z0=min(v[2] for v in vs); st=storey(z0)
    P2=lambda L:[[float((x-O[0])/1000),float(-(y-O[1])/1000)] for x,y in L]
    plates.append({'id':name[:52],'storey':st[0],'elev':st[1],'y0':float((z0-O[2])/1000),'h':float((zt-z0)/1000),
                   'outer':P2(outer),'holes':[P2(h) for h in holes]})
json.dump(plates,open(f"{OUT}/floorplates.json","w"),ensure_ascii=False)
print(f"floorplates.json  {len(plates)} плит, з отворами {sum(1 for p in plates if p['holes'])}")
# ---------- heightgrid + схил ----------
SV=np.array([T(v) for vs,_ in terr for v in vs]); step=2.0
x0,z0=SV[:,0].min(),SV[:,2].min(); cols=int((SV[:,0].max()-x0)/step)+2; rows=int((SV[:,2].max()-z0)/step)+2
H=np.full((rows,cols),np.nan)
for vs,fcs in terr:
    P=np.array([T(v) for v in vs])
    for f in fcs:
        for k in range(1,len(f)-1):
            a,b,c=P[f[0]],P[f[k]],P[f[k+1]]
            xs=[a[0],b[0],c[0]]; zs=[a[2],b[2],c[2]]
            i0,i1=int((min(xs)-x0)/step),int((max(xs)-x0)/step)+1; j0,j1=int((min(zs)-z0)/step),int((max(zs)-z0)/step)+1
            for j in range(max(j0,0),min(j1+1,rows)):
                pz=z0+j*step
                for i in range(max(i0,0),min(i1+1,cols)):
                    px=x0+i*step
                    d=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2])
                    if abs(d)<1e-12: continue
                    l1=((b[2]-c[2])*(px-c[0])+(c[0]-b[0])*(pz-c[2]))/d; l2=((c[2]-a[2])*(px-c[0])+(a[0]-c[0])*(pz-c[2]))/d; l3=1-l1-l2
                    if l1>=-1e-6 and l2>=-1e-6 and l3>=-1e-6: H[j,i]=l1*a[1]+l2*b[1]+l3*c[1]
A=np.c_[SV[:,0],SV[:,2],np.ones(len(SV))]; coef,*_=np.linalg.lstsq(A,SV[:,1],rcond=None)
up=np.array([coef[0],coef[1]]); up/=np.linalg.norm(up)
json.dump({'originX':float(x0),'originZ':float(z0),'step':step,'cols':cols,'rows':rows,
           'data':[None if np.isnan(v) else round(float(v),2) for v in H.ravel()]},open(f"{OUT}/heightgrid.json","w"))
meta={'origin_dxf_mm':[float(v) for v in O],'scene_bbox':{'min':[float(v) for v in SV.min(0)],'max':[float(v) for v in SV.max(0)]},
      'uphill_xz':[float(up[0]),float(up[1])],'slope_pct':float(math.hypot(coef[0],coef[1])*100),
      'storeys':[{'name':n,'elev':e,'y':float(e-O[2]/1000)} for n,e in STOREYS],
      'triangles':{k:len(v) for k,v in tris.items()}}
json.dump(meta,open(f"{OUT}/meta.json","w"),ensure_ascii=False,indent=1)
print(f"heightgrid {cols}×{rows} @2 м, заповнено {int(np.isfinite(H).sum())} комірок; uphill_xz={up.round(3).tolist()}, ухил {meta['slope_pct']:.1f} %")
