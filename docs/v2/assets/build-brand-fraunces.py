"""
The Fraunces wordmark and A mark (owner, 2026-09-26), in the same pattern as
build-brand-v2.py: read a committed font, write outlines, touch no network.

Source: Fraunces-Variable.ttf beside this file, the variable cut
`Fraunces[SOFT,WONK,opsz,wght].ttf` from github.com/google/fonts
(ofl/fraunces), sha256
177ff6c0f14e5550a3c624247cd1189611d4eb65d000b14944c63d967958abbb.
Licence: Fraunces-OFL.txt (SIL Open Font License 1.1). Used only to generate
outlines; never bundled into the app.

The axes are pinned so the outlines in the repo can be reproduced from the file
beside them: Medium (wght 500) at text optical size (opsz 14), with the SOFT
and WONK axes off. opsz 14 was picked against the owner's sample sheet.

Needs fonttools and uharfbuzz (development only). Run from this folder:
    python build-brand-fraunces.py
"""
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
import io
import uharfbuzz as hb

AXES = {"wght": 500, "opsz": 14, "SOFT": 0, "WONK": 0}

instance = instancer.instantiateVariableFont(TTFont("Fraunces-Variable.ttf"), AXES)
data = io.BytesIO(); instance.save(data); data = data.getvalue()
font = TTFont(io.BytesIO(data)); glyphs = font.getGlyphSet()
shaper = hb.Font(hb.Face(hb.Blob(data)))


def outline(text):
    """Path data in font units (y up) and its bounds, laid out with kerning."""
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
    hb.shape(shaper, buf, {"kern": True, "liga": True})
    x = 0; parts = []; bb = [1e9, 1e9, -1e9, -1e9]
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        name = font.getGlyphName(info.codepoint); move = (1, 0, 0, 1, x + pos.x_offset, pos.y_offset)
        pen = SVGPathPen(glyphs); glyphs[name].draw(TransformPen(pen, move)); parts.append(pen.getCommands())
        bounds = BoundsPen(glyphs); glyphs[name].draw(TransformPen(bounds, move))
        if bounds.bounds:
            b = bounds.bounds; bb = [min(bb[0], b[0]), min(bb[1], b[1]), max(bb[2], b[2]), max(bb[3], b[3])]
        x += pos.x_advance
    return " ".join(parts), bb


def svg(d, bb, pad, label):
    x0, y0, x1, y1 = bb; w = x1 - x0 + 2 * pad; h = y1 - y0 + 2 * pad
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" role="img" aria-label="{label}">\n'
            f'  <path fill="currentColor" transform="translate({pad - x0:.1f} {pad + y1:.1f}) scale(1 -1)" d="{d}"/>\n</svg>\n')


word, word_bb = outline("Apunta")
mark, mark_bb = outline("A")
open("apunta-wordmark.fraunces.currentcolor.svg", "w").write(svg(word, word_bb, 40, "Apunta"))
open("apunta-a.fraunces.currentcolor.svg", "w").write(svg(mark, mark_bb, 20, "Apunta"))
