import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeCandidates, normalizeNumber } from './number'
import { isCompactCode, parseUniversalCode, resolveCompactCode } from './qr'
import { createLocalOcrPrototype, type CreateOcrWorker } from './localOcr'
import { prepareNumber } from './prepareNumber'

vi.mock('./prepareNumber', () => ({ prepareNumber: vi.fn(async () => new Blob(['cleaned'])) }))

afterEach(() => vi.unstubAllGlobals())

describe('нормализация полного номера', () => {
  it.each(['#001', ' #01 ', '001', '1'])('принимает %s', (s) => expect(normalizeNumber(s)).toBe(1))
  it.each(['0', '#000', '-1', '+1', '1.0', '1e2', 'телефон 12', '# 001', '1 2', '##01', '1\n2', '9007199254740992', '１２', ''])('отклоняет %s', (s) => expect(normalizeNumber(s)).toBeNull())
  it('убирает дубли, не извлекает числа из текста', () => expect(normalizeCandidates(['#001', '001', 'room 12', '002'])).toEqual([1, 2]))
})
describe('QR-контракт', () => {
  it('полная строка Base32, ровно 16 символов', () => {
    expect(isCompactCode(' MM1:ABCDEFGH234567AB ')).toBe(true)
    for (const code of ['MM1:abcdefgh234567ab', 'MM1:ABCDEFGH234567A0', 'MM1:ABCDEFGH234567ABC', 'xMM1:ABCDEFGH234567AB']) expect(isCompactCode(code)).toBe(false)
  })
  it('отклоняет опасный протокол и небезопасный номер', () => {
    const path = '/projects/11111111-1111-4111-8111-111111111111/boxes/'
    expect(parseUniversalCode(`javascript:${path}1`)).toBeNull()
    expect(parseUniversalCode(`${path}9007199254740992`)).toBeNull()
    expect(parseUniversalCode(`https://old.example${path}001`)?.n).toBe(1)
  })
  it('adapter вызывает реальный путь API с телом code и проверяет ответ', async () => {
    const payload = { project_id: '11111111-1111-4111-8111-111111111111', box_number: 12 }
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)))
    vi.stubGlobal('fetch', fetch)
    await expect(resolveCompactCode(' MM1:ABCDEFGH234567AB ')).resolves.toEqual(payload)
    expect(fetch.mock.calls[0][0]).toBe('/api/boxes/resolve-code')
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'POST', body: '{"code":"MM1:ABCDEFGH234567AB"}' })
    fetch.mockResolvedValueOnce(new Response('{"project_id":"bad","box_number":1}'))
    await expect(resolveCompactCode('MM1:ABCDEFGH234567AB')).rejects.toThrow(/некорректную/)
  })
})
describe('локальный OCR adapter (технические тесты, не качество почерка)', () => {
  it('retries invalid OCR with cleaned pixels without substituting letters for digits', async () => {
    const worker = {
      recognize: vi.fn().mockResolvedValueOnce({ data: { text: '0.014' } }).mockResolvedValueOnce({ data: { text: '001' } }),
      setParameters: vi.fn().mockResolvedValue(null), terminate: vi.fn().mockResolvedValue(null),
    }
    const photo = new Blob(['photo'])
    const result = await createLocalOcrPrototype(vi.fn().mockResolvedValue(worker))(photo, new AbortController().signal)
    expect(prepareNumber).toHaveBeenCalled()
    expect(result.text).toBe('001')
    expect(normalizeCandidates(result.candidates)).toEqual([1])
    expect(worker.setParameters).toHaveBeenLastCalledWith({ tessedit_pageseg_mode: '7' })
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })
  it('does not reinterpret an unrecognized prefix as a box number', async () => {
    const worker = {
      recognize: vi.fn().mockResolvedValueOnce({ data: { text: 'F001' } }).mockResolvedValueOnce({ data: { text: 'H001' } }),
      setParameters: vi.fn().mockResolvedValue(null), terminate: vi.fn().mockResolvedValue(null),
    }
    const result = await createLocalOcrPrototype(vi.fn().mockResolvedValue(worker))(new Blob(), new AbortController().signal)
    expect(result.text).toBe('F001')
    expect(normalizeCandidates(result.candidates)).toEqual([])
  })
  it('ошибка инициализации модели показывается без глобального throw', async () => {
    let options!: Parameters<CreateOcrWorker>[2]
    const create: CreateOcrWorker = (_lang, _engine, value) => { options = value; return new Promise(() => {}) }
    const pending = createLocalOcrPrototype(create)(new Blob(), new AbortController().signal)
    options.errorHandler('model missing')
    await expect(pending).rejects.toThrow(/Ошибка локального OCR/)
  })
  it('передаёт Blob worker, использует только локальные пути и сохраняет исходный текст', async () => {
    const worker = { recognize: vi.fn().mockResolvedValue({ data: { text: '#001\naddress 12' } }), setParameters: vi.fn().mockResolvedValue(null), terminate: vi.fn().mockResolvedValue(null) }
    const create = vi.fn().mockResolvedValue(worker)
    const photo = new Blob(['pixels'])
    const result = await createLocalOcrPrototype(create)(photo, new AbortController().signal)
    expect(result.text).toBe('#001\naddress 12')
    expect(normalizeCandidates(result.candidates)).toEqual([1])
    expect(worker.recognize).toHaveBeenCalledWith(photo)
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    const options = create.mock.calls[0][2]
    for (const path of [options.workerPath, options.corePath, options.langPath]) expect(new URL(path).origin).toBe(window.location.origin)
    expect(worker.setParameters.mock.calls[0][0]).not.toHaveProperty('tessedit_char_whitelist')
  })
  it('отменяет и завершает worker, даже если инициализация запоздала', async () => {
    const worker = { recognize: vi.fn(), setParameters: vi.fn(), terminate: vi.fn().mockResolvedValue(null) }
    let resolve!: (value: typeof worker) => void
    const create = vi.fn(() => new Promise<typeof worker>((r) => { resolve = r }))
    const controller = new AbortController()
    const pending = createLocalOcrPrototype(create)(new Blob(), controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    resolve(worker)
    await Promise.resolve(); await Promise.resolve()
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    expect(worker.recognize).not.toHaveBeenCalled()
  })
})
