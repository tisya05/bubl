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
import { speak, speakLine } from './speak'
import { openPopped } from './viewer'
import { claimHandle, getMe, savePreferences } from './profile'
import { getPushKey, pushNearby, removePushSubscription, savePushSubscription, setActiveChat } from './push'

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
  speakLine,
  openPopped,
  getMe,
  claimHandle,
  savePreferences,
  getPushKey,
  savePushSubscription,
  removePushSubscription,
  pushNearby,
  setActiveChat,
}
