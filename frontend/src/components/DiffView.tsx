import { useState } from "react";

import type { FileChange } from "../api/types";

function lineClass(line: string): string {
  if (line.startsWith("@@")) return "diff-hunk";
  if (line.startsWith("+")) return "diff-add";
  if (line.startsWith("-")) return "diff-del";
  return "";
}

function FileDiff({ file, open }: { file: FileChange; open: boolean }) {
  const [expanded, setExpanded] = useState(open);
  return (
    <div className="diff-file">
      <button type="button" className="diff-header" onClick={() => setExpanded((v) => !v)}>
        <span className="chevron">{expanded ? "▾" : "▸"}</span>
        <span className="mono">{file.filename}</span>
        <span className={`file-status file-${file.status}`}>{file.status}</span>
        <span className="spacer" />
        <span className="add">+{file.additions}</span>
        <span className="del">−{file.deletions}</span>
      </button>
      {expanded &&
        (file.patch ? (
          <pre className="diff-body">
            {file.patch.split("\n").map((line, i) => (
              <div key={i} className={lineClass(line)}>
                {line || " "}
              </div>
            ))}
          </pre>
        ) : (
          <p className="muted pad">Diff not shown (binary or too large).</p>
        ))}
    </div>
  );
}

export function DiffView({ files }: { files: FileChange[] }) {
  if (!files.length) return <p className="muted">No changed files.</p>;
  // Expand small diffs by default; large ones stay collapsed so the page stays fast.
  const small = files.length <= 15;
  return (
    <div className="diff">
      {files.map((file) => (
        <FileDiff key={file.filename} file={file} open={small && (file.patch?.length ?? 0) < 20000} />
      ))}
    </div>
  );
}
