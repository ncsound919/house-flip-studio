import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'NC House Flip Studio',
  description: 'House flipping deal pipeline for two-person operations',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  )
}