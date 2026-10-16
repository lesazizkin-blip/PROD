/** Ошибка под формой или над списком: одинаковая на всех экранах, экранный диктор зачитывает её сразу. */
export default function ErrorAlert({ message }: { message: string | null | undefined }) {
  return message ? <div className="alert" role="alert">{message}</div> : null
}
