// VTC ANY CMS — Bước 7/8: app quản trị (Nuxt 3 + PrimeVue + Tailwind, SSR).
// API base lấy từ runtime config: NUXT_PUBLIC_API_BASE (dev mặc định backend local).
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
      include: [
        'Button', 'InputText', 'Password', 'Checkbox', 'DataTable', 'Column',
        'Dialog', 'Dropdown', 'Calendar', 'InputNumber', 'InputSwitch',
        'MultiSelect', 'Textarea', 'Card', 'Tag', 'ProgressBar', 'Message',
        'Toast', 'ConfirmDialog',
      ],
    },
  },
  css: ['primeicons/primeicons.css', 'quill/dist/quill.snow.css', '@/assets/css/main.css'],
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:3001/api/v1',
    },
  },
  app: {
    head: {
      title: 'VTC ANY CMS',
      meta: [
        { name: 'robots', content: 'noindex, nofollow' },
        { name: 'theme-color', content: '#091728' },
      ],
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
        { rel: 'icon', href: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' },
      ],
    },
  },
  compatibilityDate: '2024-11-01',
});
