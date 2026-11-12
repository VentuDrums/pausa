/**
 * Idiomas en los que la IA puede escribir las preguntas. El vídeo puede estar en otro idioma:
 * la IA lee la transcripción y escribe pregunta, respuestas y explicación en el idioma elegido.
 */
export type IdiomaPreguntas = 'es' | 'en' | 'ca' | 'fr'

type DatosIdioma = {
  clave: IdiomaPreguntas
  /** Nombre en la interfaz (en su propio idioma). */
  nombre: string
  /** Cómo se le nombra a la IA dentro de las instrucciones (que están en español). */
  paraLaIa: string
  /** Opciones de las preguntas de verdadero o falso. */
  vf: [string, string]
  /** Explicación de una pregunta de verdadero o falso. */
  respuestaCorrecta: (pregunta: string, respuesta: string) => string
  /** Si la IA no da explicación: cita del vídeo. */
  enElVideo: (cita: string) => string
}

export const IDIOMAS: Record<IdiomaPreguntas, DatosIdioma> = {
  es: {
    clave: 'es',
    nombre: 'Español',
    paraLaIa: 'español',
    vf: ['Verdadero', 'Falso'],
    respuestaCorrecta: (p, r) => `La respuesta correcta a «${p}» es: ${r}.`,
    enElVideo: (c) => `En el vídeo se dice: «${c}».`,
  },
  en: {
    clave: 'en',
    nombre: 'English',
    paraLaIa: 'inglés',
    vf: ['True', 'False'],
    respuestaCorrecta: (p, r) => `The correct answer to "${p}" is: ${r}.`,
    enElVideo: (c) => `The video says: "${c}".`,
  },
  ca: {
    clave: 'ca',
    nombre: 'Català',
    paraLaIa: 'catalán',
    vf: ['Vertader', 'Fals'],
    respuestaCorrecta: (p, r) => `La resposta correcta a «${p}» és: ${r}.`,
    enElVideo: (c) => `Al vídeo es diu: «${c}».`,
  },
  fr: {
    clave: 'fr',
    nombre: 'Français',
    paraLaIa: 'francés',
    vf: ['Vrai', 'Faux'],
    respuestaCorrecta: (p, r) => `La bonne réponse à « ${p} » est : ${r}.`,
    enElVideo: (c) => `Dans la vidéo, on dit : « ${c} ».`,
  },
}

export const LISTA_IDIOMAS = Object.values(IDIOMAS)

export function esIdioma(x: unknown): x is IdiomaPreguntas {
  return typeof x === 'string' && x in IDIOMAS
}
