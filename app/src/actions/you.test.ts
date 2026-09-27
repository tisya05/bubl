import { describe, expect, it, vi } from 'vitest'
import type { ActionTools } from 'deepspace/worker'
import { deleteDropped, removePopped } from './you'

vi.mock('../server/media-routes', () => ({ deleteStoredMedia: vi.fn(async () => {}) }))

function fakeTools(authorId = 'me') {
  const calls: string[] = []
  const tools = {
    get: vi.fn(async () => ({ success: true, data: { record: { recordId: 'b1', data: { authorId } } } })),
    query: vi.fn(async () => ({ success: true, data: { records: [] } })),
    remove: vi.fn(async (c: string, id: string) => { calls.push(`remove ${c} ${id}`); return { success: true, data: {} } }),
    deleteWhere: vi.fn(async (c: string, where: Record<string, unknown>) => { calls.push(`deleteWhere ${c} ${JSON.stringify(where)}`); return { success: true, data: { deleted: 0 } } }),
  } as unknown as ActionTools
  return { tools, calls }
}

const run = (h: typeof removePopped, userId: string, params: Record<string, unknown>, tools: ActionTools) =>
  h({ userId, params, tools, env: {} } as unknown as Parameters<typeof removePopped>[0])

describe('removePopped', () => {
  it('only removes the caller’s own pop', async () => {
    const { tools, calls } = fakeTools()
    expect(await run(removePopped, 'me', { bubbleId: 'b1' }, tools)).toMatchObject({ success: true })
    expect(calls).toEqual(['deleteWhere pops {"userId":"me","bubbleId":"b1"}'])
  })
})

describe('deleteDropped', () => {
  it('refuses someone else’s bubble', async () => {
    const { tools, calls } = fakeTools('someone-else')
    expect(await run(deleteDropped, 'me', { bubbleId: 'b1' }, tools)).toMatchObject({ success: false })
    expect(calls).toEqual([])
  })

  it('refuses seeded demo bubbles', async () => {
    const { tools, calls } = fakeTools()
    expect(await run(deleteDropped, 'me', { bubbleId: 'seed-lerner' }, tools)).toMatchObject({ success: false })
    expect(calls).toEqual([])
  })

  it('deletes the author’s bubble with its pops and preview', async () => {
    const { tools, calls } = fakeTools()
    expect(await run(deleteDropped, 'me', { bubbleId: 'b1' }, tools)).toMatchObject({ success: true })
    expect(calls).toEqual(['deleteWhere pops {"bubbleId":"b1"}', 'remove bubble_previews b1', 'remove bubbles b1'])
  })
})
