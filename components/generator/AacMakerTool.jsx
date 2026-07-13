import { useRef, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { printAacCards } from '../../lib/utils/printAacCards';

// AAC 의사소통 카드(그림카드) 만들기 — AI 미사용 인쇄 도구.
// 이미지를 올리고 단어를 매칭하면 A4에 정사각 카드를 배열해 인쇄/PDF 저장한다.
// (참고: 루다쌤의 AAC maker의 기능 구성을 참고해 자체 구현 — 한글 인쇄 품질 개선)

const SIZES = [60, 50, 45, 40, 30];
const BORDER_MODES = [
  { v: 'img', label: '그림 영역에만 테두리 넣기' },
  { v: 'outer', label: '글자 포함 전체(외곽) 테두리 넣기' },
  { v: 'none', label: '테두리 선 없음' },
];
const COLORS = [
  { v: 'black', label: '검정', hex: '#000000' },
  { v: 'red', label: '빨강', hex: '#e63946' },
  { v: 'orange', label: '주황', hex: '#f77f00' },
  { v: 'brown', label: '갈색', hex: '#774936' },
  { v: 'green', label: '초록', hex: '#2a9d8f' },
  { v: 'purple', label: '보라', hex: '#7209b7' },
];
const WIDTHS = [
  { v: 'thin', label: '얇게' },
  { v: 'normal', label: '보통' },
  { v: 'thick', label: '두껍게' },
];
const TEXT_POS = [
  { v: 'margin-bottom', label: '그림 여백 아래' },
  { v: 'margin-top', label: '그림 여백 위' },
  { v: 'overlay-top', label: '그림 겹치기 위' },
  { v: 'overlay-bottom', label: '그림 겹치기 아래' },
];

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = (e) => resolve(e.target.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function AacMakerTool({ onBack }) {
  const toast = useToast();
  const fileRef = useRef(null);

  const [boxSize, setBoxSize] = useState(45);
  const [borderMode, setBorderMode] = useState('outer');
  const [borderColor, setBorderColor] = useState('black');
  const [borderWidth, setBorderWidth] = useState('normal');
  const [textPos, setTextPos] = useState('margin-bottom');
  const [fontSize, setFontSize] = useState(14);
  const [items, setItems] = useState([]); // { id, name, src, label, copies }
  const [loading, setLoading] = useState(false);

  async function onFiles(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setLoading(true);
    try {
      const added = await Promise.all(files.map(async (f, i) => ({
        id: `${Date.now()}-${i}-${f.name}`,
        name: f.name,
        src: await readAsDataURL(f),
        label: '',
        copies: 1,
      })));
      setItems((prev) => [...prev, ...added]);
    } catch (err) {
      toast('이미지 읽기 실패: ' + err.message);
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const setItem = (id, patch) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const removeItem = (id) => setItems((prev) => prev.filter((it) => it.id !== id));
  const move = (idx, dir) => setItems((prev) => {
    const next = [...prev];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return prev;
    [next[idx], next[j]] = [next[j], next[idx]];
    return next;
  });

  function resetAll() {
    if (!window.confirm('모든 이미지와 입력을 초기화할까요?')) return;
    setItems([]);
  }

  function onPrint() {
    if (items.length === 0) { toast('이미지를 먼저 올려주세요.'); return; }
    // 매수만큼 카드 반복
    const expanded = items.flatMap((it) =>
      Array.from({ length: Math.max(1, Number(it.copies) || 1) }, () => ({ src: it.src, label: it.label }))
    );
    try {
      printAacCards({
        items: expanded, boxSize: Number(boxSize), borderMode,
        borderColor, borderWidth, textPos, fontSize: Number(fontSize) || 14,
      });
      toast('인쇄 창에서 프린터 또는 "PDF로 저장"을 선택하세요.');
    } catch (e) {
      toast(e.message);
    }
  }

  // 미리보기 카드 스타일 (mm 단위 그대로 — 화면에서도 근사 크기로 보임)
  const colorHex = (COLORS.find((c) => c.v === borderColor) || COLORS[0]).hex;
  const bwMm = borderWidth === 'thin' ? 0.2 : borderWidth === 'thick' ? 1.2 : 0.6;
  const isMargin = textPos.startsWith('margin');
  const textMm = isMargin ? Math.max(6, fontSize * 0.75) : 0;

  function PreviewCard({ it }) {
    const lbl = it.label ? (
      <div style={{
        fontWeight: 700, fontSize: `${fontSize}pt`, textAlign: 'center', lineHeight: 1.15,
        whiteSpace: 'nowrap', overflow: 'hidden', color: '#000',
        ...(isMargin
          ? { flex: `0 0 ${textMm}mm`, display: 'flex', alignItems: 'center', justifyContent: 'center' }
          : {
              position: 'absolute', left: 0, right: 0, padding: '1mm 2mm',
              background: 'rgba(255,255,255,.78)',
              ...(textPos === 'overlay-top' ? { top: '1.5mm' } : { bottom: '1.5mm' }),
            }),
      }}>{it.label}</div>
    ) : null;
    const img = (
      <div style={{
        flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: borderMode === 'img' ? `${bwMm}mm solid ${colorHex}` : 'none',
      }}>
        <img src={it.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
      </div>
    );
    return (
      <div style={{
        width: `${boxSize}mm`, height: `${boxSize}mm`, flexShrink: 0,
        border: borderMode === 'outer' ? `${bwMm}mm solid ${colorHex}` : '1px dashed #e5e7eb',
        position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff',
      }}>
        {textPos === 'margin-top' ? <>{lbl}{img}</> : <>{img}{lbl}</>}
      </div>
    );
  }

  return (
    <>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← 도구 목록</button>
        <div>
          <div className="card-title" style={{ marginBottom: 2 }}>🖼 AAC 의사소통 카드 만들기</div>
          <div style={{ fontSize: '.82rem', color: '#64748b' }}>
            이미지 + 단어로 인쇄용 AAC 그림카드를 만듭니다. (AI 미사용 · 이미지는 서버로 전송되지 않음)
          </div>
        </div>
      </div>

      {/* 옵션 */}
      <div className="card">
        <div className="card-title">1. 카드 옵션</div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">정사각형 크기 (테두리 기준)</label>
            <select className="form-input" value={boxSize} onChange={(e) => setBoxSize(Number(e.target.value))}>
              {SIZES.map((s) => <option key={s} value={s}>{s}mm</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">테두리</label>
            <select className="form-input" value={borderMode} onChange={(e) => setBorderMode(e.target.value)}>
              {BORDER_MODES.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">테두리 색깔</label>
            <select className="form-input" value={borderColor} onChange={(e) => setBorderColor(e.target.value)} disabled={borderMode === 'none'}>
              {COLORS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">테두리 굵기</label>
            <select className="form-input" value={borderWidth} onChange={(e) => setBorderWidth(e.target.value)} disabled={borderMode === 'none'}>
              {WIDTHS.map((w) => <option key={w.v} value={w.v}>{w.label}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">글자 위치 스타일</label>
            <select className="form-input" value={textPos} onChange={(e) => setTextPos(e.target.value)}>
              {TEXT_POS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">글자 크기 (pt)</label>
            <input type="number" className="form-input" min={8} max={40} value={fontSize}
              onChange={(e) => setFontSize(e.target.value)} />
          </div>
        </div>
      </div>

      {/* 이미지 + 단어 */}
      <div className="card">
        <div className="card-title">2. 이미지 선택 및 단어 입력</div>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={onFiles} className="form-input" />
        {loading && <p style={{ fontSize: '.85rem', color: '#64748b', margin: '8px 0 0' }}>이미지 읽는 중…</p>}
        {items.length === 0 && !loading && (
          <p style={{ fontSize: '.85rem', color: '#94a3b8', margin: '8px 0 0' }}>
            이미지를 선택하면 카드별 단어 입력창이 나타납니다. (여러 장 한꺼번에 선택 가능)
          </p>
        )}
        {items.map((it, i) => (
          <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginTop: 8, background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 10 }}>
            <img src={it.src} alt="" style={{ width: 44, height: 44, objectFit: 'contain', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i + 1}. {it.name}</div>
              <input className="form-input" style={{ marginTop: 4 }} value={it.label} placeholder="이 그림에 매칭할 단어 입력"
                onChange={(e) => setItem(it.id, { label: e.target.value })} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>매수</span>
              <input type="number" min={1} max={30} className="form-input" value={it.copies}
                onChange={(e) => setItem(it.id, { copies: e.target.value })} style={{ width: 58, padding: '4px 6px', textAlign: 'center' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0} title="위로">▲</button>
              <button className="btn btn-ghost btn-sm" onClick={() => move(i, +1)} disabled={i === items.length - 1} title="아래로">▼</button>
            </div>
            <button className="btn btn-ghost btn-sm" style={{ color: '#c0392b', flexShrink: 0 }} onClick={() => removeItem(it.id)}>✕</button>
          </div>
        ))}
      </div>

      {/* 미리보기 */}
      {items.length > 0 && (
        <div className="card">
          <div className="card-title">미리보기 <span style={{ fontWeight: 400, fontSize: 12, color: '#94a3b8' }}>· 실제 인쇄 크기 근사</span></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6mm', padding: 8, background: '#f1f5f9', borderRadius: 10, overflowX: 'auto' }}>
            {items.slice(0, 12).map((it) => <PreviewCard key={it.id} it={it} />)}
            {items.length > 12 && <div style={{ alignSelf: 'center', color: '#94a3b8', fontSize: 13 }}>… 외 {items.length - 12}장</div>}
          </div>
        </div>
      )}

      <div className="card" style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-pri" style={{ flex: 2 }} onClick={onPrint} disabled={items.length === 0}>
          🖨 인쇄 / PDF로 저장
        </button>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={resetAll} disabled={items.length === 0}>초기화</button>
      </div>
      <p style={{ fontSize: '.76rem', color: '#94a3b8', textAlign: 'center', margin: '4px 0 0' }}>
        인쇄 대화상자에서 대상 프린터를 &lsquo;PDF로 저장&rsquo;으로 바꾸면 PDF 파일로 저장됩니다. 배경 그래픽 인쇄를 켜면 겹치기 글자의 흰 배경이 함께 인쇄돼요.
      </p>
    </>
  );
}
