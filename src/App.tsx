import { lazy, Suspense, useEffect, useState } from 'react'
import { Inicio } from './pages/Inicio'
import { Ver } from './pages/Ver'
import { Comprobar } from './pages/Comprobar'

// La parte del profesor incluye las librerías de IA (varios MB): se carga solo cuando se necesita,
// así el enlace de los alumnos abre rápido incluso con mala conexión.
const Crear = lazy(() => import('./pages/Crear').then((m) => ({ default: m.Crear })))

function useRuta() {
  const [ruta, setRuta] = useState(location.hash)
  useEffect(() => {
    const cambiar = () => {
      setRuta(location.hash)
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', cambiar)
    return () => window.removeEventListener('hashchange', cambiar)
  }, [])
  return ruta
}

export default function App() {
  const ruta = useRuta()
  if (ruta.startsWith('#/ver/')) return <Ver codigo={ruta.slice('#/ver/'.length)} />
  if (ruta.startsWith('#/comprobar')) return <Comprobar />
  if (ruta.startsWith('#/crear')) {
    return (
      <Suspense fallback={<p className="p-8 text-tinta-suave">Cargando…</p>}>
        <Crear />
      </Suspense>
    )
  }
  return <Inicio />
}
