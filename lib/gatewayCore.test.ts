import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUpiUri,
  amountsMatch,
  parseFamPayEmailContent,
  signWebhookPayload,
  enqueueSandboxFamPayEmail,
  verifyFamPayPayment,
} from './emailParser.js';

test('buildUpiUri creates NPCI standard upi://pay URI with formatted INR amount', () => {
  const uri = buildUpiUri({
    upiId: 'merchant@fam',
    merchantName: 'Acme Store',
    amount: 149.5,
    orderId: 'ORD-1001',
    note: 'Order ORD-1001',
  });

  assert.ok(uri.startsWith('upi://pay?'));
  assert.ok(uri.includes('pa=merchant%40fam'));
  assert.ok(uri.includes('pn=Acme%20Store'));
  assert.ok(uri.includes('am=149.50'));
  assert.ok(uri.includes('cu=INR'));
  assert.ok(uri.includes('tr=ORD-1001'));
});

test('buildUpiUri rejects invalid UPI VPA or non-positive amounts', () => {
  assert.throws(() =>
    buildUpiUri({
      upiId: 'invalid-vpa',
      merchantName: 'Store',
      amount: 100,
      orderId: 'ORD-1',
    })
  );

  assert.throws(() =>
    buildUpiUri({
      upiId: 'merchant@fam',
      merchantName: 'Store',
      amount: 0,
      orderId: 'ORD-1',
    })
  );
});

test('parseFamPayEmailContent extracts INR amount and 12-digit UTR across FamApp formats', () => {
  const sample1 = parseFamPayEmailContent({
    subject: 'You have received ₹1,499.50 on FamApp',
    text: 'Hey! You received ₹1,499.50 from ROHAN VERMA via UPI. UPI Ref No: 431298765432.',
  });
  assert.equal(sample1.matched, true);
  assert.equal(sample1.amount, 1499.5);
  assert.equal(sample1.utr, '431298765432');

  const sample2 = parseFamPayEmailContent({
    subject: 'Credit Alert from FamApp',
    html: '<div><p>Rs. 299.00 has been credited to your FamX account.</p><p>UTR: <b>609812345678</b></p></div>',
  });
  assert.equal(sample2.matched, true);
  assert.equal(sample2.amount, 299.0);
  assert.equal(sample2.utr, '609812345678');
});

test('amountsMatch handles floating point precision accurately', () => {
  assert.equal(amountsMatch(149.0, 149), true);
  assert.equal(amountsMatch(0.1 + 0.2, 0.3), true);
  assert.equal(amountsMatch(149.0, 149.01), false);
});

test('verifyFamPayPayment matches unread FamApp email and enforces UTR deduplication', async () => {
  const usedUtrs = new Set<string>();
  const createdMs = Date.now();

  enqueueSandboxFamPayEmail({
    from: 'no-reply@famapp.in',
    subject: 'You received ₹375.00 on FamApp',
    text: '₹375.00 credited to your FamX UPI account. UPI Reference ID: 519283746501',
    date: new Date(createdMs + 1000),
  });

  const firstAttempt = await verifyFamPayPayment({
    expectedAmount: 375,
    orderCreatedAtMs: createdMs,
    isUtrUsed: async (utr) => usedUtrs.has(utr),
  });

  assert.equal(firstAttempt.verified, true);
  assert.equal(firstAttempt.utr, '519283746501');
  assert.equal(firstAttempt.amount, 375);

  usedUtrs.add(firstAttempt.utr);

  // Even if another email arrives with the SAME UTR, duplicate UTR protection must reject it
  enqueueSandboxFamPayEmail({
    from: 'no-reply@famapp.in',
    subject: 'You received ₹375.00 on FamApp',
    text: '₹375.00 credited to your FamX UPI account. UPI Reference ID: 519283746501',
    date: new Date(createdMs + 2000),
  });

  const replayAttempt = await verifyFamPayPayment({
    expectedAmount: 375,
    orderCreatedAtMs: createdMs,
    isUtrUsed: async (utr) => usedUtrs.has(utr),
  });

  assert.equal(replayAttempt.verified, false);
});

test('signWebhookPayload produces deterministic 64-char hex HMAC-SHA256 digest', () => {
  const body = JSON.stringify({ orderId: 'ORD-100', status: 'PAID' });
  const sig1 = signWebhookPayload(body, 'secret_123');
  const sig2 = signWebhookPayload(body, 'secret_123');
  const sigDifferent = signWebhookPayload(body, 'secret_456');

  assert.equal(sig1.length, 64);
  assert.equal(sig1, sig2);
  assert.notEqual(sig1, sigDifferent);
});
