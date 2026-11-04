// Resolve hook CHI CHO TEST (node --test): source backend import kieu
// extensionless theo tsconfig (vd: './dashboard-helpers'), Node ESM
// khong resolve duoc kieu nay. Hook thu them '.ts' cho import tuong doi
// khong co extension. Khong anh huong code chay that (Nest build bang
// tsc, khong dung hook nay).
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const base = specifier.split('/').pop();
    // Chi coi la da co extension khi duoi thuoc loai file thuc
    // (.ts/.js/...). Ten module co dau cham (vd permissions.catalog)
    // khong phai extension — truoc day regex cu nhan nham '.catalog'
    // la extension nen khong them '.ts' va resolve that bai.
    if (!/\.(ts|js|mjs|cjs|json|node)$/.test(base)) {
      try {
        return await nextResolve(`${specifier}.ts`, context);
      } catch {
        // Roi xuong resolve mac dinh de bao loi goc.
      }
    }
  }
  return nextResolve(specifier, context);
}
