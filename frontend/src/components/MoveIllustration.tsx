/** Иллюстрация для экрана нового переезда: коробки, грузовичок и растение (не перекрывают друг друга). Рисуется в браузере, без картинок с внешних сайтов. */
export default function MoveIllustration() {
  return (
    <svg viewBox="0 0 330 130" className="move-art" role="img" aria-label="Грузовик с коробками">
      <ellipse cx="166" cy="118" rx="154" ry="7" fill="#0A2E26" opacity=".07" />
      {/* грузовик */}
      <rect x="70" y="38" width="120" height="66" rx="8" fill="#E8F3EE" stroke="#0F382F" strokeWidth="2.5" />
      <path d="M118 58l12-8 12 8v14h-24z" fill="#B8E3D2" stroke="#0F382F" strokeWidth="2" strokeLinejoin="round" />
      <path d="M190 56h28l18 22v26h-46z" fill="#3E8A6F" stroke="#0F382F" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M198 63h17l11 14h-28z" fill="#DCEFF7" stroke="#0F382F" strokeWidth="2" strokeLinejoin="round" />
      <rect x="64" y="98" width="178" height="8" rx="4" fill="#0F382F" />
      <circle cx="102" cy="108" r="12" fill="#2A3B37" /><circle cx="102" cy="108" r="5" fill="#E8F3EE" />
      <circle cx="208" cy="108" r="12" fill="#2A3B37" /><circle cx="208" cy="108" r="5" fill="#E8F3EE" />
      {/* коробки */}
      <g stroke="#7A4E1E" strokeWidth="2" strokeLinejoin="round">
        <rect x="18" y="84" width="34" height="30" rx="3" fill="#E9B872" />
        <rect x="24" y="58" width="28" height="26" rx="3" fill="#F2C98B" />
        <path d="M35 84v10M38 58v8" fill="none" />
      </g>
      {/* растение */}
      <path d="M292 104h18l-3 -18h-12z" fill="#D9825B" stroke="#7A3E22" strokeWidth="2" strokeLinejoin="round" />
      <g fill="#3FA77F" stroke="#1D5E46" strokeWidth="1.6">
        <path d="M301 86c-2-14 2-26 8-34-1 12-2 22-8 34z" />
        <path d="M300 86c-8-8-14-18-14-30 7 7 12 17 14 30z" />
        <path d="M302 86c6-10 14-15 22-16-5 8-12 13-22 16z" />
      </g>
    </svg>
  )
}
