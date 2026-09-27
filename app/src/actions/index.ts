import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { importSeedBubbles, nearbyBubbles } from './bubbles'
import { dropBubble } from './drop'
import { canPop } from './pop'
import { loveBubble, lovedBy } from './love'
import { incomingWaves, outgoingWaves, sendWave } from './waves'
import { chatBubble, getMessages, myChats, sendMessage } from './chats'
import { deleteDropped, myDropped, myPopped, removePopped } from './you'
import { resetDemo, setupDemoProfiles } from './demo'
import { speak } from './speak'
import { openPopped } from './viewer'
import { claimHandle, getMe, savePreferences } from './profile'
import { deleteEvent, getEvents, refreshEvents } from './events'

export const actions: Record<string, ActionHandler<Env>> = {
  importSeedBubbles,
  nearbyBubbles,
  canPop,
  dropBubble,
  loveBubble,
  lovedBy,
  sendWave,
  incomingWaves,
  outgoingWaves,
  myChats,
  chatBubble,
  getMessages,
  sendMessage,
  myPopped,
  myDropped,
  removePopped,
  deleteDropped,
  resetDemo,
  setupDemoProfiles,
  speak,
  openPopped,
  getMe,
  claimHandle,
  savePreferences,
  refreshEvents,
  getEvents,
  deleteEvent,
}
