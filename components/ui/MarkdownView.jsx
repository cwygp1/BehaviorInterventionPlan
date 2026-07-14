import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// AI 출력에 종종 섞이는 <br>/<br/> 태그를 실제 줄바꿈으로 치환하는 remark 플러그인.
// react-markdown은 원시 HTML을 렌더링하지 않아 표 안의 <br>이 글자 그대로 보이는
// 문제가 있음 → html 노드 중 br 태그만 mdast 'break' 노드로 바꿔 <br>로 렌더링.
const BR_ONLY = /^(?:<br\s*\/?\s*>\s*)+$/i;
function remarkBrToBreak() {
  const walk = (node) => {
    if (!Array.isArray(node.children)) return;
    node.children = node.children.flatMap((child) => {
      if (child.type === 'html' && BR_ONLY.test(child.value.trim())) {
        const count = (child.value.match(/<br/gi) || []).length;
        return Array.from({ length: count }, () => ({ type: 'break' }));
      }
      walk(child);
      return [child];
    });
  };
  return walk;
}

/**
 * Renders Markdown text with GitHub-flavored Markdown extensions
 * (tables, task lists, strikethrough, autolinks). Used by AI response
 * displays so model output like `| col | col |` renders as a real table.
 *
 * Style hooks:
 *   - the wrapping `.md-body` class scopes styling in globals.css
 *   - external links open in a new tab and apply `rel=noreferrer noopener`
 */
export default function MarkdownView({ children, className = '' }) {
  return (
    <div className={'md-body ' + className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBrToBreak]}
        components={{
          // External links: open in new tab safely.
          a: ({ node, href, children, ...props }) => {
            const external = href && /^https?:\/\//i.test(href);
            return (
              <a
                href={href}
                target={external ? '_blank' : undefined}
                rel={external ? 'noreferrer noopener' : undefined}
                {...props}
              >
                {children}
              </a>
            );
          },
          // Tables get a wrapper div so they can scroll horizontally on
          // narrow viewports without breaking the surrounding layout.
          table: ({ node, children, ...props }) => (
            <div className="md-table-wrap">
              <table {...props}>{children}</table>
            </div>
          ),
        }}
      >
        {children || ''}
      </ReactMarkdown>
    </div>
  );
}
