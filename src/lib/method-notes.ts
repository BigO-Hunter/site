// Reviewed notes on how a record is proved (data/method-notes.json). A row has its own note by board and row id.
// A board note covers every row of one source repository, for a line of work whose leader changes often (the
// CrocSwap integer multiplication line): a row without a note of its own takes the board note of its repository.
export interface MethodNotes {
  boards?: Record<string, Record<string, unknown>>;
  board_notes?: Record<string, {repo?: unknown; text?: unknown}[]>;
}
const plain = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value : undefined;
export function methodNoteFor(notes: MethodNotes | undefined, slug: string, id: string, repo: string): string | undefined {
  const own = plain(notes?.boards?.[slug]?.[id]);
  if (own) return own;
  const shared = notes?.board_notes?.[slug]?.find(note => note.repo === repo);
  return plain(shared?.text);
}

// A note is plain text with inline TeX in \( \) pairs (KaTeX for all math, Lead 2026-11-04), as the Other bounds notes:
// at most 500 characters, no < > & $ or line break, and no backslash outside the pairs. data/validate.py has the same rule.
export const noteMath = /\\\((?:(?!\\[()]).)+?\\\)/g;
export const validNoteText = (text: string): boolean =>
  text.length > 0 && text.length <= 500 && text === text.trim() && !/[<>&$\n]/.test(text) && !text.replace(noteMath, '').includes('\\');
