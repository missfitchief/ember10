"""Regenerate the original static social card with Pillow. Not part of the app build."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
S = 2
image = Image.new('RGB', (1200*S, 630*S), '#FAF7F1')
draw = ImageDraw.Draw(image)
INK, SECONDARY, CORAL, LINE = '#24211D', '#625E57', '#B94729', '#E5DED2'

def font(size, display=False, weight=500):
    name = 'bricolage-grotesque-latin.woff2' if display else 'figtree-latin.woff2'
    value = ImageFont.truetype(str(ROOT/'apps/web/fonts'/name), size*S)
    axes = value.get_variation_axes()
    if axes:
        value.set_variation_by_axes([weight if b'Weight' in axis['name'] else axis['default'] for axis in axes])
    return value

def box(bounds, fill, radius=0, outline=None):
    draw.rounded_rectangle(tuple(int(v*S) for v in bounds), radius=radius*S, fill=fill, outline=outline, width=S)

def text(x,y,value,size,color=INK,display=False,weight=500):
    draw.text((x*S,y*S), value, font=font(size,display,weight), fill=color, anchor='lt', spacing=10*S)

box((64,48,112,100),CORAL,12)
for row in range(5):
    for col in range(2):
        box((76+col*13,58+row*7,85+col*13,62+row*7),'white',1)
text(126,53,'ember',39,display=True,weight=750)
text(244,54,'10',39,CORAL,True,750)
box((988,55,1136,93),'#F7E8D0',19)
text(1012,66,'PRELAUNCH',15,'#7A471C',weight=700)
text(64,175,'One Ember holding.',66,display=True,weight=750)
text(64,254,'Ten possibilities.',76,CORAL,True,750)
text(67,364,'A ten-asset rewards policy,',27,SECONDARY)
text(67,404,'rooted in the Ember ecosystem.',27,SECONDARY)

shadow = Image.new('RGBA', image.size, (0,0,0,0))
ImageDraw.Draw(shadow).rounded_rectangle((810*S,155*S,1140*S,516*S),radius=30*S,fill=(88,53,21,22))
image.paste(Image.alpha_composite(image.convert('RGBA'),shadow.filter(ImageFilter.GaussianBlur(18*S))).convert('RGB'))
draw = ImageDraw.Draw(image)
box((806,146,1136,502),'white',26,LINE)
text(832,169,'TEN PURCHASE BUDGETS',15,SECONDARY,weight=650)
for row in range(5):
    for col in range(2):
        x,y=832+col*141,207+row*52
        box((x,y,x+129,y+42),'#FCF3E8',9,'#EADAC9')
        text(x+13,y+12,f'{row*2+col+1:02d}',15,SECONDARY,weight=600)
        text(x+77,y+10,'10%',19,CORAL,True,700)
draw.line((64*S,532*S,1136*S,532*S),fill=LINE,width=S)
text(64,553,'10 equal budgets · 80/10/10 allocation',21,INK,weight=600)
text(64,590,'Rewards are not active yet.',18,SECONDARY)
text(902,575,'Independent project',18,SECONDARY)
target=ROOT/'apps/web/public/ember10-share.png'
target.parent.mkdir(parents=True,exist_ok=True)
image.resize((1200,630),Image.Resampling.LANCZOS).save(target,optimize=True)
print(target)
