// Xac minh Cloudflare Turnstile (server-side). Ham thuan: fetch co the
// truyen vao de test; production dung fetch mac dinh cua Node.
// Bat/tat bang bien moi truong TURNSTILE_SECRET_KEY: chua co key thi
// captcha TAT (khong chan dang ky/dang nhap), co key thi bat.
export async function verifyTurnstile(
  secret: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
  remoteip?: string,
): Promise<boolean> {
  if (!secret || !token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteip) body.set('remoteip', remoteip);
    const res = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as any;
    return data?.success === true;
  } catch {
    return false;
  }
}

export function turnstileEnabled(): boolean {
  return !!(process.env.TURNSTILE_SECRET_KEY || '').trim();
}
