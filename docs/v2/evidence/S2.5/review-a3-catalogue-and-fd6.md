# S2.5 — attempt 3, reviewer: catalogue symmetry, and FD6 key by key

Reviewer-derived, at `c5a62c8`. Nothing here is read off the implementer's
return; the catalogue figures come from the built `shared/dist` at runtime, so
they count the object the server actually imports.

## Symmetry

```
$ node -e "const m=require('./shared/dist/index.js'); …"
en 737 es 737
en-only []
es-only []
```

**737 keys in each, symmetric, no key on one side only.** The coordinator quoted
727; the ten-key commit `6e77654` landed between their check and mine, and
727 + 10 = 737. Consistent, and the symmetry is what matters.

## The nine attempt-3 keys, both sides, and their placeholder sets

| Key | `en` | `es-MX` |
| --- | --- | --- |
| `chat.change.cleared` | `cleared the {section} section` | `vacié la sección de {section}` |
| `chat.change.shortened` | `shortened the {section} section` | `acorté la sección de {section}` |
| `chat.change.expanded` | `expanded the {section} section` | `amplié la sección de {section}` |
| `chat.change.rewrote` | `rewrote the {section} section` | `reescribí la sección de {section}` |
| `chat.change.addition` | `added "{label}"` | `agregué "{label}"` |
| `chat.change.summary` | `I {changes}.` | `Cambié lo siguiente: {changes}.` |
| `chat.list.last` | `{first} and {last}` | `{first} y {last}` |
| `chat.verdict.alreadySaid` | `The note already said what you asked for.` | `La nota ya decía lo que pediste.` |
| `chat.verdict.noChanges` | `The requested edit produced no changes.` | `La edición que pediste no produjo cambios.` |

**9/9 present in both.** Placeholder sets equal on all nine (`t.test.ts`'s
runtime parity case, in V1, green). **No English shipped as Spanish** — every
`es-MX` value is a real translation, and the two `chat.verdict.*` values are
sentences, not the English bytes. FD2 and FD7 hold.

## FD6, key by key, against the base commit

Base for this comparison is `77767c2` (the parent of attempt 3's code commit
`ccb3dc2`).

| Key | Base literal | Verdict |
| --- | --- | --- |
| `chat.change.cleared` | `` `${verb} the ${name} section` `` with `verb='cleared'` | byte-identical once rendered |
| `chat.change.shortened` | same, `verb='shortened'` | byte-identical |
| `chat.change.expanded` | same, `verb='expanded'` | byte-identical |
| `chat.change.rewrote` | same, `verb='rewrote'` | byte-identical |
| `chat.change.addition` | `` `added "${addition}"` `` | byte-identical |
| `chat.change.summary` | `` `I ${parts.join(' and ')}.` `` | **identical for 1 and 2 parts, DIFFERENT for 3 or more** |
| `chat.list.last` (as `listSections` uses it) | `` `${names.slice(0,-1).join(', ')} and ${last}` `` | byte-identical, comma included |
| `chat.list.last` (as `changeSentence` uses it) | `parts.join(' and ')` | **DIFFERENT for 3 or more parts** |
| `chat.verdict.alreadySaid` | `'The note already said what you asked for.'` | byte-identical |
| `chat.verdict.noChanges` | `'The requested edit produced no changes.'` | byte-identical |

Eight of ten are byte-identical. The two that are not are one defect, and it is
demonstrated by running both versions — see `review-a3-fd6-english.md`.
