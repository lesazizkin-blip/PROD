/** Local mean threshold and connected-component noise removal. No OCR substitutions. */
export function cleanNumberPixels(data: Uint8ClampedArray, width: number, height: number) {
  const count = width * height
  const gray = new Float32Array(count)
  const stride = width + 1
  const integral = new Float64Array(stride * (height + 1))
  for (let y = 0; y < height; y++) {
    let row = 0
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      // Composite transparent pixels onto white before thresholding.
      const alpha = data[p * 4 + 3] / 255
      gray[p] = (data[p * 4] * .299 + data[p * 4 + 1] * .587 + data[p * 4 + 2] * .114) * alpha + 255 * (1 - alpha)
      row += gray[p]
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + row
    }
  }
  const radius = Math.max(7, Math.min(24, Math.round(height / 12)))
  const ink = new Uint8Array(count)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius), x1 = Math.min(width, x + radius + 1)
      const y0 = Math.max(0, y - radius), y1 = Math.min(height, y + radius + 1)
      const sum = integral[y1 * stride + x1] - integral[y0 * stride + x1] - integral[y1 * stride + x0] + integral[y0 * stride + x0]
      ink[y * width + x] = gray[y * width + x] < sum / ((x1 - x0) * (y1 - y0)) - 20 ? 1 : 0
    }
  }
  const seen = new Uint8Array(count)
  const queue = new Int32Array(count)
  const minArea = Math.max(8, Math.round(count / 10_000))
  const minHeight = Math.max(3, Math.round(height * .05))
  for (let p = 0; p < count; p++) {
    if (!ink[p] || seen[p]) continue
    let tail = 1, minY = height, maxY = 0
    queue[0] = p; seen[p] = 1
    for (let head = 0; head < tail; head++) {
      const current = queue[head], cy = Math.floor(current / width), cx = current % width
      minY = Math.min(minY, cy); maxY = Math.max(maxY, cy)
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy, next = ny * width + nx
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && ink[next] && !seen[next]) {
          seen[next] = 1; queue[tail++] = next
        }
      }
    }
    if (tail < minArea || maxY - minY + 1 < minHeight) {
      for (let i = 0; i < tail; i++) ink[queue[i]] = 0
    }
  }
  const output = new Uint8ClampedArray(count * 4)
  for (let p = 0; p < count; p++) {
    const value = ink[p] ? 0 : 255
    output[p * 4] = output[p * 4 + 1] = output[p * 4 + 2] = value
    output[p * 4 + 3] = 255
  }
  return output
}
