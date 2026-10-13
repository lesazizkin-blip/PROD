import { Component, type ReactNode } from 'react'

// Ошибка отрисовки не должна оставлять белый экран
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="center" role="alert">
        <div className="card">
          <h2>Что-то пошло не так</h2>
          <p className="muted">Обновите страницу. Если ошибка повторяется, сообщите команде.</p>
          <button className="primary" onClick={() => location.reload()}>
            Обновить страницу
          </button>
        </div>
      </div>
    )
  }
}
