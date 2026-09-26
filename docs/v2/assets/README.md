# Brand assets

| File | Use |
| --- | --- |
| `apunta-wordmark.currentcolor.svg` | In-app wordmark (top bar). Colour comes from CSS `color: var(--brand-mark)` |
| `apunta-a.currentcolor.svg` | In-app A mark (home greeting, About, setup). Same colour rule |
| `favicon.svg` | Replaces `web/public/favicon.svg` (24 x 24 tile) |
| `apunta-wordmark.teal.svg`, `apunta-wordmark.white.svg`, `apunta-a.teal.svg` | Fixed-colour exports for docs and the future website |
| `apunta-icon.svg`, `apunta-icon.png` | 1024 px master app icon (Apple 824 px tile grid) |
| `tauri-icons/` | Full Tauri desktop icon set (`icon.icns`, `icon.ico`, PNG sizes); copy to `src-tauri/icons/` |
| `Kalam-Regular.ttf`, `Kalam-OFL.txt` | Source font (SIL Open Font License 1.1). Used only to generate outlines; never bundled into the app |
| `build-brand.py`, `build-brand-v2.py` | Regenerate everything (needs `fonttools`, `uharfbuzz`; `resvg-py` for PNGs; Tauri CLI `icon` command for the set) |

## Rules

- Colours: brand teal `#1f6f63` in light mode, white `#ffffff` in dark mode,
  independent of the user's accent colour. Icon tile `#f6f4ef` with a
  `#e3e0d6` hairline.
- The name always appears as this wordmark (Kalam Regular, level baseline,
  outlines). It is never typed in a font at runtime.
- Known follow-up: a full-bleed Windows icon variant, because the Apple
  padding grid reads small at 16 to 32 px on Windows.
