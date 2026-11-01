import { OldScreen } from '../OldScreen';

// 학생 수첩 > 그래프·평가 탭(새 디자인 3단계). 본문은 기존 결과 평가 화면(EvalPage) 통째 — 이 탭이 보일 때만 마운트(캔버스 폭 0 방지).
//   위에 '결과 보고서 만들기' 입구 한 줄: 화면 안 '📊 결과 보고서 생성' 단추를 그대로 누른다(같은 창·같은 그래프·같은 입력).
//   보고서는 문서 탭·문서·자료 허브에서도 만들 수 있다(그때는 OffscreenCharts가 같은 화면을 화면 밖에 그린다).
export default function ChartTab({ onNavigate }) {
  const openReport = () => {
    const b = document.querySelector('[data-help="ev-report"]');
    if (b) { b.click(); return; }
  };
  return (
    <div className="kb-stack">
      <section className="kb-card kb-card-row" data-tour="ws-chart-report">
        <div className="kb-grow">
          <h3 className="kb-h3">결과 보고서</h3>
          <div className="kb-small">아래 그래프·충실도·위기 기록과 교사 종합 의견을 A4 한 장으로 인쇄해요.</div>
        </div>
        <button type="button" className="kb-btn kb-pri" onClick={openReport}>결과 보고서 만들기</button>
      </section>
      <OldScreen page="eval" onNavigate={onNavigate} />
    </div>
  );
}
