import { extraerIdYouTube } from './youtube'

/**
 * De dónde sale el vídeo de una actividad:
 *  - YouTube (también vídeos ocultos), con su reproductor oficial;
 *  - un archivo de vídeo en la nube del profesor (Google Drive, Dropbox, OneDrive) o un enlace directo a un .mp4,
 *    que se reproduce con el reproductor del navegador.
 */
export type ServicioArchivo = 'drive' | 'dropbox' | 'onedrive' | 'directo'

export type FuenteVideo =
  | { tipo: 'youtube'; id: string }
  | { tipo: 'archivo'; url: string; servicio: ServicioArchivo }

export const NOMBRE_SERVICIO: Record<ServicioArchivo, string> = {
  drive: 'Google Drive',
  dropbox: 'Dropbox',
  onedrive: 'OneDrive',
  directo: 'enlace directo',
}

/** base64url, como lo pide la API de enlaces compartidos de OneDrive. */
function base64Url(texto: string): string {
  const bytes = new TextEncoder().encode(texto)
  let binario = ''
  bytes.forEach((b) => (binario += String.fromCharCode(b)))
  return btoa(binario).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/**
 * Convierte el enlace de "compartir" que da cada servicio en uno que el navegador puede reproducir.
 * Devuelve null si no parece un enlace de vídeo.
 */
export function leerEnlaceVideo(texto: string): FuenteVideo | null {
  const t = texto.trim()
  if (!t) return null
  const id = extraerIdYouTube(t)
  if (id) return { tipo: 'youtube', id }

  let u: URL
  try {
    u = new URL(t)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.toLowerCase()

  // Google Drive: drive.google.com/file/d/ID/view, …/open?id=ID, …/uc?id=ID
  if (host === 'drive.google.com' || host === 'docs.google.com' || host === 'drive.usercontent.google.com') {
    const idDrive = u.pathname.match(/\/d\/([\w-]{10,})/)?.[1] ?? u.searchParams.get('id')
    if (!idDrive) return null
    return { tipo: 'archivo', servicio: 'drive', url: `https://drive.google.com/uc?export=download&id=${idDrive}` }
  }

  // Dropbox: cambiar dl=0 por raw=1 sirve el archivo tal cual (y permite saltar a cualquier minuto).
  if (host.endsWith('dropbox.com') || host.endsWith('dropboxusercontent.com')) {
    u.searchParams.delete('dl')
    u.searchParams.set('raw', '1')
    return { tipo: 'archivo', servicio: 'dropbox', url: u.toString() }
  }

  // OneDrive personal (1drv.ms, onedrive.live.com): API pública de enlaces compartidos.
  if (host === '1drv.ms' || host.endsWith('onedrive.live.com')) {
    return { tipo: 'archivo', servicio: 'onedrive', url: `https://api.onedrive.com/v1.0/shares/u!${base64Url(t)}/root/content` }
  }

  // OneDrive de un centro educativo (SharePoint / Microsoft 365): añadir download=1.
  if (host.endsWith('sharepoint.com')) {
    u.searchParams.set('download', '1')
    return { tipo: 'archivo', servicio: 'onedrive', url: u.toString() }
  }

  // Cualquier otro enlace: se prueba como archivo de vídeo directo (.mp4, .webm…).
  return { tipo: 'archivo', servicio: 'directo', url: u.toString() }
}
