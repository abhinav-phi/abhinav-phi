// Renders the profile stat cards into assets/ using the GitHub API directly.
// Runs in CI with the workflow token, so no third-party stats host is involved.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const USER = process.env.STATS_USER || "abhinav-phi";
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) throw new Error("GITHUB_TOKEN is required");

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
const BG = "#0D1117";
const TITLE = "#C77DFF";
const ICON = "#9D4EDD";
const TEXT = "#c9d1d9";
const DIM = "#8b949e";
const TRACK = "#1c2433";
const PALETTE = ["#9D4EDD", "#C77DFF", "#7B2CBF", "#5A189A", "#E0AAFF", "#3C096C", "#B388EB", "#6A4C93"];

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (n) => n.toLocaleString("en-US");
const pct = (n, d) => (d ? (n / d) * 100 : 0);

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
    repos.push(...batch.filter((r) => !r.fork && !r.archived));
    if (batch.length < 100) break;
  }
  return repos;
}

function icon(name, x, y) {
  const open = `<g transform="translate(${x} ${y})" fill="none" stroke="${ICON}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">`;
  const dot = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${ICON}" stroke="none"/>`;
  const shapes = {
    commits: `${open}<line x1="6" y1="8" x2="14" y2="8"/>${dot(4, 8, 2.6)}<circle cx="8" cy="8" r="3.4"/></g>`,
    pr: `${open}<line x1="4" y1="5" x2="4" y2="11"/>${dot(4, 3.2, 1.9)}${dot(4, 12.8, 1.9)}<path d="M9 4.5H11a2 2 0 0 1 2 2v4.5"/><polyline points="10.4 10.4 13 13 15.6 10.4"/></g>`,
    merged: `${open}<circle cx="8" cy="8" r="6.4"/><polyline points="5.2 8.2 7.2 10.2 10.9 6"/></g>`,
    issue: `${open}<circle cx="8" cy="8" r="6.4"/><line x1="8" y1="4.8" x2="8" y2="8.6"/>${dot(8, 11.2, 0.9)}</g>`,
    star: `<g transform="translate(${x} ${y})" fill="${ICON}"><path d="M8 1.6 9.9 5.5l4.3.6-3.1 3 .7 4.2L8 11.3l-3.8 2 .7-4.2-3.1-3 4.3-.6Z"/></g>`,
    user: `${open}<circle cx="8" cy="5.2" r="2.8"/><path d="M2.8 14.2a5.2 5.2 0 0 1 10.4 0"/></g>`,
    repo: `${open}<path d="M3 2.6h9.4a.9.9 0 0 1 .9.9v10.2H4.4A1.4 1.4 0 0 1 3 12.3Z"/><line x1="5.6" y1="5.6" x2="10.6" y2="5.6"/><line x1="5.6" y1="8.2" x2="10.6" y2="8.2"/></g>`,
    review: `${open}<rect x="2" y="2.8" width="12" height="9" rx="1.6"/><polyline points="5.4 11.8 5.4 14.4 8.4 11.8"/><line x1="4.8" y1="6" x2="11.2" y2="6"/><line x1="4.8" y1="8.8" x2="9" y2="8.8"/></g>`,
  };
  return shapes[name] ?? "";
}

function card({ title, width, height, rows, footer }) {
  const colGap = width / 2;
  const body = rows
    .map((r, i) => {
      const col = i % 2;
      const line = Math.floor(i / 2);
      const x = 26 + col * colGap;
      const y = 66 + line * 44;
      return `<g>${icon(r.icon, x, y - 15)}<text x="${x + 26}" y="${y - 3}" class="l">${esc(r.label)}</text><text x="${x + 26}" y="${y + 16}" class="v">${esc(r.value)}</text></g>`;
    })
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}">
<style>
.h{font:600 15px 'Segoe UI',Ubuntu,sans-serif;fill:${TITLE}}
.l{font:600 11px 'Segoe UI',Ubuntu,sans-serif;fill:${DIM}}
.v{font:700 16px 'Segoe UI',Ubuntu,sans-serif;fill:${TEXT}}
.f{font:400 10px 'Segoe UI',Ubuntu,sans-serif;fill:${DIM}}
</style>
<rect width="100%" height="100%" rx="10" fill="${BG}"/>
<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="9" fill="none" stroke="#240046" stroke-width="1.5"/>
<text x="26" y="34" class="h">${esc(title)}</text>
${body}
${footer ? `<text x="26" y="${height - 14}" class="f">${esc(footer)}</text>` : ""}
</svg>`;
}

function langCard(title, langs, footer) {
  const width = 600;
  const rows = Math.ceil(langs.length / 2);
  const height = 74 + rows * 30 + 26;
  const total = langs.reduce((s, l) => s + l.bytes, 0);
  const barW = width - 52;
  let cursor = 0;
  const segs = langs
    .map((l, i) => {
      const w = (l.bytes / total) * barW;
      const seg = `<rect x="${(26 + cursor).toFixed(2)}" y="48" width="${w.toFixed(2)}" height="10" fill="${PALETTE[i % PALETTE.length]}"/>`;
      cursor += w;
      return seg;
    })
    .join("");
  const legend = langs
    .map((l, i) => {
      const col = i % 2;
      const line = Math.floor(i / 2);
      const x = 26 + col * (width / 2);
      const y = 86 + line * 30;
      const share = pct(l.bytes, total).toFixed(1);
      return `<g><circle cx="${x + 5}" cy="${y - 4}" r="5" fill="${PALETTE[i % PALETTE.length]}"/><text x="${x + 18}" y="${y}" class="l2">${esc(l.name)}</text><text x="${x + 18}" y="${y + 15}" class="v2">${share}%</text></g>`;
    })
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}">
<style>
.h{font:600 15px 'Segoe UI',Ubuntu,sans-serif;fill:${TITLE}}
.l2{font:600 11px 'Segoe UI',Ubuntu,sans-serif;fill:${DIM}}
.v2{font:700 14px 'Segoe UI',Ubuntu,sans-serif;fill:${TEXT}}
.f{font:400 10px 'Segoe UI',Ubuntu,sans-serif;fill:${DIM}}
</style>
<rect width="100%" height="100%" rx="10" fill="${BG}"/>
<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="9" fill="none" stroke="#240046" stroke-width="1.5"/>
<text x="26" y="34" class="h">${esc(title)}</text>
<rect x="26" y="48" width="${barW}" height="10" rx="5" fill="${TRACK}"/>
${segs}
${legend}
${footer ? `<text x="26" y="${height - 12}" class="f">${esc(footer)}</text>` : ""}
</svg>`;
}

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

const commits = collection.user.contributionsCollection;
const commitTotal = commits.totalCommitContributions + commits.restrictedContributionsCount;
const reviews = commits.totalPullRequestReviewContributions;
const starsEarned = repos.reduce((s, r) => s + r.stargazers_count, 0);

const byteTotals = {};
for (const r of repos) {
  const langs = await rest(`/repos/${r.full_name}/languages`);
  for (const [name, bytes] of Object.entries(langs)) byteTotals[name] = (byteTotals[name] || 0) + bytes;
}
const topLangs = Object.entries(byteTotals)
  .map(([name, bytes]) => ({ name, bytes }))
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, 8);

const stamp = new Date().toISOString().slice(0, 10);
// restrictedContributionsCount is only populated when the token belongs to the
// profile owner, so a plain GITHUB_TOKEN (Actions bot) reports public commits only.
const privateNote = commits.restrictedContributionsCount > 0;
const statsSvg = card({
  title: `${profile.name || USER} · GitHub Stats`,
  width: 600,
  height: 242,
  footer: `${privateNote ? "Public + private" : "Public"} activity · updated ${stamp}`,
  rows: [
    { icon: "commits", label: "COMMITS (12 MO)", value: num(commitTotal) },
    { icon: "star", label: "STARS EARNED", value: num(starsEarned) },
    { icon: "merged", label: "PRS MERGED", value: num(mergedPrs) },
    { icon: "pr", label: "PRS IN PROGRESS", value: num(openPrs) },
    { icon: "issue", label: "ISSUES OPENED", value: num(issues) },
    { icon: "review", label: "PR REVIEWS (12 MO)", value: num(reviews) },
    { icon: "user", label: "FOLLOWERS", value: num(profile.followers) },
    { icon: "repo", label: "PUBLIC REPOS", value: num(repos.length) },
  ],
});

const langSvg = langCard(
  "Top Languages · own repositories",
  topLangs,
  `By bytes across ${repos.length} owned repositories · updated ${stamp}`
);

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "stats.svg"), statsSvg);
writeFileSync(join(OUT, "languages.svg"), langSvg);
console.log(
  JSON.stringify({ commitTotal, starsEarned, mergedPrs, openPrs, issues, reviews, followers: profile.followers, repos: repos.length, topLangs: topLangs.map((l) => `${l.name} ${pct(l.bytes, topLangs.reduce((s, x) => s + x.bytes, 0)).toFixed(1)}%`) }, null, 1)
);
