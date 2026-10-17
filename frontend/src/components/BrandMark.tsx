/** Знак MoverMate из макета: контурная коробка (цвет берётся из текста). */
export default function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M11.46 7.552L18 4.5L31.5 10.8V26.1L18 32.4L4.5 26.1V10.8L11.46 7.552ZM4.5 10.8L18 18M11.46 7.552L10.8 7.2M11.46 7.552L24.3 14.4M31.5 10.8L18 18M18 32.4V18" />
    </svg>
  )
}
