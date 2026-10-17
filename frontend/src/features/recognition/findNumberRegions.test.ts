import { describe, expect, it } from 'vitest'
import { findNumberRegions } from './findNumberRegions'
import { observeNumber } from './stableNumber'

function line(prefix: 'hash' | 'letter' | 'zero') {
  const width = 240, height = 100
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  const rect = (left: number, top: number, w: number, h: number) => {
    for (let y = top; y < top + h; y++) for (let x = left; x < left + w; x++) {
      const p = (y * width + x) * 4; data[p] = data[p + 1] = data[p + 2] = 0
    }
  }
  if (prefix === 'hash') {
    rect(28, 25, 4, 40); rect(50, 25, 4, 40); rect(15, 35, 50, 4); rect(15, 55, 50, 4)
  } else if (prefix === 'letter') {
    rect(15, 25, 4, 40); rect(15, 25, 50, 4); rect(15, 43, 50, 4); rect(15, 61, 50, 4)
  } else {
    rect(15, 25, 50, 4); rect(15, 61, 50, 4); rect(15, 25, 4, 40); rect(61, 25, 4, 40)
  }
  for (const x of [85, 120]) { rect(x, 25, 16, 3); rect(x, 62, 16, 3); rect(x, 25, 3, 40); rect(x + 13, 25, 3, 40) }
  rect(160, 25, 4, 40)
  return findNumberRegions(data, width, height)
}

describe('automatic number localization', () => {
  it('crops the digits after a hash with two crossing horizontal and vertical strokes', () => {
    const regions = line('hash')
    expect(regions).toHaveLength(1)
    expect(regions[0].x).toBe(85)
    expect(regions[0].width).toBe(79)
  })
  it.each(['letter', 'zero'] as const)('does not silently remove a wide %s', prefix => {
    expect(line(prefix)[0].x).toBe(15)
  })
  it('returns nothing for a blank image', () => {
    expect(findNumberRegions(new Uint8ClampedArray(80 * 60 * 4).fill(255), 80, 60)).toEqual([])
  })
  it('requires consecutive unambiguous agreement and resets on conflicting or missing numbers', () => {
    const first = observeNumber({ number: null, hits: 0 }, [1])
    expect(first.hits).toBe(1)
    expect(observeNumber(first, [1]).hits).toBe(2)
    expect(observeNumber(first, [1, 2])).toEqual({ number: null, hits: 0 })
    expect(observeNumber(first, [])).toEqual({ number: null, hits: 0 })
    expect(observeNumber(first, [2])).toEqual({ number: 2, hits: 1 })
  })
})
