import type { Segmento } from '../types'
import { leerTiempo } from './tiempo'

const SOLO_TIEMPO = /^(\d{1,2}:)?\d{1,2}:\d{2}$/
const RANGO_SUBTITULOS = /^([\d:.,]+)\s*-->\s*([\d:.,]+)/
// La transcripción de YouTube incluye la lectura del tiempo para lectores de pantalla ("1 minuto, 5 segundos").
// Al copiarla, a veces queda en su propia línea y a veces pegada al tiempo y al texto: "0:077 segundosrecuerdo que..."
const UNIDAD = '(?:horas?|minutos?|segundos?|hours?|minutes?|seconds?)'
const LECTURA = `(?:\\d+\\s*${UNIDAD}(?:\\s*(?:,|y|and)\\s*)?)+`
const LECTURA_ACCESIBLE = new RegExp(`^${LECTURA}$`, 'i')
const TIEMPO_Y_TEXTO = new RegExp(`^((?:\\d{1,2}:)?\\d{1,2}:\\d{2})\\s*(?:${LECTURA})?\\s*(.*)$`, 'i')

/**
 * Lee lo que el profesor pega: la transcripción copiada de YouTube
 * ("0:05" en una línea y el texto en la siguiente, o ambos en la misma línea)
 * o un archivo de subtítulos .srt / .vtt.
 */
export function leerTranscripcion(texto: string): Segmento[] {
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const brutos: { inicio: number; fin?: number; texto: string }[] = []
  let actual: (typeof brutos)[number] | null = null

  for (const linea of lineas) {
    if (/^WEBVTT/i.test(linea) || /^\d+$/.test(linea) || LECTURA_ACCESIBLE.test(linea)) continue

    const rango = linea.match(RANGO_SUBTITULOS)
    if (rango) {
      const inicio = leerTiempo(rango[1])
      if (inicio !== null) {
        actual = { inicio, fin: leerTiempo(rango[2]) ?? undefined, texto: '' }
        brutos.push(actual)
      }
      continue
    }
    if (SOLO_TIEMPO.test(linea)) {
      actual = { inicio: leerTiempo(linea)!, texto: '' }
      brutos.push(actual)
      continue
    }
    const tiempoYTexto = linea.match(TIEMPO_Y_TEXTO)
    if (tiempoYTexto) {
      actual = { inicio: leerTiempo(tiempoYTexto[1])!, texto: tiempoYTexto[2] }
      brutos.push(actual)
      continue
    }
    if (actual) actual.texto = `${actual.texto} ${linea}`.trim()
  }

  const limpios = brutos
    .map((s) => ({ ...s, texto: s.texto.replace(/<[^>]+>/g, '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim() }))
    .filter((s) => s.texto.length > 0)
    .sort((a, b) => a.inicio - b.inicio)

  return limpios.map((s, i) => ({
    inicio: s.inicio,
    fin: s.fin ?? limpios[i + 1]?.inicio ?? s.inicio + 5,
    texto: s.texto,
  }))
}

/**
 * Divide la transcripción en fragmentos de unos `segundos` de duración.
 * De cada fragmento saldrá una pregunta. Si el último es muy corto, se une al anterior.
 */
export function dividirEnFragmentos(segmentos: Segmento[], segundos: number): Segmento[][] {
  const fragmentos: Segmento[][] = []
  let actual: Segmento[] = []
  for (const s of segmentos) {
    actual.push(s)
    if (s.fin - actual[0].inicio >= segundos) {
      fragmentos.push(actual)
      actual = []
    }
  }
  if (actual.length) {
    const duracion = actual[actual.length - 1].fin - actual[0].inicio
    if (fragmentos.length && duracion < segundos / 2) fragmentos[fragmentos.length - 1].push(...actual)
    else fragmentos.push(actual)
  }
  return fragmentos
}
