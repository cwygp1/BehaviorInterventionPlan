#!/usr/bin/env python3
"""「2025 일상생활 활동 수업 도움 자료 활용 안내」(hwpx) → public/data/daily-life-lesson-examples.json

배경(0921 현장 요청 "이것도 예제로 활용해 달라"): 이 안내문은 2025년에 만든 일상생활 활동 수업 도움 자료
32건의 목록·설계 카드(활동 주제 / 설계 형태 A~D / 교육과정·생태학적 연계 내용 / 활동 설계 및 자료 제작의
주안점)와 4개 영역의 활동 체계표(내용요소 → 대활동 → 중활동 → 소활동)다. 설계 카드는 지도서 소활동 하나를
실제 수업으로 어떻게 설계했는지 보여 주는 **현장 예시**라서, IEP 일상생활 경로에서 성취기준을 고르면 같은
단원의 예시를 화면과 AI 프롬프트(학기 교육내용·교육방법, 월별)에 넣어 준다(lib/dailyLifeGuide.js).

사용법(원본 hwpx는 저장소 밖에 두고 커밋하지 않는다):
  python3 scripts/parse-daily-life-lesson-examples.py "~/Downloads/2025 일상생활 활동 수업 도움 자료 활용 안내.hwpx"
  python3 scripts/parse-daily-life-lesson-examples.py <hwpx> --report     # 지도서 JSON과의 연결 결과·활동 체계표 대조표만 출력

조인 키: 카드 머리글 "내용요소-대활동-소활동"의 대활동이 지도서 JSON(public/data/daily-life-guide.json)의
단원 title(또는 standard)과 같고, 자료 목록의 "N. 중활동 이름"이 그 단원의 중활동 번호·이름과 같다.
(문서 자체의 번호·이름 오타가 있어 이름 유사도로 맞추고, --report로 사람이 확인한다.)

hwpx = zip(OWPML XML). 본문은 Contents/section0.xml, 문단 hp:p → hp:run → hp:t(글자) / hp:tbl(표).
표는 hp:tr/hp:tc + hp:cellAddr(colAddr,rowAddr) + hp:cellSpan(colSpan,rowSpan)으로 격자를 복원한다.
"""
import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

HP = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GUIDE = os.path.join(ROOT, 'public/data/daily-life-guide.json')
OUT = os.path.join(ROOT, 'public/data/daily-life-lesson-examples.json')

AREAS = ['의사소통', '자립생활', '신체활동', '여가활동']
DESIGN_TYPES = {
    'A': '일상생활 활동 영역 내 선택형',
    'B': '일상생활 활동의 영역간 통합형',
    'C': '일상생활 활동·교과 연계형',
    'D': '일상생활 활동·창의적 체험활동 연계형',
}


# ── 글자·정규화 ──────────────────────────────────────────────────────────
def norm(s):
    """공백·구두점·OCR 잡음을 걷어낸 비교용 문자열."""
    s = str(s or '')
    s = re.sub(r'^\s*\d+\s*[.)]\s*', '', s)           # 앞 번호 "5. "
    s = re.sub(r'\(\d\)\s*$', '', s)                  # 뒤 "(1)"
    s = re.sub(r"[\s·‧ㆍ,.:：'‘’\"“”()\[\]\-–—~/…]", '', s)
    return s


def strip_ocr(title):
    """OCR 책 중활동 이름 앞의 잡음("Yo ", "1 ", ". ", "• ")을 걷어낸다."""
    return re.sub(r"^[^가-힣‘'(]+", '', str(title or '')).strip()


def similar(a, b):
    """0~1 유사도 — 한쪽이 다른 쪽을 품으면 1, 아니면 2-gram 겹침 비율."""
    a, b = norm(a), norm(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    if a in b or b in a:
        return 0.95
    ga = {a[i:i + 2] for i in range(len(a) - 1)}
    gb = {b[i:i + 2] for i in range(len(b) - 1)}
    if not ga or not gb:
        return 0.0
    return len(ga & gb) / max(len(ga), len(gb))


# ── XML 읽기 ────────────────────────────────────────────────────────────
def para_text(p):
    out = []
    for run in p.findall(HP + 'run'):
        for child in run:
            tag = child.tag.replace(HP, '')
            if tag == 't':
                out.append(''.join(child.itertext()))
            elif tag == 'lineBreak':
                out.append('\n')
    return ''.join(out).strip()


def para_tables(p):
    return [c for run in p.findall(HP + 'run') for c in run if c.tag == HP + 'tbl']


def para_all_text(p):
    """도형·표 안 글자까지 전부(절 제목 찾기용)."""
    return ' '.join(t.strip() for t in p.itertext() if t.strip())


def cell_paras(tc):
    sl = tc.find(HP + 'subList')
    if sl is None:
        return []
    return [t for t in (para_text(pp) for pp in sl.findall(HP + 'p')) if t]


def table_grid(tbl):
    """표 → 행 리스트. 각 행은 열 수만큼의 셀(병합으로 덮인 자리는 원 셀을 가리킨다)."""
    cells = []
    ncol = nrow = 0
    for tr in tbl.findall(HP + 'tr'):
        for tc in tr.findall(HP + 'tc'):
            addr = tc.find(HP + 'cellAddr')
            span = tc.find(HP + 'cellSpan')
            c = int(addr.get('colAddr')) if addr is not None else 0
            r = int(addr.get('rowAddr')) if addr is not None else 0
            cs = int(span.get('colSpan', 1)) if span is not None else 1
            rs = int(span.get('rowSpan', 1)) if span is not None else 1
            cell = {'col': c, 'row': r, 'colSpan': cs, 'rowSpan': rs, 'paras': cell_paras(tc)}
            cells.append(cell)
            ncol = max(ncol, c + cs)
            nrow = max(nrow, r + rs)
    grid = [[None] * ncol for _ in range(nrow)]
    for cell in cells:
        for r in range(cell['row'], cell['row'] + cell['rowSpan']):
            for c in range(cell['col'], cell['col'] + cell['colSpan']):
                grid[r][c] = cell
    return grid


def load_section_xml(path):
    if os.path.isdir(path):
        with open(os.path.join(path, 'Contents/section0.xml'), 'rb') as f:
            return f.read()
    with zipfile.ZipFile(path) as z:
        return z.read('Contents/section0.xml')


# ── 문서 걷기 ───────────────────────────────────────────────────────────
def walk(xml_bytes):
    """문단을 차례로 보며 (절 번호, 영역, 카드 머리글, 표)를 모은다."""
    root = ET.fromstring(xml_bytes)
    section = 0
    area = None
    items = []  # {'section', 'area', 'heading', 'grid'}
    heading = None
    for p in root.findall(HP + 'p'):
        tables = para_tables(p)
        all_text = para_all_text(p)
        m = re.match(r'^\s*([123])\s+영역별', all_text)
        if m and tables:
            section = int(m.group(1))
            area = None
            heading = None
            continue
        text = para_text(p)
        m = re.match(r'^\s*[가-라]\.\s*(\S+)', text)
        if m and not tables:
            for a in AREAS:
                if m.group(1).startswith(a):
                    area = a
            continue
        m = re.match(r'^\s*(\d+)\)\s*(.+)$', text)
        if m and not tables:
            heading = {'no': int(m.group(1)), 'text': m.group(2).strip()}
            continue
        for tbl in tables:
            items.append({'section': section, 'area': area, 'heading': heading, 'grid': table_grid(tbl)})
            heading = None
    return items


def parse_material_list(items):
    """1 영역별 자료 목록 → 영역별 [{element, unitTitle, listTitle, design}] (문서 순서)."""
    out = {a: [] for a in AREAS}
    for it in items:
        if it['section'] != 1 or not it['area']:
            continue
        for row in it['grid'][1:]:
            if len(row) < 4 or any(c is None for c in row[:4]):
                continue
            element = ' '.join(row[0]['paras'])
            unit = ' '.join(row[1]['paras'])
            mats = []
            for para in row[2]['paras']:
                if para.startswith('(') and mats:
                    mats[-1] += ' ' + para          # 괄호 줄은 앞 항목의 설명
                else:
                    mats.append(para)
            designs = [d for para in row[3]['paras'] for d in para.split()]
            if len(designs) != len(mats):
                designs = (designs + [''] * len(mats))[:len(mats)]
            for title, d in zip(mats, designs):
                out[it['area']].append({'element': element, 'unitTitle': unit, 'listTitle': title, 'design': d})
    return out


def parse_cards(items):
    """2 영역별 세부 내용 → [{heading, topic, design, designLabel, linkage[], focus[], extra{}}]."""
    cards = []
    for it in items:
        if it['section'] != 2 or not it['heading']:
            continue
        card = {'headingNo': it['heading']['no'], 'heading': it['heading']['text'],
                'topic': '', 'design': '', 'designLabel': '', 'linkage': [], 'focus': [], 'extra': {}}
        for row in it['grid']:
            if len(row) < 2 or row[0] is None or row[1] is None or row[0] is row[1]:
                continue
            label = ''.join(row[0]['paras']).replace(' ', '')
            vals = row[1]['paras']
            if label.startswith('활동주제'):
                card['topic'] = ' '.join(vals).strip()
            elif label.startswith('설계형태'):
                m = re.match(r'^\s*([A-D])\s*[:：]\s*(.*)$', ' '.join(vals))
                if m:
                    card['design'] = m.group(1)
                    card['designLabel'] = m.group(2).strip() or DESIGN_TYPES[m.group(1)]
                else:
                    card['extra']['설계 형태'] = ' '.join(vals)
            elif label.startswith('교육과정'):
                card['linkage'] = [re.sub(r'^[-–•]\s*', '', v).strip() for v in vals if v.strip()]
            elif label.startswith('활동설계'):
                card['focus'] = [re.sub(r'^[-–•]\s*', '', v).strip() for v in vals if v.strip()]
            else:
                card['extra'][''.join(row[0]['paras'])] = ' / '.join(vals)
        cards.append(card)
    return cards


def clean_name(s):
    """체계표 이름 정리 — 가운뎃점 통일('‧'→'·'), 앞 번호 제거, 공백 정리."""
    s = re.sub(r'^\s*\d+\s*[.)]\s*', '', str(s or ''))
    return re.sub(r'\s+', ' ', s.replace('‧', '·').replace('ㆍ', '·')).strip()


def parse_system(items):
    """3 영역별 활동 체계표 → {area: {unitTitle: {'element', 'mids': [{'title', 'subs': [...]}]}}}.

    단원·중활동은 표가 쪽 단위로 끊겨 다음 표 첫 행에서 같은 이름으로(또는 빈칸으로) 이어지므로,
    셀 객체가 바뀌고 이름이 달라질 때만 새 단원·중활동으로 본다.
    """
    out = {a: {} for a in AREAS}
    state = {a: {'unit': None, 'mid': None, 'ucell': None, 'mcell': None} for a in AREAS}
    for it in items:
        if it['section'] != 3 or not it['area']:
            continue
        st = state[it['area']]
        for row in it['grid'][1:]:
            if len(row) < 4 or any(c is None for c in row[:4]):
                continue
            element = clean_name(' '.join(row[0]['paras']))
            if row[1] is not st['ucell']:
                st['ucell'] = row[1]
                name = clean_name(' '.join(row[1]['paras']))
                if name and (st['unit'] is None or norm(name) != norm(st['unit'])):
                    st['unit'] = name
                    st['mid'] = None
                    out[it['area']].setdefault(name, {'element': element, 'mids': []})
            if st['unit'] is None:
                continue
            if row[2] is not st['mcell']:
                st['mcell'] = row[2]
                name = clean_name(' '.join(row[2]['paras']))
                if name and (st['mid'] is None or norm(name) != norm(st['mid']['title'])):
                    st['mid'] = {'title': name, 'subs': []}
                    out[it['area']][st['unit']]['mids'].append(st['mid'])
            if st['mid'] is not None:
                for s in row[3]['paras']:
                    s = re.sub(r'\s+', ' ', s).strip()
                    if s and s not in st['mid']['subs']:
                        st['mid']['subs'].append(s)
    return out


# ── 지도서 JSON과 잇기 ───────────────────────────────────────────────────
def load_guide():
    with open(GUIDE, encoding='utf-8') as f:
        return json.load(f)


def guide_units(guide):
    units = []
    for b in guide['books']:
        for u in b['units']:
            units.append({**u, 'bookArea': b['area']})
    return units


def find_unit(units, area, name):
    best, score = None, 0.0
    for u in units:
        if u['bookArea'] != area:
            continue
        s = max(similar(name, u['title']), similar(name, u['standard']))
        if s > score:
            best, score = u, s
    return (best, score) if score >= 0.5 else (None, score)


def find_mid(unit, names):
    """중활동 이름(여러 후보) → (mid, sub|None, score). 중활동에 없으면 소활동에서 찾는다."""
    best = (None, None, 0.0)
    for m in unit['midActivities']:
        for n in names:
            s = similar(n, strip_ocr(m['title']))
            if s > best[2]:
                best = (m, None, s)
    if best[2] >= 0.8:
        return best
    for m in unit['midActivities']:
        for sub in m['subActivities']:
            for n in names:
                s = similar(n, strip_ocr(sub['title']))
                if s > best[2]:
                    best = (m, sub, s)
    return best


def link_examples(mats, cards, units):
    """자료 목록(1)과 설계 카드(2)를 영역 안 순서로 짝짓고, 지도서 단원·중활동에 잇는다."""
    examples = []
    # 카드의 영역은 머리글 첫 토막(내용요소)으로 정한다 — 세부 내용 절에는 다·라 영역 제목이 없다.
    elem_area = {}
    for u in units:
        elem_area[norm(u['element'])] = u['bookArea']
    per_area = {a: [] for a in AREAS}
    for c in cards:
        parts = [x.strip() for x in re.split(r'\s*-\s*', c['heading']) if x.strip()]
        area = None
        for k, a in elem_area.items():
            if norm(parts[0]) and (norm(parts[0]) in k or k in norm(parts[0])):
                area = a
                break
        if area is None:  # "개인여가활동"처럼 붙여 쓴 경우 — 영역 이름 포함으로
            for a in AREAS:
                if a in parts[0] or (a == '여가활동' and '여가' in parts[0]) or (a == '신체활동' and '신체' in parts[0]):
                    area = a
        c['parts'] = parts
        per_area[area].append(c)
    no = 0
    for area in AREAS:
        lst, cds = mats[area], per_area[area]
        if len(lst) != len(cds):
            print(f'!! {area}: 자료 목록 {len(lst)}건 vs 설계 카드 {len(cds)}건 — 순서 짝짓기 불가', file=sys.stderr)
        for i, c in enumerate(cds):
            m = lst[i] if i < len(lst) else {}
            no += 1
            unit_name = c['parts'][1] if len(c['parts']) > 1 else m.get('unitTitle', '')
            unit, us = find_unit(units, area, m.get('unitTitle') or unit_name)
            if unit is None:
                unit, us = find_unit(units, area, unit_name)
            ex = {
                'no': no, 'area': area, 'areaNo': i + 1,
                'element': m.get('element', '').replace('\n', ' ') or (unit['element'] if unit else c['parts'][0]),
                'unitTitle': (m.get('unitTitle') or unit_name).replace('\n', ' '),
                'code': unit['code'] if unit else None,
                'standard': unit['standard'] if unit else None,
                'midNo': None, 'midTitle': None, 'subNo': None, 'subTitle': None,
                'listTitle': m.get('listTitle', ''),
                'heading': c['heading'], 'topic': c['topic'],
                'design': c['design'] or m.get('design', ''),
                'designLabel': c['designLabel'] or DESIGN_TYPES.get(c['design'] or m.get('design', ''), ''),
                'linkage': c['linkage'], 'linkageCodes': sorted({x for v in c['linkage'] for x in re.findall(r'\[(\d[^\]]{2,14})\]', v)}),
                'focus': c['focus'],
                '_match': {'unit': round(us, 2)},
            }
            if c['extra']:
                ex['extra'] = c['extra']
            if unit:
                names = [c['parts'][-1], c['topic'], re.sub(r'\(.*?\)', '', m.get('listTitle', ''))]
                mid, sub, ms = find_mid(unit, [n for n in names if n])
                ex['_match']['mid'] = round(ms, 2)
                if mid and ms >= 0.5:
                    ex['midNo'], ex['midTitle'] = mid['no'], strip_ocr(mid['title'])
                    if sub:
                        ex['subNo'], ex['subTitle'] = sub['no'], sub['title']
            examples.append(ex)
    return examples


def doc_unit_for(system, u):
    """지도서 JSON 단원 → 체계표 단원(이름 유사도 최댓값, 0.8 이상)."""
    best, score = None, 0.0
    for k, v in system.get(u['bookArea'], {}).items():
        s = similar(k, u['title'])
        if s > score:
            best, score = v, s
    return best if score >= 0.6 else None  # "개인위생 기초"↔"개인위생의 기초", "사물 탐색 및 조작"↔"사물 탐색과 조작"


def compare_system(system, units):
    """활동 체계표(3)와 지도서 JSON의 중활동 이름 대조 — OCR 잡음 확인용. (code, 단원, JSON 중활동, 체계표 중활동, 판정 subs)."""
    rows = []
    for u in units:
        doc = doc_unit_for(system, u)
        if doc is None:
            rows.append((u['code'], u['title'], '단원 없음', '', ''))
            continue
        for m in u['midActivities']:
            cand = max(doc['mids'], key=lambda d: similar(d['title'], strip_ocr(m['title'])), default=None)
            s = similar(cand['title'], strip_ocr(m['title'])) if cand else 0
            flag = 'OK' if cand and cand['title'] == m['title'] else ('잡음' if s >= 0.9 else ('다름' if s >= 0.6 else '없음'))
            rows.append((u['code'], u['title'], f"{m['no']}.{m['title']}", cand['title'] if cand else '', f'{flag} {len(m["subActivities"])}/{len(cand["subs"]) if cand else 0}'))
    return rows


def fix_guide_names(system, guide):
    """--fix-guide: 지도서 JSON(OCR 책) 중활동 이름 앞의 잡음("Yo ", "1 ", ". ", "• " — 동그라미 숫자 오독)을 걷어낸다.

    체계표(3)의 이름으로 바꾸지는 않는다 — 체계표 자체에 오타·띄어쓰기 누락("사물의 나타내는", "생활용품으로놀기",
    "맨몸 운동")이 있어 JSON 쪽이 더 나은 경우가 많다. 체계표는 --report에서 같은 활동인지 대조하는 데만 쓴다.
    잡음을 걷어낸 이름이 체계표 이름과 유사도 0.6 미만이면 의심스러우니 바꾸지 않고 보고만 한다.
    소활동 이름은 건드리지 않는다(OCR 책의 소활동은 활동 목록 문장에서 만든 것이라 개수가 달라 1:1이 아님).
    """
    changed, skipped = [], []
    for b in guide['books']:
        for u in b['units']:
            doc = doc_unit_for(system, {**u, 'bookArea': b['area']})
            for m in u['midActivities']:
                old = m['title']
                new = strip_ocr(old)
                if new == old or not new:
                    continue
                s = max((similar(d['title'], new) for d in doc['mids']), default=1.0) if doc else 1.0
                if s < 0.6:
                    # 잡음 뒤에 오타까지 있는 경우(". 농존 체험" ↔ "농촌 체험하기"): 체계표의 같은 순번 중활동과
                    # 글자가 7할 이상 겹치면 체계표 이름으로, 아니면 잡음만 걷고 보류 목록에 남긴다.
                    same = doc['mids'][m['no'] - 1] if doc and m['no'] - 1 < len(doc['mids']) else None
                    chars = set(norm(new))
                    if same and chars and len(chars & set(norm(same['title']))) / len(chars) >= 0.7:
                        m['title'] = same['title']
                        changed.append((u['code'], m['no'], old, same['title']))
                        continue
                    skipped.append((u['code'], m['no'], old, new, round(s, 2)))
                m['title'] = new
                changed.append((u['code'], m['no'], old, new))
    return changed, skipped


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    report = '--report' in sys.argv
    if not args:
        print(__doc__)
        sys.exit(1)
    items = walk(load_section_xml(os.path.expanduser(args[0])))
    mats = parse_material_list(items)
    cards = parse_cards(items)
    system = parse_system(items)
    guide = load_guide()
    units = guide_units(guide)
    examples = link_examples(mats, cards, units)

    if report:
        print(f'자료 목록 {sum(len(v) for v in mats.values())}건 · 설계 카드 {len(cards)}장 · 체계표 단원 {sum(len(v) for v in system.values())}개'
              f' · 중활동 {sum(len(u["mids"]) for a in system.values() for u in a.values())}개'
              f' · 소활동 {sum(len(m["subs"]) for a in system.values() for u in a.values() for m in u["mids"])}개')
        print('\n[예시 → 지도서 연결]')
        for e in examples:
            print(f"{e['no']:>2} {e['area']} {e['design']} | {e['unitTitle']} → {e['code'] or '??'} (u{e['_match']['unit']}) | "
                  f"{e['listTitle']} → 중{e['midNo']} {e['midTitle'] or '??'}{(' / 소' + str(e['subNo']) + ' ' + e['subTitle']) if e['subTitle'] else ''} (m{e['_match'].get('mid')}) | {e['topic']}")
        print('\n[활동 체계표 vs 지도서 JSON 중활동 이름 — OK 아닌 것만]')
        rows = compare_system(system, units)
        print(f"  전체 {len(rows)} · OK {sum(1 for r in rows if r[4].startswith('OK'))}")
        for r in rows:
            if not r[4].startswith('OK'):
                print('  ' + ' | '.join(r))
        return

    if '--fix-guide' in sys.argv:
        changed, skipped = fix_guide_names(system, guide)
        with open(GUIDE, 'w', encoding='utf-8') as f:  # 원본(Node JSON.stringify)처럼 한 줄로 — diff가 통째로 바뀌지 않게
            json.dump(guide, f, ensure_ascii=False, separators=(',', ':'))
        print(f'{GUIDE}: 중활동 이름 {len(changed)}개 잡음 제거, {len(skipped)}개 보류')
        for code, no, old, new in changed:
            print(f'  {code} 중{no}: {old!r} → {new!r}')
        for code, no, old, new, s in skipped:
            print(f'  보류 {code} 중{no}: {old!r} → {new!r} (체계표 유사도 {s})')

    out = {
        'source': {
            'title': '2025 일상생활 활동 수업 도움 자료 활용 안내',
            'year': 2025,
            'note': '일상생활 활동 수업 도움 자료 32건의 설계 카드(활동 주제·설계 형태·교육과정 및 생태학적 연계 내용·활동 설계 및 자료 제작의 주안점). '
                    '지도서 단원(code)·중활동(midNo)과 이어 IEP 일상생활 경로의 예시로 쓴다. 파서: scripts/parse-daily-life-lesson-examples.py',
        },
        'designTypes': [{'code': k, 'label': v} for k, v in DESIGN_TYPES.items()],
        'examples': [{k: v for k, v in e.items() if k != '_match'} for e in examples],
    }
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f'{OUT}: 예시 {len(out["examples"])}건 (지도서 연결 {sum(1 for e in examples if e["code"])}·중활동 {sum(1 for e in examples if e["midNo"])})')


if __name__ == '__main__':
    main()
