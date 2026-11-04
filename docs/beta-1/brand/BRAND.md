# Townlight brand package — Open Hall

Scott selected Open Hall as the Townlight identity on 4 November 2026.
The town hall and gold doorway are the principal mark. Use **Townlight**,
one word with a capital T, in running text. The tagline is:
**Municipal software cities can actually own.**

## Package and uses

| Asset | Use |
| --- | --- |
| `svg/townlight-hall-lockup.svg` | Primary logo on light backgrounds |
| `svg/townlight-hall-lockup-reversed.svg` | Primary logo on dark backgrounds |
| `svg/townlight-hall-lockup-tagline.svg` and `-reversed.svg` | Large page headers and title treatments |
| `svg/townlight-hall-lockup-mono-black.svg` and `-mono-white.svg` | One-color reproduction |
| `svg/townlight-hall-mark.svg`, reversed and mono variants | Standalone symbol, 32 pixels and above |
| `svg/townlight-hall-mark-small.svg` | Simplified symbol for 16–31 pixels |
| `svg/townlight-hall-app-icon.svg` | Square icon artwork, reserved for a subsequent software update |
| `svg/townlight-hall-social-preview.svg` | Social preview artwork |
| `png/` | Raster lockups, marks, square icons, social preview and 16/32/48 pixel favicons |
| `favicon.svg`, `favicon.ico` | Browser icons; the SVG adapts to light and dark color schemes |
| `tokens/` | Supplied palette and type references; `../tokens.css` remains the suite token authority |
| `licenses/Source-Serif-4-OFL.txt` | License for the Source Serif 4 type used in the outlined wordmark |

SVG wordmarks are outlines and require no installed font. The type references
are Source Serif 4 SemiBold for the wordmark and Inter for body text; no font
binaries are included. Keep the font license with the package. Owned artwork
is distributed under the repository's existing license; brand use does not
imply endorsement.

## Colors and reproduction

| Color | Hex | Use |
| --- | --- | --- |
| Navy | `#1A3A52` | Primary mark and wordmark |
| Dark navy | `#122A3D` | Reversed background and square icon |
| Gold | `#B08A2E` | Lit doorway; accent shapes, not small text |
| Dark gold | `#8A6A1F` | Gold text on paper |
| Paper | `#FAF8F3` | Light background and reversed mark |
| Ink | `#1A2330` | Body text |
| Secondary ink | `#3A4554` | Tagline on light backgrounds |
| Soft navy | `#E6EDF3` | Tagline on dark backgrounds |

Allow clear space of half the symbol's height around the logo. Use the plain
lockup at least 120 pixels or 30 mm wide; use a larger width for the tagline
and verify that it remains readable at the final size. Never compress the
tagline to the plain lockup minimum. Do not stretch, rotate, add effects,
rearrange the wordmark and symbol, or recolor the doorway. Use the matching
reversed artwork on dark backgrounds and mono artwork for one-color output.
Standalone CivicCast keeps its separate identity and palette.

## Documentation integration and maintenance

This directory is the canonical package in `townlight/townlight`. The public
documentation mirrors it at `https://townlight.github.io/brand/`; the Suite
documentation snapshot mirrors it in `docs/beta-1/brand/`. Keep these copies
and their downloadable ZIP identical when updating the package. GitHub READMEs
use the light and reversed lockups through a `picture` element.

`Townlight-Open-Hall-Brand.zip` contains the package without a nested copy of
itself. `SHA256SUMS` covers its contents; `Townlight-Open-Hall-Brand.zip.sha256`
covers the ZIP. `PROVENANCE.json` records the supplied artwork hashes. The SVG
favicon alone was repaired: its missing color classes and dark-mode rules
were restored, and the superseded content-credential metadata was omitted.
Other supplied logo artwork is unchanged.

The November 2026 adoption updates documentation only. The released Windows
MSI, its source companion, historical documentation and acceptance receipts
retain their original bytes and identity. Desktop, installer and runtime
branding will be integrated in the next software update. The supplied square
artwork is ready for that work; it is not evidence of a changed installer.
