// $fetch bọc baseURL + Bearer token + tự về /login khi 401.
export function useApi() {
  const config = useRuntimeConfig();
  const route = useRoute();
  const baseURL = config.public.apiBase as string;

  function getToken(): string | null {
    if (!process.client) return null;
    return localStorage.getItem('cms_token') || sessionStorage.getItem('cms_token');
  }

  async function request<T>(path: string, opts: Record<string, any> = {}): Promise<T> {
    const token = getToken();
    try {
      return await $fetch<T>(path, {
        baseURL,
        ...opts,
        headers: {
          ...(opts.headers || {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    } catch (e: any) {
      if (e?.response?.status === 401 && process.client && route.path !== '/login') {
        localStorage.removeItem('cms_token');
        sessionStorage.removeItem('cms_token');
        await navigateTo('/login');
      }
      throw e;
    }
  }

  return {
    get: <T>(p: string, query?: Record<string, any>) => request<T>(p, { query }),
    post: <T>(p: string, body?: any, query?: Record<string, any>) => request<T>(p, { method: 'POST', body, query }),
    patch: <T>(p: string, body?: any) => request<T>(p, { method: 'PATCH', body }),
    put: <T>(p: string, body?: any, headers?: Record<string, string>) => request<T>(p, { method: 'PUT', body, headers }),
    del: <T>(p: string) => request<T>(p, { method: 'DELETE' }),
  };
}
