// Dang ky resolve hook cho test (xem test-resolve-hooks.mjs).
// Chay: node --test --import ./test-hooks-register.mjs <test-file>
import { register } from 'node:module';

register('./test-resolve-hooks.mjs', import.meta.url);
