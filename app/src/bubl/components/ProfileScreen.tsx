import { useState } from 'react'
import { Camera } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { profilePhoto } from '../lib/localProfile'
import { Avatar, ScreenHeader } from './MobileUI'
import { useMobile, useOperation } from './MobileApp'

export function ProfileScreen() {
  const { profile, updateProfile, go } = useMobile()
  const [name, setName] = useState(profile.name)
  const [username, setUsername] = useState(profile.username)
  const [imageUrl, setImageUrl] = useState(profile.imageUrl)
  const { busy, run } = useOperation()
  return <section className="profile-screen screen-fill"><ScreenHeader title="Your profile" onBack={() => go('you')} />
    <form onSubmit={event => { event.preventDefault(); void run(async () => {
      if (!name.trim()) throw new Error('Enter a display name.')
      if (!/^[a-z0-9_]{3,24}$/.test(username)) throw new Error('Use 3–24 letters, numbers, or underscores for your username.')
      updateProfile({ name: name.trim(), username, imageUrl }); go('you')
    }) }}>
      <label className="profile-photo"><Avatar name={name} image={imageUrl} /><span><Camera size={18} />Change photo</span><input type="file" accept="image/*" aria-label="Profile photo" onChange={event => { const file = event.target.files?.[0]; if (file) void run(async () => { setImageUrl(await profilePhoto(file)) }) }} /></label>
      {imageUrl && <button type="button" className="text-button" onClick={() => setImageUrl(undefined)}>Remove photo</button>}
      <label className="field-label" htmlFor="profile-name">Name</label><Input id="profile-name" required maxLength={40} autoComplete="name" value={name} onChange={e => setName(e.target.value)} />
      <label className="field-label" htmlFor="profile-username">Username</label><div className="username-field"><span>@</span><Input id="profile-username" required minLength={3} maxLength={24} autoCapitalize="none" autoCorrect="off" autoComplete="username" pattern="[a-z0-9_]{3,24}" value={username} onChange={e => setUsername(e.target.value.toLowerCase())} /></div>
      <p className="fine-print">Saved on this device. Username availability will be checked when accounts are connected.</p>
      <Button className="bubl-primary" type="submit" loading={busy}>Save profile</Button>
    </form>
  </section>
}
