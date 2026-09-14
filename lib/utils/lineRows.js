// "- " 여러 줄 문자열 ↔ 표의 행 배열. 저장 형식은 그대로 두고 화면에서만 줄 단위로 나눠 보여 주기 위한 변환.
//   labeled=true 이면 "지도전략: …"처럼 앞머리 구분을 따로 떼어 { label, text }로 다룬다.

const BULLET = /^\s*[-•·]\s*/;
// 구분은 짧은 이름(공백 포함 8자 이하, "→"·":" 없음)일 때만 뗀다 — 문장 속 콜론을 구분으로 오인하지 않게.
const LABEL = /^([^:：→\n]{1,8}?)\s*[:：]\s*(.*)$/;

export function parseRows(value, labeled = false) {
  const lines = String(value || '').split('\n').map((s) => s.replace(BULLET, '').trim()).filter(Boolean);
  if (!lines.length) return [{ label: '', text: '' }];
  return lines.map((line) => {
    const m = labeled ? line.match(LABEL) : null;
    return m ? { label: m[1].trim(), text: m[2].trim() } : { label: '', text: line };
  });
}

export function serializeRows(rows) {
  return rows
    .map((r) => {
      const label = String(r.label || '').trim();
      const text = String(r.text || '').trim();
      if (!label && !text) return '';
      return `- ${label ? `${label}: ` : ''}${text}`;
    })
    .filter(Boolean)
    .join('\n');
}
