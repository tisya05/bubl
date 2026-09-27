/**
 * Landing page — a STATIC page (no DeepSpace providers).
 *
 * Hello-world placeholder until the real splash screen lands.
 */

import { Link } from 'react-router-dom'
import '@/bubl/mobile.css'

export default function Landing() {
  return (
    <Link to="/login" className="bubl-intro" aria-label="Explore your city. Tap anywhere to continue" data-testid="static-landing">
      <div className="intro-stage" aria-hidden="true">
        <img className="intro-bubbles" src="/bubl/intro-bubbles.svg" alt="" width="304" height="698" />
        <div className="intro-copy">
          <img src="/bubl/logo.svg" alt="" width="390" height="227" />
          <h1>explore your city</h1>
          <p>tap anywhere to continue</p>
        </div>
      </div>
    </Link>
  )
}
