import json,sys
from PIL import Image, ImageDraw, ImageFont
meta=json.load(open("meta.json"))
def font(n):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf","/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"):
        try: return ImageFont.truetype(p,n)
        except: pass
    return ImageFont.load_default()
F=font(20)
def draw(m,cw,ch):
    pal=[tuple(int(p["hex"][i:i+2],16) for i in (1,3,5)) for p in m["palette"]]
    im=Image.new("RGB",(m["cols"]*cw,m["rows"]*ch)); px=im.load()
    for r,row in enumerate(m["cells"]):
        for c,v in enumerate(row):
            for y in range(ch):
                for x in range(cw): px[c*cw+x,r*ch+y]=pal[v]
    return im
def crop_to(im,aspect):
    w,h=im.size
    if w/h>aspect: nw=round(h*aspect); x=(w-nw)//2; return im.crop((x,0,x+nw,h))
    nh=round(w/aspect); y=(h-nh)//2; return im.crop((0,y,w,y+nh))
def sheet(size,cw,ch,group,out):
    tiles=[]
    for tag,_ in group:
        cur=json.load(open(f"{tag}_{size}_cur.json")); ill=json.load(open(f"{tag}_{size}_ill.json"))
        a=draw(cur,cw,ch); b=draw(ill,cw,ch)
        o=crop_to(Image.open(tag+".png"),cur["cols"]*1.0/cur["rows"]*(1.125)*0+ (cur["cols"]/1.0)/(cur["rows"]/1.125)/1.0 if False else (3/4 if size=="24x32" else 4/5)).resize(a.size,Image.LANCZOS)
        tiles.append((tag,o,a,b,len(cur["palette"]),len(ill["palette"])))
    tw=tiles[0][2].width; th=tiles[0][2].height; pad=10; head=34
    W=3*tw+4*pad; H=len(tiles)*(th+head+pad)+pad
    S=Image.new("RGB",(W,H),(32,32,36)); d=ImageDraw.Draw(S)
    for i,(tag,o,a,b,ca,cb) in enumerate(tiles):
        y=pad+i*(th+head+pad)
        for j,(img,label) in enumerate(((o,f"{tag}  ORIGINAL"),(a,f"CURRENT ({ca} colors)"),(b,f"LINE ART ({cb} colors)"))):
            x=pad+j*(tw+pad); d.text((x,y+4),label,fill=(240,230,220),font=F); S.paste(img,(x,y+head))
    S.save(out)
groups=[meta[0:3],meta[3:6],meta[6:9],meta[9:12]]
for size,cw,ch in (("24x32",4,4),("16x20",6,6)):
    for i,g in enumerate(groups): sheet(size,cw,ch,g,f"sheet_{size}_{i+1}.png")
