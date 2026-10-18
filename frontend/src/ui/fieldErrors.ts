import { ApiError } from '../api/client'

/** Поле даты заполнено, но такой даты нет (29.02.2100, 31.04): браузер отдаёт пустое значение
 *  и ставит validity.badInput, поэтому без этой проверки форма молча считает дату невыбранной. */
export const isBadDateInput = (el: HTMLInputElement | null | undefined) => Boolean(el?.validity?.badInput)

/** Ошибки сервера (422) по полям формы: `first_day.3` относится к полю `first_day`. */
export function serverFieldErrors(e: unknown, fields: readonly string[]): Record<string, string> {
  if (!(e instanceof ApiError)) return {}
  const out: Record<string, string> = {}
  for (const [path, message] of Object.entries(e.fieldErrors)) {
    const field = fields.find((f) => path === f || path.startsWith(`${f}.`))
    if (!field || out[field]) continue
    const text = message.replace(/^Value error, /, '')
    // своя причина по-русски; английскую от pydantic заменяет общий текст ответа
    out[field] = /[а-яё]/i.test(text) ? text : e.message
  }
  return out
}
