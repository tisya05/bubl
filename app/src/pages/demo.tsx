import { useEffect, useState } from 'react'
import { MobileApp } from '@/bubl/components/MobileApp'
import { mockApi, mockLibrary } from '@/bubl/api/mock'
import { setLocationSource } from '@/bubl/hooks/useUserLocation'

export default function DemoPage() {
  const [ready, setReady] = useState(false)
  useEffect(() => { setLocationSource('demo'); setReady(true) }, [])
  return ready ? <MobileApp api={mockApi} library={mockLibrary} demo user={{ id: 'me', name: 'You' }} /> : null
}
