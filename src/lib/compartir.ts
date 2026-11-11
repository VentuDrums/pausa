import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { Actividad, PreguntaEditable } from '../types'
import type { FuenteVideo } from './video'

/**
 * La actividad entera viaja comprimida dentro del enlace (después de #),
 * así no hace falta ningún servidor ni base de datos. Lo que va tras # no se envía
 * a ningún servidor: solo lo lee el navegador del alumno.
 */
export function crearEnlace(
  actividad: Omit<Actividad, 'v' | 'preguntas' | 'videoId' | 'archivo'> & { fuente: FuenteVideo; preguntas: PreguntaEditable[] },
): string {
  const { fuente } = actividad
  const datos: Actividad = {
    v: 1,
    videoId: fuente.tipo === 'youtube' ? fuente.id : '',
    ...(fuente.tipo === 'archivo' ? { archivo: { url: fuente.url, servicio: fuente.servicio } } : {}),
    titulo: actividad.titulo.trim(),
    emailProfesor: actividad.emailProfesor.trim(),
    preguntas: [...actividad.preguntas]
      .sort((a, b) => a.tiempo - b.tiempo)
      .map(({ id, tiempo, tipo, enunciado, opciones, correcta, explicacion }) => ({
        id, tiempo: Math.round(tiempo * 10) / 10, tipo, enunciado, opciones, correcta, explicacion,
      })),
  }
  const base = `${location.origin}${location.pathname}`
  return `${base}#/ver/${compressToEncodedURIComponent(JSON.stringify(datos))}`
}

export function leerActividad(codigo: string): Actividad | null {
  try {
    const json = decompressFromEncodedURIComponent(codigo)
    if (!json) return null
    const datos = JSON.parse(json) as Actividad
    if (datos.v !== 1 || !(datos.videoId || datos.archivo?.url) || !Array.isArray(datos.preguntas)) return null
    datos.preguntas.sort((a, b) => a.tiempo - b.tiempo)
    return datos
  } catch {
    return null
  }
}

/** De dónde sale el vídeo de una actividad ya creada. */
export function fuenteDeActividad(a: Actividad): FuenteVideo {
  return a.archivo ? { tipo: 'archivo', url: a.archivo.url, servicio: a.archivo.servicio } : { tipo: 'youtube', id: a.videoId }
}
