import type { Pregunta } from '../types'
import { formatoTiempo } from '../lib/tiempo'

type EstadoMarca = 'pendiente' | 'acierto' | 'fallo' | 'activa'

type Props = {
  duracion: number
  actual: number
  preguntas: Pregunta[]
  estadoDe?: (p: Pregunta) => EstadoMarca
  /** Si se pasa, cada marca es un botón (modo profesor). */
  alElegir?: (p: Pregunta) => void
  seleccionada?: string | null
}

const COLOR: Record<EstadoMarca, string> = {
  pendiente: 'trazo-fosforito',
  activa: 'trazo-fosforito ring-2 ring-tinta',
  acierto: 'bg-verde rounded-sm',
  fallo: 'bg-rojo rounded-sm',
}

/** La línea de tiempo del vídeo, con cada pregunta marcada como un trazo de fosforito. */
export function LineaTiempo({ duracion, actual, preguntas, estadoDe, alElegir, seleccionada }: Props) {
  const total = Math.max(duracion, 1)
  const porcentaje = (s: number) => `${Math.min(100, Math.max(0, (s / total) * 100))}%`

  return (
    <div className="select-none">
      <div className="relative h-9">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-linea" />
        <div className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-tinta/70" style={{ width: porcentaje(actual) }} />
        {preguntas.map((p, i) => {
          const estado = seleccionada === p.id ? 'activa' : (estadoDe?.(p) ?? 'pendiente')
          const etiqueta = `Pregunta ${i + 1}, en el minuto ${formatoTiempo(p.tiempo)}`
          const clase = `absolute top-1/2 h-6 w-2.5 -translate-x-1/2 -translate-y-1/2 ${COLOR[estado]}`
          return alElegir ? (
            <button
              key={p.id}
              type="button"
              title={etiqueta}
              aria-label={etiqueta}
              onClick={() => alElegir(p)}
              className={`${clase} cursor-pointer hover:scale-125 transition-transform`}
              style={{ left: porcentaje(p.tiempo) }}
            />
          ) : (
            <span key={p.id} aria-label={etiqueta} className={clase} style={{ left: porcentaje(p.tiempo) }} />
          )
        })}
      </div>
      <div className="flex justify-between text-xs tabular-nums text-tinta-suave">
        <span>{formatoTiempo(actual)}</span>
        <span>{formatoTiempo(duracion)}</span>
      </div>
    </div>
  )
}
