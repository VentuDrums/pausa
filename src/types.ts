/** Un trozo de la transcripción con su momento en el vídeo (en segundos). */
export type Segmento = {
  inicio: number
  fin: number
  texto: string
}

export type TipoPregunta = 'test' | 'vf'

export type Pregunta = {
  id: string
  /** Segundo del vídeo en el que se detiene para preguntar. */
  tiempo: number
  tipo: TipoPregunta
  enunciado: string
  /** Para 'vf' siempre es ['Verdadero', 'Falso']. */
  opciones: string[]
  /** Índice de la opción correcta. */
  correcta: number
  /** Se muestra al alumno si falla. */
  explicacion: string
}

/** Lo que viaja dentro del enlace que reciben los alumnos. */
export type Actividad = {
  v: 1
  /** ID del vídeo de YouTube ('' si el vídeo es un archivo en la nube del profesor). */
  videoId: string
  /** Vídeo propio en Drive, Dropbox, OneDrive o enlace directo (ya convertido para reproducirse). */
  archivo?: { url: string; servicio: 'drive' | 'dropbox' | 'onedrive' | 'directo' }
  titulo: string
  emailProfesor: string
  preguntas: Pregunta[]
}

/** En el editor guardamos además el fragmento del que salió cada pregunta, para poder regenerarla. */
export type PreguntaEditable = Pregunta & { fuente?: Segmento[]; foco?: number }
