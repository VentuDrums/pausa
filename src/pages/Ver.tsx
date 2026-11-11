import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Marca } from '../components/Marca'
import { Reproductor } from '../components/Reproductor'
import { LineaTiempo } from '../components/LineaTiempo'
import { fuenteDeActividad, leerActividad } from '../lib/compartir'
import { ESTADO_YT, type ReproductorYT } from '../lib/youtube'
import { calcularNota, descargarPdf, enlaceCorreo, lineasIntentos, textoInforme, type Resultado } from '../lib/informe'
import {
  borrarEnCurso, crearCodigo, estaTerminado, fechaCorta, guardarEnCurso, guardarIntento, idActividad, leerEnCurso, leerIntentos,
  type Intento,
} from '../lib/intentos'
import type { Actividad, Pregunta } from '../types'

export function Ver({ codigo }: { codigo: string }) {
  const actividad = useMemo(() => leerActividad(codigo), [codigo])
  if (!actividad) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <Marca />
        <h1 className="mt-10 text-3xl font-extrabold">Este enlace no funciona</h1>
        <p className="mt-3 leading-relaxed text-tinta-suave">
          Puede que se haya copiado incompleto. Pide a tu profesor o profesora que te lo vuelva a enviar.
        </p>
      </div>
    )
  }
  // `key`: si se abre el enlace de otra actividad en la misma pestaña, se empieza de cero (no se arrastra el estado).
  const id = idActividad(codigo)
  return <VerActividad key={id} actividad={actividad} id={id} />
}

type Fase = 'datos' | 'reanudar' | 'viendo' | 'informe'

/** Móviles y tabletas: allí el vídeo se ve pequeño, así que empieza directamente a pantalla completa. */
function esTactil() {
  return window.matchMedia?.('(pointer: coarse)').matches ?? false
}

/**
 * Desplaza la página para que se vea `el`, con animación. Si al poco sigue fuera de la pantalla
 * (algunos navegadores no animan en segundo plano o con ahorro de energía), salta directamente.
 */
function mostrar(el: HTMLElement | null, block: ScrollLogicalPosition) {
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block })
  setTimeout(() => {
    const r = el.getBoundingClientRect()
    if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block })
  }, 700)
}

function VerActividad({ actividad, id }: { actividad: Actividad; id: string }) {
  // Intentos anteriores en este navegador (solo se guardan aquí, en el dispositivo del alumno).
  const previos = useMemo(() => leerIntentos(id), [id])
  const [intentos, setIntentos] = useState<Intento[]>(previos)
  const terminados = previos.filter(estaTerminado)
  const bloqueada = !!actividad.unIntento && terminados.length > 0
  // Intento a medias (el alumno recargó o cerró la página): se retoma donde lo dejó.
  const [enCurso] = useState(() => leerEnCurso(id))
  const [fase, setFase] = useState<Fase>(enCurso && !bloqueada ? 'reanudar' : 'datos')
  const [nombre, setNombre] = useState(enCurso?.nombre ?? '')
  const [grupo, setGrupo] = useState(enCurso?.grupo ?? '')
  const [respuestas, setRespuestas] = useState<Record<string, number>>(enCurso?.respuestas ?? {})
  const [inicio, setInicio] = useState(enCurso?.inicio ?? '')
  const [activa, setActiva] = useState<Pregunta | null>(null)
  const [elegida, setElegida] = useState<number | null>(null)
  const [comprobada, setComprobada] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [tiempo, setTiempo] = useState(0)
  const [duracion, setDuracion] = useState(0)
  const [listo, setListo] = useState(false)

  const reproductor = useRef<ReproductorYT | null>(null)
  const respuestasRef = useRef(respuestas)
  respuestasRef.current = respuestas
  const activaRef = useRef(activa)
  activaRef.current = activa
  const faseRef = useRef(fase)
  faseRef.current = fase
  const tarjeta = useRef<HTMLDivElement>(null)
  const botonSeguir = useRef<HTMLButtonElement>(null)

  // Pantalla completa propia: ocupa la pantalla el vídeo CON sus preguntas (la del reproductor las taparía).
  // Donde el navegador no la permite (iPhone), el marco ocupa igualmente toda la pantalla.
  const marco = useRef<HTMLDivElement>(null)
  const [pantallaCompleta, setPantallaCompleta] = useState(false)
  const pantallaCompletaRef = useRef(false)
  pantallaCompletaRef.current = pantallaCompleta

  const entrarPantallaCompleta = useCallback(async () => {
    const el = marco.current as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> }) | null
    if (!el) return
    setPantallaCompleta(true)
    try {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' })
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen()
      // En móviles, mejor en horizontal (solo funciona en pantalla completa y no en todos los navegadores).
      const orientacion = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
      await orientacion.lock?.('landscape').catch(() => {})
    } catch {
      /* sin pantalla completa del navegador: se queda la que ocupa toda la ventana */
    }
  }, [])

  const salirPantallaCompleta = useCallback(() => {
    setPantallaCompleta(false)
    try { screen.orientation.unlock() } catch { /* no disponible */ }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  }, [])

  // Si se sale con la tecla Esc o el gesto del móvil, lo reflejamos.
  useEffect(() => {
    const alCambiar = () => {
      if (!document.fullscreenElement && pantallaCompletaRef.current) setPantallaCompleta(false)
    }
    document.addEventListener('fullscreenchange', alCambiar)
    return () => document.removeEventListener('fullscreenchange', alCambiar)
  }, [])

  // Mientras ocupa toda la pantalla, la página de debajo no se desplaza.
  useEffect(() => {
    if (!pantallaCompleta) return
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = antes }
  }, [pantallaCompleta])

  // Al terminar, se sale de la pantalla completa para ver el informe.
  useEffect(() => {
    if (fase === 'informe' && pantallaCompletaRef.current) salirPantallaCompleta()
  }, [fase, salirPantallaCompleta])

  const preguntas = actividad.preguntas
  const fuente = useMemo(() => fuenteDeActividad(actividad), [actividad])
  const pendiente = useCallback(
    (hasta = Infinity) => preguntas.find((p) => respuestasRef.current[p.id] === undefined && p.tiempo <= hasta),
    [preguntas],
  )

  const abrir = useCallback((p: Pregunta) => {
    setActiva(p)
    setElegida(null)
    setComprobada(false)
    // La pregunta sube a lo alto de la pantalla: así caben las opciones, la corrección y el botón de seguir.
    if (!pantallaCompletaRef.current) setTimeout(() => mostrar(tarjeta.current, 'start'), 0)
  }, [])

  // Guarda el intento en curso (en este navegador) para poder retomarlo si se recarga la página.
  const tiempoRef = useRef(enCurso?.tiempo ?? 0)
  const guardarProgreso = useCallback(() => {
    if (faseRef.current !== 'viendo') return
    guardarEnCurso(id, { inicio, nombre: nombre.trim(), grupo: grupo.trim(), respuestas: respuestasRef.current, tiempo: tiempoRef.current })
  }, [id, inicio, nombre, grupo])
  useEffect(() => {
    if (fase === 'viendo') guardarProgreso()
  }, [fase, respuestas, guardarProgreso])

  // Vigila el vídeo: cuando llega (o se adelanta) al momento de una pregunta, lo detiene.
  useEffect(() => {
    if (fase !== 'viendo') return
    let ultimoGuardado = 0
    const id = setInterval(() => {
      const r = reproductor.current
      if (!r?.getCurrentTime) return
      const ahora = r.getCurrentTime() || 0
      setTiempo(ahora)
      tiempoRef.current = ahora
      if (Date.now() - ultimoGuardado > 3000) {
        ultimoGuardado = Date.now()
        guardarProgreso()
      }
      if (activaRef.current) return
      const p = pendiente(ahora + 0.15)
      if (p) {
        r.pauseVideo()
        if (ahora - p.tiempo > 2) {
          r.seekTo(p.tiempo, true)
          setAviso('Has adelantado el vídeo. Antes de seguir, responde esta pregunta.')
        }
        abrir(p)
      }
    }, 200)
    return () => clearInterval(id)
  }, [fase, pendiente, abrir, guardarProgreso])

  function alCambiarEstado(estado: number) {
    const r = reproductor.current
    if (estado === ESTADO_YT.REPRODUCIENDO && activaRef.current) r?.pauseVideo()
    if (estado === ESTADO_YT.TERMINADO && faseRef.current === 'viendo' && !activaRef.current) {
      const p = pendiente()
      if (p) abrir(p)
      else setFase('informe')
    }
  }

  function empezar(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    setInicio(new Date().toISOString())
    tiempoRef.current = 0
    setFase('viendo')
    reproductor.current?.playVideo()
    if (esTactil()) entrarPantallaCompleta()
  }

  /** Retoma el intento a medias: mismas respuestas (ya no se pueden cambiar) y el vídeo donde lo dejó. */
  function reanudar() {
    const r = reproductor.current
    setFase('viendo')
    if (esTactil()) entrarPantallaCompleta()
    if (!r) return
    r.seekTo(Math.max(0, tiempoRef.current - 2), true)
    r.playVideo()
  }

  /** Solo si se puede repetir: el intento a medias queda en el historial como «sin terminar». */
  function empezarDeNuevo() {
    if (!enCurso) return
    const { aciertos, total } = calcularNota({ actividad, respuestas: enCurso.respuestas, nombre: '', grupo: '', intentos: [], codigo: '' })
    setIntentos(
      guardarIntento(id, {
        fecha: enCurso.inicio || new Date().toISOString(),
        aciertos,
        total,
        nombre: enCurso.nombre,
        grupo: enCurso.grupo,
        respuestas: enCurso.respuestas,
        terminado: false,
      }),
    )
    borrarEnCurso(id)
    setRespuestas({})
    respuestasRef.current = {}
    tiempoRef.current = 0
    setFase('datos')
  }

  function comprobar() {
    if (!activa || elegida === null) return
    setRespuestas((r) => ({ ...r, [activa.id]: elegida }))
    respuestasRef.current = { ...respuestasRef.current, [activa.id]: elegida }
    setComprobada(true)
    // Que el botón de seguir quede a la vista sin tener que bajar (y listo para pulsar Intro).
    setTimeout(() => {
      // Desplaza la página o, a pantalla completa, el cuadro flotante.
      mostrar(botonSeguir.current, 'nearest')
      botonSeguir.current?.focus({ preventScroll: true })
    }, 0)
  }

  function continuar() {
    setActiva(null)
    setAviso(null)
    const r = reproductor.current
    if (!r) return
    if (r.getPlayerState() === ESTADO_YT.TERMINADO) {
      const p = pendiente()
      if (p) abrir(p)
      else setFase('informe')
    } else {
      r.playVideo()
    }
  }

  const guardado = useRef(false)
  useEffect(() => {
    if (fase !== 'informe' || guardado.current) return
    guardado.current = true
    const { aciertos, total } = calcularNota({ actividad, respuestas, nombre: '', grupo: '', intentos: [], codigo: '' })
    setIntentos(
      guardarIntento(id, { fecha: new Date().toISOString(), aciertos, total, nombre: nombre.trim(), grupo: grupo.trim(), respuestas }),
    )
    borrarEnCurso(id)
  }, [fase, id, actividad, respuestas, nombre, grupo])

  const resultado: Resultado = {
    nombre: nombre.trim(),
    grupo: grupo.trim(),
    actividad,
    respuestas,
    intentos,
    codigo: crearCodigo(id, actividad.titulo, intentos),
  }
  const numeroActiva = activa ? preguntas.indexOf(activa) + 1 : 0
  const quedanDespues = activa ? preguntas.some((p) => p.id !== activa.id && respuestas[p.id] === undefined) : false
  const contenidoPregunta = activa && (
    <>
          {aviso && <p className="mb-4 rounded-lg bg-fosforito-claro px-3 py-2 text-sm">{aviso}</p>}
          <p className="text-sm font-bold text-tinta-suave">
            Pregunta {numeroActiva} de {preguntas.length}
            {activa.tipo === 'vf' && ' · ¿Verdadero o falso?'}
          </p>
          <h2 className="mt-2 text-xl font-bold leading-snug sm:text-2xl">{activa.enunciado}</h2>

          <div role="radiogroup" aria-label="Respuestas" className={`mt-5 grid gap-2.5 ${activa.tipo === 'vf' ? 'grid-cols-2' : 'sm:grid-cols-2'}`}>
            {activa.opciones.map((o, i) => {
              const esCorrecta = i === activa.correcta
              const esElegida = i === elegida
              let estilo = 'border-linea hover:border-tinta/50'
              if (!comprobada && esElegida) estilo = 'border-boli bg-boli/10'
              if (comprobada && esCorrecta) estilo = 'border-verde bg-verde-claro'
              if (comprobada && esElegida && !esCorrecta) estilo = 'border-rojo bg-rojo-claro'
              if (comprobada && !esCorrecta && !esElegida) estilo = 'border-linea opacity-60'
              return (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={esElegida}
                  disabled={comprobada}
                  onClick={() => setElegida(i)}
                  className={`flex min-h-14 items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-base font-bold transition-colors ${estilo}`}
                >
                  {activa.tipo === 'test' && (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-papel text-sm">{'ABCD'[i]}</span>
                  )}
                  <span className={activa.tipo === 'vf' ? 'w-full text-center' : ''}>{o}</span>
                </button>
              )
            })}
          </div>

          {!comprobada ? (
            <button type="button" className="boton boton-principal mt-6 w-full sm:w-auto" disabled={elegida === null} onClick={comprobar}>
              Comprobar
            </button>
          ) : (
            <div className="aparecer mt-6" aria-live="polite">
              {elegida === activa.correcta ? (
                <p className="font-display text-xl font-bold text-verde">¡Correcto!</p>
              ) : (
                <div>
                  <p className="font-display text-xl font-bold text-rojo">No es correcto</p>
                  <p className="mt-1">
                    La respuesta correcta es: <strong>{activa.opciones[activa.correcta]}</strong>
                  </p>
                </div>
              )}
              {activa.explicacion && <p className="mt-2 leading-relaxed text-tinta-suave">{activa.explicacion}</p>}
              <button ref={botonSeguir} type="button" className="boton boton-principal mt-5 w-full scroll-mb-4 sm:w-auto" onClick={continuar}>
                {reproductor.current?.getPlayerState() === ESTADO_YT.TERMINADO && !quedanDespues ? 'Ver mis resultados' : 'Seguir viendo el vídeo'}
              </button>
            </div>
          )}
    </>
  )

  // Solo un intento y ya lo hizo: se le enseña su informe de entonces, no el vídeo.
  if (bloqueada) {
    const primero = terminados[0]
    return (
      <Informe
        resultado={{ ...primero, actividad, intentos: previos, codigo: crearCodigo(id, actividad.titulo, previos) }}
        aviso={`Ya hiciste esta actividad (${fechaCorta(primero.fecha)}). Tu profesor o profesora solo permite un intento: este es tu resultado.`}
      />
    )
  }
  if (fase === 'informe') return <Informe resultado={resultado} />

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
      <header className="flex items-center justify-between gap-4 py-5">
        <Marca />
        {fase === 'viendo' && (
          <p className="text-sm text-tinta-suave">
            {Object.keys(respuestas).length} de {preguntas.length} respondidas
          </p>
        )}
      </header>

      <h1 className="text-2xl font-extrabold leading-tight sm:text-3xl">{actividad.titulo || 'Vídeo interactivo'}</h1>

      {/* En móvil el formulario va debajo del vídeo (no cabe encima); desde tableta, encima del vídeo. */}
      <div className="relative mt-5">
        <div
          ref={marco}
          className={pantallaCompleta ? 'fixed inset-0 z-50 flex items-center justify-center bg-black' : 'relative'}
        >
        <div
          className={`relative aspect-video overflow-hidden bg-tinta ${pantallaCompleta ? 'w-full' : 'rounded-xl'}`}
          style={pantallaCompleta ? { maxWidth: 'calc(100dvh * 16 / 9)' } : undefined}
        >
          <Reproductor
            fuente={fuente}
            modoAlumno
            alEstarListo={(r) => {
              reproductor.current = r
              setDuracion(r.getDuration() || 0)
              setListo(true)
            }}
            alCambiarEstado={alCambiarEstado}
          />
          {(fase === 'datos' || fase === 'reanudar' || activa) && (
            <div className="absolute inset-0 flex items-center justify-center bg-tinta/80 p-4 backdrop-blur-[2px]">
              {activa && !pantallaCompleta && (
                <p className="hidden text-center font-display text-lg font-bold text-papel sm:block">
                  Responde la pregunta para seguir viendo el vídeo
                </p>
              )}
            </div>
          )}
        </div>
          {/* A pantalla completa, la pregunta flota sobre el vídeo (con su propio desplazamiento si no cabe). */}
          {pantallaCompleta && activa && (
            <div className="absolute inset-0 z-10 flex items-center justify-center p-3 sm:p-6">
              <div
                className="aparecer max-h-full w-full max-w-2xl overflow-y-auto overscroll-contain rounded-2xl bg-hoja p-4 shadow-2xl sm:p-5 [&_h2]:!mt-1 [&_h2]:!text-lg [&_h2]:sm:!text-xl [&_[role=radio]]:!min-h-11 [&_[role=radio]]:!py-2 [&_[role=radio]]:!text-sm [&_[role=radiogroup]]:!mt-3 [&_[role=radiogroup]]:!gap-2 [&_.boton]:!mt-3"
                ref={tarjeta}
              >
                {contenidoPregunta}
              </div>
            </div>
          )}
          {pantallaCompleta && (
            <button
              type="button"
              onClick={salirPantallaCompleta}
              className="absolute right-2 top-2 z-20 rounded-lg bg-black/60 px-3 py-1.5 text-sm font-bold text-white hover:bg-black/80"
            >
              Salir de pantalla completa
            </button>
          )}
        </div>
        {fase === 'reanudar' && enCurso && (
          <div className="mt-4 flex justify-center sm:absolute sm:inset-0 sm:mt-0 sm:items-center sm:p-4">
            <div className="aparecer w-full max-w-sm rounded-2xl border-2 border-tinta/10 bg-hoja p-5 sm:border-0 sm:p-6">
              <p className="font-display text-lg font-bold">Tienes esta actividad a medias</p>
              <p className="mt-1 text-sm text-tinta-suave">
                {enCurso.nombre}
                {enCurso.grupo && ` · ${enCurso.grupo}`} · empezada {fechaCorta(enCurso.inicio)}
              </p>
              <p className="mt-2 text-sm">
                Llevas {Object.keys(enCurso.respuestas).length} de {preguntas.length} preguntas respondidas. Las respuestas que ya diste no se
                pueden cambiar.
              </p>
              <button type="button" className="boton boton-principal mt-5 w-full" disabled={!listo} onClick={reanudar}>
                {listo ? 'Continuar donde lo dejé' : 'Cargando el vídeo…'}
              </button>
              {actividad.unIntento ? (
                <p className="mt-3 text-xs text-tinta-suave">Solo tienes un intento, así que no puedes empezar de nuevo.</p>
              ) : (
                <>
                  <button type="button" className="boton boton-secundario mt-2 w-full" onClick={empezarDeNuevo}>
                    Empezar de nuevo
                  </button>
                  <p className="mt-2 text-xs text-tinta-suave">Si empiezas de nuevo, este intento aparecerá en tu informe como «sin terminar».</p>
                </>
              )}
            </div>
          </div>
        )}
        {fase === 'datos' && (
          <div className="mt-4 flex justify-center sm:absolute sm:inset-0 sm:mt-0 sm:items-center sm:p-4">
            <form onSubmit={empezar} className="aparecer w-full max-w-sm rounded-2xl border-2 border-tinta/10 bg-hoja p-5 sm:border-0 sm:p-6">
              <p className="font-display text-lg font-bold">
                {preguntas.length} {preguntas.length === 1 ? 'pregunta' : 'preguntas'} durante el vídeo
              </p>
              <p className="mt-1 text-sm text-tinta-suave">El vídeo se detendrá para preguntarte. Escribe tu nombre para empezar.</p>
              {actividad.unIntento ? (
                <p className="mt-2 rounded-lg bg-fosforito-claro px-3 py-2 text-sm">Solo tienes un intento: cuando termines no podrás repetirla.</p>
              ) : (
                intentos.length > 0 && (
                  <p className="mt-2 rounded-lg bg-fosforito-claro px-3 py-2 text-sm">
                    Ya has empezado esta actividad {intentos.length === 1 ? 'una vez' : `${intentos.length} veces`}. Tu
                    informe incluirá todos los intentos, también los que dejaste sin terminar.
                  </p>
                )
              )}
              <label className="etiqueta mt-4" htmlFor="nombre">Nombre y apellidos</label>
              <input id="nombre" className="campo py-2.5" autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
              <label className="etiqueta mt-3" htmlFor="grupo">Curso y grupo <span className="font-normal text-tinta-suave">(opcional)</span></label>
              <input id="grupo" className="campo py-2.5" placeholder="Ej.: 1º ESO B" value={grupo} onChange={(e) => setGrupo(e.target.value)} />
              <button type="submit" className="boton boton-principal mt-5 w-full" disabled={!nombre.trim() || !listo}>
                {listo ? 'Empezar el vídeo' : 'Cargando el vídeo…'}
              </button>
            </form>
          </div>
        )}
      </div>

      {fase === 'viendo' && !pantallaCompleta && (
        <div className="mt-2 flex justify-end">
          <button type="button" className="boton-texto" onClick={entrarPantallaCompleta}>
            <span aria-hidden="true">⛶</span> Pantalla completa
          </button>
        </div>
      )}

      <div className="mt-3">
        <LineaTiempo
          duracion={duracion}
          actual={tiempo}
          preguntas={preguntas}
          estadoDe={(p) => (respuestas[p.id] === undefined ? 'pendiente' : respuestas[p.id] === p.correcta ? 'acierto' : 'fallo')}
          seleccionada={activa?.id ?? null}
        />
      </div>

      {activa && !pantallaCompleta && (
        <div ref={tarjeta} className="aparecer mt-5 scroll-mt-4 rounded-2xl border-2 border-tinta bg-hoja p-5 shadow-[5px_5px_0_var(--color-tinta)] sm:p-7">
          {contenidoPregunta}
        </div>
      )}
    </div>
  )
}

function Informe({ resultado, aviso }: { resultado: Resultado; aviso?: string }) {
  const { total, aciertos, fallos, nota } = calcularNota(resultado)
  const { actividad, respuestas } = resultado
  const [informeCopiado, setInformeCopiado] = useState(false)

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
      <header className="py-5">
        <Marca />
      </header>

      {aviso && <p className="mb-5 rounded-xl border-2 border-tinta bg-fosforito-claro p-4 font-bold">{aviso}</p>}
      <p className="text-tinta-suave">{actividad.titulo || 'Vídeo interactivo'}</p>
      <h1 className="mt-1 text-4xl font-extrabold leading-tight sm:text-5xl">
        Has acertado {aciertos} de {total}
      </h1>

      <div className="mt-6 flex flex-wrap gap-3">
        <span className="rounded-xl bg-verde-claro px-4 py-2 font-bold text-verde">{aciertos} {aciertos === 1 ? 'acierto' : 'aciertos'}</span>
        <span className="rounded-xl bg-rojo-claro px-4 py-2 font-bold text-rojo">{fallos} {fallos === 1 ? 'fallo' : 'fallos'}</span>
        <span className="trazo-fosforito px-4 py-2 font-bold">Nota: {nota.toLocaleString('es-ES')}</span>
      </div>

      <section className="mt-8 rounded-2xl border-2 border-tinta bg-hoja p-5 sm:p-6">
        <h2 className="text-lg font-bold">Envía tus resultados</h2>
        <p className="mt-1 text-sm leading-relaxed text-tinta-suave">
          Elige dónde tienes tu correo. Se abrirá con el informe ya escrito
          {actividad.emailProfesor ? ` para ${actividad.emailProfesor}: solo tienes que pulsar Enviar.` : ': añade la dirección de tu profesor o profesora y pulsa Enviar.'}
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {(
            [
              ['gmail', 'Gmail'],
              ['outlook', 'Outlook (cuenta del centro)'],
              ['hotmail', 'Outlook.com o Hotmail'],
              ['app', 'Aplicación de correo del ordenador'],
            ] as const
          ).map(([servicio, nombreServicio]) => (
            <a
              key={servicio}
              href={enlaceCorreo(resultado, servicio)}
              {...(servicio === 'app' ? {} : { target: '_blank', rel: 'noreferrer' })}
              className={`boton ${servicio === 'gmail' ? 'boton-principal' : 'boton-secundario'} justify-center`}
            >
              {nombreServicio}
            </a>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t-2 border-linea pt-4">
          <button type="button" className="boton boton-secundario" onClick={() => descargarPdf(resultado)}>
            Descargar en PDF
          </button>
          <button
            type="button"
            className="boton-texto"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(textoInforme(resultado))
                setInformeCopiado(true)
              } catch {
                setInformeCopiado(false)
              }
            }}
          >
            {informeCopiado ? 'Copiado: pégalo en un correo o en Classroom' : 'Copiar el informe'}
          </button>
        </div>
      </section>

      {resultado.intentos.length > 1 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold">Tus intentos</h2>
          <p className="mt-1 text-sm text-tinta-suave">Tu profesor o profesora los verá todos en el informe.</p>
          <ul className="mt-3 space-y-1">
            {lineasIntentos(resultado.intentos).map((l) => (
              <li key={l} className="rounded-lg bg-hoja px-3 py-2 text-sm">{l}</li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mt-10 text-lg font-bold">Tus respuestas</h2>
      <ol className="mt-3 space-y-3">
        {actividad.preguntas.map((p, i) => {
          const elegida = respuestas[p.id]
          const bien = elegida === p.correcta
          return (
            <li key={p.id} className={`rounded-xl border-l-[6px] bg-hoja p-4 ${bien ? 'border-verde' : 'border-rojo'}`}>
              <p className="font-bold">
                {i + 1}. {p.enunciado}
              </p>
              <p className="mt-1 text-sm">
                Tu respuesta: <span className={bien ? 'font-bold text-verde' : 'font-bold text-rojo'}>{elegida === undefined ? 'sin responder' : p.opciones[elegida]}</span>
                {!bien && (
                  <>
                    {' '}· Correcta: <strong>{p.opciones[p.correcta]}</strong>
                  </>
                )}
              </p>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
