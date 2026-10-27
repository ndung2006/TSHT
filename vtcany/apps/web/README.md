# apps/web — Web Client (Nuxt 3 + Vue 3 + PrimeVue + Tailwind SSR, clone vtcplay.vn)

## Chạy local
```bash
cd apps/web
npm install
cp .env.example .env
npm run dev      # http://localhost:3000
```

Trỏ API khác: `NUXT_PUBLIC_API_BASE=https://api.vtcrd.top/api/v1 npm run dev`.

## Cấu trúc
- `layouts/default.vue` — sidebar trái (menu, tìm kiếm, QR, footer công ty)
- `pages/index.vue` — trang chủ: HeroCarousel + rails từ `GET /layout/home`
- `components/HeroCarousel.vue`, `components/RailCarousel.vue`
- `utils/url.ts` — helper slug-24hex (copy từ packages/contracts để build độc lập)
- Sitemap (Mục 1.2): `/phim`, `/short`, `/giai-tri`, `/truyen-hinh`,
  `/danh-muc/[slugId]`, `/phim/[slugId]`, `/video/[slugId]`, `/short/[slugId]`, `/tim-kiem?s=`
