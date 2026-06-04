function githubHeaders(): HeadersInit {
  const token = process.env.GITHUB_PAT_TOKEN;
  if (!token) throw new Error("Missing GITHUB_PAT_TOKEN");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function repoPath() {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  if (!owner || !repo) throw new Error("Missing GITHUB_OWNER or GITHUB_REPO");
  return { owner, repo, base: `https://api.github.com/repos/${owner}/${repo}` };
}

export type GitHubIssue = {
  number: number;
  title: string;
  state: string;
  updated_at: string;
  user?: { login?: string };
  assignees?: Array<{ login?: string }>;
  comments: number;
  labels?: Array<{ name?: string }>;
};

export type GitHubPR = {
  number: number;
  title: string;
  state: string;
  updated_at: string;
  created_at: string;
  user?: { login?: string };
  draft?: boolean;
  comments: number;
  review_comments: number;
  requested_reviewers?: Array<{ login?: string }>;
};

export type GitHubCommit = {
  sha: string;
  commit: { message: string; author?: { name?: string; date?: string } };
  author?: { login?: string } | null;
};

export type GitHubComment = {
  user?: { login?: string };
  body?: string;
  created_at?: string;
  updated_at?: string;
};

export async function listOpenIssues(): Promise<GitHubIssue[]> {
  const { base } = repoPath();
  const res = await fetch(`${base}/issues?state=open&per_page=30`, {
    headers: githubHeaders(),
  });
  if (!res.ok) throw new Error(`GitHub issues fetch failed: ${res.status}`);
  const data = (await res.json()) as GitHubIssue[];
  return data.filter((i) => !("pull_request" in (i as Record<string, unknown>)));
}

export async function listOpenPullRequests(): Promise<GitHubPR[]> {
  const { base } = repoPath();
  const res = await fetch(`${base}/pulls?state=open&per_page=20`, {
    headers: githubHeaders(),
  });
  if (!res.ok) throw new Error(`GitHub PRs fetch failed: ${res.status}`);
  return res.json();
}

export async function listRecentCommits(perPage = 10): Promise<GitHubCommit[]> {
  const { base } = repoPath();
  const res = await fetch(`${base}/commits?per_page=${perPage}`, {
    headers: githubHeaders(),
  });
  if (!res.ok) throw new Error(`GitHub commits fetch failed: ${res.status}`);
  return res.json();
}

export async function listIssueComments(issueNumber: number): Promise<GitHubComment[]> {
  const { base } = repoPath();
  const res = await fetch(`${base}/issues/${issueNumber}/comments?per_page=5`, {
    headers: githubHeaders(),
  });
  if (!res.ok) return [];
  return res.json();
}

export async function listPullReviewComments(prNumber: number): Promise<GitHubComment[]> {
  const { base } = repoPath();
  const res = await fetch(`${base}/pulls/${prNumber}/comments?per_page=5`, {
    headers: githubHeaders(),
  });
  if (!res.ok) return [];
  return res.json();
}
