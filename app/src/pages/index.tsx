/**
 * Landing page — a STATIC page (no DeepSpace providers).
 *
 * Hello-world placeholder until the real splash screen lands.
 */

import { Link } from 'react-router-dom'

export default function Landing() {
  return (
    <div
      data-testid="static-landing"
      className="flex min-h-screen flex-col items-center justify-center bg-[#243B64] px-6 text-center"
    >
      <h1 className="mb-2 text-6xl font-bold tracking-tight text-[#F4F1EA]">bubl</h1>
      <p className="mb-10 text-lg text-[#FF8A5B]">pop ur bubl.</p>
      <Link
        to="/home"
        className="inline-flex min-h-11 items-center rounded-full bg-[#FF8A5B] px-6 text-sm font-medium text-[#17171C] transition-opacity hover:opacity-90"
      >
        Enter the app
      </Link>
    </div>
  )
}
