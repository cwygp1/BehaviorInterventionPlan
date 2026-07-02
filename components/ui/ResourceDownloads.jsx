// 자료실 다운로드 카드 — public/docs/ 아래 탑재된 예시 문서를 그대로 내려받아 활용.
// files: [{ name, desc, links: [{ label, href }] }]
export default function ResourceDownloads({ title = '📎 자료실 (예시 문서 다운로드)', subtitle, files = [] }) {
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      {subtitle && <div className="card-subtitle">{subtitle}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {files.map((f) => (
          <div
            key={f.name}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              padding: '10px 14px', background: 'var(--surface2)',
              border: '1px solid var(--border)', borderRadius: 10,
            }}
          >
            <span style={{ fontSize: '1.4rem' }}>📄</span>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontWeight: 700, fontSize: '.92rem' }}>{f.name}</div>
              {f.desc && <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>{f.desc}</div>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {f.links.map((l) => (
                <a
                  key={l.href}
                  className="btn btn-ghost btn-sm"
                  href={encodeURI(l.href)}
                  download
                  style={{ textDecoration: 'none' }}
                >⬇ {l.label}</a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
