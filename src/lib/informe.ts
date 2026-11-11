import type { jsPDF as JsPDF } from 'jspdf'
import type { Actividad } from '../types'
import { formatoTiempo } from './tiempo'

export type Resultado = {
  nombre: string
  grupo: string
  actividad: Actividad
  /** id de pregunta -> índice de la opción elegida */
  respuestas: Record<string, number>
}

export function calcularNota(r: Resultado) {
  const total = r.actividad.preguntas.length
  const aciertos = r.actividad.preguntas.filter((p) => r.respuestas[p.id] === p.correcta).length
  return { total, aciertos, fallos: total - aciertos, nota: total ? Math.round((aciertos / total) * 100) / 10 : 0 }
}

function recortar(texto: string, max: number) {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto
}

/** Enlace "mailto:" que abre el correo del alumno con todo ya escrito. */
export function enlaceCorreo(r: Resultado): string {
  const { total, aciertos, fallos, nota } = calcularNota(r)
  const asunto = `Resultados de "${r.actividad.titulo || 'vídeo'}" - ${r.nombre}`
  const lineas = [
    `Alumno/a: ${r.nombre}${r.grupo ? ` (${r.grupo})` : ''}`,
    `Actividad: ${r.actividad.titulo || 'Vídeo interactivo'}`,
    `Aciertos: ${aciertos} de ${total}  |  Fallos: ${fallos}  |  Nota: ${nota.toLocaleString('es-ES')}`,
    '',
    ...r.actividad.preguntas.map((p, i) => {
      const elegida = r.respuestas[p.id]
      const bien = elegida === p.correcta
      const respuesta = elegida === undefined ? 'sin responder' : p.opciones[elegida]
      return `${i + 1}. [${bien ? 'BIEN' : 'MAL'}] ${recortar(p.enunciado, 90)} -> ${recortar(respuesta, 50)}`
    }),
    '',
    'Enviado desde Pausa',
  ]
  const destino = encodeURIComponent(r.actividad.emailProfesor || '')
  return `mailto:${destino}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(lineas.join('\n'))}`
}

export async function descargarPdf(r: Resultado) {
  const { doc, nombreArchivo } = await crearPdf(r)
  doc.save(`${nombreArchivo}.pdf`)
}

/** La fuente del PDF solo tiene caracteres latinos: quitamos emojis y símbolos que saldrían como basura. */
function latino(texto: string): string {
  return texto
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[^ -ÿ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function crearPdf(r: Resultado): Promise<{ doc: JsPDF; nombreArchivo: string }> {
  // La librería de PDF solo se descarga cuando el alumno la pide.
  const { jsPDF } = await import('jspdf')
  const { total, aciertos, fallos, nota } = calcularNota(r)
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margen = 18
  const ancho = 210 - margen * 2
  let y = 22

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(27, 43, 38)
  const lineasTitulo = doc.splitTextToSize(latino(r.actividad.titulo) || 'Vídeo interactivo', ancho)
  doc.text(lineasTitulo, margen, y)
  y += lineasTitulo.length * 7.5 + 2

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(77, 98, 91)
  doc.text(latino(`${r.nombre}${r.grupo ? ` · ${r.grupo}` : ''}  -  ${new Date().toLocaleString('es-ES')}`), margen, y)
  y += 10

  doc.setFillColor(252, 239, 192)
  doc.roundedRect(margen, y, ancho, 18, 3, 3, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(27, 43, 38)
  doc.text(`Aciertos: ${aciertos} de ${total}     Fallos: ${fallos}     Nota: ${nota.toLocaleString('es-ES')}`, margen + 5, y + 11)
  y += 28

  r.actividad.preguntas.forEach((p, i) => {
    const elegida = r.respuestas[p.id]
    const bien = elegida === p.correcta
    const lineasPregunta = doc.splitTextToSize(latino(`${i + 1}. ${p.enunciado}`), ancho - 22)
    const respuesta = latino(`Respuesta: ${elegida === undefined ? 'sin responder' : p.opciones[elegida]}`)
    const correcta = bien ? '' : latino(`Correcta: ${p.opciones[p.correcta]}`)
    const alto = lineasPregunta.length * 5 + 12 + (correcta ? 5 : 0)
    if (y + alto > 280) {
      doc.addPage()
      y = 20
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    if (bien) doc.setTextColor(30, 125, 79)
    else doc.setTextColor(200, 57, 43)
    doc.text(bien ? 'BIEN' : 'MAL', margen, y)
    doc.setTextColor(27, 43, 38)
    doc.setFontSize(11)
    doc.text(lineasPregunta, margen + 14, y)
    y += lineasPregunta.length * 5 + 1
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(77, 98, 91)
    doc.text(`${respuesta}   (min. ${formatoTiempo(p.tiempo)})`, margen + 14, y + 4)
    y += 5
    if (correcta) {
      doc.text(correcta, margen + 14, y + 4)
      y += 5
    }
    y += 10
  })

  const nombreArchivo = `resultados-${r.nombre}-${r.actividad.titulo || 'video'}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 80)
  return { doc, nombreArchivo }
}
