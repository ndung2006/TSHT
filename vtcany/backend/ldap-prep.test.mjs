// Test khung chuan bi AD/LDAP (Goi 2D-2): fail-closed khi thieu cau hinh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchFilter, escapeLdapFilterValue, isLdapConfigured, ldapConfigFromEnv,
} from './src/modules/auth/ldap-prep.ts';

const FULL = {
  AUTH_LDAP_URL: 'ldaps://dc.toasoan.local:636',
  AUTH_LDAP_BIND_DN: 'CN=svc-cms,OU=Service,DC=toasoan,DC=local',
  AUTH_LDAP_BIND_PASSWORD: 'secret',
  AUTH_LDAP_SEARCH_BASE: 'OU=Users,DC=toasoan,DC=local',
};

test('ldapConfigFromEnv: thieu truong bat buoc -> null (fail-closed)', () => {
  assert.equal(ldapConfigFromEnv({}), null);
  assert.equal(isLdapConfigured({}), false);
  const missing = { ...FULL };
  delete missing.AUTH_LDAP_BIND_PASSWORD;
  assert.equal(ldapConfigFromEnv(missing), null);
  assert.equal(ldapConfigFromEnv({ ...FULL, AUTH_LDAP_URL: 'dc.local' }), null); // sai scheme
});

test('ldapConfigFromEnv: du cau hinh -> gia tri mac dinh dung chuan AD', () => {
  const cfg = ldapConfigFromEnv(FULL);
  assert.ok(cfg);
  assert.equal(cfg.searchFilter, '(&(objectClass=user)(userPrincipalName=%s))');
  assert.equal(cfg.usernameAttribute, 'userPrincipalName');
  assert.equal(isLdapConfigured(FULL), true);
});

test('escapeLdapFilterValue + buildSearchFilter: chong injection bo loc', () => {
  assert.equal(escapeLdapFilterValue('a*b(c)d\\e'), 'a\\2ab\\28c\\29d\\5ce');
  const cfg = ldapConfigFromEnv(FULL);
  const f = buildSearchFilter(cfg, 'user*)(objectClass=*');
  assert.ok(!f.includes('user*)('));
  assert.ok(f.startsWith('(&(objectClass=user)(userPrincipalName=user\\2a'));
});
