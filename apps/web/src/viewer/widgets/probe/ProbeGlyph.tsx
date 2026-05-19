/** Probe glyph — the reticle that follows the pointer during drag-to-activate.
 *  Indigo target lock with concentric rings + a small downward triangle.
 *  Mirrors the rail tile icon at a larger size so the user reads the glyph
 *  as "the same thing they grabbed". */
export function ProbeGlyph() {
  return (
    <svg width="36" height="44" viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="probeCore" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#a5b4fc" />
          <stop offset="100%" stopColor="#6366f1" />
        </radialGradient>
      </defs>
      {/* Outer ring */}
      <circle cx="18" cy="18" r="16" fill="none" stroke="#818cf8" strokeWidth="1.4" opacity="0.55" />
      {/* Middle ring */}
      <circle cx="18" cy="18" r="11" fill="none" stroke="#818cf8" strokeWidth="1.4" opacity="0.75" />
      {/* Inner ring */}
      <circle cx="18" cy="18" r="6" fill="none" stroke="#818cf8" strokeWidth="1.6" />
      {/* Core */}
      <circle cx="18" cy="18" r="3" fill="url(#probeCore)" />
      {/* Crosshair ticks */}
      <line x1="18" y1="0" x2="18" y2="4" stroke="#818cf8" strokeWidth="1.2" />
      <line x1="18" y1="32" x2="18" y2="36" stroke="#818cf8" strokeWidth="1.2" />
      <line x1="0" y1="18" x2="4" y2="18" stroke="#818cf8" strokeWidth="1.2" />
      <line x1="32" y1="18" x2="36" y2="18" stroke="#818cf8" strokeWidth="1.2" />
      {/* Drop arrow */}
      <path d="M14 36 L 22 36 L 18 44 Z" fill="#818cf8" opacity="0.9" />
    </svg>
  )
}
