// Shapes of the GitHub objects the UI uses (only the fields we read).

export type TokenKind = "create" | "merge";

export interface TokenInfo {
  env_name: string;
  masked: string;
  source: "env_file" | "environment" | null;
  login: string | null;
  avatar_url: string | null;
  scopes: string | null;
  error: string | null;
}

export type Tokens = Record<TokenKind, TokenInfo | null>;

export interface Repo {
  full_name: string;
  private: boolean;
  default_branch: string;
  pushed_at: string | null;
}

export interface User {
  login: string;
  avatar_url: string;
}

export interface PullSummary {
  number: number;
  title: string;
  state: "open" | "closed";
  draft: boolean;
  merged_at: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  user: User;
  head: { ref: string; sha: string };
  base: { ref: string };
}

export interface Label {
  id: number;
  name: string;
  color: string;
  description: string | null;
}

export interface Team {
  slug: string;
  name: string;
}

export interface PullPage {
  items: PullSummary[];
  total_count: number;
  has_next_page: boolean;
  end_cursor: string | null;
}

export interface Pull extends PullSummary {
  node_id: string;
  body: string | null;
  closed_at: string | null;
  head: { ref: string; sha: string; repo: { full_name: string } | null };
  labels: Label[];
  assignees: User[];
  requested_reviewers: User[];
  requested_teams: Team[];
  merged: boolean;
  mergeable: boolean | null;
  mergeable_state: string;
  commits: number;
  additions: number;
  deletions: number;
  changed_files: number;
  merged_by: User | null;
}

export interface Review {
  id: number;
  user: User;
  state: string;
  body: string;
  submitted_at: string;
}

export interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  started_at: string | null;
  completed_at: string | null;
  /** Set when this entry was built from an Actions run (token can't read check runs). */
  workflow_run_id?: number;
}

export interface CommitStatus {
  id: number;
  context: string;
  state: string;
  description: string | null;
  target_url: string | null;
}

export interface ChecksSummary {
  total: number;
  success: number;
  failure: number;
  pending: number;
  skipped: number;
}

export interface PullDetail {
  pr: Pull;
  reviews: Review[];
  check_runs: CheckRun[];
  statuses: CommitStatus[];
  checks_summary: ChecksSummary;
  /** Why some checks couldn't be read (missing token permissions). */
  checks_notes: string[];
  /** For closed PRs from this repo: whether the head branch still exists. */
  head_branch_exists: boolean | null;
  /** For open PRs: commits on the base branch the head doesn't have yet. */
  behind_by: number | null;
}

export interface Commit {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name: string; date: string } };
  author: User | null;
}

export interface FileChange {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

export interface Comment {
  id: number;
  user: User;
  body: string;
  created_at: string;
  updated_at: string;
  html_url: string;
}

/** An inline comment on a line of the diff. */
export interface ReviewComment extends Comment {
  path: string;
  line: number | null;
  original_line: number | null;
  diff_hunk: string;
  pull_request_review_id: number | null;
  in_reply_to_id?: number;
}

/** Issue event: closed, reopened, merged, labeled, assigned, renamed, head_ref_deleted... */
export interface IssueEvent {
  id: number;
  event: string;
  actor: User | null;
  created_at: string;
  commit_id: string | null;
  label?: { name: string; color: string };
  assignee?: User;
  requested_reviewer?: User;
  requested_team?: Team;
  rename?: { from: string; to: string };
}

export interface Compare {
  status: string;
  ahead_by: number;
  behind_by: number;
  commits: Commit[];
  files: FileChange[];
}

export interface Workflow {
  id: number;
  name: string;
  path: string;
  state: string;
}

export interface RunPage {
  items: WorkflowRun[];
  total_count: number;
  page: number;
  per_page: number;
  last_page: number;
}

export interface WorkflowRun {
  id: number;
  name: string;
  display_title: string;
  run_number: number;
  event: string;
  status: string;
  conclusion: string | null;
  head_branch: string;
  head_sha: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  run_started_at: string | null;
  actor: User | null;
}

export interface Step {
  name: string;
  number: number;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface Job {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  html_url: string;
  steps?: Step[];
}

export interface RunDetail {
  run: WorkflowRun;
  jobs: Job[];
}
