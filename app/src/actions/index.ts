import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { importSeedBubbles, nearbyBubbles } from './bubbles'
import { loveBubble, lovedBy } from './love'
import { testRecordPop } from './test-support'
import { incomingWaves, sendWave } from './waves'

export const actions: Record<string, ActionHandler<Env>> = {
  importSeedBubbles,
  nearbyBubbles,
  loveBubble,
  lovedBy,
  sendWave,
  incomingWaves,
  testRecordPop,
}
