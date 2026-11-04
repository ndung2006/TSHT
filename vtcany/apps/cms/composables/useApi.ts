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
      // 401 = phiên hết hạn/không hợp lệ: xóa SẠCH phiên (không chỉ token)
      // rồi về /login; nếu router kẹt thì chuyển hướng cứng.
      if (e?.response?.status === 401 && process.client && route.path !== '/login') {
        clearCmsSession();
        await navigateTo('/login');
        if (window.location.pathname !== '/login') window.location.assign('/login');
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
