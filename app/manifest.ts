import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bitácora',
    short_name: 'Bitácora',
    description: 'Tareas diarias de oficina con etiquetas, historial y recordatorios',
    start_url: '/',
    display: 'standalone',
    background_color: '#ECEEF2',
    theme_color: '#111725',
    lang: 'es',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
