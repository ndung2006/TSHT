// CHUAN BI dang nhap AD/LDAP (Goi 2D-2) — chi la khung cau hinh, CHUA noi
// AD that. Muc tieu cua goi la "chuan bi, chua thay JWT": dang nhap
// Local/JWT hien tai chay nguyen ven, duong AD chi duoc bat khi day du
// cau hinh may chu AD cua toa soan duoc cap qua env. Thieu bat ky truong
// bat buoc nao -> coi nhu chua cau hinh (fail-closed), khong doan gia tri.
//
// Khi noi that (buoc sau, ngoai goi nay): cai thu vien ldapts, bind bang
// tai khoan dich vu, search nguoi dung theo searchFilter, bind lai bang
// mat khau nguoi dung de xac thuc, roi anh xa sang AdminUser (tao moi neu
// chua co, role mac dinh do dieu phoi vien chot). Khong tu y lam truoc.

export interface LdapConfig {
  url: string;
  bindDn: string;
  bindPassword: string;
  searchBase: string;
  /** Bo loc tim nguoi dung; %s duoc thay bang dinh danh dang nhap da escape. */
  searchFilter: string;
  /** Thuoc tinh dinh danh (mac dinh userPrincipalName cho AD). */
  usernameAttribute: string;
}

/** Cac bien env bat buoc de coi la "da cau hinh AD". */
export const LDAP_REQUIRED_ENV = [
  'AUTH_LDAP_URL',
  'AUTH_LDAP_BIND_DN',
  'AUTH_LDAP_BIND_PASSWORD',
  'AUTH_LDAP_SEARCH_BASE',
] as const;

/**
 * Doc cau hinh LDAP tu env. Tra null neu thieu bat ky truong bat buoc
 * nao (duong AD tat). searchFilter mac dinh AD:
 * (&(objectClass=user)(userPrincipalName=%s)).
 */
export function ldapConfigFromEnv(env: Record<string, string | undefined>): LdapConfig | null {
  for (const key of LDAP_REQUIRED_ENV) {
    if (!env[key] || !String(env[key]).trim()) return null;
  }
  const url = String(env.AUTH_LDAP_URL).trim();
  if (!/^ldaps?:\/\//i.test(url)) return null;
  return {
    url,
    bindDn: String(env.AUTH_LDAP_BIND_DN).trim(),
    bindPassword: String(env.AUTH_LDAP_BIND_PASSWORD),
    searchBase: String(env.AUTH_LDAP_SEARCH_BASE).trim(),
    searchFilter:
      (env.AUTH_LDAP_SEARCH_FILTER && String(env.AUTH_LDAP_SEARCH_FILTER).trim()) ||
      '(&(objectClass=user)(userPrincipalName=%s))',
    usernameAttribute:
      (env.AUTH_LDAP_USERNAME_ATTRIBUTE && String(env.AUTH_LDAP_USERNAME_ATTRIBUTE).trim()) ||
      'userPrincipalName',
  };
}

export function isLdapConfigured(env: Record<string, string | undefined>): boolean {
  return ldapConfigFromEnv(env) !== null;
}

/** Escape dinh danh truoc khi nhet vao bo loc LDAP (RFC 4515). */
export function escapeLdapFilterValue(value: string): string {
  return String(value).replace(/[*()\\\u0000]/g, (ch) => {
    switch (ch) {
      case '*': return '\\2a';
      case '(': return '\\28';
      case ')': return '\\29';
      case '\\': return '\\5c';
      default: return '\\00';
    }
  });
}

/** Dien dinh danh dang nhap vao bo loc (sau khi escape). */
export function buildSearchFilter(config: LdapConfig, loginId: string): string {
  return config.searchFilter.replace(/%s/g, escapeLdapFilterValue(loginId));
}
