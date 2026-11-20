/**
 * Wrap user-provided data as JSON inside <user_data> tags. "<" is escaped as < (still valid
 * JSON), so text in the data can't close the tag or open a new one.
 */
export function userData(data: unknown): string {
  const json = JSON.stringify(data, null, 2).replace(/</g, '\\u003c');
  return `<user_data>\n${json}\n</user_data>`;
}
