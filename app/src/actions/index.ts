import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { importSeedBubbles, nearbyBubbles } from './bubbles'
import { dropBubble } from './drop'
import { canPop } from './pop'
import { speak } from './speak'
import { openPopped } from './viewer'

export const actions: Record<string, ActionHandler<Env>> = {
  importSeedBubbles,
  nearbyBubbles,
  canPop,
  dropBubble,
  speak,
  openPopped,
}
