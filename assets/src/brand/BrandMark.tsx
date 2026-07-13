// Suikou brand seal: the app-icon 阴阳 mark rendered inline as vector text so it
// scales crisp and needs no network font. Colors are the fixed brand vermilion
// (not theme accent) so the mark reads identically in every theme, matching the
// favicon / PWA icon. Source of truth for the raster icon lives in
// assets/brand/icon.html.
const YIN = "#b3462f" // inked vermilion field
const YANG = "#f7efe8" // paper-light field

const COLS: [string, string][] = [
  ["す", "い"], // 阴刻: light glyphs on the inked half
  ["こ", "う"], // 阳刻: vermilion glyphs on the light half
]

export const BRAND_SERIF = '"Hina Mincho", "Hiragino Mincho ProN", "Yu Mincho", serif'

export function BrandMark({ size = 44, radius = 12 }: { size?: number; radius?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 overflow-hidden"
      style={{ width: size, height: size, borderRadius: radius, fontFamily: BRAND_SERIF }}
    >
      {COLS.map(([top, bottom], i) => {
        const yin = i === 0
        return (
          <span
            key={i}
            className="flex flex-1 flex-col items-center justify-center"
            style={{
              background: yin ? YIN : YANG,
              color: yin ? YANG : YIN,
              fontSize: size * 0.34,
              lineHeight: 1,
            }}
          >
            <span>{top}</span>
            <span>{bottom}</span>
          </span>
        )
      })}
    </span>
  )
}
