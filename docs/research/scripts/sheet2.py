import json,sys,struct
import numpy as np
from PIL import Image, ImageDraw, ImageFont
def font(n):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",):
        try: return ImageFont.truetype(p,n)
        except: pass
    return ImageFont.load_default()
F=font(20)
def orig(tag):
    b=open(tag+".rgba","rb").read(); w,h=struct.unpack("<II",b[:8])
    a=np.frombuffer(b[8:],dtype=np.uint8).reshape(h,w,4).astype(float)
    al=a[...,3:4]/255; rgb=(a[...,:3]*al+255*(1-al)).astype(np.uint8)
    return Image.fromarray(rgb)
def draw(m,s):
    pal=np.array([[int(p["hex"][i:i+2],16) for i in (1,3,5)] for p in m["palette"]],dtype=np.uint8)
    arr=np.array(m["cells"]); im=pal[arr]
    return Image.fromarray(im).resize((m["cols"]*s,m["rows"]*s),Image.NEAREST)
def crop_to(im,aspect):
    w,h=im.size
    if w/h>aspect: nw=round(h*aspect); x=(w-nw)//2; return im.crop((x,0,x+nw,h))
    nh=round(w/aspect); y=(h-nh)//2; return im.crop((0,y,w,y+nh))
def sheet(rows,cols_suffix,labels,out,s):
    # rows: list of (src, key, title)
    tiles=[]
    for src,key,title in rows:
        ms=[json.load(open(f"{key}_{x}.json")) for x in cols_suffix]
        ims=[draw(m,s) for m in ms]
        o=crop_to(orig(src),ms[0]["cols"]/ (ms[0]["rows"]*1.125 if False else ms[0]["rows"]) * (1) if False else None) if False else None
        # physical aspect: width/height inches; cells aspect (cols/rows*(4.5/4)) 
        asp=ms[0]["cols"]/ms[0]["rows"]*(1/1.125)
        o=crop_to(orig(src),asp).resize(ims[0].size,Image.LANCZOS)
        tiles.append((title,[o]+ims,[len(m["palette"]) for m in ms]))
    tw,th=tiles[0][1][0].size; pad=10; head=34; n=len(tiles[0][1])
    W=n*tw+(n+1)*pad; H=len(tiles)*(th+head+pad)+pad
    S=Image.new("RGB",(W,H),(32,32,36)); d=ImageDraw.Draw(S)
    for i,(title,ims,cs) in enumerate(tiles):
        y=pad+i*(th+head+pad)
        labs=[title+" ORIGINAL"]+[f"{l} ({c})" for l,c in zip(labels,cs)]
        for j,(img,l) in enumerate(zip(ims,labs)):
            x=pad+j*(tw+pad); d.text((x,y+4),l,fill=(240,230,220),font=F); S.paste(img,(x,y+head))
    S.save(out)
if __name__=="__main__":
    cfg=json.load(open(sys.argv[1])); sheet(cfg["rows"],cfg["cols"],cfg["labels"],cfg["out"],cfg["scale"])
