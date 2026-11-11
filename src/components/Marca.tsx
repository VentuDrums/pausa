/** Logotipo: dos barras de pausa sobre una línea de tiempo con un trazo de fosforito. */
export function Marca({ className = '' }: { className?: string }) {
  return (
    <a href="#/" className={`inline-flex items-center gap-2.5 font-display text-xl font-extrabold text-tinta ${className}`}>
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#1B2B26" />
        <rect x="5" y="22" width="22" height="3" rx="1.5" fill="#5E7A70" />
        <rect x="16" y="19" width="6" height="9" rx="1.5" fill="#F4C430" transform="rotate(-8 19 23)" />
        <rect x="10" y="6" width="4" height="11" rx="1" fill="#EEF2F0" />
        <rect x="18" y="6" width="4" height="11" rx="1" fill="#EEF2F0" />
      </svg>
      Pausa
    </a>
  )
}
