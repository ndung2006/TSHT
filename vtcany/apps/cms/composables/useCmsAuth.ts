// Phiên đăng nhập CMS: token + role/permissions/user, dark/light toggle.
const TOKEN_KEY = 'cms_token';

export function useCmsAuth() {
  const config = useRuntimeConfig();
  const token = useState<string | null>('cms-token', () => null);
  const user = useState<any>('cms-user', () => null);
  const role = useState<string>('cms-role', () => '');
  const permissions = useState<string[]>('cms-perms', () => []);
  const dark = useState<boolean>('cms-dark', () => true);

  if (process.client && token.value === null) {
    token.value = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
    try {
      user.value = JSON.parse(localStorage.getItem('cms_user') || sessionStorage.getItem('cms_user') || 'null');
      role.value = localStorage.getItem('cms_role') || sessionStorage.getItem('cms_role') || '';
      permissions.value = JSON.parse(localStorage.getItem('cms_perms') || sessionStorage.getItem('cms_perms') || '[]');
    } catch { /* bỏ qua cache hỏng */ }
    document.documentElement.classList.toggle('p-dark', dark.value);
    document.body.classList.toggle('light-mode', !dark.value);
  }

  const loggedIn = computed(() => !!token.value);
  const can = (perm: string) => permissions.value.includes('*') || permissions.value.includes(perm);

  async function login(email: string, password: string, remember: boolean) {
    const res = await $fetch<any>('/auth/admin/login', {
      baseURL: config.public.apiBase as string,
      method: 'POST',
      body: { email, password },
    });
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
    await navigateTo('/');
  }

  function logout() {
    for (const k of [TOKEN_KEY, 'cms_user', 'cms_role', 'cms_perms']) {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    }
    token.value = null;
    user.value = null;
    role.value = '';
    permissions.value = [];
    navigateTo('/login');
  }

  function toggleDark() {
    dark.value = !dark.value;
    document.documentElement.classList.toggle('p-dark', dark.value);
    document.body.classList.toggle('light-mode', !dark.value);
  }

  return { token, user, role, permissions, loggedIn, can, login, logout, dark, toggleDark };
}
