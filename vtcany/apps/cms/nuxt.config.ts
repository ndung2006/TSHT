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
  css: ['primeicons/primeicons.css', '@/assets/css/main.css'],
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
        { name: 'theme-color', content: '#0B1B33' },
      ],
      link: [{ rel: 'icon', href: '/logo.svg', type: 'image/svg+xml' }],
    },
  },
  compatibilityDate: '2024-11-01',
});
