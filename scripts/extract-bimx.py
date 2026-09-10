"""BIMx -> sketch-zones.json (усі зони) + storeys"""
import re, json, sys, os
SRC="/Users/s1/Downloads/фасади_27_обід.bimx"; OUT=sys.argv[1] if len(sys.argv)>1 else "etl_out"; os.makedirs(OUT,exist_ok=True)
d=open(SRC,'rb').read(); i=d.find(b'</PublisherItem>'); last=d.rfind(b'</Elem>')
hdr=d[8:i+16].decode('utf-8'); seg=d[i+16:last+7].decode('utf-8',errors='replace')
ST={int(m.group(2)):(m.group(1),float(m.group(3))) for m in re.finditer(r'<Story name="([^"]*)" number="(-?\d+)" id="\d+" level="([^"]*)"',hdr)}
def num(s):
    s=re.sub(r'[\s   ]','',s or '').replace(',','.')
    try: return float(s)
    except: return None
zones=[]
for a,b in re.findall(r'<Elem ([^>]*)>(.*?)</Elem>', seg, re.S):
    if 'type="ROOM"' not in a: continue
    fl=int(re.search(r'floornum="(-?\d+)"',a).group(1)); zn=re.search(r'<Zone name="([^"]*)" number="([^"]*)"',b)
    kv={k:v for k,v,u in re.findall(r'<Info key="([^"]*)" value="([^"]*)" unit="([^"]*)"/>', b)}
    zones.append({'guid':re.search(r'id="([0-9A-F-]{36})"',a).group(1),'id':kv.get('ID Элемента'),
                  'category':zn.group(1) if zn else None,'number':zn.group(2) if zn else '',
                  'floor':fl,'storey':ST.get(fl,('?',None))[0],'elev':ST.get(fl,('?',None))[1],
                  'area_m2':num(kv.get('Вычисленная Площадь')),'height_mm_raw':num(kv.get('Высота'))})
rooms=[z for z in zones if z['category']=='Номер']
json.dump({'source':os.path.basename(SRC),'storeys':[{'number':k,'name':v[0],'elev':v[1]} for k,v in sorted(ST.items())],
           'zones':zones},open(f"{OUT}/sketch-zones.json","w"),ensure_ascii=False,indent=1)
print(f"зон {len(zones)}, номерів {len(rooms)}, Σ площа номерів {sum(z['area_m2'] or 0 for z in rooms):,.1f} м²")
