/** Текст ошибки под полем формы. id связывает его с полем через aria-describedby. */
export default function FieldError({ id, message }: { id: string; message: string | null | undefined }) {
  return message ? <p id={id} className="error-text small" role="alert">{message}</p> : null
}
