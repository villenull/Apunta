from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
import uharfbuzz as hb

TEAL, BEIGE = "#1f6f63", "#f6f4ef"
font = TTFont("Kalam-Regular.ttf"); gs = font.getGlyphSet(); upm = font["head"].unitsPerEm
blob = hb.Blob.from_file_path("Kalam-Regular.ttf"); hbfont = hb.Font(hb.Face(blob))

def shape(text):
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
    hb.shape(hbfont, buf, {"kern": True, "liga": True})
    names = [font.getGlyphName(i.codepoint) for i in buf.glyph_infos]
    return names, buf.glyph_positions

def outline(text):
    """Path data in font units (y up) plus bounds, glyphs laid out with kerning."""
    names, pos = shape(text); x = 0; parts = []; bb = [1e9,1e9,-1e9,-1e9]
    for n, p in zip(names, pos):
        sp = SVGPathPen(gs); tp = TransformPen(sp, (1,0,0,1,x+p.x_offset,p.y_offset)); gs[n].draw(tp)
        parts.append(sp.getCommands())
        bp = BoundsPen(gs); gs[n].draw(TransformPen(bp,(1,0,0,1,x+p.x_offset,p.y_offset)))
        if bp.bounds:
            b = bp.bounds; bb = [min(bb[0],b[0]),min(bb[1],b[1]),max(bb[2],b[2]),max(bb[3],b[3])]
        x += p.x_advance
    return " ".join(parts), bb

# ---- wordmark (logo 1a): level baseline, outlined, no font dependency
d, (x0,y0,x1,y1) = outline("Apunta"); pad = 70; w = x1-x0+2*pad; h = y1-y0+2*pad
word = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" role="img" aria-label="Apunta">
  <path fill="{TEAL}" transform="translate({pad-x0:.1f} {pad+y1:.1f}) scale(1 -1)" d="{d}"/>
</svg>
'''
open("apunta-wordmark.svg","w").write(word)

# ---- app icon: beige rounded square, single A, Apple 1024 grid (824 tile)
d, (x0,y0,x1,y1) = outline("A")
S, TILE, R = 1024, 824, 185
target_h = TILE*0.56; k = target_h/(y1-y0)
cx, cy = S/2, S/2 + TILE*0.01   # nudged down a hair: optical centre of an A sits high
tx = cx - (x0+x1)/2*k; ty = cy + (y0+y1)/2*k
m = (S-TILE)/2
icon = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}" width="{S}" height="{S}">
  <rect x="{m}" y="{m}" width="{TILE}" height="{TILE}" rx="{R}" fill="{BEIGE}" stroke="#e3e0d6" stroke-width="6"/>
  <path fill="{TEAL}" transform="translate({tx:.1f} {ty:.1f}) scale({k:.4f} {-k:.4f})" d="{d}"/>
</svg>
'''
open("apunta-icon.svg","w").write(icon)
print("ok", w, h)
