import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">NC House Flip Studio</h1>
        <p className="text-gray-600 mb-8">Two-person deal pipeline</p>
        <Link href="/login" className="bg-blue-600 text-white px-6 py-3 rounded">
          Sign In
        </Link>
      </div>
    </div>
  )
}