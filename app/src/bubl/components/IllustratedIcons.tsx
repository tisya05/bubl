export function WaveIllustration() {
  return <svg viewBox="0 0 128 128" fill="none" aria-hidden="true">
    <g stroke="#27365D" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="m47 88-17-27c-5-8 3-14 9-7l10 13-15-37c-3-8 7-12 10-4l13 29-8-37c-2-8 9-10 11-2l8 37-1-33c0-9 11-9 11 0l1 37 6-23c2-8 12-5 10 3l-7 39c-2 15-10 24-22 25-8 1-14-4-19-13Z" fill="#FFD1AB" />
      <path d="M51 69c5-10 16-13 25-7M65 64c-8 6-8 13-6 19" stroke="#C68B73" strokeWidth="2" />
      <path d="m48 94 32-5 6 22-34 6Z" fill="#A9BFE2" />
      <path d="m53 101 28-5" stroke="#7896C3" />
      <path d="M18 39c-2-8-1-14 2-20M11 40c-3-12-2-19 3-27m89 37c4-5 6-11 6-17m1 22c5-7 8-15 7-23" stroke="#D78AAA" />
    </g><circle cx="76" cy="105" r="2" fill="#27365D" />
  </svg>
}

export function Postmark({ date }: { date: string }) {
  return <svg className="stamp-postmark" viewBox="0 0 180 85" fill="none" aria-hidden="true"><g stroke="currentColor" strokeWidth="2"><circle cx="43" cy="44" r="31" /><circle cx="43" cy="44" r="25" /><path d="M26 39h34m-34 7h34" />{[26, 37, 48, 59].map(y => <path key={y} d={`M76 ${y}c13-12 23 12 36 0s23 12 36 0 23 12 36 0`} />)}</g><g fill="currentColor" textAnchor="middle" fontFamily="sans-serif" fontSize="7" letterSpacing="2"><text x="43" y="32">BUBL</text><text x="43" y="63">{new Date(date).getFullYear()}</text></g></svg>
}
