import { Link } from 'react-router-dom'
import { ClipboardList, PackageSearch, QrCode, ShieldCheck, Truck, Users } from 'lucide-react'
import MoveIllustration from '../components/MoveIllustration'
import { useAuth } from '../state/AuthContext'

const WHY = [
  { icon: ClipboardList, title: 'План без хаоса', text: 'Задачи до переезда, в день переезда и после — в одном месте, с отметками выполнения.' },
  { icon: PackageSearch, title: 'Любая вещь за секунды', text: 'Вписали вещи в коробку — поиск покажет номер коробки, комнату и где она сейчас.' },
  { icon: QrCode, title: 'QR-этикетки', text: 'Печатаете этикетку, наклеиваете на коробку — любая камера телефона открывает её содержимое.' },
  { icon: Truck, title: 'Контроль переезда', text: 'Видно, что погружено, доставлено и распаковано по каждой комнате.' },
  { icon: Users, title: 'Вместе с помощниками', text: 'Позовите родных или грузчиков по ссылке — они смогут отмечать коробки.' },
  { icon: ShieldCheck, title: 'Без лишних данных', text: 'Только логин и пароль: ни почты, ни телефона. Ничего не передаём третьим лицам.' },
]

/** О нас и почему MoverMate. Первая страница для гостя; открывается и по клику на название сайта. */
export default function AboutPage() {
  const { user } = useAuth()
  return (
    <div className="about stack">
      <section className="card about__hero">
        <div className="about__art"><MoveIllustration /></div>
        <div className="stack">
          <h1>MoverMate — переезд без хаоса</h1>
          <p className="muted">
            Мы команда хакатона PROD, которая сама не раз искала чайник среди тридцати одинаковых коробок.
            MoverMate помогает спланировать переезд, промаркировать коробки и найти любую вещь на новом месте.
          </p>
          {user ? (
            <div className="row wrap">
              <Link to="/" className="button primary">Перейти к плану</Link>
              <Link to="/calculator" className="button">Рассчитать переезд</Link>
            </div>
          ) : (
            <div className="row wrap">
              <Link to="/auth?mode=register" className="button primary">Зарегистрироваться</Link>
              <Link to="/auth" className="button">Войти</Link>
              <Link to="/calculator" className="button">Рассчитать переезд</Link>
            </div>
          )}
        </div>
      </section>

      <h2>Почему выбирают нас</h2>
      <div className="about__grid">
        {WHY.map((w) => (
          <article key={w.title} className="card about__item">
            <w.icon className="icon" aria-hidden />
            <h3>{w.title}</h3>
            <p className="muted">{w.text}</p>
          </article>
        ))}
      </div>
    </div>
  )
}
