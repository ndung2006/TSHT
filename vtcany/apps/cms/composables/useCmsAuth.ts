// Phiên đăng nhập CMS: token + role/permissions/user, dark/light toggle.
//
// Quy tắc phiên hết hạn (sửa 2026-11-04): phiên hết hạn phải tự xóa
// SẠCH (cả 4 khóa, cả 2 storage) rồi về trang đăng nhập, không để lại
// trạng thái nửa vời (token mất nhưng user/role/perms còn) khiến giao
// diện render khung rỗng mà mọi nút đều chết. Backend vẫn là cổng chặn
// cuối cùng; kiểm tra exp phía client chỉ để chuyển hướng sớm.
const TOKEN_KEY = 'cms_token';
const SESSION_KEYS = [TOKEN_KEY, 'cms_user', 'cms_role', 'cms_perms'] as const;

export function clearCmsSession() {
  if (!process.client) return;
  for (const k of SESSION_KEYS) {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  }
}

export function readCmsToken(): string | null {
  if (!process.client) return null;
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

// true khi token vắng, sai định dạng JWT, hoặc đã quá hạn exp.
export function isCmsTokenExpired(token: string | null): boolean {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

export function useCmsAuth() {
  const config = useRuntimeConfig();
  const token = useState<string | null>('cms-token', () => null);
  const user = useState<any>('cms-user', () => null);
  const role = useState<string>('cms-role', () => '');
  const permissions = useState<string[]>('cms-perms', () => []);
  const dark = useState<boolean>('cms-dark', () => false);

  if (process.client && token.value === null) {
    token.value = readCmsToken();
    // Không token thì không nạp user/role/perms: tránh trạng thái nửa vời
    // (phiên cũ đã xóa token nhưng còn user/perms) khiến khung render sai.
    if (token.value) {
      try {
        user.value = JSON.parse(localStorage.getItem('cms_user') || sessionStorage.getItem('cms_user') || 'null');
        role.value = localStorage.getItem('cms_role') || sessionStorage.getItem('cms_role') || '';
        permissions.value = JSON.parse(localStorage.getItem('cms_perms') || sessionStorage.getItem('cms_perms') || '[]');
      } catch { /* bỏ qua cache hỏng */ }
    }
    document.documentElement.classList.toggle('p-dark', dark.value);
    document.body.classList.toggle('light-mode', !dark.value);
  }

  const loggedIn = computed(() => !!token.value);
  const can = (perm: string) => permissions.value.includes('*') || permissions.value.includes(perm);

  function applySession(res: any, email: string, remember: boolean) {
    const store = remember ? localStorage : sessionStorage;
    (remember ? sessionStorage : localStorage).removeItem(TOKEN_KEY);
    store.setItem(TOKEN_KEY, res.access_token);
    store.setItem('cms_user', JSON.stringify({ email }));
    store.setItem('cms_role', res.role || '');
    store.setItem('cms_perms', JSON.stringify(res.permissions || []));
    token.value = res.access_token;
    user.value = { email };
    role.value = res.role || '';
    permissions.value = res.permissions || [];
  }

  // Dang nhap buoc 1 (mat khau). Neu tai khoan da bat 2FA (Goi 2D-2),
  // server tra { requiresTwoFactor, challengeToken } thay vi token:
  // ham nay tra ve nguyen phan hoi do de trang login chuyen sang buoc
  // nhap ma; nguoc lai ap phien + vao trang chu nhu cu (tra ve null).
  async function login(email: string, password: string, remember: boolean) {
    const res = await $fetch<any>('/auth/admin/login', {
      baseURL: config.public.apiBase as string,
      method: 'POST',
      body: { email, password },
    });
    if (res?.requiresTwoFactor) return res;
    applySession(res, email, remember);
    await navigateTo('/');
    return null;
  }

  // Dang nhap buoc 2: gui ma TOTP kem challengeToken cua buoc 1.
  async function loginTwoFactor(challengeToken: string, code: string, email: string, remember: boolean) {
    const res = await $fetch<any>('/auth/admin/login/2fa', {
      baseURL: config.public.apiBase as string,
      method: 'POST',
      body: { challengeToken, code },
    });
    applySession(res, email, remember);
    await navigateTo('/');
  }

  // Đăng xuất: xóa sạch phiên rồi về /login. Nếu router SPA kẹt (trường
  // hợp hiếm) thì chuyển hướng cứng để nút luôn đưa về trang đăng nhập.
  async function logout() {
    clearCmsSession();
    token.value = null;
    user.value = null;
    role.value = '';
    permissions.value = [];
    await navigateTo('/login');
    if (process.client && window.location.pathname !== '/login') window.location.assign('/login');
  }

  function toggleDark() {
    dark.value = !dark.value;
    document.documentElement.classList.toggle('p-dark', dark.value);
    document.body.classList.toggle('light-mode', !dark.value);
  }

  return { token, user, role, permissions, loggedIn, can, login, loginTwoFactor, logout, dark, toggleDark };
}
