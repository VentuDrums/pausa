import type { jsPDF as JsPDF } from 'jspdf'
import type { Actividad } from '../types'
import { formatoTiempo } from './tiempo'
import { estaTerminado, fechaCorta, notaDe, type Intento } from './intentos'

export type Resultado = {
  nombre: string
  grupo: string
  actividad: Actividad
  /** id de pregunta -> índice de la opción elegida */
  respuestas: Record<string, number>
  /** Todos los intentos hechos en este dispositivo, del primero al último. */
  intentos: Intento[]
  /** Código de comprobación para el profesor. */
  codigo: string
}

/** "Intento 1: 4 de 10 (nota 4) – lun, 10 nov, 10:02" */
export function lineasIntentos(intentos: Intento[]): string[] {
  return intentos.map((x, i) =>
    estaTerminado(x)
      ? `Intento ${i + 1}: ${x.aciertos} de ${x.total} (nota ${notaDe(x.aciertos, x.total).toLocaleString('es-ES')}) - ${fechaCorta(x.fecha)}`
      : `Intento ${i + 1}: sin terminar (${Object.keys(x.respuestas).length} de ${x.total} respondidas, ${x.aciertos} ${x.aciertos === 1 ? 'acierto' : 'aciertos'}) - ${fechaCorta(x.fecha)}`,
  )
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
    r.intentos.length > 1 ? `Intentos (${r.intentos.length}):` : 'Intentos: 1',
    ...(r.intentos.length > 1 ? lineasIntentos(r.intentos) : []),
    '',
    'Código de comprobación (el profesor puede verificarlo en Pausa):',
    r.codigo,
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
  const fechaIntento = r.intentos.at(-1)?.fecha ?? new Date().toISOString()
  doc.text(latino(`${r.nombre}${r.grupo ? ` · ${r.grupo}` : ''}  -  ${new Date(fechaIntento).toLocaleString('es-ES')}`), margen, y)
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

  // Historial de intentos y código de comprobación, al final.
  const historial = r.intentos.length > 1 ? lineasIntentos(r.intentos).map(latino) : []
  const lineasCodigo = doc.splitTextToSize(r.codigo, ancho)
  const altoFinal = 16 + historial.length * 5 + 12 + lineasCodigo.length * 4.2
  if (y + altoFinal > 285) {
    doc.addPage()
    y = 20
  }
  doc.setDrawColor(221, 228, 225)
  doc.line(margen, y - 4, margen + ancho, y - 4)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(27, 43, 38)
  doc.text(
    r.intentos.length > 1 ? `Intentos: ${r.intentos.length}` : 'Intentos: 1',
    margen,
    y + 2,
  )
  y += 8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(77, 98, 91)
  historial.forEach((linea) => {
    doc.text(linea, margen, y)
    y += 5
  })
  y += 3
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(27, 43, 38)
  doc.text('Código de comprobación', margen, y)
  y += 5
  doc.setFont('courier', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(77, 98, 91)
  doc.text(lineasCodigo, margen, y)

  const nombreArchivo = `resultados-${r.nombre}-${r.actividad.titulo || 'video'}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 80)
  return { doc, nombreArchivo }
}
