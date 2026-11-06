// The credit name of a GitHub account that asked for one in place of its profile name, by lowercase login. The pages
// use it for every credit of that login; scripts/refresh-authors.mjs keeps writing the GitHub name to
// author-profiles.json, which no page shows for these logins. darkhipo: a shared account whose work is done by an AI
// agent swarm (site#15, Lead decision 2026-11-05). jv1000: the paper and README name the author Jennifer Voitle, the GitHub
// profile says UltrontheCat (Lead decision 2026-11-06: credit follows the paper).
export const creditNames: Record<string, string> = {darkhipo: 'MultiAgency swarm', jv1000: 'Jennifer Voitle'};

// A GitHub profile name with no letter or digit (for example "-" or "...") is not a name: use the login.
export function profileName(name: unknown, login: string): string {
 const trimmed = typeof name === 'string' ? name.trim() : '';
 return /[\p{L}\p{N}]/u.test(trimmed) ? trimmed : login;
}
