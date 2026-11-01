// A GitHub profile name with no letter or digit (for example "-" or "...") is not a name: use the login.
export function profileName(name: unknown, login: string): string {
 const trimmed = typeof name === 'string' ? name.trim() : '';
 return /[\p{L}\p{N}]/u.test(trimmed) ? trimmed : login;
}
