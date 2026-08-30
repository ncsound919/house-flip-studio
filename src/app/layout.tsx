import './globals.css'
import type { Metadata, Viewport } from 'next'
import { PwaRegister } from '@/components/pwa/PwaRegister'

export const metadata: Metadata = {
  title: 'NC House Flip Studio',
  description: 'House flipping deal pipeline for two-person operations',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Flip Studio',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#1d4ed8',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">
        {children}
        <PwaRegister />
      </body>
    </html>
  )
}