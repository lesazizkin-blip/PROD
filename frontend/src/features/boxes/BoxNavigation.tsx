import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type MouseEvent } from 'react'
import { Link, useLocation, useNavigate, type LinkProps } from 'react-router-dom'
import { api } from '../../api/endpoints'
import type { Box, BoxCard, BoxSort, Page, Progress, SearchHit } from '../../api/types'
import { boxPath } from '../../ui/format'
import { locationFor, INITIAL_LOCATION_PAGES, LOCATION_PAGE_SIZE, type BoxLocation, type LocationBoxes, type LocationPages } from './boxLocations'
import './box-navigation.css'

export interface ShelfView {
  pid: string
  query: string
  room: string | null
  scrollY: number
  page: number
  sort?: BoxSort
  place?: BoxLocation
  placePages?: LocationPages
  locations?: LocationBoxes
  summary: Progress | null
  boxes: Page<Box> | null
  hits: Page<SearchHit> | null
  byNumber: Page<Box> | null
}

interface Navigation {
  pendingPath: string | null
  openBox: (pid: string, number: number, source: HTMLElement) => Promise<void>
  returnToShelf: (pid: string, number: number) => Promise<void>
  cardSeed: (pid: string, number: number) => BoxCard | null
  shelfView: (pid: string) => ShelfView | null
  rememberShelf: (view: ShelfView) => void
}

const Context = createContext<Navigation | null>(null)

/** Ephemeral, authenticated-screen memory; inventory is never written to browser history. */
export function BoxNavigationProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [pendingPath, setPendingPath] = useState<string | null>(null)
  const cachedCard = useRef<{ path: string; value: BoxCard; at: number } | null>(null)
  const shelf = useRef<ShelfView | null>(null)
  const sourceId = useRef<string | undefined>(undefined)
  const request = useRef(0)
  const mounted = useRef(true)
  const activeTransition = useRef<ViewTransition | null>(null)
  const pendingCommit = useRef<{ path: string; finish: () => void; after: () => void } | null>(null)

  // BrowserRouter commits navigation in a React transition. The browser snapshot
  // must wait for that commit, including the destination's layout and scroll.
  useLayoutEffect(() => {
    const commit = pendingCommit.current
    if (!commit) return
    pendingCommit.current = null
    if (pathname === commit.path) commit.after()
    commit.finish()
  }, [pathname])

  function navigateAndWait(path: string, after: () => void) {
    return new Promise<void>((finish) => {
      pendingCommit.current?.finish()
      pendingCommit.current = { path, finish, after }
      navigate(path, { state: { cartonTransition: true } })
    })
  }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      // This ref is a request generation counter, not a captured DOM node.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      request.current++
      activeTransition.current?.skipTransition()
      pendingCommit.current?.finish()
    }
  }, [])

  async function transition(update: () => void | Promise<void>) {
    activeTransition.current?.skipTransition()
    if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      await update()
      return
    }
    const current = document.startViewTransition(update)
    activeTransition.current = current
    // A skipped snapshot (e.g. a hidden tab) must never reject the navigation.
    void current.ready.catch(() => {})
    await current.finished.catch(() => {})
    if (activeTransition.current === current) activeTransition.current = null
  }

  async function openBox(pid: string, number: number, source: HTMLElement) {
    const path = boxPath(pid, number)
    const ticket = ++request.current
    const origin = window.location.href
    sourceId.current = source.dataset.boxSource
    setPendingPath(path)
    try {
      const value = await api.getBox(pid, number)
      if (!mounted.current || ticket !== request.current || window.location.href !== origin) return
      cachedCard.current = { path, value, at: Date.now() }
    } catch {
      // The destination owns its normal authentication, error and retry states.
      if (!mounted.current || ticket !== request.current || window.location.href !== origin) return
      cachedCard.current = null
    } finally {
      if (mounted.current && ticket === request.current) setPendingPath(null)
    }
    if (!source.isConnected) return
    source.style.viewTransitionName = 'carton-zoom'
    try {
      await transition(() => {
        if (!mounted.current || ticket !== request.current || window.location.href !== origin) return
        return navigateAndWait(path, () => window.scrollTo({ top: 0, behavior: 'instant' }))
      })
      if (window.location.pathname === path) document.getElementById('box-heading')?.focus({ preventScroll: true })
    } finally { source.style.removeProperty('view-transition-name') }
  }

  async function returnToShelf(pid: string, number: number) {
    const origin = window.location.href
    const ticket = ++request.current
    setPendingPath('/boxes')
    try {
      const previous = shelf.current?.pid === pid ? shelf.current : null
      const placePages = previous?.placePages ?? INITIAL_LOCATION_PAGES
      const [old, truck, arrived, summary, card] = await Promise.all([
        api.boxes(pid, { sort: previous?.sort ?? 'number', location: 'old', page_size: LOCATION_PAGE_SIZE, page: placePages.old, ...(previous?.room ? { room: previous.room } : {}) }),
        api.boxes(pid, { sort: previous?.sort ?? 'number', location: 'truck', page_size: LOCATION_PAGE_SIZE, page: placePages.truck, ...(previous?.room ? { room: previous.room } : {}) }),
        api.boxes(pid, { sort: previous?.sort ?? 'number', location: 'new', page_size: LOCATION_PAGE_SIZE, page: placePages.new, ...(previous?.room ? { room: previous.room } : {}) }),
        api.progress(pid), api.getBox(pid, number),
      ])
      if (!mounted.current || ticket !== request.current || window.location.href !== origin) return
      const destination = locationFor(card.status)
      const place = destination
      shelf.current = { pid, query: previous?.query ?? '', room: previous?.room ?? null, scrollY: previous?.scrollY ?? 0, page: previous?.page ?? 1, hits: previous?.hits ?? null, byNumber: previous?.byNumber ?? null, boxes: previous?.boxes ?? null, summary, sort: previous?.sort ?? 'number', place, placePages, locations: { old, truck, new: arrived } }
    } catch {
      if (!mounted.current || ticket !== request.current || window.location.href !== origin) return
      shelf.current = null
    } finally {
      if (mounted.current && ticket === request.current) setPendingPath(null)
    }
    let target: HTMLElement | undefined
    await transition(() => {
      if (!mounted.current || ticket !== request.current || window.location.href !== origin) return
      return navigateAndWait('/boxes', () => {
        window.scrollTo({ top: shelf.current?.scrollY ?? 0, behavior: 'instant' })
        const links = Array.from(document.querySelectorAll<HTMLElement>('[data-box-path]')).filter((el) => el.dataset.boxPath === boxPath(pid, number) && el.getClientRects().length > 0)
        target = links.find((el) => el.dataset.boxSource === sourceId.current) ?? links[0]
        if (target) target.style.viewTransitionName = 'carton-zoom'
      })
    })
    target?.style.removeProperty('view-transition-name')
    if (window.location.pathname === '/boxes') target?.focus({ preventScroll: true })
  }

  return <Context.Provider value={{
    pendingPath, openBox, returnToShelf,
    cardSeed: (pid, number) => cachedCard.current?.path === boxPath(pid, number) && Date.now() - cachedCard.current.at < 15_000 ? cachedCard.current.value : null,
    shelfView: (pid) => shelf.current?.pid === pid ? shelf.current : null,
    rememberShelf: (view) => { shelf.current = view },
  }}>{children}</Context.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBoxNavigation() {
  const value = useContext(Context)
  if (!value) throw new Error('Box navigation requires BoxNavigationProvider')
  return value
}

/** Retains native modified-click, download and open-in-new-tab link behaviour. */
export function BoxLink({ pid, number, sourceId, children, onClick, ...props }: Omit<LinkProps, 'to'> & { pid: string; number: number; sourceId?: string }) {
  const navigation = useBoxNavigation()
  const path = boxPath(pid, number)
  function open(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.download || (props.target && props.target !== '_self')) return
    event.preventDefault()
    if (navigation.pendingPath === path) return
    void navigation.openBox(pid, number, event.currentTarget)
  }
  return <Link {...props} to={path} data-box-path={path} data-box-source={sourceId ?? `box-${number}`} aria-busy={navigation.pendingPath === path || undefined} onClick={open}>{children}</Link>
}
