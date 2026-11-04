// Chưa đăng nhập (không token, hoặc token đã quá hạn) -> xóa sạch phiên
// rồi về /login. Token nằm ở localStorage nên chỉ check phía client.
// Kiểm tra exp chỉ để chuyển hướng sớm; backend vẫn chặn cuối cùng.
export default defineNuxtRouteMiddleware(() => {
  if (!process.client) return;
  const token = readCmsToken();
  if (isCmsTokenExpired(token)) {
    clearCmsSession();
    return navigateTo('/login');
  }
});
