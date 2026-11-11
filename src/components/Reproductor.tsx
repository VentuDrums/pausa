import { useEffect, useRef, useState } from 'react'
import { ReproductorYouTube } from './ReproductorYouTube'
import { ESTADO_YT, type ReproductorYT } from '../lib/youtube'
import { NOMBRE_SERVICIO, type FuenteVideo } from '../lib/video'

type Props = {
  fuente: FuenteVideo
  alEstarListo?: (reproductor: ReproductorYT) => void
  alCambiarEstado?: (estado: number) => void
  /** Modo alumno: sin teclado para adelantar, sin pantalla completa ni descarga. */
  modoAlumno?: boolean
}

/** Reproduce el vídeo de la actividad, venga de YouTube o de un archivo en la nube. */
export function Reproductor({ fuente, alEstarListo, alCambiarEstado, modoAlumno }: Props) {
  if (fuente.tipo === 'youtube') {
    return <ReproductorYouTube videoId={fuente.id} alEstarListo={alEstarListo} alCambiarEstado={alCambiarEstado} bloquearTeclado={modoAlumno} />
  }
  return <ReproductorArchivo key={fuente.url} fuente={fuente} alEstarListo={alEstarListo} alCambiarEstado={alCambiarEstado} modoAlumno={modoAlumno} />
}

function ReproductorArchivo({
  fuente,
  alEstarListo,
  alCambiarEstado,
  modoAlumno,
}: Props & { fuente: Extract<FuenteVideo, { tipo: 'archivo' }> }) {
  const video = useRef<HTMLVideoElement>(null)
  const avisos = useRef({ alEstarListo, alCambiarEstado })
  avisos.current = { alEstarListo, alCambiarEstado }
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    const v = video.current
    if (!v) return
    // Imita la API del reproductor de YouTube para que alumno y profesor funcionen igual con los dos.
    const reproductor: ReproductorYT = {
      playVideo: () => void v.play().catch(() => {}),
      pauseVideo: () => v.pause(),
      seekTo: (s) => { v.currentTime = s },
      getCurrentTime: () => v.currentTime,
      getDuration: () => (Number.isFinite(v.duration) ? v.duration : 0),
      getPlayerState: () => (v.ended ? ESTADO_YT.TERMINADO : v.paused ? ESTADO_YT.PAUSADO : ESTADO_YT.REPRODUCIENDO),
      getVideoData: () => ({}),
      destroy: () => {},
    }
    const listo = () => avisos.current.alEstarListo?.(reproductor)
    const reproduciendo = () => avisos.current.alCambiarEstado?.(ESTADO_YT.REPRODUCIENDO)
    const pausado = () => { if (!v.ended) avisos.current.alCambiarEstado?.(ESTADO_YT.PAUSADO) }
    const terminado = () => avisos.current.alCambiarEstado?.(ESTADO_YT.TERMINADO)
    const error = () => setFallo(true)
    v.addEventListener('loadedmetadata', listo)
    v.addEventListener('play', reproduciendo)
    v.addEventListener('pause', pausado)
    v.addEventListener('ended', terminado)
    v.addEventListener('error', error)
    if (v.readyState >= 1) listo()
    // Si el enlace falla muy deprisa, el error puede llegar antes de que estemos escuchando.
    if (v.error) setFallo(true)
    return () => {
      v.removeEventListener('loadedmetadata', listo)
      v.removeEventListener('play', reproduciendo)
      v.removeEventListener('pause', pausado)
      v.removeEventListener('ended', terminado)
      v.removeEventListener('error', error)
    }
  }, [fuente.url])

  // En modo alumno, las teclas de flecha no adelantan el vídeo.
  function teclas(e: React.KeyboardEvent) {
    if (modoAlumno && ['ArrowRight', 'ArrowLeft', 'End', 'Home'].includes(e.key)) e.preventDefault()
  }

  return (
    <div className="absolute inset-0">
      <video
        ref={video}
        src={fuente.url}
        className="h-full w-full bg-tinta"
        controls
        playsInline
        preload="metadata"
        controlsList={modoAlumno ? 'nodownload nofullscreen noplaybackrate' : 'nodownload'}
        disablePictureInPicture
        onKeyDown={teclas}
        onError={() => setFallo(true)}
      />
      {fallo && (
        <div className="absolute inset-0 flex items-center justify-center bg-tinta/90 p-6 text-center text-papel">
          <p className="max-w-sm text-sm leading-relaxed">
            {modoAlumno
              ? 'No se puede cargar el vídeo. Avisa a tu profesor o profesora.'
              : `No se puede reproducir este vídeo${fuente.servicio === 'directo' ? '' : ` de ${NOMBRE_SERVICIO[fuente.servicio]}`}. Comprueba que el enlace es público ("cualquier persona con el enlace") y que el archivo es MP4. Mira la guía de abajo.`}
          </p>
        </div>
      )}
    </div>
  )
}
