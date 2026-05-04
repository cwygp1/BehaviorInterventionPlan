import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
        remarkPlugins={[remarkGfm]}
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
