// Renders the profile analytics panel into assets/ using the GitHub API directly.
// Runs in CI with the workflow token, so no third-party stats host is involved.
//
// Both cards are composed into ONE svg: GitHub's sanitizer drops the style
// attribute from <table>/<td>, so an HTML table here would always draw cell
// borders. A single vector panel sidesteps that entirely.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const USER = process.env.STATS_USER || "abhinav-phi";
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) throw new Error("GITHUB_TOKEN is required");

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
const CW = 560;
const BG = "#0D1117";
const TITLE = "#C77DFF";
const ICON = "#9D4EDD";
const TEXT = "#c9d1d9";
const DIM = "#8b949e";
const TRACK = "#1c2433";
const BORDER = "#240046";
const PALETTE = ["#9D4EDD", "#C77DFF", "#7B2CBF", "#5A189A", "#E0AAFF", "#3C096C", "#B388EB", "#6A4C93"];

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (n) => n.toLocaleString("en-US");

const STYLE = `<style>
.h{font:600 15px 'Segoe UI',Ubuntu,sans-serif;fill:${TITLE}}
.l{font:600 11px 'Segoe UI',Ubuntu,sans-serif;fill:${DIM}}
.v{font:700 16px 'Segoe UI',Ubuntu,sans-serif;fill:${TEXT}}
.r{font:600 13px 'Segoe UI',Ubuntu,sans-serif;fill:${TEXT}}
.f{font:400 10px 'Segoe UI',Ubuntu,sans-serif;fill:${DIM}}
</style>`;

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

const cc = collection.user.contributionsCollection;
const commitTotal = cc.totalCommitContributions + cc.restrictedContributionsCount;
const reviews = cc.totalPullRequestReviewContributions;
const starsEarned = repos.reduce((s, r) => s + r.stargazers_count, 0);
const privateSeen = cc.restrictedContributionsCount > 0;

const byteTotals = {};
for (const r of repos) {
  const langs = await rest(`/repos/${r.full_name}/languages`);
  for (const [name, bytes] of Object.entries(langs)) byteTotals[name] = (byteTotals[name] || 0) + bytes;
}
const topLangs = Object.entries(byteTotals)
  .map(([name, bytes]) => ({ name, bytes }))
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, 8);
const langTotal = topLangs.reduce((s, l) => s + l.bytes, 0);

const stamp = new Date().toISOString().slice(0, 10);

// ---------- stats panel ----------

const metrics = [
  { icon: "commits", label: "COMMITS (12 MO)", value: num(commitTotal) },
  { icon: "merged", label: "PULL REQUESTS MERGED", value: num(mergedPrs) },
  { icon: "pr", label: "PULL REQUESTS IN PROGRESS", value: num(openPrs) },
  { icon: "issue", label: "ISSUES OPENED", value: num(issues) },
  { icon: "review", label: "PULL REQUEST REVIEWS (12 MO)", value: num(reviews) },
  { icon: "star", label: "STARS EARNED", value: num(starsEarned) },
  { icon: "repo", label: "OWNED REPOSITORIES", value: num(repos.length) },
  { icon: "user", label: "FOLLOWERS", value: num(profile.followers) },
];

const ROW = 44;
const TOP = 66;
const PH = TOP + metrics.length * ROW - 8 + 26;

const statsBody =
  metrics
    .map((m, i) => {
      const y = TOP + i * ROW;
      return `<g>${icon(m.icon, 26, y - 15)}<text x="52" y="${y - 3}" class="l">${esc(m.label)}</text><text x="52" y="${y + 16}" class="v">${esc(m.value)}</text></g>`;
    })
    .join("\n") +
  `\n<text x="26" y="${PH - 14}" class="f">${privateSeen ? "Public + private" : "Public"} activity · updated ${stamp}</text>`;

// ---------- languages panel, same height as stats ----------

const barW = CW - 52;
const langStep = (PH - 40 - TOP) / topLangs.length;
const langBody =
  topLangs
    .map((l, i) => {
      const y = TOP + Math.round(i * langStep);
      const share = (l.bytes / langTotal) * 100;
      const w = Math.max(2, (share / 100) * barW);
      const color = PALETTE[i % PALETTE.length];
      return `<g><text x="26" y="${y}" class="r">${esc(l.name)}</text><text x="${CW - 26}" y="${y}" text-anchor="end" class="r">${share.toFixed(1)}%</text><rect x="26" y="${y + 8}" width="${barW}" height="8" rx="4" fill="${TRACK}"/><rect x="26" y="${y + 8}" width="${w.toFixed(2)}" height="8" rx="4" fill="${color}"/></g>`;
    })
    .join("\n") +
  `\n<text x="26" y="${PH - 14}" class="f">Bytes across ${repos.length} owned repositories · updated ${stamp}</text>`;

// ---------- compose ----------

const GAP = 24;
const PW = CW * 2 + GAP;

const sub = (title, body, x) =>
  `<g transform="translate(${x} 0)">
<rect width="${CW}" height="${PH}" rx="10" fill="${BG}"/>
<rect x="1" y="1" width="${CW - 2}" height="${PH - 2}" rx="9" fill="none" stroke="${BORDER}" stroke-width="1.5"/>
<text x="26" y="34" class="h">${esc(title)}</text>
${body}
</g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${PH}" viewBox="0 0 ${PW} ${PH}" role="img" aria-label="GitHub analytics for ${esc(USER)}">
${STYLE}
${sub(`${profile.name || USER} · GitHub Stats`, statsBody, 0)}
${sub("Top Languages · by bytes", langBody, CW + GAP)}
</svg>`;

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "analytics.svg"), svg);
console.log(
  JSON.stringify(
    {
      panel: `${PW}x${PH}`,
      commitTotal,
      mergedPrs,
      openPrs,
      issues,
      reviews,
      starsEarned,
      followers: profile.followers,
      repos: repos.length,
      topLangs: topLangs.map((l) => `${l.name} ${((l.bytes / langTotal) * 100).toFixed(1)}%`),
    },
    null,
    1
  )
);
