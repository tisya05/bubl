import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { importSeedBubbles, nearbyBubbles } from './bubbles'
import { canPop } from './pop'
import { loveBubble, lovedBy } from './love'
import { incomingWaves, sendWave } from './waves'
import { getMessages, myChats, sendMessage } from './chats'
import { myDropped, myPopped } from './you'
import { resetDemo } from './demo'

export const actions: Record<string, ActionHandler<Env>> = {
  importSeedBubbles,
  nearbyBubbles,
  canPop,
  loveBubble,
  lovedBy,
  sendWave,
  incomingWaves,
  myChats,
  getMessages,
  sendMessage,
  myPopped,
  myDropped,
  resetDemo,
}
