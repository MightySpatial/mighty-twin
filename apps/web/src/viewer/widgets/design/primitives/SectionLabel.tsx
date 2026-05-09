/** Small uppercase tracking-wide label that sits above grouped controls.
 *  Mirrors v1's `.flabel` / `.export-section-label` typography. */
export default function SectionLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label className="dw-section-label" htmlFor={htmlFor}>
      {children}
    </label>
  )
}
