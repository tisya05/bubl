/**
 * Landing page — a STATIC page (no DeepSpace providers).
 *
 * Hello-world placeholder until the real splash screen lands.
 */

import { Link } from 'react-router-dom'
import '@/bubl/mobile.css'

export default function Landing() {
  return (
    <Link to="/login" className="bubl-intro" aria-label="Tap anywhere to continue" data-testid="static-landing">
      <div className="intro-stage" aria-hidden="true">
        <img className="intro-bubbles" src="/bubl/intro-bubbles.svg" alt="" width="304" height="698" />
        <div className="intro-copy">
          <img className="intro-app-icon" src="/bubl/app-icon-transparent.png" alt="" />
          <h1>explore your city</h1>
          <p>tap anywhere to continue</p>
        </div>
      </div>
    </Link>
  )
}
