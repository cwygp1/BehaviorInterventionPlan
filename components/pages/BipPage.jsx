import { useEffect, useState } from 'react';
import StuHero, { NoStudentHint } from '../student/StuHero';
import { FormLoading } from '../../lib/hooks/useFormLoad';
import useAutoSave from '../../lib/hooks/useAutoSave';
import { useStudents } from '../../contexts/StudentContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLLM } from '../../contexts/LLMContext';
import { EditableChipGroup, makeAppender } from '../ui/QChip';
import TokenField from '../ui/TokenField';
import BIPPromptModal from '../modals/BIPPromptModal';
import FamilyLetterModal from '../modals/FamilyLetterModal';
import { saveBIP as apiSaveBIP } from '../../lib/api/students';
import NextStepBanner, { useSavedFlag, hintNextStep } from '../ui/NextStepBanner';
import { skillsForQabf } from '../../lib/functionSkills';
import AssessmentLauncher from '../student/AssessmentLauncher';
import { printBehaviorContract } from '../../lib/utils/printContract';
import { printBIP } from '../../lib/utils/printBIP';

// LLM 응답에서 JSON 오브젝트를 관대하게 추출.
function looseJSON(raw) {
  const m = String(raw || '').match(/\{[\s\S]*\}/);
  if (!m) throw new Error('JSON을 찾지 못했어요.');
  try { return JSON.parse(m[0]); }
  catch (_) {
    return JSON.parse(m[0].replace(/```(?:json)?/gi, '').replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, '$1'));
  }
}

const ALT_CHIPS = ['쉬어 카드 들기', '"도와주세요" 카드', '심호흡 3회', '감각 도구 요청', '휴식 신호', '대안 활동 선택'];
const FCT_CHIPS = ['"도와주세요" 카드', '"쉬고 싶어요" 카드', '"이해 안 돼요" 카드', '"그만" 카드', 'PECS 그림 카드', 'AAC 음성 출력'];
const CRIT_CHIPS = ['하루 3회 미만', '주 5회 이상', '2주 연속', '한 달 연속', '80% 이상', '강도 2 이하'];
const PREV_CHIPS = ['시각적 일과표 제공', '선택권 2~3가지 제공', '환경 조정(파티션)', '과제 난이도 조정', '사전 예고 5분 전', '감각 휴식 시간 배치', '4:1 긍정 비율 유지', '좌석 배치 변경', '시각 단서 카드', '작업 분량 시각적 표시'];
const TEACH_CHIPS = ['FCT 직접 교수', '모델링 후 역할극', '사회적 이야기(Carol Gray)', '비디오 모델링', '자기관리 훈련', '또래 매개 중재(PMI)', '과제 분석 단계별', '점진적 촉진 줄이기'];
const REINF_CHIPS = ['차별강화 DRA(대체행동)', '차별강화 DRO(부재 강화)', '토큰 경제', '즉각 칭찬 + 스티커', '활동 강화(선호 활동)', '4:1 긍정:재지도 비율', '자연 강화 활용'];
const RESP_CHIPS = ['계획적 무시 10초', '대체행동 즉각 촉진', '안전 거리 확보', '심리안정실 이동', '위기관리팀 호출', '보호자 연락', '그라운딩 5-4-3-2-1', '신체적 개입(최후 수단)'];
const REWARD_CHIPS = ['스티커 5개당 작은 선물', '특별 활동 시간', '선택 시간', '또래 칭찬 카드', '보호자 칭찬 통신문', '자리 선택권'];

export default function BipPage({ onNavigate }) {
  const { curStu, curStuId, curStuData, curStuDataLoaded, updateStudentData } = useStudents();
  const { user } = useAuth();
  const toast = useToast();
  const { callDetailed, status: llmStatus } = useLLM();
  const aiOn = llmStatus !== 'off';

  const [opdef, setOpdef] = useState(''); // 0719: 표적행동(문제행동) 조작적 정의 — ABC 다음 단계
  const [hypothesis, setHypothesis] = useState(''); // 0822: 행동기능 가설문(워크플로 ⑤단계)
  const [alt, setAlt] = useState('');
  const [fct, setFct] = useState('');
  const [crit, setCrit] = useState('');
  const [prev, setPrev] = useState('');
  const [teach, setTeach] = useState('');
  const [reinf, setReinf] = useState('');
  const [resp, setResp] = useState('');
  const [bgoal, setBgoal] = useState(''); // 0719: 중재계획 다음 단계 — 메이거식 행동목표
  // 0814 전문가 자문: 행동목표의 IEP 반영 방식은 선생님의 선택 —
  // 'iep'(개별화 목표로 가져감) | 'subject'(교과 목표에 녹임) | ''(미선택).
  const [bgoalDest, setBgoalDest] = useState('');
  // 0819 피드백: 저장 성공 후 "다음 단계(행동 데이터)로 이동" 배너 — 내용을 다시 수정하면 숨김.
  const [savedOk, markSaved] = useSavedFlag([alt, fct, crit, prev, teach, reinf, resp, opdef, bgoal, bgoalDest, hypothesis]);
  const [opdefBusy, setOpdefBusy] = useState(false);
  const [bgoalBusy, setBgoalBusy] = useState(false);

  const [conStu, setConStu] = useState('');
  const [conCrit, setConCrit] = useState('');
  const [conTch, setConTch] = useState('');
  const [conStart, setConStart] = useState('');
  const [conEnd, setConEnd] = useState('');

  const [busy, setBusy] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [letterOpen, setLetterOpen] = useState(false);

  // 학생이 바뀌거나 데이터가 처음 도착했을 때만 폼을 채운다.
  // (자동 저장이 캐시를 갱신할 때마다 재실행되면, 저장 요청 중에 이어서 친
  //  글자가 방금 저장된 값으로 되돌아가는 유실이 생긴다 — deps에서 bip 제외)
  useEffect(() => {
    const b = curStuData?.bip || {};
    setAlt(b.alt || ''); setFct(b.fct || ''); setCrit(b.crit || '');
    setPrev(b.prev || ''); setTeach(b.teach || ''); setReinf(b.reinf || ''); setResp(b.resp || '');
    setOpdef(b.opdef || ''); setBgoal(b.bgoal || ''); setBgoalDest(b.bgoal_dest || '');
    setHypothesis(b.hypothesis || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curStuId, curStuDataLoaded]);

  // 자동 저장(0824 퀵윈①) — 입력이 서버값과 다르면 타이핑이 멎은 뒤 저장.
  // 텍스트 위주 페이지라 디바운스를 2초로 넉넉히. 상태는 상단바 SaveBadge에 표시.
  const bipBody = { alt, fct, crit, prev, teach, reinf, resp, opdef, bgoal, bgoal_dest: bgoalDest, hypothesis };
  const savedBip = curStuData?.bip || {};
  const bipDirty = Object.entries(bipBody).some(([k, v]) => String(v || '') !== String(savedBip[k] || ''));
  useAutoSave({
    enabled: !!curStuId && curStuDataLoaded,
    dirty: bipDirty,
    signal: JSON.stringify(bipBody),
    save: saveCore,
    delay: 2000,
  });

  if (!curStu) return <><StuHero /><NoStudentHint /></>;
  // 서버 데이터 도착 전 입력 UI를 띄우지 않는다 — 로드 중 입력이 덮어써지는 것 방지.
  if (!curStuDataLoaded) return <><StuHero /><FormLoading label="BIP 내용을 불러오는 중…" /></>;

  // 실제 저장(공통) — 자동 저장은 조용히 호출, 수동 [저장]은 토스트·다음단계 안내까지.
  // (함수 선언 호이스팅으로 위 useAutoSave에서 참조 가능)
  async function saveCore() {
    const body = { alt, fct, crit, prev, teach, reinf, resp, opdef, bgoal, bgoal_dest: bgoalDest, hypothesis };
    await apiSaveBIP(curStuId, body);
    // 캐시는 병합으로 갱신 — interview(초기면담지)처럼 이 화면이 다루지 않는 필드를 지우지 않는다.
    updateStudentData(curStuId, (cur) => ({ ...cur, bip: { ...(cur.bip || {}), ...body } }));
  }

  async function onSave() {
    if (!curStuId) return;
    setBusy(true);
    try {
      await saveCore();
      toast('BIP 저장 완료');
      markSaved(); hintNextStep('monitor'); // 저장 확인 + 사이드바 다음 메뉴 반짝임
    } catch (e) {
      toast('저장 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  // 0822: 행동기능 가설문 규칙 초안 — QABF 최다 기능 + 최근 ABC로 양식을 채운다(AI 불필요).
  // 양식(동료 제공): "[선행사건]일 때, 학생은 [행동]을 하며, 이는 [기능]을 얻기 위한 것이다."
  function draftHypothesis() {
    const abc0 = (curStuData?.abc || [])[0] || {};
    const beh = String(opdef || abc0.b || '').trim() || '[행동]';
    const ante = String(abc0.a || '').trim() || '[선행사건]';
    const rec = skillsForQabf(curStuData?.qabf);
    const FUNC_TEXT = {
      관심: '타인의 관심', 회피: '선호하지 않는 요구·상황으로부터의 도피·회피',
      '자동·감각': '감각 자극(자동강화)', 신체: '신체적 불편의 표현·완화', 강화물: '원하는 물건·활동',
    };
    const fn = rec?.qabfLabel ? (FUNC_TEXT[rec.qabfLabel] || rec.qabfLabel) : '[기능]';
    setHypothesis(`${ante}일 때, 학생은 ${beh}을(를) 하며, 이는 ${fn}을(를) 얻기 위한 것이다.`);
    toast('ABC·QABF에서 가설문 초안을 채웠어요 — [ ] 부분을 학생에 맞게 다듬어 주세요.');
  }

  // 0719: ABC 누적 기록으로 표적행동 조작적 정의 초안 생성.
  async function aiOpdef() {
    if (!aiOn) { toast('AI 미설정: 우측 상단 AI 버튼에서 연결을 먼저 설정하세요.'); return; }
    const abcs = (curStuData?.abc || []).slice(0, 12);
    if (!abcs.length) { toast('ABC 관찰 기록이 없어요. 학생 관찰/ABC에서 먼저 기록하세요.'); return; }
    setOpdefBusy(true);
    try {
      const prompt =
        '/no_think\n너는 특수교육 행동지원(PBS) 전문가다. 아래 ABC 관찰 기록을 바탕으로 표적행동(문제행동)의 "조작적 정의"를 작성하라.\n' +
        '- 눈으로 보고 셀 수 있는 구체적 움직임으로("죽은 사람 검사" 통과), 시작·끝을 알 수 있게 1~2문장.\n' +
        '- 추측·감정 표현(화가 나서, 반항적으로 등) 금지. 쉬운 우리말.\n' +
        (opdef.trim() ? `- 교사가 쓴 초안을 다듬어라: "${opdef.trim()}"\n` : '') +
        '[ABC 기록]\n' + abcs.map((r) => `- A: ${r.a} / B: ${r.b} / C: ${r.c}`).join('\n') + '\n' +
        '반드시 JSON만 출력: {"opdef":"..."}';
      const r = await callDetailed(prompt, { temperature: 0.3, tier: 'fast', label: '조작적 정의 생성' });
      const out = (r.content && r.content.trim()) ? r.content : (r.reasoning || '');
      const j = looseJSON(out);
      if (!String(j.opdef || '').trim()) throw new Error('정의를 받지 못했어요.');
      setOpdef(String(j.opdef).trim());
      toast('조작적 정의 초안을 만들었어요. 다듬은 뒤 저장하세요.');
    } catch (e) { toast('생성 실패: ' + e.message); }
    finally { setOpdefBusy(false); }
  }

  // 0719: 선택한 키워드·작성 내용(조작적 정의+대체행동+중재전략)으로 메이거식 행동목표 생성.
  async function aiBgoal() {
    if (!aiOn) { toast('AI 미설정: 우측 상단 AI 버튼에서 연결을 먼저 설정하세요.'); return; }
    if (!alt.trim() && !opdef.trim()) { toast('조작적 정의나 대체 행동을 먼저 작성하세요.'); return; }
    setBgoalBusy(true);
    try {
      const prompt =
        '/no_think\n너는 특수교육 행동지원(PBS) 전문가다. 아래 중재계획을 바탕으로 메이거(Mager) 방식의 "행동목표"를 1문장으로 작성하라.\n' +
        '- 조건(어떤 상황·자료에서) + 행동(관찰 가능한 대체행동을 한다) + 기준(성공 기준: 횟수·비율·기간)을 모두 담을 것.\n' +
        '- 문제행동 감소가 아니라 대체행동 수행을 긍정형으로 진술. 쉬운 우리말, 전략 이름 금지.\n' +
        (opdef.trim() ? `[표적행동 조작적 정의] ${opdef.trim()}\n` : '') +
        (alt.trim() ? `[대체 행동] ${alt.trim()}\n` : '') +
        (fct.trim() ? `[FCT 기술] ${fct.trim()}\n` : '') +
        (crit.trim() ? `[성공 기준] ${crit.trim()}\n` : '') +
        (prev.trim() ? `[예방 전략] ${prev.replace(/\n/g, ' / ')}\n` : '') +
        (teach.trim() ? `[교수 전략] ${teach.replace(/\n/g, ' / ')}\n` : '') +
        (reinf.trim() ? `[강화 전략] ${reinf.replace(/\n/g, ' / ')}\n` : '') +
        '반드시 JSON만 출력: {"bgoal":"..."}';
      const r = await callDetailed(prompt, { temperature: 0.4, tier: 'fast', label: '행동목표 생성(메이거식)' });
      const out = (r.content && r.content.trim()) ? r.content : (r.reasoning || '');
      const j = looseJSON(out);
      if (!String(j.bgoal || '').trim()) throw new Error('행동목표를 받지 못했어요.');
      setBgoal(String(j.bgoal).trim());
      toast('행동목표 초안을 만들었어요. 다듬은 뒤 저장하세요.');
    } catch (e) { toast('생성 실패: ' + e.message); }
    finally { setBgoalBusy(false); }
  }

  async function copyBgoal() {
    if (!bgoal.trim()) { toast('행동목표를 먼저 작성하세요.'); return; }
    try { await navigator.clipboard.writeText(bgoal.trim()); toast('행동목표를 복사했어요. IEP "학기목표 먼저" 경로에 붙여넣으면 개별화 학기목표로 쓸 수 있어요.'); }
    catch (_) { toast('복사가 막혔어요. 직접 선택해 복사하세요.'); }
  }

  function copyBIPToContract() {
    if (!alt && !crit) { toast('BIP 칸을 먼저 작성해주세요.'); return; }
    if (alt) setConStu(alt);
    if (crit) setConCrit(crit);
    toast('BIP 데이터로 채웠습니다.');
  }

  function onPrintBIP() {
    if (!alt && !prev && !teach && !reinf && !resp) {
      toast('BIP 내용을 먼저 작성해주세요.');
      return;
    }
    printBIP({
      studentId: curStu.code,
      level: curStu.level,
      disability: curStu.disability,
      note: curStu.note,
      teacherName: user?.name,
      school: user?.school,
      bip: { alt, fct, crit, prev, teach, reinf, resp },
    });
  }

  function onPrint() {
    if (!conStu.trim()) { toast('학생의 약속을 입력해주세요.'); return; }
    printBehaviorContract({
      studentId: curStu.code,
      teacherName: user?.name || '',
      stu: conStu, crit: conCrit, tch: conTch, d1: conStart, d2: conEnd,
    });
  }

  return (
    <>
      <StuHero />
      {/* 0821: BIP는 선호/강화물·표적행동 우선순위를 재료로 쓴다 — 여기서 바로 작성·수정 */}
      <AssessmentLauncher compact />

      {/* 0719 피드백: ABC → ① 조작적 정의 → ② 중재계획 → ③ 행동목표 순서를 화면에 드러냄 */}
      <div className="card" style={{ background: 'var(--pri-soft)', borderColor: 'var(--pri-l)', fontSize: '.84rem', lineHeight: 1.6 }} data-tour="bip-order">
        🧭 <strong>작성 순서</strong> — ABC 관찰 뒤 ① <strong>표적행동 조작적 정의</strong>를 쓰고, ② 대체행동·중재 전략(BIP)을 세운 다음, ③ <strong>행동목표(메이거식)</strong>를 만들어 마무리합니다. 행동목표는 IEP의 개별화 학기목표로도 쓸 수 있어요.
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 0 }} data-tour="bip-opdef">🪄 ① 표적행동(문제행동) 조작적 정의</div>
            <div className="card-subtitle">ABC 기록을 근거로, 눈으로 보고 셀 수 있는 구체적 행동으로 정의합니다.</div>
          </div>
          {aiOn && <button className="btn btn-ghost btn-sm" onClick={aiOpdef} disabled={opdefBusy}>{opdefBusy ? '생성 중…' : '✨ ABC 기록으로 AI 초안'}</button>}
        </div>
        <textarea className="form-textarea" rows={2} value={opdef} onChange={(e) => setOpdef(e.target.value)}
          placeholder='예: 과제를 제시받으면 3초 이내에 "싫어"라고 소리치며 책상 위 물건을 바닥으로 던진다.' />
      </div>

      {/* 0822 워크플로 개편 ⑤: 행동기능에 대한 가설 설정 — 가설문 양식 + 예시 + 규칙 초안 */}
      <div className="card" data-tour="bip-hypo" style={{ borderColor: '#c7d8f5' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 0 }}>🧭 행동기능 가설 설정</div>
            <div className="card-subtitle">ABC 분석과 기능평가(QABF)를 근거로, 행동이 <strong>왜</strong> 나타나는지 한 문장으로 가설을 세웁니다.</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={draftHypothesis}>↻ ABC·QABF에서 초안 채우기</button>
        </div>
        <div style={{ fontSize: '.8rem', color: '#274690', background: '#eef4ff', border: '1px solid #b9cdf0', borderRadius: 8, padding: '8px 12px', margin: '8px 0', lineHeight: 1.7 }}>
          <strong>입력 양식</strong> — “[선행사건]일 때, 학생은 [행동]을 하며, 이는 [기능]을 얻기 위한 것이다.”
          <br /><strong>예시</strong> — “아침 학습 시간에 여러 단계로 이루어진 쓰기 과제가 제시될 때, 로라는 자료를 던지거나 ‘싫어요’라고 말하거나 자리에서 벗어나며, 이는 선호하지 않는 학업 요구를 도피·회피하기 위한 것이다.”
        </div>
        <textarea className="form-textarea" rows={2} value={hypothesis} onChange={(e) => setHypothesis(e.target.value)}
          placeholder="“[선행사건]일 때, 학생은 [행동]을 하며, 이는 [기능]을 얻기 위한 것이다.” 형태로 입력 — 아래 중재 전략은 이 가설에서 출발합니다." />
      </div>

      <div className="card" data-tour="bip-alt">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 0 }}>🎯 ② 목표 행동(대체 행동) 설정</div>
            <div className="card-subtitle">ABC + QABF + 학생 정보를 기반으로 AI가 4영역 초안을 만들어줍니다.</div>
          </div>
          <button className="btn btn-pri btn-sm" onClick={() => setAiOpen(true)}>📜 AI BIP 중재안 프롬프트</button>
        </div>
        <div className="form-group">
          <label className="form-label">대체 행동</label>
          {/* 기능기반 IEPBS(0819): QABF 최상위 기능에 맞는 대체 핵심기술을 추천 칩으로 — 기능과 무관한 고정 칩 보완. */}
          {(() => {
            const rec = skillsForQabf(curStuData?.qabf);
            if (!rec || !rec.func || !rec.skills.length) return null;
            return (
              <div style={{ background: '#fff8e8', border: '1px solid #f2dfad', borderRadius: 8, padding: '7px 10px', marginBottom: 6 }}>
                <div style={{ fontSize: '.78rem', color: '#8a6100', fontWeight: 700, marginBottom: 4 }}>
                  ⭐ QABF 추정 기능 '{rec.qabfLabel}' 추천 대체 핵심기술 (기능기반 IEPBS)
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {rec.skills.map((s) => (
                    <button key={s.name} type="button" className="btn btn-ghost btn-sm" style={{ borderColor: '#e5c76a' }}
                      title={`목표 예: ${s.goal}\n이럴 때: ${s.when}`}
                      onClick={() => makeAppender(alt, setAlt, true)(s.name)}>
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}
          <EditableChipGroup storageKey="bip_alt" defaults={ALT_CHIPS} onPick={makeAppender(alt, setAlt, true)} />
          <input className="form-input" value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="문제행동 대신 할 바람직한 행동" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">FCT 기술</label>
            <EditableChipGroup storageKey="bip_fct" defaults={FCT_CHIPS} onPick={makeAppender(fct, setFct, true)} />
            <input className="form-input" value={fct} onChange={(e) => setFct(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">성공 기준</label>
            <EditableChipGroup storageKey="bip_crit" defaults={CRIT_CHIPS} onPick={makeAppender(crit, setCrit, true)} />
            <input className="form-input" value={crit} onChange={(e) => setCrit(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card" data-tour="bip-strategy">
        <div className="card-title">📜 중재 전략 (예방-교수-강화-반응)</div>
        <div className="form-group">
          <label className="form-label">🛡 예방 전략</label>
          <TokenField value={prev} onChange={setPrev} options={PREV_CHIPS} storageKey="bip_prev" editPlaceholder="이 학생 맥락의 예방 전략" />
        </div>
        <div className="form-group">
          <label className="form-label">📖 교수 전략</label>
          <TokenField value={teach} onChange={setTeach} options={TEACH_CHIPS} storageKey="bip_teach" editPlaceholder="이 학생 맥락의 교수 전략" />
        </div>
        <div className="form-group">
          <label className="form-label">⭐ 강화 전략</label>
          <TokenField value={reinf} onChange={setReinf} options={REINF_CHIPS} storageKey="bip_reinf" editPlaceholder="이 학생 맥락의 강화 전략" />
        </div>
        <div className="form-group">
          <label className="form-label">🚨 반응 절차</label>
          <TokenField value={resp} onChange={setResp} options={RESP_CHIPS} storageKey="bip_resp" editPlaceholder="이 학생 맥락의 반응 절차" />
        </div>

        {/* 0719 피드백(E-3): 선택한 전략을 BIP 인쇄 표처럼 화면에서 바로 정리해 보여준다 */}
        {(prev.trim() || teach.trim() || reinf.trim() || resp.trim() || alt.trim() || crit.trim()) && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: 6 }}>📋 선택한 전략 자동 정리 <span style={{ fontWeight: 400, fontSize: '.76rem', color: 'var(--muted)' }}>— 인쇄되는 표와 같은 구성으로 실시간 정리됩니다</span></div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.84rem' }}>
              <tbody>
                {[
                  ['🛡 예방 (Antecedent)', prev, '#eef4ff'],
                  ['📖 교수 (Teaching)', teach, '#f0fbf4'],
                  ['⭐ 강화 (Reinforcement)', reinf, '#fff7ed'],
                  ['🚨 반응 (Response)', resp, '#fff1f4'],
                  ['🎯 대체 행동', alt, '#f7f3ff'],
                  ['✅ 결과 평가 (성공 기준)', crit, '#f2f4f7'],
                ].filter(([, v]) => String(v || '').trim()).map(([label, v, bg]) => (
                  <tr key={label}>
                    <td style={{ border: '1px solid var(--border)', background: bg, padding: '6px 10px', fontWeight: 700, width: 170, verticalAlign: 'top', whiteSpace: 'nowrap' }}>{label}</td>
                    <td style={{ border: '1px solid var(--border)', padding: '6px 10px', verticalAlign: 'top' }}>
                      {String(v).split(/\n|,\s*/).map((t) => t.trim()).filter(Boolean).map((t, i) => (
                        <div key={i}>· {t}</div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 0819 피드백: 저장·다음 단계 버튼을 한곳에 — 다음 버튼은 저장 전 옅게, 저장 후 강조 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={onPrintBIP}>🖨 BIP 인쇄/PDF</button>
          <button
            className={'btn ' + (bipDirty ? 'btn-pri' : 'btn-ghost')}
            onClick={onSave}
            disabled={busy || !bipDirty}
            title={bipDirty ? '지금 바로 저장' : '변경 내용이 모두 자동 저장되었습니다'}
          >
            {bipDirty ? '💾 BIP 저장' : '✓ 저장됨'}
          </button>
          <span aria-hidden="true" style={{ color: 'var(--muted, #9aa3b2)' }}>→</span>
          <button className={'btn ' + (savedOk ? 'btn-pri' : 'btn-ghost')} onClick={() => onNavigate?.('monitor')}>📈 행동 데이터 →</button>
        </div>
        <NextStepBanner
          show={savedOk}
          message="✅ BIP 저장 완료"
          hint="중재를 실행하며 오른쪽 버튼(행동 데이터)에서 변화를 매일 기록해보세요"
        />
      </div>

      {/* 0719 피드백(A-3): ③ 행동목표 — 중재계획을 참고해 메이거식으로 작성, IEP 학기목표로 연계 */}
      <div className="card" style={{ borderColor: '#c7b9f0' }} data-tour="bip-goal">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 0 }}>🏁 ③ 행동목표 (메이거식: 조건 + 행동 + 기준)</div>
            <div className="card-subtitle">작성한 조작적 정의·대체행동·중재 전략을 바탕으로 한 문장의 행동목표를 만듭니다.</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {aiOn && <button className="btn btn-ok btn-sm" onClick={aiBgoal} disabled={bgoalBusy}>{bgoalBusy ? '생성 중…' : '✨ 중재계획으로 AI 생성'}</button>}
            <button className="btn btn-ghost btn-sm" onClick={copyBgoal} title="복사해서 IEP 학기목표(경로 B)에 붙여넣기">📋 IEP 학기목표로 복사</button>
          </div>
        </div>
        <textarea className="form-textarea" rows={2} value={bgoal} onChange={(e) => setBgoal(e.target.value)}
          placeholder='예: 과제가 어려울 때(조건), "도와주세요" 카드를 들어 도움을 요청하기를(행동) 2주 연속 하루 3회 이상 한다(기준).' />

        {/* 0814 전문가 자문: 행동목표를 IEP에 어떻게 반영할지는 '선택의 문제' —
            개별화 목표로 그대로 가져갈지, 교과 목표에 녹일지 선생님이 정한다.
            저장 시 AI 생성(tierContext)도 이 선택을 따른다. */}
        <div className="bgoal-dest">
          <div className="bgoal-dest-label">🔀 이 행동목표, IEP에 어떻게 반영할까요? <span className="bgoal-dest-sub">(선택 사항 — AI 초안 생성이 이 선택을 따라요)</span></div>
          <div className="bgoal-dest-opts" role="radiogroup" aria-label="행동목표 IEP 반영 방식">
            {[
              { v: 'iep', icon: '📘', t: '개별화 목표로 가져가기', d: 'IEP의 행동·사회성 학기목표로 그대로 사용' },
              { v: 'subject', icon: '📚', t: '교과 목표에 녹이기', d: '교과 학기목표·평가계획 안에 행동 지원을 통합' },
              { v: '', icon: '⏳', t: '아직 결정 안 함', d: '행동 지원 참고용으로만 활용' },
            ].map((o) => (
              <button
                key={o.v || 'none'}
                type="button"
                role="radio"
                aria-checked={bgoalDest === o.v}
                className={'bgoal-dest-opt' + (bgoalDest === o.v ? ' on' : '')}
                onClick={() => setBgoalDest(o.v)}
              >
                <span aria-hidden="true">{o.icon}</span>
                <span className="bdo-body"><b>{o.t}</b><small>{o.d}</small></span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ fontSize: '.76rem', color: 'var(--muted)', marginTop: 6 }}>
          {bgoalDest === 'subject'
            ? <>교과에 녹이기를 선택했어요 — IEP의 <strong>교과 학기목표·평가계획</strong>을 만들 때 이 행동 지원 요소가 교과 맥락 안에 통합돼요.</>
            : <>이 행동목표는 <strong>개별화교육(IEP) → 학기목표 먼저(경로 B)</strong>에 붙여넣어 개별화 학기목표로 그대로 쓸 수 있어요.</>}
          {' '}저장하면 Tier 3 통합 문서·AI 생성에도 반영됩니다.
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div className="card-title" style={{ marginBottom: 0 }} data-tour="bip-contract">✍ 행동 계약서</div>
          <button className="btn btn-ghost btn-sm" onClick={copyBIPToContract}>📋 BIP에서 가져오기</button>
        </div>
        <div className="form-group">
          <label className="form-label">나(학생)의 약속</label>
          <input className="form-input" value={conStu} onChange={(e) => setConStu(e.target.value)} placeholder="목표 행동" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">성공 기준</label>
            <input className="form-input" value={conCrit} onChange={(e) => setConCrit(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">선생님의 약속 (보상)</label>
            <EditableChipGroup storageKey="bip_reward" defaults={REWARD_CHIPS} onPick={makeAppender(conTch, setConTch, true)} />
            <input className="form-input" value={conTch} onChange={(e) => setConTch(e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">계약 시작일</label><input type="date" className="form-input" value={conStart} onChange={(e) => setConStart(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">계약 종료일</label><input type="date" className="form-input" value={conEnd} onChange={(e) => setConEnd(e.target.value)} /></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn btn-ok" onClick={onPrint}>🖨 계약서 인쇄/저장</button>
        </div>
      </div>

      {/* 가정 연계 통신문 — 별도의 카드로 격상 */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #f0fbf4 0%, #e7f7ee 100%)', borderColor: '#9be0b9' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: '1.4rem' }}>✉</span>
              <strong style={{ fontSize: '1.05rem', color: '#0a7d4e' }}>가정 연계 통신문</strong>
              {(curStuData?.letters?.length || 0) > 0 && (
                <span style={{ background: '#0a7d4e', color: '#fff', fontSize: '.7rem', fontWeight: 700, padding: '2px 9px', borderRadius: 99 }}>
                  📜 {curStuData.letters.length}건
                </span>
              )}
            </div>
            <p style={{ fontSize: '.85rem', color: '#0a7d4e', opacity: 0.85, lineHeight: 1.6 }}>
              학부모와의 협력을 위한 통신문을 카테고리별로 작성·인쇄하고 이력으로 관리합니다.<br />
              AI가 학생 BIP·관찰 기록을 바탕으로 초안도 생성해줍니다.
            </p>
          </div>
          <button className="btn btn-ok" onClick={() => setLetterOpen(true)} style={{ flexShrink: 0 }}>
            ✉ 통신문 작성
          </button>
        </div>
      </div>

      <FamilyLetterModal open={letterOpen} onClose={() => setLetterOpen(false)} />
      <BIPPromptModal open={aiOpen} onClose={() => setAiOpen(false)}
        onApply={(parsed) => {
          // 교사가 이미 작성한 내용을 함부로 덮어쓰지 않는다.
          // 충돌 시: [확인] 기존 내용 아래에 덧붙이기 / [취소] 기존을 AI 제안으로 교체.
          const inputFields = new Set(['alt', 'fct', 'crit']); // 단일 줄 입력
          const fields = [
            ['alt', alt, setAlt], ['fct', fct, setFct], ['crit', crit, setCrit],
            ['prev', prev, setPrev], ['teach', teach, setTeach], ['reinf', reinf, setReinf], ['resp', resp, setResp],
          ];
          const hasConflict = fields.some(([k, cur]) => parsed[k] && cur && cur.trim());
          let mode = 'fill'; // 빈 칸만 채움
          if (hasConflict) {
            mode = window.confirm('이미 입력한 내용이 있어요.\n\n[확인] 기존 내용 아래에 AI 제안을 덧붙입니다\n[취소] 기존 내용을 AI 제안으로 교체합니다')
              ? 'append' : 'replace';
          }
          fields.forEach(([k, cur, set]) => {
            const v = parsed[k];
            if (!v) return;
            if (!cur || !cur.trim()) { set(v); return; }      // 빈 칸 → 채움
            if (mode === 'append') set(cur + (inputFields.has(k) ? ' / ' : '\n') + '(AI 제안) ' + v);
            else if (mode === 'replace') set(v);              // 교체
            // mode === 'fill' → 기존 유지
          });
          toast('AI 초안을 반영했어요. 확인 후 저장하세요.', 'success');
        }}
      />
    </>
  );
}
