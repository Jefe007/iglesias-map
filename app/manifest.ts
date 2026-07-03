import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Red de Distribución La Guaira — Samaritan’s Purse',
    short_name: 'Red La Guaira',
    description: 'Mapa de iglesias, centros de distribución y hospital de campaña en La Guaira, Venezuela',
    start_url: '/',
    display: 'standalone',
    background_color: '#1b2a4a',
    theme_color: '#1b2a4a',
    lang: 'es',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
