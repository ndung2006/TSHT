<template>
  <div class="flex min-h-[70vh] items-center justify-center p-5">
    <div class="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-center">
      <img src="/icons/vtc-any/logo-vtc-any-transparent.svg" alt="VTC ANY" width="156" height="66" class="mx-auto" />
      <h1 class="mt-2 text-lg font-bold">Đăng nhập</h1>
      <p class="mt-1 text-sm text-neutral-400">Đăng nhập để xem Truyền hình và dùng Yêu thích</p>

      <div class="mt-5 flex flex-col gap-3">
        <!-- Google -->
        <div v-if="googleClientId" ref="googleBtnWrap" class="flex justify-center"></div>
        <Button
          v-else
          label="Đăng nhập bằng Google"
          icon="pi pi-google"
          class="w-full !border-neutral-700 !bg-white !text-neutral-800"
          @click="oauthMissing('Google')"
        />
        <!-- Facebook -->
        <Button
          label="Đăng nhập bằng Facebook"
          icon="pi pi-facebook"
          class="w-full !border-0 !bg-[#1877F2]"
          @click="loginFacebook"
        />
      </div>

      <p v-if="notice" class="mt-3 text-sm" :class="noticeOk ? 'text-emerald-400' : 'text-amber-300'">{{ notice }}</p>

      <!-- Dang nhap bang email/SDT + mat khau (mat khau do admin cap trong CMS) -->
      <div class="mt-5 border-t border-neutral-800 pt-4 text-left">
        <p class="mb-2 text-sm font-medium text-neutral-300">Đăng nhập bằng tài khoản</p>
        <div class="flex flex-col gap-2">
          <InputText v-model="identifier" placeholder="Email hoặc số điện thoại" class="w-full" />
          <InputText v-model="password" type="password" placeholder="Mật khẩu" class="w-full" @keyup.enter="loginPassword" />
          <Button label="Đăng nhập" class="w-full" :loading="pwBusy" :disabled="!identifier.trim() || !password" @click="loginPassword" />
        </div>
      </div>

      <details class="mt-5 text-left">
        <summary class="cursor-pointer text-xs text-neutral-500">Dành cho developer: đăng nhập bằng token</summary>
        <div class="mt-2 flex gap-2">
          <InputText v-model="paste" placeholder="Dán access token (Bearer)" class="w-full" />
          <Button label="OK" size="small" @click="doTokenLogin" :disabled="!paste.trim()" />
        </div>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
useHead({ title: 'Đăng nhập - VTC ANY' });

const config = useRuntimeConfig();
const { login } = useAuth();
const googleClientId = config.public.googleClientId as string;
const facebookAppId = config.public.facebookAppId as string;

const notice = ref('');
const noticeOk = ref(false);
const paste = ref('');
const googleBtnWrap = ref<HTMLElement | null>(null);
const identifier = ref('');
const password = ref('');
const pwBusy = ref(false);

async function loginPassword() {
  const idf = identifier.value.trim();
  if (!idf || !password.value) return;
  pwBusy.value = true;
  say('Đang đăng nhập…');
  try {
    const res = await $fetch<{ accessToken: string }>('/auth/user/login', {
      baseURL: config.public.apiBase as string,
      method: 'POST',
      body: { identifier: idf, password: password.value },
    });
    login(res.accessToken);
    say('Đăng nhập thành công.', true);
    navigateTo('/');
  } catch (e: any) {
    const msg = e?.data || e?.message || '';
    say(String(msg).includes('bi khoa') ? 'Tài khoản đã bị khóa. Liên hệ admin.' : 'Sai email/SĐT hoặc mật khẩu.');
  } finally {
    pwBusy.value = false;
  }
}

function say(msg: string, ok = false) {
  notice.value = msg;
  noticeOk.value = ok;
}

function oauthMissing(provider: string) {
  say(`Chưa cấu hình ${provider} OAuth trên web. Liên hệ admin hoặc dùng đăng nhập token bên dưới.`);
}

async function exchange(provider: 'google' | 'facebook', idToken: string) {
  say('Đang đăng nhập…');
  try {
    const res = await $fetch<{ accessToken: string }>('/auth/oauth/' + provider, {
      baseURL: config.public.apiBase as string,
      method: 'POST',
      body: { idToken },
    });
    login(res.accessToken);
    say('Đăng nhập thành công.', true);
    navigateTo('/');
  } catch {
    say('Đăng nhập thất bại, vui lòng thử lại.');
  }
}

async function doTokenLogin() {
  const t = paste.value.trim();
  if (!t) return;
  try {
    await $fetch('/auth/me', {
      baseURL: config.public.apiBase as string,
      headers: { Authorization: `Bearer ${t}` },
    });
    login(t);
    navigateTo('/');
  } catch {
    say('Token không hợp lệ.');
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('load failed'));
    document.head.appendChild(s);
  });
}

// Google Identity Services — chỉ khi đã cấu hình client ID.
onMounted(async () => {
  if (!googleClientId || typeof window === 'undefined') return;
  try {
    await loadScript('https://accounts.google.com/gsi/client');
    const g = (window as any).google;
    g.accounts.id.initialize({
      client_id: googleClientId,
      callback: (resp: any) => exchange('google', resp.credential),
    });
    g.accounts.id.renderButton(googleBtnWrap.value, { theme: 'outline', size: 'large', width: 320, text: 'signin_with' });
  } catch {
    say('Không tải được Google Sign-In, thử lại sau.');
  }
});

async function loginFacebook() {
  if (!facebookAppId) {
    oauthMissing('Facebook');
    return;
  }
  if (typeof window === 'undefined') return;
  try {
    await loadScript('https://connect.facebook.net/vi_VN/sdk.js');
    const FB = (window as any).FB;
    FB.init({ appId: facebookAppId, cookie: true, xfbml: false, version: 'v19.0' });
    FB.login(
      (resp: any) => {
        if (resp?.authResponse?.accessToken) exchange('facebook', resp.authResponse.accessToken);
        else say('Bạn đã hủy đăng nhập Facebook.');
      },
      { scope: 'email,public_profile' },
    );
  } catch {
    say('Không tải được Facebook SDK, thử lại sau.');
  }
}
</script>
