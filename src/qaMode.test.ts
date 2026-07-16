import { describe, expect, it } from 'vitest'

import { resolveQaMode } from './qaMode'

describe('QA build mode', () => {
  it('stays enabled in development and only accepts the explicit production flag', () => {
    expect(resolveQaMode(true, undefined)).toBe(true)
    expect(resolveQaMode(false, '1')).toBe(true)
    expect(resolveQaMode(false, undefined)).toBe(false)
    expect(resolveQaMode(false, '0')).toBe(false)
  })
})
