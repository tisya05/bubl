// Switches location between real GPS and the draggable demo dot.

import { Label, Switch } from '@/components/ui';
import { setLocationSource, useLocationSource } from '../hooks/useUserLocation';

export function DemoModeToggle() {
  const source = useLocationSource();

  return (
    <div className="flex min-h-11 items-center gap-2">
      <Switch
        id="demo-mode"
        checked={source === 'demo'}
        onCheckedChange={(checked) => setLocationSource(checked ? 'demo' : 'gps')}
      />
      <Label htmlFor="demo-mode" className="font-mono text-xs uppercase">
        {source === 'demo' ? 'Demo dot' : 'GPS'}
      </Label>
    </div>
  );
}
