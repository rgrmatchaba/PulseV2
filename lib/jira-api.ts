function getAuth() {
  const site = process.env.ATLASSIAN_SITE_URL;
  const email = process.env.ATLASSIAN_EMAIL;
  const token = process.env.ATLASSIAN_API_TOKEN;
  if (!site || !email || !token) throw new Error("Missing ATLASSIAN_SITE_URL, ATLASSIAN_EMAIL, or ATLASSIAN_API_TOKEN");
  const credentials = Buffer.from(`${email}:${token}`).toString("base64");
  return {
    baseUrl: `https://${site}`,
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: "application/json",
    },
  };
}

export async function getActiveSprint(boardId: string) {
  const { baseUrl, headers } = getAuth();
  const res = await fetch(
    `${baseUrl}/rest/agile/1.0/board/${boardId}/sprint?state=active`,
    { headers }
  );
  if (!res.ok) throw new Error(`Jira sprint fetch failed: ${res.status}`);
  return res.json();
}

export async function getSprintIssues(sprintId: number) {
  const { baseUrl, headers } = getAuth();
  const fields = "summary,status,assignee,priority,issuetype,reporter,updated,created";
  const res = await fetch(
    `${baseUrl}/rest/agile/1.0/sprint/${sprintId}/issue?fields=${fields}&maxResults=50`,
    { headers }
  );
  if (!res.ok) throw new Error(`Jira sprint issues fetch failed: ${res.status}`);
  return res.json();
}

export async function searchIssues(jql: string, maxResults = 20) {
  const { baseUrl, headers } = getAuth();
  const fields =
    "summary,status,assignee,priority,issuetype,reporter,updated,created,comment";
  const res = await fetch(
    `${baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=${fields}&maxResults=${maxResults}`,
    { headers }
  );
  if (!res.ok) throw new Error(`Jira search failed: ${res.status}`);
  return res.json();
}

export async function getCurrentUser() {
  const { baseUrl, headers } = getAuth();
  const res = await fetch(`${baseUrl}/rest/api/3/myself`, { headers });
  if (!res.ok) throw new Error(`Jira user fetch failed: ${res.status}`);
  return res.json() as Promise<{
    displayName?: string;
    emailAddress?: string;
    accountId?: string;
  }>;
}

export type JiraTransition = {
  id: string;
  name: string;
  to?: { name?: string; statusCategory?: { name?: string } };
};

export async function getIssueTransitions(issueKey: string): Promise<JiraTransition[]> {
  const { baseUrl, headers } = getAuth();
  const res = await fetch(
    `${baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
    { headers }
  );
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Transitions fetch failed for ${issueKey}: ${res.status} ${err}`);
  }
  const data = await res.json();
  return (data.transitions ?? []) as JiraTransition[];
}

export async function transitionIssue(
  issueKey: string,
  transitionId: string
): Promise<void> {
  const { baseUrl, headers } = getAuth();
  const res = await fetch(
    `${baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ transition: { id: transitionId } }),
    }
  );
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Transition failed for ${issueKey}: ${res.status} ${err}`);
  }
}

/** Move issue to a status name (e.g. "Done", "In Progress") via Jira REST — reliable path. */
export async function transitionIssueToStatus(
  issueKey: string,
  targetStatus: string
): Promise<{ success: boolean; detail: string }> {
  const transitions = await getIssueTransitions(issueKey);
  const target = targetStatus.toLowerCase().trim();

  const match = transitions.find((t) => {
    const toName = (t.to?.name ?? "").toLowerCase();
    const transitionName = (t.name ?? "").toLowerCase();
    return (
      toName === target ||
      transitionName === target ||
      toName.includes(target) ||
      transitionName.includes(target)
    );
  });

  if (!match) {
    const available = [
      ...new Set(transitions.map((t) => t.to?.name ?? t.name).filter(Boolean)),
    ].join(", ");
    return {
      success: false,
      detail: available
        ? `No transition to "${targetStatus}". Options: ${available}`
        : `No transitions available for ${issueKey}`,
    };
  }

  await transitionIssue(issueKey, match.id);
  const landed = match.to?.name ?? match.name;
  return { success: true, detail: `${issueKey} is now ${landed}` };
}

function adfCommentBody(text: string) {
  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

export async function addIssueComment(issueKey: string, text: string): Promise<void> {
  const { baseUrl, headers } = getAuth();
  const res = await fetch(
    `${baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ body: adfCommentBody(text) }),
    }
  );
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Comment failed on ${issueKey}: ${res.status} ${err}`);
  }
}

export async function getIssueComments(issueKey: string, maxResults = 5) {
  const { baseUrl, headers } = getAuth();
  const res = await fetch(
    `${baseUrl}/rest/api/3/issue/${issueKey}/comment?maxResults=${maxResults}&orderBy=-created`,
    { headers }
  );
  if (!res.ok) return { comments: [] as Record<string, unknown>[] };
  const data = await res.json();
  return data as { comments: Record<string, unknown>[] };
}
