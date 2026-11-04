// Resolve hook CHI CHO TEST (node --test): source backend import kieu
// extensionless theo tsconfig (vd: './dashboard-helpers'), Node ESM
// khong resolve duoc kieu nay. Hook thu them '.ts' cho import tuong doi
// khong co extension. Khong anh huong code chay that (Nest build bang
// tsc, khong dung hook nay).
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    if (!/\.[a-zA-Z0-9]+$/.test(specifier)) {
      try {
        return await nextResolve(`${specifier}.ts`, context);
      } catch {
        // Roi xuong resolve mac dinh de bao loi goc.
      }
    }
  }
  return nextResolve(specifier, context);
}
