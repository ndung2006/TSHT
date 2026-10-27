// Trạng thái đăng nhập web (dùng cho chặn xem Truyền hình, Yêu thích).
export function useAuth() {
  const config = useRuntimeConfig();
  const token = useState<string | null>('vtc-token', () => null);
  const user = useState<Record<string, unknown> | null>('vtc-user', () => null);

  if (typeof window !== 'undefined' && token.value === null) {
    token.value = localStorage.getItem('vtc-token');
  }

  const loggedIn = computed(() => !!token.value);

  async function refreshMe() {
    if (!token.value) {
      user.value = null;
      return;
    }
    try {
      const me = await $fetch<Record<string, unknown>>('/auth/me', {
        baseURL: config.public.apiBase as string,
        headers: { Authorization: `Bearer ${token.value}` },
      });
      user.value = me;
    } catch {
      logout();
    }
  }

  function login(newToken: string) {
    token.value = newToken;
    localStorage.setItem('vtc-token', newToken);
    refreshMe();
  }

  function logout() {
    token.value = null;
    user.value = null;
    localStorage.removeItem('vtc-token');
  }

  return { token, user, loggedIn, login, logout, refreshMe };
}
