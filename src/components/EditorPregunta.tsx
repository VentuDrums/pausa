import { useEffect, useState } from 'react'
import type { PreguntaEditable, TipoPregunta } from '../types'
import { formatoTiempo, leerTiempo } from '../lib/tiempo'

type Props = {
  numero: number
  pregunta: PreguntaEditable
  seleccionada: boolean
  regenerando: boolean
  puedeRegenerar: boolean
  alCambiar: (p: PreguntaEditable) => void
  alOrdenar: () => void
  alBorrar: () => void
  alRegenerar: () => void
  alIr: () => void
  /** Opciones de verdadero/falso en el idioma de las preguntas. */
  etiquetasVf?: readonly [string, string]
}

const LETRAS = ['A', 'B', 'C', 'D']

export function EditorPregunta({
  numero, pregunta: p, seleccionada, regenerando, puedeRegenerar, alCambiar, alOrdenar, alBorrar, alRegenerar, alIr, etiquetasVf,
}: Props) {
  const [textoTiempo, setTextoTiempo] = useState(formatoTiempo(p.tiempo))
  useEffect(() => setTextoTiempo(formatoTiempo(p.tiempo)), [p.tiempo])

  function cambiarTipo(tipo: TipoPregunta) {
    if (tipo === p.tipo) return
    alCambiar(
      tipo === 'vf'
        ? { ...p, tipo, opciones: [...(etiquetasVf ?? ['Verdadero', 'Falso'])], correcta: 0 }
        : { ...p, tipo, opciones: ['', '', '', ''], correcta: 0 },
    )
  }

  function confirmarTiempo() {
    const t = leerTiempo(textoTiempo)
    if (t === null) {
      setTextoTiempo(formatoTiempo(p.tiempo))
      return
    }
    alCambiar({ ...p, tiempo: t })
    alOrdenar()
  }

  return (
    <li
      id={`pregunta-${p.id}`}
      className={`aparecer scroll-mt-24 rounded-xl border-2 bg-hoja p-4 transition-colors ${
        seleccionada ? 'border-tinta' : 'border-linea'
      } ${regenerando ? 'animate-pulse' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="trazo-fosforito px-2 py-0.5 font-display text-sm font-bold">{numero}</span>
        <label className="inline-flex items-center gap-1.5 text-sm">
          <span className="text-tinta-suave">Se para en el</span>
          <input
            aria-label="Momento del vídeo (minutos:segundos)"
            className="w-20 rounded-lg border-2 border-linea bg-hoja px-2 py-1 text-center tabular-nums focus:border-boli focus:outline-none"
            value={textoTiempo}
            onChange={(e) => setTextoTiempo(e.target.value)}
            onBlur={confirmarTiempo}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </label>
        <button type="button" className="boton-texto" onClick={alIr}>Ver este momento</button>
        <select
          aria-label="Tipo de pregunta"
          className="ml-auto rounded-lg border-2 border-linea bg-hoja px-2 py-1 text-sm"
          value={p.tipo}
          onChange={(e) => cambiarTipo(e.target.value as TipoPregunta)}
        >
          <option value="test">Tipo test</option>
          <option value="vf">Verdadero o falso</option>
        </select>
      </div>

      <label className="sr-only" htmlFor={`enunciado-${p.id}`}>Enunciado</label>
      <textarea
        id={`enunciado-${p.id}`}
        rows={2}
        className="campo mt-3 resize-y font-display text-lg font-bold leading-snug"
        placeholder={p.tipo === 'vf' ? 'Escribe la afirmación' : 'Escribe la pregunta'}
        value={p.enunciado}
        onChange={(e) => alCambiar({ ...p, enunciado: e.target.value })}
      />

      <fieldset className="mt-3">
        <legend className="mb-1.5 text-sm text-tinta-suave">
          {p.tipo === 'vf' ? 'Esta afirmación es…' : 'Opciones (marca la correcta)'}
        </legend>
        {p.tipo === 'vf' ? (
          <div className="flex gap-2">
            {p.opciones.map((o, i) => (
              <label
                key={o}
                className={`flex-1 cursor-pointer rounded-lg border-2 px-3 py-2 text-center font-bold ${
                  p.correcta === i ? 'border-verde bg-verde-claro text-verde' : 'border-linea'
                }`}
              >
                <input type="radio" className="sr-only" name={`correcta-${p.id}`} checked={p.correcta === i} onChange={() => alCambiar({ ...p, correcta: i })} />
                {o}
              </label>
            ))}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {p.opciones.map((o, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 rounded-lg border-2 pl-2 ${p.correcta === i ? 'border-verde bg-verde-claro' : 'border-linea'}`}
              >
                <input
                  type="radio"
                  aria-label={`Marcar la opción ${LETRAS[i]} como correcta`}
                  className="h-4 w-4 shrink-0 accent-verde"
                  name={`correcta-${p.id}`}
                  checked={p.correcta === i}
                  onChange={() => alCambiar({ ...p, correcta: i })}
                />
                <span className="text-sm font-bold text-tinta-suave">{LETRAS[i]}</span>
                <input
                  aria-label={`Opción ${LETRAS[i]}`}
                  className="min-w-0 flex-1 bg-transparent py-2 pr-2 focus:outline-none"
                  value={o}
                  placeholder="Escribe una opción"
                  onChange={(e) => alCambiar({ ...p, opciones: p.opciones.map((x, j) => (j === i ? e.target.value : x)) })}
                />
              </div>
            ))}
          </div>
        )}
      </fieldset>

      <label className="mt-3 block">
        <span className="mb-1 block text-sm text-tinta-suave">Explicación si el alumno falla</span>
        <input className="campo py-2 text-sm" value={p.explicacion} onChange={(e) => alCambiar({ ...p, explicacion: e.target.value })} />
      </label>

      <div className="mt-3 flex justify-end gap-2">
        {p.fuente && (
          <button type="button" className="boton-texto" disabled={!puedeRegenerar} onClick={alRegenerar}>
            {regenerando ? 'Escribiendo otra…' : 'Pedir otra pregunta'}
          </button>
        )}
        <button type="button" className="boton-texto text-rojo hover:bg-rojo/10" onClick={alBorrar}>
          Borrar
        </button>
      </div>
    </li>
  )
}
