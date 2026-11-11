/* eslint-disable @typescript-eslint/no-explicit-any */

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

let promesaApi: Promise<any> | null = null

export function cargarApiYouTube(): Promise<any> {
  const w = window as any
  if (w.YT?.Player) return Promise.resolve(w.YT)
  if (!promesaApi) {
    promesaApi = new Promise((resolve) => {
      const anterior = w.onYouTubeIframeAPIReady
      w.onYouTubeIframeAPIReady = () => {
        anterior?.()
        resolve(w.YT)
      }
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(script)
    })
  }
  return promesaApi
}
