import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// GitHub-flavoured markdown (tables, task lists, strikethrough). Raw HTML is not rendered.
export function Markdown({ text }: { text: string | null | undefined }) {
  if (!text?.trim()) return <p className="muted">No description provided.</p>;
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: (props) => <a {...props} target="_blank" rel="noreferrer" /> }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
