import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'

/**
 * Intentos de una actividad hechos EN ESTE NAVEGADOR. Se guardan solo en el dispositivo del alumno
 * (localStorage): no salen de ahí salvo dentro del informe que él mismo envía.
 */
export type Intento = {
  /** Fecha y hora de fin (ISO). */
  fecha: string
  aciertos: number
  total: number
  nombre: string
  grupo: string
  /** id de pregunta -> índice de la opción elegida */
  respuestas: Record<string, number>
  /** false si el alumno lo dejó a medias y empezó de nuevo (los antiguos, sin este campo, están terminados). */
  terminado?: boolean
}

export const estaTerminado = (x: Intento) => x.terminado !== false

/** Intento que el alumno está haciendo ahora: se guarda sobre la marcha para poder retomarlo si recarga. */
export type EnCurso = {
  inicio: string
  nombre: string
  grupo: string
  respuestas: Record<string, number>
  /** Segundo del vídeo por el que iba. */
  tiempo: number
}

const claveEnCurso = (id: string) => `pausa-encurso-v1:${id}`

export function leerEnCurso(id: string): EnCurso | null {
  try {
    const d = JSON.parse(localStorage.getItem(claveEnCurso(id)) ?? 'null')
    return d && typeof d.nombre === 'string' && d.respuestas ? d : null
  } catch {
    return null
  }
}

export function guardarEnCurso(id: string, enCurso: EnCurso) {
  try {
    localStorage.setItem(claveEnCurso(id), JSON.stringify(enCurso))
  } catch {
    /* sin almacenamiento */
  }
}

export function borrarEnCurso(id: string) {
  try {
    localStorage.removeItem(claveEnCurso(id))
  } catch {
    /* sin almacenamiento */
  }
}

/** Huella corta (FNV-1a de 32 bits, en base 36). Sirve para identificar y para detectar cambios, no es cifrado. */
function huella(texto: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

/** Identificador de una actividad a partir de su enlace (el mismo enlace da siempre el mismo id). */
export function idActividad(codigo: string): string {
  return huella(codigo) + huella(`${codigo.length}:${codigo}`)
}

const clave = (id: string) => `pausa-intentos-v1:${id}`

export function leerIntentos(id: string): Intento[] {
  try {
    const datos = JSON.parse(localStorage.getItem(clave(id)) ?? '[]')
    return Array.isArray(datos) ? datos : []
  } catch {
    return []
  }
}

export function guardarIntento(id: string, intento: Intento): Intento[] {
  const todos = [...leerIntentos(id), intento]
  try {
    localStorage.setItem(clave(id), JSON.stringify(todos))
  } catch {
    /* sin almacenamiento (modo privado estricto): el intento solo vale para esta vez */
  }
  return todos
}

/* ---------- Código de comprobación ---------- */

/**
 * Lo que va dentro del código: actividad, alumno e historial de intentos (fecha en minutos, aciertos, total).
 * Si alguien cambia la nota a mano en el PDF o en el correo, el código sigue diciendo la verdad;
 * y si se toca el código, deja de ser válido.
 */
// Cada intento: [minuto, aciertos, total] y, si quedó sin terminar, un cuarto valor con las preguntas respondidas.
type DatosCodigo = { v: 1; a: string; t: string; n: string; g: string; i: ([number, number, number] | [number, number, number, number])[] }

const SAL = 'pausa·informe'

export function crearCodigo(id: string, titulo: string, intentos: Intento[]): string {
  const ultimo = intentos[intentos.length - 1]
  const datos: DatosCodigo = {
    v: 1,
    a: id,
    t: titulo.slice(0, 60),
    n: ultimo?.nombre ?? '',
    g: ultimo?.grupo ?? '',
    // Minutos enteros (truncados, como la hora que muestra el informe).
    i: intentos.map((x) => {
      const minuto = Math.floor(new Date(x.fecha).getTime() / 60000)
      return estaTerminado(x) ? [minuto, x.aciertos, x.total] : [minuto, x.aciertos, x.total, Object.keys(x.respuestas).length]
    }),
  }
  const cuerpo = compressToEncodedURIComponent(JSON.stringify(datos))
  return `${cuerpo}.${huella(SAL + cuerpo)}`
}

export type InformeComprobado = {
  actividad: string
  titulo: string
  nombre: string
  grupo: string
  /** `respondidas` solo existe si el intento quedó sin terminar. */
  intentos: { fecha: Date; aciertos: number; total: number; respondidas?: number }[]
}

/** Devuelve lo que dice el código, o null si no es un código de Pausa o se ha modificado. */
export function leerCodigo(codigo: string): InformeComprobado | null {
  const limpio = codigo.replace(/\s+/g, '')
  const punto = limpio.lastIndexOf('.')
  if (punto < 1) return null
  const cuerpo = limpio.slice(0, punto)
  if (huella(SAL + cuerpo) !== limpio.slice(punto + 1)) return null
  try {
    const d = JSON.parse(decompressFromEncodedURIComponent(cuerpo) ?? '') as DatosCodigo
    if (d.v !== 1 || !Array.isArray(d.i)) return null
    return {
      actividad: d.a,
      titulo: d.t,
      nombre: d.n,
      grupo: d.g,
      intentos: d.i.map(([minutos, aciertos, total, respondidas]) => ({
        fecha: new Date(minutos * 60000),
        aciertos,
        total,
        ...(respondidas !== undefined ? { respondidas } : {}),
      })),
    }
  } catch {
    return null
  }
}

export function notaDe(aciertos: number, total: number): number {
  return total ? Math.round((aciertos / total) * 100) / 10 : 0
}

export function fechaCorta(fecha: Date | string): string {
  return new Date(fecha).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
