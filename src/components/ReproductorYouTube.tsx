/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from 'react'
import { cargarApiYouTube, type ReproductorYT } from '../lib/youtube'

type Props = {
  videoId: string
  alEstarListo?: (reproductor: ReproductorYT) => void
  alCambiarEstado?: (estado: number) => void
  /** Impide usar el teclado para adelantar (modo alumno). */
  bloquearTeclado?: boolean
}

/** Reproductor oficial de YouTube (IFrame API) con el tamaño 16:9 del contenedor. */
export function ReproductorYouTube({ videoId, alEstarListo, alCambiarEstado, bloquearTeclado }: Props) {
  const caja = useRef<HTMLDivElement>(null)
  const avisos = useRef({ alEstarListo, alCambiarEstado })
  avisos.current = { alEstarListo, alCambiarEstado }

  useEffect(() => {
    const contenedor = caja.current
    if (!contenedor) return
    let cancelado = false
    let reproductor: any = null
    const destino = document.createElement('div')
    contenedor.appendChild(destino)

    cargarApiYouTube().then((YT) => {
      if (cancelado) return
      reproductor = new YT.Player(destino, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: { rel: 0, playsinline: 1, fs: 0, modestbranding: 1, disablekb: bloquearTeclado ? 1 : 0, hl: 'es' },
        events: {
          onReady: () => avisos.current.alEstarListo?.(reproductor),
          onStateChange: (e: any) => avisos.current.alCambiarEstado?.(e.data),
        },
      })
    })

    return () => {
      cancelado = true
      try {
        reproductor?.destroy()
      } catch {
        /* el reproductor ya no existe */
      }
      contenedor.innerHTML = ''
    }
  }, [videoId, bloquearTeclado])

  return <div ref={caja} className="absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full" />
}
