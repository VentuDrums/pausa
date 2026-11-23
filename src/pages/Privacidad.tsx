import { useState, type ReactNode } from 'react'
import { Marca } from '../components/Marca'

const ACTUALIZADO = '15 de noviembre de 2026'

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-2xl font-bold">{titulo}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-tinta-suave [&_strong]:text-tinta">{children}</div>
    </section>
  )
}

/** Borra todo lo que Pausa ha guardado en este navegador (intentos, borradores y preferencias). */
function borrarDatosLocales(): number {
  let borrados = 0
  try {
    const claves: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const clave = localStorage.key(i)
      if (clave?.startsWith('pausa-')) claves.push(clave)
    }
    for (const clave of claves) {
      localStorage.removeItem(clave)
      borrados++
    }
  } catch {
    /* sin almacenamiento */
  }
  return borrados
}

/** Aviso de privacidad, en lenguaje claro, para alumnos, familias y profesores. */
export function Privacidad() {
  const [borrado, setBorrado] = useState<number | null>(null)

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 sm:px-6">
      <header className="py-6">
        <Marca />
      </header>

      <h1 className="text-3xl font-extrabold sm:text-4xl">Privacidad</h1>
      <p className="mt-3 text-sm text-tinta-suave">Última actualización: {ACTUALIZADO}</p>

      <div className="mt-6 rounded-2xl border-2 border-tinta bg-hoja p-5 shadow-[5px_5px_0_var(--color-tinta)] sm:p-6">
        <p className="font-display text-xl font-bold">En resumen</p>
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed">
          <li>Pausa <strong>no tiene cuentas, ni base de datos, ni servidor que guarde datos</strong> de alumnos o profesores.</li>
          <li>El nombre y las respuestas del alumno se quedan <strong>en su propio navegador</strong>. Solo salen de ahí si él mismo envía su informe al profesor.</li>
          <li>No usa cookies, publicidad ni herramientas de seguimiento.</li>
          <li>La IA solo se usa para <strong>proponer preguntas al profesor</strong>, que las revisa. No evalúa a los alumnos.</li>
        </ul>
      </div>

      <Seccion titulo="Si eres alumno o alumna">
        <p>
          Para hacer una actividad te pedimos tu <strong>nombre y apellidos</strong> y, si quieres, tu curso y grupo. Sirven para que tu
          profesor sepa de quién es el informe. <strong>No escribas otros datos personales</strong> (teléfono, dirección, correo…): no hacen falta.
        </p>
        <p>
          Tu nombre, tus respuestas y tu resultado se guardan <strong>solo en este navegador</strong>, para que puedas seguir si se recarga la
          página y para que el informe incluya todos tus intentos. Pausa no los recibe ni los ve nadie más.
        </p>
        <p>
          Al terminar, decides tú cómo entregar el informe: lo envías por correo desde tu propia cuenta (Gmail, Outlook u otra) o descargas
          el PDF. En ese caso, el informe viaja de tu correo al de tu profesor, como cualquier otro correo.
        </p>
      </Seccion>

      <Seccion titulo="Si eres profesor o profesora">
        <p>
          La actividad que creas (el vídeo, las preguntas y <strong>tu correo</strong>, para que los alumnos puedan enviarte el informe)
          viaja <strong>dentro del propio enlace</strong>. No se guarda en ningún servidor, pero cualquiera que tenga el enlace puede verla:
          usa tu correo de trabajo y comparte el enlace solo con tus alumnos.
        </p>
        <p>
          Mientras preparas la actividad, Pausa guarda un borrador y tus preferencias en tu navegador para que no pierdas el trabajo.
        </p>
        <p>
          <strong>La IA que crea las preguntas puede trabajar de dos formas:</strong>
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>En tu navegador:</strong> el modelo se descarga en tu ordenador y la transcripción del vídeo no sale de él.
          </li>
          <li>
            <strong>En la nube:</strong> el texto del vídeo se envía a Cloudflare Workers AI para que el modelo Gemma 4 proponga las
            preguntas. Solo se envía ese texto, nunca datos de alumnos. Pausa tiene desactivados los registros de esas peticiones, y
            Cloudflare no usa este contenido para entrenar sus modelos.
          </li>
        </ul>
        <p>
          Si transcribes el vídeo con Pausa, la transcripción se hace en tu ordenador con el modelo Whisper: el audio no se envía a
          ningún sitio.
        </p>
      </Seccion>

      <Seccion titulo="Quién más interviene">
        <p>Para funcionar, Pausa se apoya en estos servicios. Como cualquier web, pueden ver datos técnicos de la conexión (la dirección IP y el navegador):</p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>GitHub Pages</strong>, que aloja la web de Pausa.</li>
          <li>
            <strong>YouTube</strong>, si el vídeo está en YouTube. Pausa usa su modo de privacidad mejorada (youtube-nocookie.com):
            YouTube no guarda cookies hasta que se reproduce el vídeo; a partir de ahí se aplica su política de privacidad.
          </li>
          <li>
            <strong>Google Drive, Dropbox u OneDrive</strong>, si el vídeo está guardado ahí. Los vídeos de Drive pasan por un pequeño
            intermediario de Pausa en Cloudflare, que no guarda nada.
          </li>
          <li><strong>Cloudflare</strong>, solo si el profesor usa la IA en la nube.</li>
          <li><strong>Hugging Face y jsDelivr</strong>, de donde se descargan los modelos de IA cuando el profesor la usa en su navegador.</li>
          <li><strong>Tu servicio de correo</strong>, si envías el informe por correo.</li>
        </ul>
        <p>
          Algunos de estos servicios son de empresas de Estados Unidos y pueden tratar datos técnicos fuera de la Unión Europea, con las
          garantías que establecen sus propias políticas (por ejemplo, el Marco de Privacidad de Datos UE-EE. UU.). Pausa no les envía
          datos personales del alumnado.
        </p>
      </Seccion>

      <Seccion titulo="Inteligencia artificial">
        <p>
          La IA de Pausa solo <strong>propone</strong> preguntas a partir del vídeo. El profesor las revisa, las corrige si hace falta y
          decide cuáles usar. Las respuestas de los alumnos se corrigen comparándolas con la opción que el profesor ha dado por buena: no
          las corrige una IA ni se toma ninguna decisión automática sobre el alumno.
        </p>
      </Seccion>

      <Seccion titulo="Borrar tus datos">
        <p>
          Como todo se guarda en tu navegador, puedes borrarlo cuando quieras con este botón. Se eliminarán tus intentos, borradores y
          preferencias de Pausa en este navegador. Los informes que ya hayas enviado por correo no se ven afectados.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="boton" onClick={() => setBorrado(borrarDatosLocales())}>
            Borrar mis datos de Pausa en este navegador
          </button>
          {borrado !== null && (
            <p role="status" className="text-sm font-bold text-tinta">
              {borrado > 0 ? 'Listo: se han borrado tus datos de Pausa.' : 'No había datos de Pausa guardados en este navegador.'}
            </p>
          )}
        </div>
      </Seccion>

      <Seccion titulo="Responsabilidad y contacto">
        <p>
          Pausa es un proyecto personal y gratuito, con el código a la vista para que cualquiera pueda revisar qué hace. Cuando un profesor la usa con su alumnado, es él (y su centro) quien
          decide usarla y quien recibe los informes, así que debe seguir las normas de protección de datos de su centro y de su
          administración educativa.
        </p>
        <p>
          Si tienes dudas o quieres comentar algo sobre la privacidad de Pausa, escribe en{' '}
          <a className="underline" href="https://github.com/VentuDrums/pausa/issues" target="_blank" rel="noreferrer">
            github.com/VentuDrums/pausa
          </a>
          .
        </p>
      </Seccion>

      <p className="mt-12">
        <a href="#/" className="boton-texto">← Volver al inicio</a>
      </p>
    </div>
  )
}
