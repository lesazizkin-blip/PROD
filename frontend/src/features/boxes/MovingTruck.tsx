/** Small ink-and-cardboard truck, shared by the route and status feedback. */
export default function MovingTruck({ cargo = false }: { cargo?: boolean }) {
  return <svg viewBox="0 0 180 102" className="moving-truck" aria-hidden="true">
    <path d="M5 86h168" stroke="currentColor" strokeWidth="2" opacity=".18" />
    <path d="M12 24h98v53H12z" fill="#d8bb8c" stroke="#5f654f" strokeWidth="2" />
    <path d="M110 40h29l24 23v14h-53z" fill="#8c9583" stroke="#5f654f" strokeWidth="2" strokeLinejoin="round" />
    <path d="M120 47h16l15 15h-31z" fill="#f5f1e7" stroke="#5f654f" strokeWidth="1.5" />
    <path d="M10 77h156" stroke="#34372f" strokeWidth="5" strokeLinecap="round" />
    <circle cx="40" cy="80" r="12" fill="#34372f" /><circle cx="40" cy="80" r="5" fill="#f5f1e7" />
    <circle cx="140" cy="80" r="12" fill="#34372f" /><circle cx="140" cy="80" r="5" fill="#f5f1e7" />
    {cargo ? <g fill="#f2e5cc" stroke="#866b45" strokeWidth="1.5"><path d="M35 39h24v25H35zM64 39h24v25H64z" /><path d="M45 39v8h5v-8M74 39v8h5v-8" fill="#999d92" /></g> : <path d="M46 50h29m-8-7 8 7-8 7" fill="none" stroke="#866b45" strokeWidth="2" />}
    <path d="M16 30h8m-4-4v8" stroke="#f5f1e7" strokeWidth="2" opacity=".7" />
  </svg>
}
