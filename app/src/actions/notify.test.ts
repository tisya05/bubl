import { describe, expect, it, vi } from 'vitest'
import type { ActionTools } from 'deepspace/worker'
import { loveNotice } from '../bubl/lib/notifications'
import { displayName, notify } from './notify'

const draft = loveNotice({ id: 'u-maya', name: 'Maya' }, { id: 'b1', placeName: 'Broadway & 116th St' })

const toolsWith = (create: () => Promise<unknown>, name?: string) =>
  ({
    create: vi.fn(create),
    get: vi.fn(async () => (name === undefined ? { success: false, error: 'Record not found' } : { success: true, data: { record: { data: { name } } } })),
  }) as unknown as ActionTools & { create: ReturnType<typeof vi.fn> }

describe('notify', () => {
  it("writes an unread row to the recipient's feed", async () => {
    const tools = toolsWith(async () => ({ success: true, data: { recordId: 'n1' } }))
    await notify(tools, 'u-author', draft)
    expect(tools.create).toHaveBeenCalledWith('notifications', { userId: 'u-author', ...draft, read: false })
  })

  it('never notifies you about your own action', async () => {
    const tools = toolsWith(async () => ({ success: true, data: { recordId: 'n1' } }))
    await notify(tools, 'u-maya', draft)
    expect(tools.create).not.toHaveBeenCalled()
  })

  it('never throws, so the love / wave / message itself still succeeds', async () => {
    await expect(notify(toolsWith(async () => ({ success: false, error: 'nope' })), 'u-author', draft)).resolves.toBeUndefined()
    await expect(
      notify(
        toolsWith(async () => {
          throw new Error('room down')
        }),
        'u-author',
        draft,
      ),
    ).resolves.toBeUndefined()
  })
})

describe('displayName', () => {
  it('uses the account name, or "Someone"', async () => {
    expect(await displayName(toolsWith(async () => ({}), 'Maya'), 'u-maya')).toBe('Maya')
    expect(await displayName(toolsWith(async () => ({})), 'u-ghost')).toBe('Someone')
  })
})
