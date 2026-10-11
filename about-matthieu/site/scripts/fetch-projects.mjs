// Refresh src/data/projects.json from the GitHub API (public repos, no forks).
// Usage: npm run projects   (set GITHUB_TOKEN to avoid the anonymous rate limit)
import { writeFileSync } from 'node:fs';
const USER = 'laborima';
const headers = { Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
const get = async (url) => { const r = await fetch(url, { headers }); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); };
const user = await get(`https://api.github.com/users/${USER}`);
const repos = (await get(`https://api.github.com/users/${USER}/repos?per_page=100&sort=pushed`))
  .filter((r) => !r.fork && !r.archived && r.description)
  .map((r) => ({ name: r.name, description: r.description, url: r.html_url, homepage: r.homepage || null,
                 language: r.language, stars: r.stargazers_count, pushedAt: r.pushed_at, topics: r.topics || [] }))
  .sort((a, b) => b.stars - a.stars || b.pushedAt.localeCompare(a.pushedAt));
writeFileSync(new URL('../src/data/projects.json', import.meta.url), JSON.stringify({
  fetchedAt: new Date().toISOString(),
  user: { name: user.name, login: user.login, bio: user.bio, location: user.location, url: user.html_url, avatar: user.avatar_url, since: user.created_at },
  repos }, null, 2) + '\n');
console.log(`${repos.length} repositories`);
