import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'La Guaira Distribution Network — Samaritan’s Purse',
    short_name: 'La Guaira Network',
    description: 'Map of churches, distribution centers, and field hospital in La Guaira, Venezuela',
    start_url: '/',
    display: 'standalone',
    background_color: '#1b2a4a',
    theme_color: '#1b2a4a',
    lang: 'en',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
