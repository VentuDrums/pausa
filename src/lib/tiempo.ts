/** 75 -> "1:15", 3725 -> "1:02:05" */
export function formatoTiempo(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const dos = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${dos(m)}:${dos(ss)}` : `${m}:${dos(ss)}`
}

/** "1:15" -> 75, "00:01:02,500" -> 62.5. Devuelve null si no es un tiempo. */
export function leerTiempo(texto: string): number | null {
  const t = texto.trim().replace(',', '.')
  if (!/^(\d+:){0,2}\d+(\.\d+)?$/.test(t)) return null
  return t.split(':').reduce((total, parte) => total * 60 + parseFloat(parte), 0)
}

export function idAleatorio(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID().slice(0, 8)
  return Math.random().toString(36).slice(2, 10)
}
