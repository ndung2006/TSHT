<template>
  <div class="flex min-h-screen items-center justify-center bg-neutral-950 p-5">
    <div class="absolute right-5 top-5">
      <Button :icon="dark ? 'pi pi-sun' : 'pi pi-moon'" text rounded @click="toggleDark" aria-label="Đổi giao diện" />
    </div>
    <div class="surface-card w-full max-w-sm p-7 text-center">
      <img src="/icons/vtc-tsht/logo-vtc-tsht-lockup.svg" alt="VTC TSHT - Tòa soạn hội tụ" width="150" height="72" class="mx-auto" />
      <h1 class="mt-3 text-lg font-bold">Đăng nhập quản trị</h1>
      <p class="mt-1 text-sm text-neutral-400">VTC ANY CMS</p>

      <Message v-if="error" severity="error" class="mt-4 justify-start">{{ error }}</Message>

      <form v-if="!challenge" class="mt-5 flex flex-col gap-4 text-left" @submit.prevent="doLogin">
        <div>
          <label class="field-label" for="email">Email</label>
          <InputText id="email" v-model="email" type="email" class="w-full" placeholder="admin@vtcany.vn" required autocomplete="username" />
        </div>
        <div>
          <label class="field-label" for="password">Mật khẩu</label>
          <Password id="password" v-model="password" class="w-full" input-class="w-full" toggle-mask
            placeholder="••••••••" :feedback="false" required autocomplete="current-password" />
        </div>
        <div class="flex items-center justify-between text-sm">
          <div class="flex items-center gap-2">
            <Checkbox v-model="remember" input-id="remember" binary />
            <label for="remember" class="text-neutral-400">Ghi nhớ đăng nhập</label>
          </div>
          <a href="#" class="text-neutral-400 hover:text-neutral-200" @click.prevent>Quên mật khẩu?</a>
        </div>
        <Button type="submit" label="Đăng nhập" :loading="loading"
          class="w-full !border-0 !bg-danger !text-white" />
      </form>

      <!-- Buoc 2 khi tai khoan da bat 2FA (Goi 2D-2) -->
      <form v-else class="mt-5 flex flex-col gap-4 text-left" @submit.prevent="doTwoFactor">
        <p class="text-sm text-neutral-400">Tài khoản đã bật xác thực 2 lớp. Nhập mã 6 số từ ứng dụng Authenticator của bạn (mã hiệu lực 5 phút).</p>
        <div>
          <label class="field-label" for="otp">Mã xác thực</label>
          <InputText id="otp" v-model="otp" class="w-full" placeholder="123456" inputmode="numeric"
            autocomplete="one-time-code" maxlength="6" required />
        </div>
        <Button type="submit" label="Xác thực" :loading="loading"
          class="w-full !border-0 !bg-danger !text-white" />
        <Button type="button" label="Quay lại" text @click="challenge = ''; otp = ''" />
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false });
useHead({ title: 'Đăng nhập - VTC ANY CMS' });

const { login, loginTwoFactor, dark, toggleDark } = useCmsAuth();
const email = ref('');
const password = ref('');
const remember = ref(true);
const loading = ref(false);
const error = ref('');
const challenge = ref('');
const otp = ref('');

async function doLogin() {
  error.value = '';
  loading.value = true;
  try {
    const res = await login(email.value.trim(), password.value, remember.value);
    if (res?.requiresTwoFactor) challenge.value = res.challengeToken || '';
  } catch (e: any) {
    error.value = e?.response?.status === 401 ? 'Sai thông tin đăng nhập' : 'Đăng nhập thất bại, thử lại sau.';
  } finally {
    loading.value = false;
  }
}

async function doTwoFactor() {
  error.value = '';
  loading.value = true;
  try {
    await loginTwoFactor(challenge.value, otp.value.trim(), email.value.trim(), remember.value);
  } catch (e: any) {
    error.value = e?.response?.status === 401 ? 'Mã xác thực sai hoặc đã hết hạn — đăng nhập lại để lấy mã mới.' : 'Xác thực thất bại, thử lại sau.';
  } finally {
    loading.value = false;
  }
}
</script>
