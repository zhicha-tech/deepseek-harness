/**
 * Pingshun Buddy brand artwork: the sidebar/hero brand mark, the brand
 * name, and the favicon replacement used while Buddy mode is active.
 *
 * The components are slot occupants, so they accept the owner props the
 * framework passes (`size`, optional hero `className`) and render
 * self-contained markup; no native class may be relied on.
 *
 * @module
 */
import type { CSSProperties } from 'react'

/** Brand display name used in the sidebar and the document title. */
export const BRAND_NAME = '平顺 Buddy'

/** Raw SVG body shared by the inline mark and the favicon data URL. */
const MARK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
  + '<rect x="4" y="4" width="56" height="56" rx="14" fill="#1f6feb"/>'
  + '<path d="M20 40 L32 18 L44 40" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'
  + '<circle cx="32" cy="46" r="4" fill="#ffffff"/>'
  + '</svg>'

/** Self-contained favicon href; no bundle asset route is needed. */
export const FAVICON_HREF = `data:image/svg+xml,${encodeURIComponent(MARK_SVG)}`

/** Props of the brand mark slot occupants (sidebar + hero shapes unioned). */
export interface BrandMarkProps {
  /** Requested square edge in pixels. */
  size: number
  /** Host class preserving the surrounding mark geometry (hero slot). */
  className?: string | undefined
}

/** The Pingshun Buddy mark: blue rounded square with the mountain glyph. */
export function BrandMark({ size, className }: BrandMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={BRAND_NAME}
    >
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#1f6feb" />
      <path
        d="M20 40 L32 18 L44 40"
        fill="none"
        stroke="#ffffff"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="46" r="4" fill="#ffffff" />
    </svg>
  )
}

const nameStyle: CSSProperties = { fontWeight: 600 }

/** The brand name rendered inside the sidebar's brand-name container. */
export function BrandName() {
  return <span style={nameStyle}>{BRAND_NAME}</span>
}

/** Hero-slot adapter: accepts the hero owner's className alongside size. */
export function HeroBrandMark({ size, className }: BrandMarkProps) {
  return <BrandMark size={size} className={className} />
}
