<template>
  <div class="flex min-h-screen items-center justify-center bg-neutral-950 p-5">
    <div class="absolute right-5 top-5">
      <Button :icon="dark ? 'pi pi-sun' : 'pi pi-moon'" text rounded @click="toggleDark" aria-label="Đổi giao diện" />
    </div>
    <div class="surface-card w-full max-w-sm p-7 text-center">
      <img src="/logo.svg" alt="VTC ANY" width="150" height="64" class="mx-auto" />
      <h1 class="mt-3 text-lg font-bold">Đăng nhập quản trị</h1>
      <p class="mt-1 text-sm text-neutral-400">VTC ANY CMS</p>

      <Message v-if="error" severity="error" class="mt-4 justify-start">{{ error }}</Message>

      <form class="mt-5 flex flex-col gap-4 text-left" @submit.prevent="doLogin">
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
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false });
useHead({ title: 'Đăng nhập - VTC ANY CMS' });

const { login, dark, toggleDark } = useCmsAuth();
const email = ref('');
const password = ref('');
const remember = ref(true);
const loading = ref(false);
const error = ref('');

async function doLogin() {
  error.value = '';
  loading.value = true;
  try {
    await login(email.value.trim(), password.value, remember.value);
  } catch (e: any) {
    error.value = e?.response?.status === 401 ? 'Sai thông tin đăng nhập' : 'Đăng nhập thất bại, thử lại sau.';
  } finally {
    loading.value = false;
  }
}
</script>
