import type { ReactNode } from 'react'

function Guia({ titulo, etiqueta, children }: { titulo: string; etiqueta?: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border-2 border-linea bg-papel/60">
      <summary className="cursor-pointer list-none px-4 py-3 font-bold [&::-webkit-details-marker]:hidden">
        <span className="mr-2 inline-block transition-transform group-open:rotate-90" aria-hidden="true">▸</span>
        {titulo}
        {etiqueta && <span className="ml-2 rounded bg-fosforito-claro px-1.5 py-0.5 text-xs">{etiqueta}</span>}
      </summary>
      <div className="space-y-3 px-4 pb-4 text-sm leading-relaxed">{children}</div>
    </details>
  )
}

function Pasos({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-1.5 pl-5 marker:font-bold">{children}</ol>
}

/** Cómo usar un vídeo propio que no está en YouTube: subirlo oculto a YouTube o compartirlo desde la nube. */
export function GuiasVideoPropio() {
  return (
    <div className="mt-4 space-y-2">
      <p className="text-sm font-bold text-tinta-suave">¿Tu vídeo no está en YouTube?</p>

      <Guia titulo="Súbelo a YouTube como vídeo oculto" etiqueta="Recomendado">
        <p>Es la forma más fiable: se ve bien en cualquier dispositivo y YouTube le pone subtítulos automáticos.</p>
        <Pasos>
          <li>
            Entra en{' '}
            <a className="font-bold text-boli underline" href="https://studio.youtube.com" target="_blank" rel="noreferrer">
              YouTube Studio
            </a>{' '}
            con tu cuenta de Google.
          </li>
          <li>Pulsa <strong>Crear → Subir vídeos</strong> y elige el archivo.</li>
          <li>
            En <strong>Visibilidad</strong>, elige <strong>Oculto</strong>: solo lo verá quien tenga el enlace. No sale en las búsquedas
            ni en tu canal.
          </li>
          <li>Copia el enlace del vídeo y pégalo arriba.</li>
        </Pasos>
        <p className="text-tinta-suave">
          Los subtítulos automáticos tardan un rato en aparecer. Cuando estén, usa «Desde YouTube» en el paso 2.
        </p>
      </Guia>

      <Guia titulo="Compártelo desde Google Drive, Dropbox u OneDrive">
        <p>
          El vídeo debe estar en <strong>MP4</strong> (lo normal en móviles y grabaciones de pantalla) y compartido para{' '}
          <strong>cualquier persona con el enlace</strong>.
        </p>
        <div>
          <p className="font-bold">Google Drive</p>
          <Pasos>
            <li>Clic derecho en el vídeo → <strong>Compartir</strong>.</li>
            <li>En «Acceso general», elige <strong>Cualquier persona con el enlace</strong>.</li>
            <li>Pulsa <strong>Copiar enlace</strong> y pégalo arriba.</li>
          </Pasos>
          <p className="mt-1 text-tinta-suave">
            Si el vídeo no se ve, comprueba que está compartido para cualquier persona. Si sigue sin verse, prueba con Dropbox o con YouTube oculto.
          </p>
        </div>
        <div>
          <p className="font-bold">Dropbox</p>
          <Pasos>
            <li>Pasa el ratón por el vídeo y pulsa <strong>Compartir</strong>.</li>
            <li>Comprueba que pone <strong>Cualquier persona con este enlace puede ver</strong>.</li>
            <li>Pulsa <strong>Copiar enlace</strong> y pégalo arriba.</li>
          </Pasos>
        </div>
        <div>
          <p className="font-bold">OneDrive</p>
          <Pasos>
            <li>Clic derecho en el vídeo → <strong>Compartir</strong>.</li>
            <li>Elige <strong>Cualquier persona con el vínculo puede ver</strong>.</li>
            <li>Pulsa <strong>Copiar vínculo</strong> y pégalo arriba.</li>
          </Pasos>
          <p className="mt-1 text-tinta-suave">
            Algunas cuentas de centro educativo no permiten compartir con personas de fuera. Si es tu caso, usa YouTube oculto.
          </p>
        </div>
        <p className="text-tinta-suave">Ojo: cualquiera que tenga el enlace de la actividad podrá ver el vídeo.</p>
      </Guia>
    </div>
  )
}
