import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Marca } from '../components/Marca'
import { ReproductorYouTube } from '../components/ReproductorYouTube'
import { LineaTiempo } from '../components/LineaTiempo'
import { EditorPregunta } from '../components/EditorPregunta'
import { extraerIdYouTube, type ReproductorYT } from '../lib/youtube'
import { leerTranscripcion } from '../lib/transcripcion'
import { extraerAudio, transcribir } from '../lib/whisper'
import {
  MODELOS, cantidadSugerida, comprobarDispositivo, generarPregunta, generarPreguntas, modeloRecomendado, prepararModelo,
  type ClaveModelo, type InfoDispositivo,
} from '../lib/ia'
import { analizarDispositivo, type Analisis } from '../lib/dispositivo'
import { codigoMarcador, leerImportacion } from '../lib/marcador'
import { crearEnlace } from '../lib/compartir'
import { formatoTiempo, idAleatorio } from '../lib/tiempo'
import type { PreguntaEditable, Segmento, TipoPregunta } from '../types'

const CLAVE_BORRADOR = 'pausa-borrador-v1'

type Borrador = { url: string; titulo: string; email: string; segmentos: Segmento[]; preguntas: PreguntaEditable[] }

function leerBorrador(): Borrador {
  const vacio: Borrador = { url: '', titulo: '', email: '', segmentos: [], preguntas: [] }
  try {
    const guardado = localStorage.getItem(CLAVE_BORRADOR)
    return guardado ? { ...vacio, ...JSON.parse(guardado) } : vacio
  } catch {
    return vacio
  }
}

const CLAVE_ANALISIS = 'pausa-analisis-v1'

function leerAnalisisGuardado(): Analisis | null {
  try {
    const guardado = localStorage.getItem(CLAVE_ANALISIS)
    return guardado ? (JSON.parse(guardado) as Analisis) : null
  } catch {
    return null
  }
}

type Trabajo = { texto: string; proporcion?: number } | null

export function Crear() {
  const inicial = useMemo(leerBorrador, [])
  const [url, setUrl] = useState(inicial.url)
  const [titulo, setTitulo] = useState(inicial.titulo)
  const [email, setEmail] = useState(inicial.email)
  const [segmentos, setSegmentos] = useState<Segmento[]>(inicial.segmentos)
  const [preguntas, setPreguntas] = useState<PreguntaEditable[]>(inicial.preguntas)

  const [modoTexto, setModoTexto] = useState<'youtube' | 'pegar' | 'archivo'>('youtube')
  const [textoPegado, setTextoPegado] = useState('')
  const [idioma, setIdioma] = useState<'spanish' | 'english'>('spanish')
  const [cantidad, setCantidad] = useState(() =>
    cantidadSugerida(inicial.segmentos[inicial.segmentos.length - 1]?.fin ?? 0),
  )
  const [tipos, setTipos] = useState<Record<TipoPregunta, boolean>>({ test: true, vf: true })
  const [dispositivo, setDispositivo] = useState<InfoDispositivo | null>(null)
  const [analisis, setAnalisis] = useState<Analisis | null>(leerAnalisisGuardado)
  const [analizando, setAnalizando] = useState(false)
  const [modelo, setModelo] = useState<ClaveModelo>(() => leerAnalisisGuardado()?.recomendado ?? 'equilibrado')
  const marcador = useRef<HTMLAnchorElement>(null)

  const [trabajo, setTrabajo] = useState<Trabajo>(null)
  const [regenerando, setRegenerando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [seleccionada, setSeleccionada] = useState<string | null>(null)
  const [enlace, setEnlace] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  const reproductor = useRef<ReproductorYT | null>(null)
  const [tiempoActual, setTiempoActual] = useState(0)
  const [duracion, setDuracion] = useState(0)
  const cancelar = useRef(false)

  const videoId = extraerIdYouTube(url)
  const duracionTotal = duracion || segmentos[segmentos.length - 1]?.fin || 0
  const ocupado = trabajo !== null || regenerando !== null

  useEffect(() => {
    comprobarDispositivo().then((info) => {
      setDispositivo(info)
      if (!leerAnalisisGuardado()) setModelo(modeloRecomendado(info))
    })
  }, [])

  // React no permite enlaces "javascript:" en sus propiedades, así que el código del marcador se pone a mano.
  useEffect(() => {
    marcador.current?.setAttribute('href', codigoMarcador())
  })

  // Datos que llegan desde YouTube con el botón «Enviar a Pausa» (#/crear?importar=...)
  useEffect(() => {
    const importados = leerImportacion(location.hash)
    if (!importados) return
    history.replaceState(null, '', '#/crear')
    const segs = leerTranscripcion(importados.texto)
    setUrl(`https://www.youtube.com/watch?v=${importados.videoId}`)
    setTitulo(importados.titulo)
    setPreguntas([])
    if (segs.length >= 3) {
      setSegmentos(segs)
      setCantidad(cantidadSugerida(segs[segs.length - 1].fin))
      setError(null)
    } else {
      setSegmentos([])
      setError('El vídeo ha llegado, pero sin transcripción. Pégala a mano o sube el archivo del vídeo.')
    }
  }, [])

  async function analizar() {
    setAnalizando(true)
    try {
      const resultado = await analizarDispositivo()
      setAnalisis(resultado)
      setModelo(resultado.recomendado)
      try {
        localStorage.setItem(CLAVE_ANALISIS, JSON.stringify(resultado))
      } catch {
        /* sin almacenamiento: no pasa nada */
      }
    } finally {
      setAnalizando(false)
    }
  }

  // Guarda el borrador para no perder el trabajo si se recarga la página.
  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({ url, titulo, email, segmentos, preguntas }))
    } catch {
      /* sin almacenamiento disponible: no pasa nada */
    }
  }, [url, titulo, email, segmentos, preguntas])

  useEffect(() => {
    setEnlace(null)
  }, [preguntas, titulo, email, videoId])

  useEffect(() => {
    const id = setInterval(() => {
      const r = reproductor.current
      if (r?.getCurrentTime) setTiempoActual(r.getCurrentTime() || 0)
    }, 400)
    return () => clearInterval(id)
  }, [])

  function alEstarListo(r: ReproductorYT) {
    reproductor.current = r
    setDuracion(r.getDuration() || 0)
    const nombre = r.getVideoData?.().title
    if (nombre) setTitulo((t) => t || nombre)
  }

  function irA(segundos: number) {
    reproductor.current?.seekTo(Math.max(0, segundos - 4), true)
    reproductor.current?.playVideo()
  }

  function usarTextoPegado() {
    const segs = leerTranscripcion(textoPegado)
    if (segs.length < 3) {
      setError('No encuentro las marcas de tiempo (como 0:05 o 1:20). Copia la transcripción completa desde YouTube, con los tiempos incluidos.')
      return
    }
    setError(null)
    setSegmentos(segs)
    setCantidad(cantidadSugerida(segs[segs.length - 1].fin))
    setPreguntas([])
  }

  async function leerArchivoSubtitulos(archivo: File) {
    setTextoPegado(await archivo.text())
  }

  async function transcribirArchivo(archivo: File) {
    setError(null)
    setTrabajo({ texto: 'Extrayendo el audio del vídeo' })
    try {
      const audio = await extraerAudio(archivo)
      const segs = await transcribir(audio, idioma, (texto, proporcion) => setTrabajo({ texto, proporcion }))
      if (segs.length === 0) throw new Error('no se ha encontrado voz en el archivo')
      setSegmentos(segs)
      setCantidad(cantidadSugerida(segs[segs.length - 1].fin))
      setPreguntas([])
    } catch (e) {
      setError(`No se pudo transcribir el archivo: ${(e as Error).message}. Prueba a pegar la transcripción de YouTube.`)
    } finally {
      setTrabajo(null)
    }
  }

  function mensajeErrorIA(e: unknown) {
    const texto = String((e as Error)?.message ?? e)
    if (/memory|out of|device lost|allocation/i.test(texto)) {
      return 'Este dispositivo se ha quedado sin memoria para el modelo. Elige el modelo «Ligero» e inténtalo de nuevo.'
    }
    return `La IA no ha podido terminar: ${texto}`
  }

  async function generar() {
    if (!dispositivo) return
    const tiposElegidos = (['test', 'vf'] as const).filter((t) => tipos[t])
    cancelar.current = false
    setError(null)
    setPreguntas([])
    setTrabajo({ texto: 'Preparando el modelo' })
    try {
      await prepararModelo(modelo, dispositivo.webgpu, (texto, proporcion) => setTrabajo({ texto, proporcion }))
      const creadas = await generarPreguntas({
        segmentos,
        cantidad,
        tipos: [...tiposElegidos],
        alAvanzar: (texto, proporcion) => setTrabajo({ texto, proporcion }),
        alCrear: (nueva) => setPreguntas((prev) => [...prev, nueva].sort((a, b) => a.tiempo - b.tiempo)),
        cancelado: () => cancelar.current,
      })
      if (!cancelar.current && creadas < cantidad) {
        setError(
          `El vídeo solo ha dado para ${creadas} ${creadas === 1 ? 'pregunta' : 'preguntas'} de las ${cantidad} que pediste. ` +
            'Puedes añadir el resto a mano en el momento que quieras.',
        )
      }
    } catch (e) {
      setError(mensajeErrorIA(e))
    } finally {
      setTrabajo(null)
    }
  }

  async function regenerar(p: PreguntaEditable) {
    if (!dispositivo || !p.fuente) return
    setError(null)
    setRegenerando(p.id)
    try {
      await prepararModelo(modelo, dispositivo.webgpu, (texto, proporcion) => setTrabajo({ texto, proporcion }))
      setTrabajo(null)
      // intento 1 = con algo de aleatoriedad, para que salga una pregunta distinta
      const foco = p.foco ?? Math.floor(p.fuente.length / 2)
      const nueva = await generarPregunta(p.fuente, foco, p.tipo, Math.random() < 0.5, 1)
      setPreguntas((prev) => prev.map((x) => (x.id === p.id ? nueva : x)).sort((a, b) => a.tiempo - b.tiempo))
      setSeleccionada(nueva.id)
    } catch (e) {
      setError(mensajeErrorIA(e))
    } finally {
      setTrabajo(null)
      setRegenerando(null)
    }
  }

  function anadirPregunta() {
    const nueva: PreguntaEditable = {
      id: idAleatorio(),
      tiempo: Math.round(tiempoActual),
      tipo: 'test',
      enunciado: '',
      opciones: ['', '', '', ''],
      correcta: 0,
      explicacion: '',
    }
    setPreguntas((prev) => [...prev, nueva].sort((a, b) => a.tiempo - b.tiempo))
    setSeleccionada(nueva.id)
  }

  const incompletas = preguntas.filter((p) => !p.enunciado.trim() || p.opciones.some((o) => !o.trim())).length

  function generarEnlace() {
    if (!videoId) return
    setEnlace(crearEnlace({ videoId, titulo, emailProfesor: email, preguntas }))
    setCopiado(false)
  }

  async function copiarEnlace() {
    if (!enlace) return
    try {
      await navigator.clipboard.writeText(enlace)
      setCopiado(true)
    } catch {
      setCopiado(false)
    }
  }

  function empezarDeNuevo() {
    if (!confirm('Se borrará el vídeo, la transcripción y las preguntas de este borrador. ¿Continuar?')) return
    setUrl('')
    setTitulo('')
    setSegmentos([])
    setPreguntas([])
    setTextoPegado('')
    setError(null)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
      <header className="flex items-center justify-between py-6">
        <Marca />
        {(url || preguntas.length > 0) && (
          <button type="button" onClick={empezarDeNuevo} className="boton-texto" disabled={ocupado}>
            Empezar de nuevo
          </button>
        )}
      </header>

      <h1 className="text-3xl font-extrabold sm:text-4xl">Crear una actividad</h1>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:items-start">
        {/* Columna derecha (arriba en móvil): el vídeo y su línea de tiempo */}
        <aside className="lg:sticky lg:top-6 lg:order-2">
          <div className="relative aspect-video overflow-hidden rounded-xl bg-tinta">
            {videoId ? (
              <ReproductorYouTube videoId={videoId} alEstarListo={alEstarListo} />
            ) : (
              <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-papel/70">
                Aquí aparecerá el vídeo
              </p>
            )}
          </div>
          {videoId && (
            <div className="mt-3">
              <LineaTiempo
                duracion={duracionTotal}
                actual={tiempoActual}
                preguntas={preguntas}
                seleccionada={seleccionada}
                alElegir={(p) => {
                  setSeleccionada(p.id)
                  irA(p.tiempo)
                  document.getElementById(`pregunta-${p.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }}
              />
              {preguntas.length > 0 && (
                <p className="mt-1 text-sm text-tinta-suave">
                  {preguntas.length} {preguntas.length === 1 ? 'pregunta' : 'preguntas'}. Pulsa una marca para ir a ese momento.
                </p>
              )}
            </div>
          )}
        </aside>

        <div className="space-y-6 lg:order-1">
          <Paso numero={1} titulo="El vídeo" hecho={!!videoId}>
            <label className="etiqueta" htmlFor="url">Enlace de YouTube</label>
            <input
              id="url"
              className="campo"
              inputMode="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            {url && !videoId && <p className="mt-2 text-sm text-rojo">Este enlace no parece de un vídeo de YouTube.</p>}
            {videoId && (
              <div className="mt-4">
                <label className="etiqueta" htmlFor="titulo">Título de la actividad</label>
                <input id="titulo" className="campo" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
              </div>
            )}
          </Paso>

          <Paso numero={2} titulo="Lo que se dice en el vídeo" hecho={segmentos.length > 0} bloqueado={!videoId}>
            {segmentos.length > 0 ? (
              <div>
                <p className="leading-relaxed">
                  Transcripción lista: {segmentos.length} fragmentos, hasta el minuto {formatoTiempo(segmentos[segmentos.length - 1].fin)}.
                </p>
                <details className="mt-3 rounded-xl border-2 border-linea bg-papel/60">
                  <summary className="cursor-pointer px-4 py-2 text-sm font-bold">Ver el texto</summary>
                  <div className="max-h-64 space-y-1 overflow-y-auto px-4 pb-3 text-sm">
                    {segmentos.map((s, i) => (
                      <p key={i}>
                        <button type="button" className="mr-2 tabular-nums text-boli hover:underline" onClick={() => irA(s.inicio + 4)}>
                          {formatoTiempo(s.inicio)}
                        </button>
                        {s.texto}
                      </p>
                    ))}
                  </div>
                </details>
                <button
                  type="button"
                  className="boton-texto mt-3"
                  disabled={ocupado}
                  onClick={() => {
                    if (preguntas.length && !confirm('Se borrarán las preguntas creadas. ¿Cambiar la transcripción?')) return
                    setSegmentos([])
                    setPreguntas([])
                  }}
                >
                  Cambiar la transcripción
                </button>
              </div>
            ) : (
              <div>
                <div role="tablist" className="inline-flex rounded-xl bg-papel p-1">
                  {(
                    [
                      ['youtube', 'Desde YouTube'],
                      ['pegar', 'Pegar el texto'],
                      ['archivo', 'Subir el vídeo (MP4)'],
                    ] as const
                  ).map(([clave, texto]) => (
                    <button
                      key={clave}
                      role="tab"
                      type="button"
                      aria-selected={modoTexto === clave}
                      onClick={() => setModoTexto(clave)}
                      className={`rounded-lg px-4 py-2 text-sm font-bold ${modoTexto === clave ? 'bg-hoja shadow-sm' : 'text-tinta-suave'}`}
                    >
                      {texto}
                    </button>
                  ))}
                </div>

                {modoTexto === 'youtube' ? (
                  <div className="mt-4">
                    <p className="text-sm leading-relaxed text-tinta-suave">
                      YouTube no deja que otras webs lean sus transcripciones, pero este botón trabaja desde la propia página de
                      YouTube y te trae el vídeo con todo su texto.
                    </p>
                    <ol className="mt-4 space-y-4">
                      <li className="flex gap-3">
                        <span className="trazo-fosforito h-fit px-2 font-display font-bold">1</span>
                        <div>
                          <p className="font-bold">Arrastra este botón a tu barra de marcadores</p>
                          <p className="text-sm text-tinta-suave">Solo la primera vez. Si no ves la barra, pulsa Ctrl + Mayús + B.</p>
                          <a
                            ref={marcador}
                            draggable
                            onClick={(e) => {
                              e.preventDefault()
                              setError('Este botón no se pulsa aquí: arrástralo a tu barra de marcadores y úsalo cuando estés viendo un vídeo en YouTube.')
                            }}
                            className="mt-2 inline-flex cursor-grab items-center gap-2 rounded-xl border-2 border-dashed border-tinta bg-fosforito px-4 py-2 font-bold text-tinta active:cursor-grabbing"
                          >
                            <span aria-hidden="true">⏸</span> Enviar a Pausa
                          </a>
                        </div>
                      </li>
                      <li className="flex gap-3">
                        <span className="trazo-fosforito h-fit px-2 font-display font-bold">2</span>
                        <div>
                          <p className="font-bold">Abre el vídeo en YouTube y pulsa el marcador «Enviar a Pausa»</p>
                          <p className="text-sm text-tinta-suave">
                            Pausa se abrirá en una pestaña nueva con el vídeo y su transcripción ya cargados.
                          </p>
                        </div>
                      </li>
                    </ol>
                  </div>
                ) : modoTexto === 'pegar' ? (
                  <div className="mt-4">
                    <p className="text-sm leading-relaxed text-tinta-suave">
                      En YouTube, abre la descripción del vídeo y pulsa <strong>Mostrar transcripción</strong>. Selecciona todo el
                      texto del panel y pégalo aquí tal cual: Pausa entiende el formato de YouTube y los subtítulos .srt o .vtt.
                    </p>
                    <textarea
                      className="campo mt-3 h-40 resize-y font-sans text-sm"
                      placeholder={'0:00\nHoy vamos a hablar de la Edad Media...\n0:06\nUn periodo que empezó en el siglo V...'}
                      value={textoPegado}
                      onChange={(e) => setTextoPegado(e.target.value)}
                    />
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <button type="button" className="boton boton-principal" disabled={!textoPegado.trim()} onClick={usarTextoPegado}>
                        Usar esta transcripción
                      </button>
                      <label className="boton-texto cursor-pointer">
                        O sube un archivo de subtítulos (.srt, .vtt)
                        <input
                          type="file"
                          accept=".srt,.vtt,.txt"
                          className="sr-only"
                          onChange={(e) => e.target.files?.[0] && leerArchivoSubtitulos(e.target.files[0])}
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4">
                    <p className="text-sm leading-relaxed text-tinta-suave">
                      Si el vídeo no tiene transcripción, sube el mismo vídeo (o solo su audio). La IA lo escuchará en tu navegador:
                      el archivo no sale de tu dispositivo.
                    </p>
                    <div className="mt-3 flex flex-wrap items-end gap-3">
                      <div>
                        <label className="etiqueta" htmlFor="idioma">Idioma del vídeo</label>
                        <select id="idioma" className="campo py-2.5" value={idioma} onChange={(e) => setIdioma(e.target.value as 'spanish' | 'english')}>
                          <option value="spanish">Español</option>
                          <option value="english">Inglés</option>
                        </select>
                      </div>
                      <label className={`boton boton-principal cursor-pointer ${ocupado ? 'pointer-events-none opacity-50' : ''}`}>
                        Elegir archivo
                        <input
                          type="file"
                          accept="video/*,audio/*"
                          className="sr-only"
                          disabled={ocupado}
                          onChange={(e) => e.target.files?.[0] && transcribirArchivo(e.target.files[0])}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Paso>

          <Paso numero={3} titulo="Preguntas" hecho={preguntas.length > 0} bloqueado={segmentos.length === 0}>
            {dispositivo && !dispositivo.webgpu && (
              <Aviso>
                Este navegador no puede usar la tarjeta gráfica, así que la IA funcionará con el procesador: irá más despacio. Te
                recomendamos el modelo «Ligero», o abrir la página en Chrome o Edge actualizados.
              </Aviso>
            )}

            <div className="mb-5 rounded-xl border-2 border-linea bg-papel/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold">¿Qué modelo aguanta tu dispositivo?</p>
                  <p className="text-sm text-tinta-suave">Una prueba de unos segundos mide la potencia de tu tarjeta gráfica.</p>
                </div>
                <button type="button" className="boton boton-secundario" disabled={analizando || ocupado} onClick={analizar}>
                  {analizando ? 'Analizando…' : analisis ? 'Volver a analizar' : 'Analizar mi dispositivo'}
                </button>
              </div>
              {analisis && !analizando && (
                <div className="aparecer mt-4 border-t-2 border-linea pt-3">
                  <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                    <dt className="text-tinta-suave">Tarjeta gráfica</dt>
                    <dd className="font-bold">{analisis.grafica}</dd>
                    <dt className="text-tinta-suave">Potencia medida</dt>
                    <dd className="font-bold">
                      {analisis.gflops === null
                        ? 'No se ha podido medir'
                        : `${Math.round(analisis.gflops).toLocaleString('es-ES')} GFLOPS (${analisis.nivel})`}
                    </dd>
                    <dt className="text-tinta-suave">Memoria y procesador</dt>
                    <dd className="font-bold">
                      {analisis.memoriaGB === null ? 'Memoria desconocida' : `${analisis.memoriaGB.toLocaleString('es-ES')} GB`} de RAM,{' '}
                      {analisis.nucleos} núcleos
                    </dd>
                  </dl>
                  <p className="mt-3 text-sm leading-relaxed">
                    {analisis.motivo} Recomendado: <strong>{MODELOS.find((m) => m.clave === analisis.recomendado)?.nombre}</strong>.
                  </p>
                </div>
              )}
            </div>

            <fieldset disabled={ocupado} className="space-y-5">
              <div>
                <legend className="etiqueta">Modelo de IA</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {MODELOS.map((m) => (
                    <label
                      key={m.clave}
                      className={`cursor-pointer rounded-xl border-2 p-3 ${modelo === m.clave ? 'border-boli bg-boli/5' : 'border-linea bg-hoja'}`}
                    >
                      <input type="radio" name="modelo" className="sr-only" checked={modelo === m.clave} onChange={() => setModelo(m.clave)} />
                      <span className="block font-bold">
                        {m.nombre}
                        {(analisis ? analisis.recomendado : dispositivo && modeloRecomendado(dispositivo)) === m.clave && (
                          <span className="ml-2 rounded bg-fosforito-claro px-1.5 py-0.5 text-xs">Recomendado</span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-sm text-tinta-suave">{m.paraQuien}</span>
                      <span className="mt-0.5 block text-xs text-tinta-suave">Descarga de {m.descarga} la primera vez</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-6">
                <div>
                  <label className="etiqueta" htmlFor="cantidad">Número de preguntas</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Una pregunta menos"
                      className="boton boton-secundario h-12 w-12 p-0 text-xl"
                      onClick={() => setCantidad((c) => Math.max(1, c - 1))}
                    >
                      −
                    </button>
                    <input
                      id="cantidad"
                      type="number"
                      min={1}
                      max={30}
                      className="campo w-20 text-center text-lg font-bold tabular-nums"
                      value={cantidad}
                      onChange={(e) => setCantidad(Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
                    />
                    <button
                      type="button"
                      aria-label="Una pregunta más"
                      className="boton boton-secundario h-12 w-12 p-0 text-xl"
                      onClick={() => setCantidad((c) => Math.min(30, c + 1))}
                    >
                      +
                    </button>
                  </div>
                  <p className="mt-1.5 max-w-xs text-xs text-tinta-suave">
                    La IA lee el vídeo entero y las coloca donde se explican los datos más importantes.
                  </p>
                </div>
                <div>
                  <span className="etiqueta">Tipos de pregunta</span>
                  <div className="flex gap-4 pt-2.5">
                    {(
                      [
                        ['test', 'Tipo test'],
                        ['vf', 'Verdadero o falso'],
                      ] as const
                    ).map(([clave, texto]) => (
                      <label key={clave} className="inline-flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-5 w-5 accent-boli"
                          checked={tipos[clave]}
                          onChange={(e) => setTipos((t) => ({ ...t, [clave]: e.target.checked }))}
                        />
                        {texto}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </fieldset>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {trabajo && !regenerando ? (
                <button type="button" className="boton boton-secundario" onClick={() => (cancelar.current = true)}>
                  Detener
                </button>
              ) : (
                <button
                  type="button"
                  className="boton boton-principal"
                  disabled={ocupado || !dispositivo || (!tipos.test && !tipos.vf)}
                  onClick={() => {
                    if (preguntas.length && !confirm('Se sustituirán las preguntas actuales. ¿Generar de nuevo?')) return
                    generar()
                  }}
                >
                  {preguntas.length ? 'Volver a generar las preguntas' : 'Generar preguntas'}
                </button>
              )}
              <button type="button" className="boton boton-secundario" disabled={ocupado} onClick={anadirPregunta}>
                Añadir una pregunta en el {formatoTiempo(tiempoActual)}
              </button>
            </div>

            {preguntas.length > 0 && (
              <ol className="mt-6 space-y-4">
                {preguntas.map((p, i) => (
                  <EditorPregunta
                    key={p.id}
                    numero={i + 1}
                    pregunta={p}
                    seleccionada={seleccionada === p.id}
                    regenerando={regenerando === p.id}
                    puedeRegenerar={!!p.fuente && !!dispositivo && !ocupado}
                    alCambiar={(nueva) => setPreguntas((prev) => prev.map((x) => (x.id === p.id ? nueva : x)))}
                    alOrdenar={() => setPreguntas((prev) => [...prev].sort((a, b) => a.tiempo - b.tiempo))}
                    alBorrar={() => setPreguntas((prev) => prev.filter((x) => x.id !== p.id))}
                    alRegenerar={() => regenerar(p)}
                    alIr={() => {
                      setSeleccionada(p.id)
                      irA(p.tiempo)
                    }}
                  />
                ))}
              </ol>
            )}
          </Paso>

          <Paso numero={4} titulo="Compartir con tus alumnos" hecho={!!enlace} bloqueado={preguntas.length === 0}>
            <label className="etiqueta" htmlFor="email">Tu correo, para recibir los resultados</label>
            <input
              id="email"
              type="email"
              className="campo"
              placeholder="nombre@educa.es"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="mt-1.5 text-sm text-tinta-suave">
              Al terminar, cada alumno podrá enviarte su informe a esta dirección desde su propio correo.
            </p>
            {incompletas > 0 && (
              <Aviso>
                {incompletas === 1 ? 'Hay 1 pregunta sin completar.' : `Hay ${incompletas} preguntas sin completar.`} Rellena el enunciado y todas
                las opciones, o bórrala.
              </Aviso>
            )}
            <button type="button" className="boton boton-principal mt-4" disabled={incompletas > 0 || ocupado} onClick={generarEnlace}>
              Crear el enlace para los alumnos
            </button>

            {enlace && (
              <div className="aparecer mt-5 rounded-xl border-2 border-tinta bg-fosforito-claro p-4">
                <label className="etiqueta" htmlFor="enlace">Enlace de la actividad</label>
                <input id="enlace" readOnly className="campo text-sm" value={enlace} onFocus={(e) => e.target.select()} />
                <div className="mt-3 flex flex-wrap gap-3">
                  <button type="button" className="boton boton-principal" onClick={copiarEnlace}>
                    {copiado ? 'Enlace copiado' : 'Copiar el enlace'}
                  </button>
                  <a href={enlace} target="_blank" rel="noreferrer" className="boton boton-secundario">
                    Probar como alumno
                  </a>
                </div>
                <p className="mt-3 text-sm text-tinta-suave">
                  Compártelo por Classroom, Moodle o correo. Las preguntas van dentro del enlace: si cambias algo, crea un enlace nuevo.
                </p>
              </div>
            )}
          </Paso>
        </div>
      </div>

      {trabajo && (
        <div role="status" className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-tinta bg-hoja px-4 py-3 shadow-[0_-4px_0_rgba(27,43,38,0.06)]">
          <div className="mx-auto flex max-w-7xl items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{trabajo.texto}</p>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-linea">
                {trabajo.proporcion !== undefined ? (
                  <div className="h-full rounded-full bg-boli transition-[width]" style={{ width: `${Math.round(trabajo.proporcion * 100)}%` }} />
                ) : (
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-boli" />
                )}
              </div>
            </div>
            {trabajo.proporcion !== undefined && (
              <span className="text-sm tabular-nums text-tinta-suave">{Math.round(trabajo.proporcion * 100)} %</span>
            )}
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="fixed inset-x-4 top-4 z-30 mx-auto max-w-xl rounded-xl border-2 border-rojo bg-rojo-claro p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <p className="flex-1 text-sm leading-relaxed">{error}</p>
            <button type="button" className="boton-texto text-rojo" onClick={() => setError(null)}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Paso({
  numero, titulo, hecho, bloqueado, children,
}: { numero: number; titulo: string; hecho?: boolean; bloqueado?: boolean; children: ReactNode }) {
  return (
    <section
      aria-disabled={bloqueado}
      className={`rounded-2xl border-2 bg-hoja p-5 sm:p-6 ${bloqueado ? 'border-transparent opacity-55' : 'border-tinta/10'}`}
    >
      <h2 className="flex items-center gap-3 text-xl font-bold">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base ${
            hecho ? 'bg-verde text-white' : 'border-2 border-tinta/30 text-tinta-suave'
          }`}
        >
          {hecho ? '✓' : numero}
        </span>
        {titulo}
      </h2>
      <div className={`mt-4 ${bloqueado ? 'pointer-events-none' : ''}`} inert={bloqueado || undefined}>
        {children}
      </div>
    </section>
  )
}

function Aviso({ children }: { children: ReactNode }) {
  return <p className="my-4 rounded-xl border-l-4 border-fosforito bg-fosforito-claro px-4 py-3 text-sm leading-relaxed">{children}</p>
}
