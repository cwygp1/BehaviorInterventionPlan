export function Card({ title, subtitle, children, style, className }) {
  return (
    <div className={'card' + (className ? ' ' + className : '')} style={style}>
      {title && <div className="card-title">{title}</div>}
      {subtitle && <div className="card-subtitle">{subtitle}</div>}
      {children}
    </div>
  );
}

export function EmptyState({ emoji, children }) {
  return (
    <div className="empty-state">
      {emoji && <span className="emoji">{emoji}</span>}
      {children}
    </div>
  );
}
