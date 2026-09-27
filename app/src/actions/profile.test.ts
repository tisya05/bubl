import { describe, expect, it } from 'vitest'
import { handleProblem, normalizeHandle } from './profile'

describe('handles', () => {
  it('normalizes case and a leading @', () => {
    expect(normalizeHandle('  @Maya_R ')).toBe('maya_r')
  })

  it.each(['ab', 'a'.repeat(21), 'has space', 'dash-es', 'émoji', 'dots.ok'])('rejects %j', (h) => {
    expect(handleProblem(h)).toMatch(/3 to 20/)
  })

  it('reserves app names', () => {
    expect(handleProblem('admin')).toBe('That handle is taken')
    expect(handleProblem('bubl')).toBe('That handle is taken')
  })

  it.each(['maya', 'dev_2', 'x'.repeat(20), 'abc'])('accepts %j', (h) => {
    expect(handleProblem(h)).toBeUndefined()
  })
})
