import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FolderOpen, KeyRound, LogOut, ShieldCheck } from 'lucide-react'
import Avatar from '../components/Avatar'
import PasswordModal from '../components/PasswordModal'
import { useAuth } from '../state/AuthContext'
import { useProjects } from '../state/ProjectContext'
import { useTheme, type ThemePreference } from '../state/ThemeContext'

/** Account settings only; moving projects and their teams have dedicated pages. */
export default function ProfilePage() {
  const { user, logout } = useAuth()
  const { preference, setPreference } = useTheme()
  const { projects } = useProjects()
  const navigate = useNavigate()
  const [changingPassword, setChangingPassword] = useState(false)
  if (!user) return null
  const isDemo = user.username === 'demo'
  return <div className="profile account-page stack">
    <section className="card profile__hero">
      <Avatar name={user.username} size="lg" />
      <div className="grow"><h1>{user.username}</h1><p className="muted">{isDemo ? 'Демо-аккаунт' : 'Ваш аккаунт'}</p></div>
    </section>
    <section className="card stack">
      <h2>Проекты</h2><p className="muted">Все ваши переезды, участие в других проектах и архив на этом устройстве.</p>
      <Link to="/projects" className="button tonal"><FolderOpen className="icon-sm" aria-hidden />Все проекты ({projects.length})</Link>
      <p className="muted small">Адреса, дату переезда и помощников можно изменить в настройках выбранного проекта.</p>
    </section>
    <section className="card stack theme-settings"><h2>Оформление</h2>
      <label>Тема<select value={preference} onChange={event => setPreference(event.target.value as ThemePreference)} aria-label="Тема"><option value="system">Как на устройстве</option><option value="light">Светлая</option><option value="dark">Тёмная</option></select></label>
    </section>
    <section className="card stack"><h2>Безопасность</h2>
      <p className="row muted small"><ShieldCheck className="icon-sm" aria-hidden />Для входа используются логин и пароль.</p>
      <div className="row wrap">{isDemo ? <p className="muted small">У демо-аккаунта общий пароль, сменить его нельзя.</p> : <button className="tonal" onClick={() => setChangingPassword(true)}><KeyRound className="icon-sm" aria-hidden />Сменить пароль</button>}<button className="danger" onClick={() => void logout().then(() => navigate('/'))}><LogOut className="icon-sm" aria-hidden />Выйти</button></div>
    </section>
    {changingPassword ? <PasswordModal onClose={() => setChangingPassword(false)} /> : null}
  </div>
}
