import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App'
import '@fontsource-variable/manrope'
import '@fontsource/dm-mono/300.css'
import '@fontsource/dm-mono/400.css'
import '@fontsource/dm-mono/500.css'
import './styles.css'

const router = createBrowserRouter([{ path: '*', element: <App /> }], {
  basename: import.meta.env.BASE_URL,
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
