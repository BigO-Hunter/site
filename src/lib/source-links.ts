// The proof scope of a direct result (data/direct_refresh.py other_claims) names its source as plain text:
// "at commit <40-hex sha> of https://github.com/<owner>/<repo>." The data stays plain (other-merge.ts refuses
// < > &), so the Other page links it here (Nil, 2026-11-04): the short hash opens the commit, the name opens
// the repository. Text without that form does not change.
const SOURCE = /at commit ([0-9a-f]{40}) of https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]+?)(?=\.?(?:\s|$))/g;

export const sourceLinks = (text: string) => text.replace(SOURCE, (_, sha: string, owner: string, repo: string) => {
  const url = `https://github.com/${owner}/${repo}`;
  return `at commit <a href="${url}/commit/${sha}" target="_blank" rel="noopener"><code>${sha.slice(0, 8)}</code></a> of <a href="${url}" target="_blank" rel="noopener">${owner}/${repo}</a>`;
});
