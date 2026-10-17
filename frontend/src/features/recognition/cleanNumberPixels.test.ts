import { describe, expect, it } from 'vitest'
import { cleanNumberPixels } from './cleanNumberPixels'
import { cropFromPoints } from './crop'

describe('number image preparation', () => {
  it('removes small dark dots while retaining a stroke under uneven lighting', () => {
    const width = 80, height = 60
    const data = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const ink = (x >= 38 && x <= 41 && y >= 15 && y <= 44) || (x === 10 && y === 20)
      data[i] = data[i + 1] = data[i + 2] = ink ? 30 : 130 + x
      data[i + 3] = 255
    }
    const output = cleanNumberPixels(data, width, height)
    expect(output[(20 * width + 10) * 4]).toBe(255)
    expect(output[(30 * width + 40) * 4]).toBe(0)
    expect(output[(30 * width + 60) * 4]).toBe(255)
  })
  it('composites transparent background onto white', () => {
    expect(cleanNumberPixels(new Uint8ClampedArray(16), 2, 2)).toEqual(new Uint8ClampedArray(16).fill(255))
  })
  it('supports reverse drag and clamps the crop to the image', () => {
    expect(cropFromPoints({ x: 80, y: 70 }, { x: 20, y: 30 })).toEqual({ x: 20, y: 30, width: 60, height: 40 })
    const crop = cropFromPoints({ x: 105, y: 105 }, { x: 110, y: 110 })
    expect(crop.x + crop.width).toBeLessThanOrEqual(100)
    expect(crop.y + crop.height).toBeLessThanOrEqual(100)
  })
})
