/**
 * Botón "Enviar a Pausa" para la barra de marcadores (un "bookmarklet").
 *
 * YouTube no deja que otras webs lean sus transcripciones (las bloquea el navegador por seguridad),
 * pero un marcador se ejecuta dentro de la propia página de YouTube: abre el panel "Mostrar transcripción",
 * lo lee y abre Pausa con el vídeo y el texto ya cargados. No hace falta ningún servidor.
 */
function enviarAPausa(app: string) {
  const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const leer = () =>
    Array.from(document.querySelectorAll('transcript-segment-view-model, ytd-transcript-segment-renderer'))

  ;(async () => {
    const parametros = new URLSearchParams(location.search)
    const video = parametros.get('v') || (location.pathname.match(/\/shorts\/([\w-]{11})/) || [])[1]
    if (!/(^|\.)youtube\.com$/.test(location.hostname) || !video) {
      alert('Abre un vídeo de YouTube y vuelve a pulsar «Enviar a Pausa».')
      return
    }
    let trozos = leer()
    if (!trozos.length) {
      ;(document.querySelector('#description #expand, ytd-text-inline-expander #expand') as HTMLElement | null)?.click()
      await esperar(500)
      const boton =
        (document.querySelector('ytd-video-description-transcript-section-renderer button') as HTMLElement | null) ||
        (Array.from(document.querySelectorAll('button')).find((b) =>
          /transcrip/i.test(`${b.getAttribute('aria-label') || ''} ${b.textContent || ''}`),
        ) as HTMLElement | undefined)
      if (!boton) {
        alert('Este vídeo no tiene transcripción. En Pausa, usa la opción «Subir el vídeo (MP4)».')
        return
      }
      boton.click()
      for (let i = 0; i < 40 && !trozos.length; i++) {
        await esperar(250)
        trozos = leer()
      }
    }
    if (!trozos.length) {
      alert('No he podido abrir la transcripción. Ábrela tú con «Mostrar transcripción» y vuelve a pulsar «Enviar a Pausa».')
      return
    }
    const lineas = trozos
      .map((t) => {
        const tiempo = t.querySelector('[class*="Timestamp"]:not([class*="A11y"]), .segment-timestamp')?.textContent?.trim()
        const texto = t.querySelector('[role="text"], .segment-text')?.textContent?.trim()
        return tiempo && texto ? `${tiempo} ${texto}` : ''
      })
      .filter(Boolean)
    const titulo = document.title.replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube$/, '')
    const datos = JSON.stringify({ v: video, t: titulo, x: lineas.join('\n') })
    window.open(`${app}#/crear?importar=${encodeURIComponent(datos)}`, '_blank')
  })()
}

/** Código del marcador, apuntando a la dirección donde está publicada esta app. */
export function codigoMarcador(): string {
  const app = `${location.origin}${location.pathname}`
  return `javascript:${encodeURIComponent(`(${enviarAPausa.toString()})(${JSON.stringify(app)})`)}`
}

export type DatosImportados = { videoId: string; titulo: string; texto: string }

/** Lee lo que el marcador manda en la dirección (#/crear?importar=...). */
export function leerImportacion(hash: string): DatosImportados | null {
  const i = hash.indexOf('?importar=')
  if (i < 0) return null
  try {
    const datos = JSON.parse(decodeURIComponent(hash.slice(i + '?importar='.length)))
    if (!/^[\w-]{11}$/.test(datos.v) || typeof datos.x !== 'string') return null
    return { videoId: datos.v, titulo: String(datos.t ?? ''), texto: datos.x }
  } catch {
    return null
  }
}
