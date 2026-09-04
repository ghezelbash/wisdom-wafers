# Dananeh brand assets

Production-ready exports derived from the selected symbol in
`../../Concept-Logo.jpeg`. The mark was traced from the selected artwork rather
than regenerated, so its geometry remains the approved design while JPEG noise
and surrounding presentation text are removed.

## Source files

- `dananeh-symbol.svg` — canonical symbol master, transparent, primary green.
- `dananeh-wordmark-fa.svg` — outlined Persian wordmark; no external font needed.
- `dananeh-wordmark-en.svg` — outlined Latin wordmark; no external font needed.
- `dananeh-lockup-fa-horizontal.svg` — symbol and Persian wordmark.
- `dananeh-lockup-fa-stacked.svg` — stacked symbol and Persian wordmark.
- `dananeh-lockup-en-horizontal.svg` — symbol and Latin wordmark.

Do not add guillemets around the wordmark. `دانانه` is the brand; `«…»` is
editorial punctuation, not part of the logo.

## App exports

| File | Use |
| --- | --- |
| `app-icon-1024.png` | Primary Expo/iOS icon; opaque growth-green canvas |
| `app-icon-warm-1024.png` | Approved alternate icon on warm canvas |
| `android-adaptive-foreground.png` | Android adaptive icon foreground |
| `android-adaptive-monochrome.png` | Android 13+ themed icon mask |
| `splash-icon.png` | Light splash artwork on transparency |
| `splash-icon-dark.png` | Dark splash artwork on transparency |
| `notification-icon.png` | Android notification glyph, 96x96 white on transparency |
| `favicon.png` | Web favicon master |
| `dananeh-symbol-1024.png` | Transparent raster symbol master |

The adaptive foreground intentionally keeps the symbol within the central safe
zone so OEM masks can crop the outer canvas without touching the mark.

## Core colours

- Primary green: `#2F6D4B`
- Growth green: `#65A96B`
- Dark-mode green: `#77B98A`
- Warm canvas: `#F7F4EA`
- Dark canvas: `#171A17`
- Warm white: `#FFFDF7`

Keep the clear space around a standalone mark at least equal to the diameter of
its central seed. Do not stretch, mirror, rotate, add shadows, bake rounded
corners into an app icon, or place text inside raster artwork.
