import { describe, expect, it } from 'vitest'
import { boxNumberFromInput, boxPath, boxUrl, formatDate, formatMoveDates, formatTimeRange, isRealDate, moveDateBounds, moveDatesError, parseBoxLink, plural } from './format'

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
  it('переезд на несколько дней: «с ... по ...», год один раз', () => {
    expect(formatMoveDates('2026-11-01')).toBe('01.11.2026')
    expect(formatMoveDates('2026-11-01', null)).toBe('01.11.2026')
    expect(formatMoveDates('2026-11-01', '2026-11-01')).toBe('01.11.2026')
    expect(formatMoveDates('2026-11-01', '2026-11-03')).toBe('01.11–03.11.2026')
    expect(formatMoveDates('2026-12-30', '2027-01-02')).toBe('30.12.2026 – 02.01.2027')
  })
  const TODAY = new Date(2026, 9, 18) // 18.10.2026, местное время
  it('даты «с ... по ...» проверяются как на сервере', () => {
    const check = (a: string, b: string) => moveDatesError(a, b, { today: TODAY })
    expect(check('2026-11-01', '')).toBeNull()
    expect(check('2026-11-01', '2026-11-01')).toBeNull()
    expect(check('2026-11-01', '2026-11-30')).toBeNull()
    expect(check('2026-11-03', '2026-11-01')).toBe('Дата окончания раньше даты начала')
    expect(check('2026-11-01', '2026-12-02')).toBe('Переезд длится не больше 31 дня')
    expect(check('2027-02-27', '2027-03-01')).toBeNull() // через конец февраля
  })
  it('февраль: 29-е только в високосный год, 30-го и 31-го не бывает', () => {
    expect(isRealDate('2028-02-29')).toBe(true)
    expect(isRealDate('2027-02-29')).toBe(false)
    expect(isRealDate('2027-02-30')).toBe(false)
    expect(isRealDate('2027-04-31')).toBe(false)
    expect(isRealDate('2027-1-5')).toBe(false)
    expect(moveDatesError('2027-02-29', '', { today: TODAY })).toBe('Такой даты нет в календаре: проверьте число и месяц')
    expect(moveDatesError('2028-02-29', '', { today: TODAY })).toBeNull()
    expect(moveDatesError('2027-02-27', '2027-02-30', { today: TODAY })).toBe('Дата окончания: такой даты нет в календаре')
  })
  it('дата переезда: от сегодня до той же даты через 2 года', () => {
    expect(moveDateBounds(TODAY)).toEqual({ min: '2026-10-18', max: '2028-10-18' })
    expect(moveDateBounds(new Date(2028, 1, 29))).toEqual({ min: '2028-02-29', max: '2030-02-28' })
    expect(moveDatesError('2026-10-17', '', { today: TODAY })).toBe('Дата переезда уже прошла: выберите сегодняшнюю или будущую')
    expect(moveDatesError('2026-10-18', '', { today: TODAY })).toBeNull()
    expect(moveDatesError('2028-10-18', '', { today: TODAY })).toBeNull()
    expect(moveDatesError('2028-10-19', '', { today: TODAY })).toBe('Дата переезда — не дальше чем через 2 года')
    // прежняя дата уже идущего переезда в настройках не проверяется
    expect(moveDatesError('2026-09-01', '', { today: TODAY, checkStart: false })).toBeNull()
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

describe('boxNumberFromInput', () => {
  const PID = '00000000-0000-4000-8000-000000000001'
  it('номер вручную в любом привычном виде', () => {
    expect(boxNumberFromInput('17', PID)).toBe(17)
    expect(boxNumberFromInput(' #017 ', PID)).toBe(17)
    expect(boxNumberFromInput('№ 5', PID)).toBe(5)
  })
  it('ссылка из QR от ручного сканера: номер, а не склейка всех цифр', () => {
    expect(boxNumberFromInput(`https://site.example/projects/${PID}/boxes/12`, PID)).toBe(12)
    expect(boxNumberFromInput(`https://site.example/projects/${PID.replace('1', '2')}/boxes/12`, PID)).toBe('other-project')
  })
  it('мусор и ноль не номер', () => {
    expect(boxNumberFromInput('кухня 3', PID)).toBeNull()
    expect(boxNumberFromInput('0', PID)).toBeNull()
    expect(boxNumberFromInput('', PID)).toBeNull()
  })
})
