// Bước 3/8 — Nuxt 3 + Vue 3 + PrimeVue + Tailwind SSR (clone vtcplay.vn).
// API base lấy từ runtime config: NUXT_PUBLIC_API_BASE (prod trỏ api.vtcany.vn).
// Theme Aura: bắt buộc để Dialog/Accordion/Carousel render đúng (overlay, pill...).
import Aura from '@primeuix/themes/aura';

export default defineNuxtConfig({
  modules: ['@primevue/nuxt-module', '@nuxtjs/tailwindcss'],
  primevue: {
    options: {
      ripple: true,
      theme: {
        preset: Aura,
        options: { darkModeSelector: '.p-dark' },
      },
    },
    components: {
      include: ['Carousel', 'Button', 'InputText', 'Skeleton', 'Accordion', 'AccordionPanel', 'AccordionHeader', 'AccordionContent', 'Dialog'],
    },
  },
  css: ['primeicons/primeicons.css', '@/assets/css/main.css'],
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:3001/api/v1',
      // false = xem Truyền hình không cần login (đặt NUXT_PUBLIC_REQUIRE_LOGIN_TV=true để chặn như VTC Play).
      requireLoginTv: process.env.NUXT_PUBLIC_REQUIRE_LOGIN_TV === 'true',
      // OAuth web (dialog đăng nhập kiểu VTC Play: Google + Facebook).
      // Chưa set = nút bấm sẽ báo chưa cấu hình, vẫn dùng được đăng nhập token dev.
      googleClientId: process.env.NUXT_PUBLIC_GOOGLE_CLIENT_ID || '',
      facebookAppId: process.env.NUXT_PUBLIC_FACEBOOK_APP_ID || '',
    },
  },
  app: {
    head: {
      title: 'VTC ANY',
      meta: [
        { name: 'robots', content: 'noindex, nofollow' },
        { name: 'theme-color', content: '#091728' },
      ],
      link: [
        { rel: 'icon', href: '/icons/vtc-any/favicon.ico', sizes: 'any' },
        { rel: 'icon', href: '/icons/vtc-any/favicon.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/icons/vtc-any/apple-touch-icon.png' },
        { rel: 'manifest', href: '/icons/vtc-any/site.webmanifest' },
      ],
    },
  },
  compatibilityDate: '2024-11-01',
});
