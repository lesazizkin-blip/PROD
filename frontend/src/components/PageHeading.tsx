import type { ReactNode } from 'react'

export default function PageHeading({ title, mobileTitle, children }: { title: string; mobileTitle?: string; children: ReactNode }) {
  return <div className="page-heading no-print"><h1>{mobileTitle ? <><span className="desktop-title">{title}</span><span className="mobile-title">{mobileTitle}</span></> : title}</h1><p className="muted">{children}</p></div>
}
