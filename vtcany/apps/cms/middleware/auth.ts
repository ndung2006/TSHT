// Chưa đăng nhập -> /login (token nằm ở localStorage nên chỉ check phía client).
export default defineNuxtRouteMiddleware(() => {
  if (!process.client) return;
  const token = localStorage.getItem('cms_token') || sessionStorage.getItem('cms_token');
  if (!token) return navigateTo('/login');
});
