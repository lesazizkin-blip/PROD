import type { Budget, Progress, Project, Task } from '../../api/types'

export type StageState = 'done' | 'active' | 'todo'

export interface JourneyStage {
  n: number
  title: string
  question: string
  does: string
  actions: { to: string; label: string }[]
  // состояние и короткий итог по данным проекта (у гостя данных нет)
  state?: StageState
  detail?: string
}

/** Модель «от решения до обжились»: 7 этапов. Состав этапов один для гостя и для проекта. */
export const STAGES: Omit<JourneyStage, 'state' | 'detail'>[] = [
  {
    n: 1, title: 'Решение', question: 'Во что обойдётся переезд и сколько времени нужно?',
    does: 'Калькулятор: бюджет «от–до», коробки, машина, грузчики, срок подготовки и советы по дате.',
    actions: [{ to: '/calculator', label: 'Калькулятор' }],
  },
  {
    n: 2, title: 'Новое жильё', question: 'Куда переезжаем и что проверить?',
    does: 'Адрес и дата в проекте, план «Снимаю или сдаю квартиру»: осмотр, фото «до», счётчики, акт, залог.',
    actions: [{ to: '/profile', label: 'Адреса проекта' }, { to: '/', label: 'Умный чек-лист' }],
  },
  {
    n: 3, title: 'Подготовка', question: 'Что сделать заранее и ничего не забыть?',
    does: 'Персональный план с ИИ, этапы и сроки; документы и смена адреса; разобрать вещи до упаковки.',
    actions: [{ to: '/', label: 'План переезда' }],
  },
  {
    n: 4, title: 'Подрядчики и бюджет', question: 'Кто поможет и сколько это стоит на самом деле?',
    does: 'Смета из калькулятора переходит в бюджет; по мере оплаты вносится факт и видно отклонение.',
    actions: [{ to: '/budget', label: 'Бюджет' }],
  },
  {
    n: 5, title: 'Упаковка', question: 'Как ничего не потерять?',
    does: 'Коробки с номерами и комнатами, опись по фото, раскладка комнаты по фото, QR-этикетки, поиск, вещи первого дня.',
    actions: [{ to: '/boxes', label: 'Коробки' }, { to: '/labels', label: 'QR-этикетки' }],
  },
  {
    n: 6, title: 'День переезда', question: 'Всё ли погрузили и всё ли доехало?',
    does: 'Статусы коробок «Погружена» и «Доставлена», прогресс по комнатам; повреждения — в карточке коробки.',
    actions: [{ to: '/boxes', label: 'Статусы коробок' }, { to: '/progress', label: 'Прогресс по комнатам' }],
  },
  {
    n: 7, title: 'Обжиться', question: 'Всё распаковано и дела закрыты?',
    does: 'Чек-лист распаковки вещей первого дня, поиск вещей, дела после переезда и итог: задачи, коробки, потери, бюджет.',
    actions: [{ to: '/progress', label: 'Прогресс и итог' }],
  },
]

/** Состояние этапов по данным проекта. Текущий этап - первый незавершённый. */
export function stagesFor(data: { project: Project; tasks: Task[]; progress: Progress; budget: Budget }): JourneyStage[] {
  const { project, tasks, progress, budget } = data
  const byStage = (s: Task['stage']) => tasks.filter((t) => t.stage === s)
  const before = byStage('before')
  const after = byStage('after')
  const doneBefore = before.filter((t) => t.done).length
  const doneAfter = after.filter((t) => t.done).length
  const total = progress.boxes_total
  const st = progress.by_status
  const packed = total - st.packing
  const loaded = st.loaded + st.delivered + st.unpacked
  const paid = budget.items.filter((e) => e.actual !== null).length

  const facts: { done: boolean; started: boolean; detail: string }[] = [
    {
      done: budget.planned > 0,
      started: budget.planned > 0,
      detail: budget.planned > 0 ? `Смета в бюджете: ${budget.planned.toLocaleString('ru-RU')} ₽` : 'Смета ещё не посчитана',
    },
    {
      done: !!project.address_to,
      started: !!project.address_from || !!project.address_to,
      detail: project.address_to ? `Куда: ${project.address_to}` : 'Новый адрес не указан',
    },
    {
      done: before.length > 0 && doneBefore === before.length,
      started: before.length > 0,
      detail: before.length ? `Задач до переезда выполнено ${doneBefore} из ${before.length}` : 'Плана подготовки пока нет',
    },
    {
      done: budget.items.length > 0 && paid === budget.items.length,
      started: budget.items.length > 0,
      detail: budget.items.length ? `Оплачено статей ${paid} из ${budget.items.length}` : 'Статей бюджета нет',
    },
    {
      done: total > 0 && packed === total,
      started: total > 0,
      detail: total ? `Собрано коробок ${packed} из ${total}` : 'Коробок пока нет',
    },
    {
      done: total > 0 && st.delivered + st.unpacked === total,
      started: loaded > 0,
      detail: total ? `Погружено ${loaded}, доехало ${st.delivered + st.unpacked} из ${total}` : 'Нечего грузить',
    },
    {
      done: total > 0 && st.unpacked === total && (after.length === 0 || doneAfter === after.length),
      started: st.unpacked > 0 || doneAfter > 0,
      detail: total ? `Распаковано ${st.unpacked} из ${total}${after.length ? `, дел после переезда ${doneAfter} из ${after.length}` : ''}` : 'Распаковка впереди',
    },
  ]
  const current = facts.findIndex((f) => !f.done)
  return STAGES.map((stage, i) => ({
    ...stage,
    state: facts[i].done ? 'done' : i === current || facts[i].started ? 'active' : 'todo',
    detail: facts[i].detail,
  }))
}

