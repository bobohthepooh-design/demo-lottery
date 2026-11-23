import { describe, it, expect } from 'vitest';
import { isPasswordBreached, passwordSha1Suffix } from '../src/lib/haveibeenpwned.js';

// fake fetch คืน body แบบ HIBP range API: "SUFFIX5:COUNT\n..."
const fakeFetch = (body, status = 200) => async () => ({
  ok: status === 200,
  status,
  text: async () => body,
});

describe('HIBP k-anonymity password check', () => {
  it('detects breached password via range suffix match', async () => {
    // sha1("password123") = 42e1f47... — suffix หลัง 5 ตัวแรกคือ 1f47d8e1e7f6caa8...
    // ใช้ passwordSha1Suffix คำนวณ suffix ที่ต้อง match แทนการ hardcode
    const pw = 'hunter2hunter2';
    const suffix = passwordSha1Suffix(pw);
    const body = `AAAAA:1\n${suffix}:12345\nBBBBB:9`;
    const res = await isPasswordBreached(pw, fakeFetch(body));
    expect(res).toEqual({ breached: true, count: 12345 });
  });

  it('returns not-breached when suffix absent', async () => {
    const pw = 'unique-passphrase-xyz';
    const res = await isPasswordBreached(pw, fakeFetch('AAAAA:1\nCCCCC:2'));
    expect(res).toEqual({ breached: false, count: 0 });
  });

  it('fails open (breached:null) on network error', async () => {
    const boom = async () => { throw new Error('ECONNREFUSED'); };
    const res = await isPasswordBreached('any', boom);
    expect(res).toEqual({ breached: null, count: 0 });
  });

  it('fails open on non-200 response', async () => {
    const res = await isPasswordBreached('any', fakeFetch('oops', 503));
    expect(res).toEqual({ breached: null, count: 0 });
  });
});
