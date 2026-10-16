import { Html5Qrcode } from 'html5-qrcode'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import RequireProject from '../components/RequireProject'
import { boxPath, parseBoxLink } from '../ui/format'

export default function ScanPage() {
  return <RequireProject>{(pid) => <Scanner pid={pid} />}</RequireProject>
}

const READER_ID = 'qr-reader'

function Scanner({ pid }: { pid: string }) {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(
    window.isSecureContext ? null : 'Камера работает только по HTTPS (или на localhost). Введите номер коробки вручную.',
  )
  const [number, setNumber] = useState('')

  useEffect(() => {
    if (!window.isSecureContext) return
    const scanner = new Html5Qrcode(READER_ID)
    const started = scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (text) => {
          const link = parseBoxLink(text)
          if (link) navigate(boxPath(link.pid, link.n))
          else setError('Это не QR-код коробки MoverMate. Попробуйте другой.')
        },
        undefined,
      )
      .catch(() => setError('Не удалось включить камеру. Разрешите доступ к камере в браузере или введите номер вручную.'))
    return () => {
      // Остановка после старта: StrictMode в разработке запускает эффект дважды
      void started.then(() => (scanner.isScanning ? scanner.stop() : undefined)).then(() => scanner.clear()).catch(() => {})
    }
  }, [navigate])

  function openNumber(e: FormEvent) {
    e.preventDefault()
    const n = Number(number)
    if (Number.isInteger(n) && n >= 1) navigate(boxPath(pid, n))
  }

  return (
    <>
      <h2>Сканер QR</h2>
      <p className="muted">Наведите камеру на QR-код на коробке: откроется её карточка.</p>
      <div id={READER_ID} className="scanner" />
      {error ? <div className="alert" role="alert">{error}</div> : null}
      <form className="card stack" onSubmit={openNumber}>
        <label>
          Или введите номер коробки
          <input type="number" min={1} inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} />
        </label>
        <button className="primary" type="submit" disabled={!number}>Открыть</button>
      </form>
    </>
  )
}
