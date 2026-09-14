import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { parseRows, serializeRows } from '../../lib/utils/lineRows';

/**
 * LineTable — "- " 여러 줄 textarea를 한 줄 = 한 행인 편집 표로 보여 준다. (0915 현장 피드백: 칸이 작아 한눈에 안 들어옴)
 *
 * 칸마다 내용 길이만큼 높이가 늘어나 스크롤 없이 전부 보인다. 값은 항상 "- " 줄 문자열 — 저장 스키마·월별 계획·AI 프롬프트와 그대로 호환.
 * Enter = 커서 뒤를 새 행으로, 맨 앞에서 Backspace = 윗행과 합치기(빈 행이면 지우기), 여러 줄 붙여넣기 = 행으로 나눔.
 * labeled 이면 "지도전략: …"의 앞머리를 [구분] 칸으로 따로 보여 준다.
 *
 *   <LineTable value={semMethods} onChange={setSemMethods} labeled placeholder="…" />
 */
export default function LineTable({ value = '', onChange, labeled = false, placeholder = '', addLabel = '+ 줄 추가' }) {
  const [rows, setRows] = useState(() => parseRows(value, labeled));
  const refs = useRef([]);
  const pendingFocus = useRef(null); // { i, pos } — 행이 바뀐 뒤 커서를 옮길 곳

  // 바깥에서 값이 바뀌면(채우기 버튼·불러오기) 다시 나눈다. 편집 중인 빈 행은 저장값과 같으므로 유지.
  useEffect(() => {
    if (value !== serializeRows(rows)) setRows(parseRows(value, labeled));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, labeled]);

  useEffect(() => {
    const f = pendingFocus.current;
    if (!f) return;
    pendingFocus.current = null;
    const el = refs.current[f.i];
    if (el) { el.focus(); const p = f.pos ?? el.value.length; el.setSelectionRange(p, p); }
  });

  const commit = (next) => {
    const safe = next.length ? next : [{ label: '', text: '' }];
    setRows(safe);
    const s = serializeRows(safe);
    if (s !== value) onChange?.(s);
  };
  const setCell = (i, key, v) => commit(rows.map((r, k) => (k === i ? { ...r, [key]: v } : r)));

  const onKeyDown = (i, e) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return; // 한글 조합 중 Enter는 글자 확정
    const el = e.currentTarget;
    const { selectionStart: a, selectionEnd: b } = el;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const cur = rows[i].text;
      const next = [...rows];
      next.splice(i, 1, { ...rows[i], text: cur.slice(0, a) }, { label: '', text: cur.slice(b) });
      pendingFocus.current = { i: i + 1, pos: 0 };
      commit(next);
    } else if (e.key === 'Backspace' && a === 0 && b === 0 && i > 0 && !rows[i].label) {
      e.preventDefault();
      const prev = rows[i - 1];
      const next = [...rows];
      next.splice(i - 1, 2, { ...prev, text: prev.text + rows[i].text });
      pendingFocus.current = { i: i - 1, pos: prev.text.length };
      commit(next);
    } else if (e.key === 'ArrowUp' && a === 0 && i > 0) {
      e.preventDefault(); refs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowDown' && a === el.value.length && i < rows.length - 1) {
      e.preventDefault(); refs.current[i + 1]?.focus();
    }
  };

  const onPaste = (i, e) => {
    const t = e.clipboardData?.getData('text') || '';
    if (!t.includes('\n')) return;
    e.preventDefault();
    const el = e.currentTarget;
    const cur = rows[i].text;
    const before = cur.slice(0, el.selectionStart), after = cur.slice(el.selectionEnd);
    // 붙여넣은 줄은 각자 행이 된다. 커서 앞 글이 있으면 그 행은 남기고 아래로, 커서 뒤 글은 마지막 행 끝에 붙인다.
    const pasted = parseRows(t, labeled);
    pasted[pasted.length - 1] = { ...pasted[pasted.length - 1], text: pasted[pasted.length - 1].text + after };
    const head = before.trim() ? [{ ...rows[i], text: before }] : [];
    if (!head.length && rows[i].label && !pasted[0].label) pasted[0] = { ...pasted[0], label: rows[i].label };
    const next = [...rows];
    next.splice(i, 1, ...head, ...pasted);
    pendingFocus.current = { i: i + head.length + pasted.length - 1, pos: pasted[pasted.length - 1].text.length - after.length };
    commit(next);
  };

  const remove = (i) => commit(rows.filter((_, k) => k !== i));
  const add = () => { pendingFocus.current = { i: rows.length, pos: 0 }; commit([...rows, { label: '', text: '' }]); };

  return (
    <div className="line-table">
      <table>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="lt-num">{i + 1}</td>
              {labeled && (
                <td className="lt-label">
                  <AutoGrow value={r.label} placeholder="구분" onChange={(v) => setCell(i, 'label', v.replace(/\n/g, ' '))} />
                </td>
              )}
              <td>
                <AutoGrow
                  inputRef={(el) => { refs.current[i] = el; }}
                  value={r.text}
                  placeholder={i === 0 && rows.length === 1 ? placeholder : ''}
                  onChange={(v) => setCell(i, 'text', v)}
                  onKeyDown={(e) => onKeyDown(i, e)}
                  onPaste={(e) => onPaste(i, e)}
                />
              </td>
              <td className="lt-del">
                <button type="button" title="이 줄 지우기" aria-label={`${i + 1}번째 줄 지우기`} onClick={() => remove(i)}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="lt-add" onClick={add}>{addLabel}</button>
    </div>
  );
}

// 내용 높이만큼 늘어나는 한 칸짜리 textarea. 열 폭이 바뀌어도(창 크기) 다시 잰다.
function AutoGrow({ value, onChange, inputRef, ...rest }) {
  const ref = useRef(null);
  const fit = () => { const el = ref.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; };
  useLayoutEffect(fit, [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => { if (el.clientWidth !== w) { w = el.clientWidth; fit(); } });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <textarea
      ref={(el) => { ref.current = el; inputRef?.(el); }}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
}
