# Clinical reference PDFs

The owner's three publicly available reference guides, kept in Git so a
rebuilt machine has them. They contain no client information.

| File | SHA-256 | Used by |
| --- | --- | --- |
| `Interventions Cheat Sheet for Notes.pdf` | `fb81b504371e6da070ec0c03e160c5bd7da4406e95db994f5e1b9269d45b7168` | Q3 approach suggestions: the nine page-1 headings are the approach names in `shared/src/clinical-guidance.ts` |
| `MSE examples.pdf` | `f3d3c486a1c40dc2ab8794d904e288523ee1bff8c4259a2d136807efb849c3c0` | Mental-status wording reference behind the Client presentation guidance |
| `Presentation_MSE_.pdf` | `0646e99ba3fd17f3f306e0527de7aaf8613cd25848ac2b1861ec776b7d3f92ce` | Presentation/MSE domains and phrasing behind `PRESENTATION_MSE_DOMAINS` |

The app never reads these files at runtime: their content was distilled into
code and instructions. They are source material for review and for any future
change to that guidance. If the owner updates a guide, replace the file here,
update its hash, and re-check `shared/src/clinical-guidance.ts` against it.
These are not Halaxy exports; real Halaxy PDFs never go in Git.
