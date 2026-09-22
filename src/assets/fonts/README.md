# fonts

## Purpose

Fonts bundled for server-side label rendering (`src/lib/label-raster.ts`).
They are registered by path at runtime because Vercel's Node runtime ships
no usable system fonts: without this, every label would render blank boxes.

## Contents

- `NotoSans-Regular.ttf` / `NotoSans-Bold.ttf` — Noto Sans (Latin), the
  primary faces. Source:
  `https://github.com/notofonts/notofonts.github.io/raw/main/fonts/NotoSans/googlefonts/ttf/`.
- `NotoSansSC-Regular.otf` — Noto Sans Simplified Chinese, the fallback
  face. Listed after the Latin family in every font string the rasterizer
  builds, so a Chinese customer name prints instead of coming out blank.
  Source: `https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/SC/`.
  It is the largest file in the repo (about 8 MB); it is the subset OTF,
  not the full CJK collection.

All three are SIL Open Font License 1.1. There is no bold CJK face: a
Chinese name renders in the regular weight, which is acceptable at label
size and saves another 8 MB.

## Connectivity

Read only by `src/lib/label-raster.ts`, which registers them once per
process under the internal family names `PrintkitLabel`,
`PrintkitLabelBold` and `PrintkitLabelCJK`.

## Parent

See the repo root [README.md](../../../README.md) for the full layout.
