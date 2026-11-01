// Renders the profile stats card into assets/ using the GitHub API directly.
// Runs in CI with the workflow token, so no third-party stats host is involved.
//
// Shipped as a committed SVG rather than an HTML table: GitHub's markdown
// sanitizer drops the style attribute from <table>/<td>, so an HTML layout here
// always renders with cell borders.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const USER = process.env.STATS_USER || "abhinav-phi";
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) throw new Error("GITHUB_TOKEN is required");

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
const W = 1000;
const COLS = 2;
const ROW = 44;
const TOP = 66;
const BG = "#0D1117";
const TITLE = "#C77DFF";
const ICON = "#9D4EDD";
const TEXT = "#c9d1d9";
const DIM = "#8b949e";
const BORDER = "#240046";

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (n) => n.toLocaleString("en-US");

async function gql(query) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (json.errors) throw new Error("GraphQL: " + json.errors[0].message);
  return json.data;
}

async function rest(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "profile-stats" },
  });
  if (!res.ok) throw new Error(`REST ${path} -> ${res.status}`);
  return res.json();
}

async function searchCount(query) {
  const body = await rest(`/search/issues?q=${encodeURIComponent(query)}&per_page=1`);
  return body.total_count;
}

async function ownedRepos() {
  const repos = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await rest(`/users/${USER}/repos?per_page=100&page=${page}&type=owner`);
    if (!batch.length) break;
    repos.push(...batch.filter((r) => !r.fork && !r.archived));
    if (batch.length < 100) break;
  }
  return repos;
}

function icon(name, x, y) {
  const g = `<g transform="translate(${x} ${y})" fill="none" stroke="${ICON}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">`;
  const dot = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${ICON}" stroke="none"/>`;
  const shapes = {
    commits: `${g}<line x1="6" y1="8" x2="14" y2="8"/>${dot(4, 8, 2.6)}<circle cx="8" cy="8" r="3.4"/></g>`,
    pr: `${g}<line x1="4" y1="5" x2="4" y2="11"/>${dot(4, 3.2, 1.9)}${dot(4, 12.8, 1.9)}<path d="M9 4.5H11a2 2 0 0 1 2 2v4.5"/><polyline points="10.4 10.4 13 13 15.6 10.4"/></g>`,
    merged: `${g}<circle cx="8" cy="8" r="6.4"/><polyline points="5.2 8.2 7.2 10.2 10.9 6"/></g>`,
    issue: `${g}<circle cx="8" cy="8" r="6.4"/><line x1="8" y1="4.8" x2="8" y2="8.6"/>${dot(8, 11.2, 0.9)}</g>`,
    star: `<g transform="translate(${x} ${y})" fill="${ICON}"><path d="M8 1.6 9.9 5.5l4.3.6-3.1 3 .7 4.2L8 11.3l-3.8 2 .7-4.2-3.1-3 4.3-.6Z"/></g>`,
    user: `${g}<circle cx="8" cy="5.2" r="2.8"/><path d="M2.8 14.2a5.2 5.2 0 0 1 10.4 0"/></g>`,
    repo: `${g}<path d="M3 2.6h9.4a.9.9 0 0 1 .9.9v10.2H4.4A1.4 1.4 0 0 1 3 12.3Z"/><line x1="5.6" y1="5.6" x2="10.6" y2="5.6"/><line x1="5.6" y1="8.2" x2="10.6" y2="8.2"/></g>`,
    review: `${g}<rect x="2" y="2.8" width="12" height="9" rx="1.6"/><polyline points="5.4 11.8 5.4 14.4 8.4 11.8"/><line x1="4.8" y1="6" x2="11.2" y2="6"/><line x1="4.8" y1="8.8" x2="9" y2="8.8"/></g>`,
  };
  return shapes[name] ?? "";
}

// ---------- data ----------

const since = new Date();
since.setFullYear(since.getFullYear() - 1);
const iso = (d) => d.toISOString().slice(0, 19) + "Z";

const [profile, collection, mergedPrs, openPrs, issues, repos] = await Promise.all([
  rest(`/users/${USER}`),
  gql(`{ user(login:"${USER}"){ contributionsCollection(from:"${iso(since)}", to:"${iso(new Date())}"){ totalCommitContributions restrictedContributionsCount totalPullRequestReviewContributions } } }`),
  searchCount(`author:${USER} is:pr is:merged`),
  searchCount(`author:${USER} is:pr is:open`),
  searchCount(`author:${USER} is:issue`),
  ownedRepos(),
]);

const repoCount = repos.length;
const starsEarned = repos.reduce((s, r) => s + r.stargazers_count, 0);

const cc = collection.user.contributionsCollection;
const commitTotal = cc.totalCommitContributions + cc.restrictedContributionsCount;
const reviews = cc.totalPullRequestReviewContributions;
const privateSeen = cc.restrictedContributionsCount > 0;

const metrics = [
  { icon: "commits", label: "COMMITS (12 MO)", value: num(commitTotal) },
  { icon: "star", label: "STARS EARNED", value: num(starsEarned) },
  { icon: "merged", label: "PULL REQUESTS MERGED", value: num(mergedPrs) },
  { icon: "pr", label: "PULL REQUESTS IN PROGRESS", value: num(openPrs) },
  { icon: "issue", label: "ISSUES OPENED", value: num(issues) },
  { icon: "review", label: "PULL REQUEST REVIEWS (12 MO)", value: num(reviews) },
  { icon: "repo", label: "OWNED REPOSITORIES", value: num(repoCount) },
  { icon: "user", label: "FOLLOWERS", value: num(profile.followers) },
];

// ---------- render ----------

const rows = Math.ceil(metrics.length / COLS);
const H = TOP + rows * ROW - 8 + 26;
const colW = (W - 52) / COLS;
const stamp = new Date().toISOString().slice(0, 10);

const body = metrics
  .map((m, i) => {
    const col = i % COLS;
    const line = Math.floor(i / COLS);
    const x = 26 + col * colW;
    const y = TOP + line * ROW;
    return `<g>${icon(m.icon, x, y - 15)}<text x="${x + 26}" y="${y - 3}" style="font:600 11px 'Segoe UI',Ubuntu,sans-serif;fill:${DIM}">${esc(m.label)}</text><text x="${x + 26}" y="${y + 16}" style="font:700 16px 'Segoe UI',Ubuntu,sans-serif;fill:${TEXT}">${esc(m.value)}</text></g>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="GitHub stats for ${esc(USER)}">
<rect width="100%" height="100%" rx="10" fill="${BG}"/>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="9" fill="none" stroke="${BORDER}" stroke-width="1.5"/>
<text x="26" y="34" style="font:600 15px 'Segoe UI',Ubuntu,sans-serif;fill:${TITLE}">${esc(profile.name || USER)} · GitHub Stats</text>
${body}
<text x="26" y="${H - 14}" style="font:400 10px 'Segoe UI',Ubuntu,sans-serif;fill:${DIM}">${privateSeen ? "Public + private" : "Public"} activity · updated ${stamp}</text>
</svg>`;

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "analytics.svg"), svg);
console.log(
  JSON.stringify(
    { card: `${W}x${H}`, commitTotal, starsEarned, mergedPrs, openPrs, issues, reviews, repoCount, followers: profile.followers },
    null,
    1
  )
);
