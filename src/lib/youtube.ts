/** Acepta enlaces de youtube.com, youtu.be, shorts, embed, live o el ID suelto. */
export function extraerIdYouTube(texto: string): string | null {
  const t = texto.trim()
  if (/^[\w-]{11}$/.test(t)) return t
  const m = t.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/)
  return m ? m[1] : null
}

export type ReproductorYT = {
  playVideo(): void
  pauseVideo(): void
  seekTo(segundos: number, permitirBusqueda: boolean): void
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
  getVideoData(): { title?: string }
  destroy(): void
}

export const ESTADO_YT = { TERMINADO: 0, REPRODUCIENDO: 1, PAUSADO: 2 } as const

/**
 * Privacidad: el vídeo se inserta desde youtube-nocookie.com (modo de privacidad mejorada de YouTube)
 * y NO se carga la librería oficial de control (www.youtube.com/iframe_api), que se descarga de youtube.com
 * con las cookies de Google. En su lugar hablamos con el reproductor con los mismos mensajes que usa esa
 * librería (postMessage), así que ninguna petición sale hacia youtube.com.
 */
export const HOST_YOUTUBE = 'https://www.youtube-nocookie.com'

type Opciones = {
  videoId: string
  bloquearTeclado?: boolean
  alEstarListo: (r: ReproductorYT) => void
  alCambiarEstado: (estado: number) => void
}

export function crearReproductorYouTube(contenedor: HTMLElement, { videoId, bloquearTeclado, alEstarListo, alCambiarEstado }: Opciones): ReproductorYT {
  const parametros = new URLSearchParams({
    enablejsapi: '1',
    origin: location.origin,
    widgetid: '1',
    rel: '0',
    playsinline: '1',
    fs: '0',
    disablekb: bloquearTeclado ? '1' : '0',
    hl: 'es',
  })
  const iframe = document.createElement('iframe')
  iframe.src = `${HOST_YOUTUBE}/embed/${videoId}?${parametros}`
  iframe.title = 'Vídeo de YouTube'
  iframe.allow = 'autoplay; encrypted-media; picture-in-picture'
  iframe.referrerPolicy = 'strict-origin-when-cross-origin'
  iframe.style.border = '0'
  contenedor.appendChild(iframe)

  // Lo último que nos ha contado el reproductor.
  let estado = -1
  let tiempo = 0
  let tiempoMarcado = performance.now() // cuándo llegó `tiempo`, para estimar el segundo exacto entre avisos
  let duracion = 0
  let titulo: string | undefined
  let listo = false

  const enviar = (mensaje: object) => iframe.contentWindow?.postMessage(JSON.stringify({ ...mensaje, id: 1, channel: 'widget' }), HOST_YOUTUBE)
  const orden = (func: string, args: unknown[] = []) => enviar({ event: 'command', func, args })

  const reproductor: ReproductorYT = {
    playVideo: () => orden('playVideo'),
    pauseVideo: () => {
      orden('pauseVideo')
      // Anotamos la pausa ya: el aviso del reproductor tarda unos milisegundos en llegar.
      tiempo = reproductor.getCurrentTime()
      tiempoMarcado = performance.now()
      estado = ESTADO_YT.PAUSADO
    },
    seekTo: (s, permitir) => {
      orden('seekTo', [s, permitir])
      tiempo = s
      tiempoMarcado = performance.now()
    },
    getCurrentTime: () => {
      if (estado !== ESTADO_YT.REPRODUCIENDO) return tiempo
      const estimado = tiempo + (performance.now() - tiempoMarcado) / 1000
      return duracion ? Math.min(estimado, duracion) : estimado
    },
    getDuration: () => duracion,
    getPlayerState: () => estado,
    getVideoData: () => ({ title: titulo }),
    destroy: () => {
      window.removeEventListener('message', alRecibir)
      clearInterval(llamada)
      iframe.remove()
    },
  }

  function cambiarEstado(nuevo: number) {
    if (nuevo === estado) return
    estado = nuevo
    alCambiarEstado(nuevo)
  }

  function alRecibir(e: MessageEvent) {
    if (e.origin !== HOST_YOUTUBE || e.source !== iframe.contentWindow) return
    let datos: { event?: string; info?: any } // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      datos = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
    } catch {
      return
    }
    const info = datos.info
    if ((datos.event === 'infoDelivery' || datos.event === 'initialDelivery') && info) {
      if (typeof info.currentTime === 'number') {
        tiempo = info.currentTime
        tiempoMarcado = performance.now()
      }
      if (typeof info.duration === 'number' && info.duration > 0) duracion = info.duration
      if (info.videoData?.title) titulo = info.videoData.title
      if (typeof info.playerState === 'number') cambiarEstado(info.playerState)
    } else if (datos.event === 'onStateChange' && typeof info === 'number') {
      cambiarEstado(info)
    } else if (datos.event === 'onReady' && !listo) {
      listo = true
      clearInterval(llamada)
      // La duración llega en los primeros avisos; esperamos un instante para darla ya correcta.
      setTimeout(() => alEstarListo(reproductor), 300)
    }
  }
  window.addEventListener('message', alRecibir)

  // El reproductor solo empieza a enviar avisos cuando sabe que alguien escucha: se lo repetimos hasta que conteste.
  const llamada = setInterval(() => enviar({ event: 'listening' }), 250)
  iframe.addEventListener('load', () => enviar({ event: 'listening' }))

  return reproductor
}
