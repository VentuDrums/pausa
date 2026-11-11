import { useMemo, useState } from 'react'
import { Marca } from '../components/Marca'
import { fechaCorta, leerCodigo, notaDe, type InformeComprobado } from '../lib/intentos'

/** Busca un código de Pausa válido en lo que se haya pegado (el código solo o el correo entero). */
function buscarCodigo(texto: string): { informe: InformeComprobado | null; habiaAlgo: boolean } {
  const limpio = texto.trim()
  if (!limpio) return { informe: null, habiaAlgo: false }
  const candidatos = [limpio, ...limpio.split(/\s+/)].filter((t) => t.includes('.') && t.length > 20)
  for (const c of candidatos) {
    const informe = leerCodigo(c)
    if (informe) return { informe, habiaAlgo: true }
  }
  return { informe: null, habiaAlgo: true }
}

/** Página para el profesor: comprueba el código de un informe y muestra lo que de verdad pasó. */
export function Comprobar() {
  const [texto, setTexto] = useState('')
  const { informe, habiaAlgo } = useMemo(() => buscarCodigo(texto), [texto])

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 sm:px-6">
      <header className="py-6">
        <a href="#/">
          <Marca />
        </a>
      </header>

      <h1 className="text-3xl font-extrabold sm:text-4xl">Comprobar un informe</h1>
      <p className="mt-3 leading-relaxed text-tinta-suave">
        Pega el código de comprobación que aparece al final del PDF o del correo del alumno (o el correo entero). Pausa te dirá si es
        auténtico y qué intentos se hicieron en su dispositivo.
      </p>

      <label className="etiqueta mt-6" htmlFor="codigo">Código de comprobación</label>
      <textarea
        id="codigo"
        className="campo h-28 resize-y font-mono text-xs"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="N4Ig…"
        spellCheck={false}
      />

      {habiaAlgo && !informe && (
        <div role="alert" className="aparecer mt-5 rounded-2xl border-2 border-rojo bg-rojo-claro p-5">
          <p className="font-display text-xl font-bold text-rojo">Código no válido</p>
          <p className="mt-1 leading-relaxed">
            No es un código de Pausa o se ha modificado. Comprueba que lo has copiado entero; si es así, el informe puede estar alterado.
          </p>
        </div>
      )}

      {informe && (
        <div className="aparecer mt-5 rounded-2xl border-2 border-tinta bg-hoja p-5 shadow-[5px_5px_0_var(--color-tinta)] sm:p-6">
          <p className="font-display text-xl font-bold text-verde">Código auténtico</p>
          <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-tinta-suave">Actividad</dt>
            <dd className="font-bold">{informe.titulo || 'Vídeo interactivo'}</dd>
            <dt className="text-tinta-suave">Alumno/a</dt>
            <dd className="font-bold">
              {informe.nombre}
              {informe.grupo && ` (${informe.grupo})`}
            </dd>
          </dl>

          <h2 className="mt-5 font-bold">
            {informe.intentos.length === 1 ? '1 intento en su dispositivo' : `${informe.intentos.length} intentos en su dispositivo`}
          </h2>
          <ol className="mt-2 space-y-1.5">
            {informe.intentos.map((x, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-papel px-3 py-2">
                <span className="font-bold">Intento {i + 1}</span>
                <span>
                  {x.aciertos} de {x.total} · nota <strong>{notaDe(x.aciertos, x.total).toLocaleString('es-ES')}</strong>
                </span>
                <span className="text-sm text-tinta-suave">{fechaCorta(x.fecha)}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm leading-relaxed text-tinta-suave">
            Compara estos datos con los del PDF o el correo: si no coinciden, el informe se ha cambiado a mano. Pausa solo ve los intentos
            hechos en ese navegador; otro dispositivo o el modo incógnito no aparecen aquí.
          </p>
        </div>
      )}
    </div>
  )
}
