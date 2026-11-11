import { Marca } from '../components/Marca'

const PASOS = [
  { titulo: 'Pega un vídeo de YouTube', texto: 'Cualquier vídeo público: una explicación, un documental, una clase grabada.' },
  { titulo: 'La IA prepara las preguntas', texto: 'Escucha el vídeo y coloca cada pregunta justo después de que se explique el dato.' },
  { titulo: 'Revisa y comparte el enlace', texto: 'Cambia lo que quieras y envía el enlace. Tus alumnos no instalan nada.' },
]

// Ejemplo ficticio para ilustrar la idea en la portada.
const EJEMPLO = [
  { pos: 18, estado: 'acierto' },
  { pos: 41, estado: 'acierto' },
  { pos: 63, estado: 'fallo' },
  { pos: 86, estado: 'pendiente' },
] as const

export function Inicio() {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
      <header className="flex items-center justify-between py-6">
        <Marca />
        <nav className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1">
          <a href="#/comprobar" className="boton-texto">Comprobar un informe</a>
          <a href="#/crear" className="boton-texto">Crear una actividad</a>
        </nav>
      </header>

      <section className="grid gap-10 pt-8 md:grid-cols-[1.1fr_1fr] md:items-center md:pt-16">
        <div>
          <h1 className="text-4xl font-extrabold leading-[1.05] sm:text-6xl">
            El vídeo se para.
            <br />
            El alumno responde.
          </h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-tinta-suave">
            Pausa convierte un vídeo de YouTube en una actividad interactiva. La inteligencia artificial
            funciona dentro de tu navegador: es gratis y no envía nada a ningún servidor.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#/crear" className="boton boton-principal text-lg">Crear una actividad</a>
          </div>
        </div>

        {/* Ilustración: un reproductor con preguntas marcadas en la línea de tiempo */}
        <div aria-hidden="true" className="rounded-2xl border-2 border-tinta bg-hoja p-3 shadow-[6px_6px_0_var(--color-tinta)]">
          <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-tinta">
            <div className="w-[78%] rounded-xl bg-hoja p-4 text-left">
              <p className="text-xs font-bold text-tinta-suave">Pregunta 3 de 4</p>
              <p className="mt-1 font-display text-base font-bold leading-snug sm:text-lg">
                ¿En qué siglo comenzó la Edad Media?
              </p>
              <div className="mt-3 grid grid-cols-2 gap-1.5 text-sm">
                {['Siglo III', 'Siglo V', 'Siglo X', 'Siglo XV'].map((o) => (
                  <span key={o} className={`rounded-md border-2 px-2 py-1 ${o === 'Siglo V' ? 'border-boli bg-boli/10 font-bold' : 'border-linea'}`}>
                    {o}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="relative mt-4 mb-2 h-6">
            <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-linea" />
            <div className="absolute left-0 top-1/2 h-1.5 w-[63%] -translate-y-1/2 rounded-full bg-tinta/70" />
            {EJEMPLO.map((m) => (
              <span
                key={m.pos}
                className={`absolute top-1/2 h-6 w-2.5 -translate-x-1/2 -translate-y-1/2 ${
                  m.estado === 'acierto' ? 'rounded-sm bg-verde' : m.estado === 'fallo' ? 'rounded-sm bg-rojo' : 'trazo-fosforito'
                }`}
                style={{ left: `${m.pos}%` }}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="mt-24">
        <h2 className="text-2xl font-bold">Cómo funciona</h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-3">
          {PASOS.map((p, i) => (
            <li key={p.titulo} className="border-t-2 border-tinta pt-4">
              <span className="font-display text-3xl font-extrabold text-tinta/25">{i + 1}</span>
              <h3 className="mt-1 text-lg font-bold">{p.titulo}</h3>
              <p className="mt-1 leading-relaxed text-tinta-suave">{p.texto}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-20 grid gap-6 rounded-2xl bg-hoja p-6 sm:grid-cols-2 sm:p-8">
        <div>
          <h2 className="text-xl font-bold">Al terminar, un informe</h2>
          <p className="mt-2 leading-relaxed text-tinta-suave">
            Cada alumno ve cuántas preguntas ha acertado y fallado, y puede enviártelo por correo o descargarlo en PDF.
          </p>
        </div>
        <div>
          <h2 className="text-xl font-bold">Sin cuentas ni costes</h2>
          <p className="mt-2 leading-relaxed text-tinta-suave">
            La actividad viaja dentro del propio enlace. No hay que registrarse, ni pagar una IA, ni guardar datos del alumnado.
          </p>
        </div>
      </section>
    </div>
  )
}
