/* Dead-simple local password gate. This is a LOCAL admin tool; the cookie
 * just stops a stray browser tab from poking the API. Not internet-grade. */
export const AUTH_COOKIE = "admin_auth";

export function expectedToken(): string {
  return process.env.ADMIN_PASSWORD ?? "admin";
}

export function isAuthed(cookieValue: string | undefined | null): boolean {
  if (!cookieValue) return false;
  return cookieValue === expectedToken();
}
