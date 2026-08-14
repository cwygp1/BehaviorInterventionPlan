import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { ALL_TIERS, TIER_META, parseUsedTiers } from '../../lib/tiers';

// 사용 지원 단계(Tier) 설정 — 선생님이 실제로 운영하는 단계만 골라
// 홈 허브·사이드바 메뉴를 정리한다. 최소 1개는 선택해야 저장 가능.
// 저장은 users.used_tiers('1,2,3' CSV) — 어느 기기에서 로그인해도 따라온다.
export default function TierSetupModal({ open, onClose, onSaved }) {
  const { user, updateUsedTiers } = useAuth();
  const toast = useToast();
  const [sel, setSel] = useState(ALL_TIERS);
  const [saving, setSaving] = useState(false);

  // 열릴 때마다 현재 설정으로 초기화(미설정이면 전체 선택 상태로 시작).
  useEffect(() => {
    if (open) setSel(parseUsedTiers(user?.used_tiers) || [...ALL_TIERS]);
  }, [open, user]);

  function toggle(n) {
    setSel((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b)));
  }

  async function save() {
    if (sel.length === 0) {
      toast('최소 1개의 지원 단계는 선택해야 해요.', 'error');
      return;
    }
    setSaving(true);
    try {
      const csv = sel.join(',');
      await updateUsedTiers(csv);
      toast('메뉴 구성을 저장했어요. 선택한 단계만 표시됩니다.', 'success');
      if (onSaved) onSaved(csv);
      onClose();
    } catch (e) {
      toast(e.message || '저장에 실패했어요. 잠시 후 다시 시도해주세요.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={560}>
      <h3>🧩 사용하는 지원 단계 설정</h3>
      <p className="tier-setup-sub">
        선생님이 실제로 운영하는 단계만 골라주세요. 선택한 단계만 홈과 왼쪽 메뉴에 보여요.
        나중에 홈의 <b>⚙ 사용 단계 설정</b>에서 언제든 바꿀 수 있어요.
      </p>

      {ALL_TIERS.map((n) => {
        const m = TIER_META[n];
        const on = sel.includes(n);
        return (
          <button
            key={n}
            type="button"
            className={'tier-pick' + (on ? ' on' : '')}
            style={{ '--tc': m.color, '--tc-soft': m.soft }}
            onClick={() => toggle(n)}
            aria-pressed={on}
          >
            <span className="tp-icon" aria-hidden="true">{m.icon}</span>
            <span className="tp-body">
              <span className="tp-title">
                <span className="tier-badge" style={{ background: m.color }}>{m.badge}</span>
                {m.title}
              </span>
              <span className="tp-desc">{m.short}</span>
            </span>
            <span className={'tp-check' + (on ? ' on' : '')} aria-hidden="true">{on ? '✓' : ''}</span>
          </button>
        );
      })}

      <div className="tier-setup-note">
        💡 예) 개별 학생 지원만 하신다면 <b>Tier 3</b>만, 소그룹과 개별을 함께 운영하시면 <b>Tier 2 + 3</b>을 선택하세요.
        숨긴 단계의 기존 기록은 지워지지 않아요 — 메뉴만 정리됩니다.
        <br />📘 <b>개별화교육(IEP)</b> 메뉴는 Tier와 별개의 공통 업무라 <b>항상 표시</b>되고, 운영 중인 Tier의 기록이 IEP에 반영돼요.
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn-ghost" onClick={onClose} disabled={saving}>취소</button>
        <button className="btn btn-pri" onClick={save} disabled={saving || sel.length === 0}>
          {saving ? '저장 중…' : '이대로 사용하기'}
        </button>
      </div>
    </Modal>
  );
}
