import { useState } from "react";

import { Markdown } from "./Markdown";

/** Textarea with GitHub's Write / Preview tabs. Ctrl+Enter calls onSubmit. */
export function MarkdownEditor({
  value,
  onChange,
  onSubmit,
  placeholder = "Leave a comment (markdown)",
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [preview, setPreview] = useState(false);
  return (
    <div className="stack md-editor">
      <div className="segmented small">
        <button type="button" className={!preview ? "active" : ""} onClick={() => setPreview(false)}>
          Write
        </button>
        <button type="button" className={preview ? "active" : ""} onClick={() => setPreview(true)}>
          Preview
        </button>
      </div>
      {preview ? (
        <div className="preview comment-preview">
          <Markdown text={value} />
        </div>
      ) : (
        <textarea
          className="input comment-input"
          placeholder={placeholder}
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (onSubmit && e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
      )}
    </div>
  );
}
