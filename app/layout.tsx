import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from 'sonner'
import './globals.css'

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap'
})

export const metadata: Metadata = {
  title: 'PIFA - Federación Internacional de Fútbol',
  description: 'Pebepe\'s International Football Asociación - Sistema de gestión de clubes y directores técnicos',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'PIFA',
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f97316' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1a1a' },
  ],
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className={inter.variable} data-scroll-behavior="smooth">
      <body className="font-sans antialiased min-h-dvh overflow-x-hidden">
        <main className="min-h-dvh">
          {children}
        </main>
        <Toaster 
          position="top-center" 
          richColors 
          closeButton
          toastOptions={{
            className: 'text-sm',
          }}
        />
        <Analytics />
      </body>
    </html>
  )
}
