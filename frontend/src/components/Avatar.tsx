/** Кружок с первыми буквами логина: фото не храним, поэтому аватар собирается из имени. */
export default function Avatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  const initials = name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '?'
  return <span className={`avatar avatar--${size}`} aria-hidden>{initials}</span>
}
