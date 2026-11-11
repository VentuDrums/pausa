import type { Segmento } from '../types'

/** Extrae el audio de un archivo de vídeo/audio a 16 kHz mono, que es lo que necesita Whisper. */
export async function extraerAudio(archivo: File): Promise<Float32Array> {
  const datos = await archivo.arrayBuffer()
  const contexto = new AudioContext({ sampleRate: 16000 })
  try {
    const audio = await contexto.decodeAudioData(datos)
    if (audio.numberOfChannels === 1) return audio.getChannelData(0).slice()
    const mezcla = new Float32Array(audio.length)
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const canal = audio.getChannelData(c)
      for (let i = 0; i < canal.length; i++) mezcla[i] += canal[i] / audio.numberOfChannels
    }
    return mezcla
  } finally {
    contexto.close()
  }
}

type Trozo = { timestamp: [number, number | null]; text: string }

/**
 * Transcribe en un "worker" (un hilo aparte) para que la página no se congele.
 * Al terminar se cierra y libera la memoria, dejando sitio al modelo que escribe las preguntas.
 */
export function transcribir(
  audio: Float32Array,
  idioma: 'spanish' | 'english',
  alAvanzar: (texto: string, proporcion?: number) => void,
): Promise<Segmento[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' })
    const descargas = new Map<string, { cargado: number; total: number }>()
    const dispositivo = 'gpu' in navigator ? 'webgpu' : 'wasm'

    worker.onmessage = (e: MessageEvent) => {
      const m = e.data
      if (m.tipo === 'progreso') {
        const p = m.p
        if (p.status === 'progress' && p.file && p.total) {
          descargas.set(p.file, { cargado: p.loaded, total: p.total })
          let cargado = 0
          let total = 0
          descargas.forEach((d) => { cargado += d.cargado; total += d.total })
          alAvanzar('Descargando el modelo que transcribe (solo la primera vez)', total ? cargado / total : undefined)
        }
      } else if (m.tipo === 'estado') {
        alAvanzar(m.texto)
      } else if (m.tipo === 'hecho') {
        worker.terminate()
        const trozos = m.trozos as Trozo[]
        resolve(
          trozos
            .map((t) => ({
              inicio: t.timestamp[0] ?? 0,
              fin: t.timestamp[1] ?? (t.timestamp[0] ?? 0) + 5,
              texto: t.text.trim(),
            }))
            .filter((s) => s.texto.length > 0),
        )
      } else if (m.tipo === 'error') {
        worker.terminate()
        reject(new Error(m.mensaje))
      }
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(e.message || 'No se pudo iniciar la transcripción'))
    }
    worker.postMessage({ audio, idioma, dispositivo }, [audio.buffer])
  })
}
