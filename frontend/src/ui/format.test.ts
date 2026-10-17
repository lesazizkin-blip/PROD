import { describe, expect, it } from 'vitest'
import { boxPath, boxUrl, formatDate, formatTimeRange, parseBoxLink, plural } from './format'

const PID = '00000000-0000-4000-8000-000000000001'

describe('parseBoxLink', () => {
  it('разбирает ссылку из QR на свой домен', () => {
    expect(parseBoxLink(`https://movermate.example/projects/${PID}/boxes/12`)).toEqual({ pid: PID, n: 12 })
  })
  it('принимает и ссылку с другим адресом сайта (этикетку могли напечатать на другом домене)', () => {
    expect(parseBoxLink(`http://localhost:5173/projects/${PID}/boxes/3/`)).toEqual({ pid: PID, n: 3 })
  })
  it('принимает путь без адреса и не зависит от регистра id', () => {
    expect(parseBoxLink(`  /projects/${PID.toUpperCase()}/boxes/7  `)).toEqual({ pid: PID, n: 7 })
  })
  it.each(['', 'привет', 'https://example.com/', `/projects/${PID}/boxes/0`, `/projects/${PID}/boxes/abc`, '/projects/short/boxes/1', `/projects/${PID}/boxes/1/label`])(
    'отклоняет чужое и мусор: %j',
    (text) => expect(parseBoxLink(text)).toBeNull(),
  )
})

describe('ссылки', () => {
  it('QR кодирует обычный URL сайта', () => {
    expect(boxUrl(boxPath(PID, 5), 'https://site.ru')).toBe(`https://site.ru/projects/${PID}/boxes/5`)
  })
})

describe('форматы', () => {
  it('дата ДД.ММ.ГГГГ, время игнорируется', () => {
    expect(formatDate('2026-11-01')).toBe('01.11.2026')
    expect(formatDate('2026-11-01T10:00:00Z')).toBe('01.11.2026')
  })
  it.each([
    [1, 'вещь'],
    [2, 'вещи'],
    [4, 'вещи'],
    [5, 'вещей'],
    [11, 'вещей'],
    [12, 'вещей'],
    [21, 'вещь'],
    [22, 'вещи'],
    [100, 'вещей'],
    [0, 'вещей'],
  ])('склонение: %i -> %s', (n, word) => expect(plural(n, ['вещь', 'вещи', 'вещей'])).toBe(word))
})

describe('formatTimeRange', () => {
  it('показывает диапазон, одно значение или пустую строку', () => {
    expect(formatTimeRange('09:00:00', '12:30:00')).toBe('09:00–12:30')
    expect(formatTimeRange('09:00:00', null)).toBe('с 09:00')
    expect(formatTimeRange(null, '12:30:00')).toBe('до 12:30')
    expect(formatTimeRange(null, null)).toBe('')
  })
})
