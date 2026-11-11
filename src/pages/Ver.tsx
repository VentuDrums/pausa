import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Marca } from '../components/Marca'
import { Reproductor } from '../components/Reproductor'
import { LineaTiempo } from '../components/LineaTiempo'
import { fuenteDeActividad, leerActividad } from '../lib/compartir'
import { ESTADO_YT, type ReproductorYT } from '../lib/youtube'
import { calcularNota, descargarPdf, enlaceCorreo, lineasIntentos, type Resultado } from '../lib/informe'
import { crearCodigo, fechaCorta, guardarIntento, idActividad, leerIntentos, type Intento } from '../lib/intentos'
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
  return <VerActividad actividad={actividad} id={idActividad(codigo)} />
}

type Fase = 'datos' | 'viendo' | 'informe'

function VerActividad({ actividad, id }: { actividad: Actividad; id: string }) {
  // Intentos anteriores en este navegador (solo se guardan aquí, en el dispositivo del alumno).
  const previos = useMemo(() => leerIntentos(id), [id])
  const [intentos, setIntentos] = useState<Intento[]>(previos)
  const bloqueada = !!actividad.unIntento && previos.length > 0
  const [fase, setFase] = useState<Fase>('datos')
  const [nombre, setNombre] = useState('')
  const [grupo, setGrupo] = useState('')
  const [respuestas, setRespuestas] = useState<Record<string, number>>({})
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

  const preguntas = actividad.preguntas
  const fuente = useMemo(() => fuenteDeActividad(actividad), [actividad])
  const pendiente = useCallback(
    (hasta = Infinity) => preguntas.find((p) => respuestasRef.current[p.id] === undefined && p.tiempo <= hasta),
    [preguntas],
  )

  const abrir = useCallback((p: Pregunta) => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    setActiva(p)
    setElegida(null)
    setComprobada(false)
    requestAnimationFrame(() => tarjeta.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  }, [])

  // Vigila el vídeo: cuando llega (o se adelanta) al momento de una pregunta, lo detiene.
  useEffect(() => {
    if (fase !== 'viendo') return
    const id = setInterval(() => {
      const r = reproductor.current
      if (!r?.getCurrentTime) return
      const ahora = r.getCurrentTime() || 0
      setTiempo(ahora)
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
  }, [fase, pendiente, abrir])

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
    setFase('viendo')
    reproductor.current?.playVideo()
  }

  function comprobar() {
    if (!activa || elegida === null) return
    setRespuestas((r) => ({ ...r, [activa.id]: elegida }))
    respuestasRef.current = { ...respuestasRef.current, [activa.id]: elegida }
    setComprobada(true)
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

  // Solo un intento y ya lo hizo: se le enseña su informe de entonces, no el vídeo.
  if (bloqueada) {
    const primero = previos[0]
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
        <div className="relative aspect-video overflow-hidden rounded-xl bg-tinta">
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
          {(fase === 'datos' || activa) && (
            <div className="absolute inset-0 flex items-center justify-center bg-tinta/80 p-4 backdrop-blur-[2px]">
              {activa && (
                <p className="hidden text-center font-display text-lg font-bold text-papel sm:block">
                  Responde la pregunta para seguir viendo el vídeo
                </p>
              )}
            </div>
          )}
        </div>
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
                previos.length > 0 && (
                  <p className="mt-2 rounded-lg bg-fosforito-claro px-3 py-2 text-sm">
                    Ya has hecho esta actividad {previos.length === 1 ? 'una vez' : `${previos.length} veces`} en este dispositivo. Tu informe
                    incluirá todos los intentos.
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

      <div className="mt-3">
        <LineaTiempo
          duracion={duracion}
          actual={tiempo}
          preguntas={preguntas}
          estadoDe={(p) => (respuestas[p.id] === undefined ? 'pendiente' : respuestas[p.id] === p.correcta ? 'acierto' : 'fallo')}
          seleccionada={activa?.id ?? null}
        />
      </div>

      {activa && (
        <div ref={tarjeta} className="aparecer mt-5 scroll-mt-4 rounded-2xl border-2 border-tinta bg-hoja p-5 shadow-[5px_5px_0_var(--color-tinta)] sm:p-7">
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
              <button type="button" className="boton boton-principal mt-5 w-full sm:w-auto" onClick={continuar}>
                {reproductor.current?.getPlayerState() === ESTADO_YT.TERMINADO && !quedanDespues ? 'Ver mis resultados' : 'Seguir viendo el vídeo'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Informe({ resultado, aviso }: { resultado: Resultado; aviso?: string }) {
  const { total, aciertos, fallos, nota } = calcularNota(resultado)
  const { actividad, respuestas } = resultado
  const [copiado, setCopiado] = useState(false)

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
          {actividad.emailProfesor
            ? `Se abrirá tu correo con el informe ya escrito para ${actividad.emailProfesor}. Solo tienes que pulsar Enviar.`
            : 'Se abrirá tu correo con el informe ya escrito. Añade la dirección de tu profesor o profesora y pulsa Enviar.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a href={enlaceCorreo(resultado)} className="boton boton-principal">
            Enviar por correo
          </a>
          <button type="button" className="boton boton-secundario" onClick={() => descargarPdf(resultado)}>
            Descargar en PDF
          </button>
        </div>
      </section>

      {resultado.intentos.length > 1 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold">Tus intentos en este dispositivo</h2>
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

      <section className="mt-10 rounded-xl border-2 border-linea p-4">
        <h2 className="font-bold">Código de comprobación</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Va incluido en el correo y en el PDF. Sirve para que tu profesor o profesora compruebe que el informe no se ha cambiado.
        </p>
        <p className="mt-2 break-all rounded-lg bg-papel p-2 font-mono text-xs">{resultado.codigo}</p>
        <button
          type="button"
          className="boton-texto mt-2"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(resultado.codigo)
              setCopiado(true)
            } catch {
              setCopiado(false)
            }
          }}
        >
          {copiado ? 'Copiado' : 'Copiar el código'}
        </button>
      </section>
    </div>
  )
}
