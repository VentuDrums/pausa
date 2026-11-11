import { useEffect, useRef } from 'react'
import { crearReproductorYouTube, type ReproductorYT } from '../lib/youtube'

type Props = {
  videoId: string
  alEstarListo?: (reproductor: ReproductorYT) => void
  alCambiarEstado?: (estado: number) => void
  /** Impide usar el teclado para adelantar (modo alumno). */
  bloquearTeclado?: boolean
}

/** Reproductor de YouTube en modo de privacidad mejorada, con el tamaño 16:9 del contenedor. */
export function ReproductorYouTube({ videoId, alEstarListo, alCambiarEstado, bloquearTeclado }: Props) {
  const caja = useRef<HTMLDivElement>(null)
  const avisos = useRef({ alEstarListo, alCambiarEstado })
  avisos.current = { alEstarListo, alCambiarEstado }

  useEffect(() => {
    const contenedor = caja.current
    if (!contenedor) return
    const reproductor = crearReproductorYouTube(contenedor, {
      videoId,
      bloquearTeclado,
      alEstarListo: (r) => avisos.current.alEstarListo?.(r),
      alCambiarEstado: (e) => avisos.current.alCambiarEstado?.(e),
    })
    return () => reproductor.destroy()
  }, [videoId, bloquearTeclado])

  return <div ref={caja} className="absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full" />
}
