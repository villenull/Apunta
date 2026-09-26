import re
exec(open("build.py").read().split("# ---- wordmark")[0])
TEAL, BEIGE, EDGE = "#1f6f63", "#f6f4ef", "#e3e0d6"
out = "/home/claude/v2/assets"
import os; os.makedirs(out, exist_ok=True)

def svg(d, bb, pad, fill, label):
    x0,y0,x1,y1 = bb; w = x1-x0+2*pad; h = y1-y0+2*pad
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" role="img" aria-label="{label}">\n'
            f'  <path fill="{fill}" transform="translate({pad-x0:.1f} {pad+y1:.1f}) scale(1 -1)" d="{d}"/>\n</svg>\n')

wd, wbb = outline("Apunta"); ad, abb = outline("A")
# In-app: currentColor so CSS token --brand-mark controls light (teal) / dark (white)
open(f"{out}/apunta-wordmark.currentcolor.svg","w").write(svg(wd,wbb,20,"currentColor","Apunta"))
open(f"{out}/apunta-a.currentcolor.svg","w").write(svg(ad,abb,20,"currentColor","Apunta"))
# Fixed-colour exports for web/docs
open(f"{out}/apunta-wordmark.teal.svg","w").write(svg(wd,wbb,70,TEAL,"Apunta"))
open(f"{out}/apunta-wordmark.white.svg","w").write(svg(wd,wbb,70,"#ffffff","Apunta"))
open(f"{out}/apunta-a.teal.svg","w").write(svg(ad,abb,20,TEAL,"Apunta"))

# Favicon: 24x24 tile like the current favicon, with the A
x0,y0,x1,y1 = abb; k = 15/(y1-y0); tx = 12-(x0+x1)/2*k; ty = 12.2+(y0+y1)/2*k
fav = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <!--
    The Apunta mark: a handwritten A (Kalam, SIL OFL 1.1, converted to outlines).
    Served from web/public/ so it reaches the browser byte for byte and is
    bundled with the app: no CDN, no external asset (CLAUDE.md hard rule 1).
    Colours are written out because a favicon cannot see CSS custom properties.
  -->
  <rect x="0.25" y="0.25" width="23.5" height="23.5" rx="5" fill="{BEIGE}" stroke="{EDGE}" stroke-width="0.5"/>
  <path fill="{TEAL}" transform="translate({tx:.3f} {ty:.3f}) scale({k:.5f} {-k:.5f})" d="{ad}"/>
</svg>
'''
open(f"{out}/favicon.svg","w").write(fav)
print("assets ok")
