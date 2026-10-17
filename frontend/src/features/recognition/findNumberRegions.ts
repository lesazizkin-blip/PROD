export interface NumberRegion { x: number; y: number; width: number; height: number }

/** Find similarly sized, horizontally aligned ink components. Input is cleaned black/white RGBA. */
export function findNumberRegions(pixels: Uint8ClampedArray, width: number, height: number): NumberRegion[] {
  const seen = new Uint8Array(width * height), queue = new Int32Array(width * height)
  const parts: NumberRegion[] = []
  for (let p = 0; p < seen.length; p++) {
    if (seen[p] || pixels[p * 4] !== 0) continue
    let tail = 1, left = width, top = height, right = 0, bottom = 0
    queue[0] = p; seen[p] = 1
    for (let head = 0; head < tail; head++) {
      const at = queue[head], y = Math.floor(at / width), x = at % width
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, next = ny * width + nx
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && !seen[next] && pixels[next * 4] === 0) {
          seen[next] = 1; queue[tail++] = next
        }
      }
    }
    const w = right - left + 1, h = bottom - top + 1
    if (tail >= 12 && h >= Math.max(10, height * .08) && h < height * .85 && w < width * .6) parts.push({ x: left, y: top, width: w, height: h })
  }
  const runs = (values: boolean[]) => values.reduce((sum, on, i) => sum + (on && !values[i - 1] ? 1 : 0), 0)
  const looksLikeHash = (p: NumberRegion) => {
    if (p.width < p.height * .45) return false
    const rows = [], cols = []
    for (let y = Math.ceil(p.height * .1); y < p.height * .9; y++) {
      let count = 0
      for (let x = 0; x < p.width; x++) if (pixels[((p.y + y) * width + p.x + x) * 4] === 0) count++
      rows.push(count >= p.width * .55)
    }
    for (let x = Math.ceil(p.width * .1); x < p.width * .9; x++) {
      let count = 0
      for (let y = 0; y < p.height; y++) if (pixels[((p.y + y) * width + p.x + x) * 4] === 0) count++
      cols.push(count >= p.height * .35)
    }
    return runs(rows) === 2 && runs(cols) === 2
  }
  const groups: NumberRegion[][] = []
  for (const p of parts.sort((a, b) => a.x - b.x)) {
    const group = groups.find(g => {
      const last = g[g.length - 1], h = Math.max(last.height, p.height)
      const gap = p.x - last.x - last.width
      return gap >= -2 && gap <= h * 1.25 && Math.min(last.height, p.height) / h > .5
        && Math.abs(last.y + last.height / 2 - p.y - p.height / 2) < h * .4
    })
    if (group) group.push(p); else groups.push([p])
  }
  return groups.filter(g => g.length <= 8).map(group => {
    // Remove a geometrically detected hash, never a letter guessed by OCR.
    const glyphs = group.length > 1 && looksLikeHash(group[0]) ? group.slice(1) : group
    const x = Math.min(...glyphs.map(p => p.x)), y = Math.min(...glyphs.map(p => p.y))
    return { x, y, width: Math.max(...glyphs.map(p => p.x + p.width)) - x, height: Math.max(...glyphs.map(p => p.y + p.height)) - y }
  }).filter(region => region.x > width * .01 && region.y > height * .01
    && region.x + region.width < width * .99 && region.y + region.height < height * .99)
    .sort((a, b) => Math.hypot((a.x + a.width / 2) / width - .5, (a.y + a.height / 2) / height - .5)
    - Math.hypot((b.x + b.width / 2) / width - .5, (b.y + b.height / 2) / height - .5)).slice(0, 3)
}
