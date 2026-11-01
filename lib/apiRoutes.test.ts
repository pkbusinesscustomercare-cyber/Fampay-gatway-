import test from 'node:test';
import assert from 'node:assert/strict';
import { POST as createOrderPOST, GET as createOrderGET } from '../app/api/create-order/route.js';
import { POST as verifyOrderPOST } from '../app/api/verify-order/route.js';
import { enqueueSandboxFamPayEmail } from './emailParser.js';

test('End-to-end create-order -> verify-order -> FamApp IMAP match -> UTR duplicate protection', async () => {
  // 1. Create Order #1 for ₹412.50
  const createReq1 = new Request('http://localhost:3000/api/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: 412.5,
      customerName: 'Siddharth Rao',
      note: 'Annual License',
      redirectUrl: 'http://localhost:3000/merchant/callback',
    }),
  });

  const createRes1 = await createOrderPOST(createReq1);
  assert.equal(createRes1.status, 201);
  const order1 = await createRes1.json();
  assert.equal(order1.success, true);
  assert.equal(order1.status, 'PENDING');
  assert.ok(order1.upiUri.startsWith('upi://pay?'));
  assert.ok(order1.checkoutUrl.endsWith(`/checkout/${order1.orderId}`));

  // 2. Initial poll before email arrives -> remains PENDING
  const verifyReqPending = new Request('http://localhost:3000/api/verify-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: order1.orderId }),
  });
  const verifyResPending = await verifyOrderPOST(verifyReqPending);
  const pendingPayload = await verifyResPending.json();
  assert.equal(pendingPayload.paid, false);
  assert.equal(pendingPayload.status, 'PENDING');

  // 3. Simulate incoming FamApp email from no-reply@famapp.in with UTR 781234905612
  const uniqueUtr = '781234905612';
  enqueueSandboxFamPayEmail({
    from: 'no-reply@famapp.in',
    subject: 'You have received ₹412.50 on FamApp',
    text: `Hey! ₹412.50 received via UPI. UPI Ref No: ${uniqueUtr}`,
    date: new Date(),
  });

  // 4. Poll again -> verifies payment and transitions to PAID
  const verifyReqPaid = new Request('http://localhost:3000/api/verify-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: order1.orderId }),
  });
  const verifyResPaid = await verifyOrderPOST(verifyReqPaid);
  const paidPayload = await verifyResPaid.json();
  assert.equal(paidPayload.paid, true);
  assert.equal(paidPayload.status, 'PAID');
  assert.equal(paidPayload.utr, uniqueUtr);

  // 5. Create Order #2 for same ₹412.50 and attempt replay with same UTR 781234905612
  const createReq2 = new Request('http://localhost:3000/api/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: 412.5,
      customerName: 'Replay Attacker',
    }),
  });
  const order2 = await (await createOrderPOST(createReq2)).json();

  enqueueSandboxFamPayEmail({
    from: 'no-reply@famapp.in',
    subject: 'You have received ₹412.50 on FamApp',
    text: `Hey! ₹412.50 received via UPI. UPI Ref No: ${uniqueUtr}`,
    date: new Date(),
  });

  const verifyOrder2 = await (
    await verifyOrderPOST(
      new Request('http://localhost:3000/api/verify-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order2.orderId }),
      })
    )
  ).json();

  // Duplicate UTR must NOT mark Order #2 as PAID
  assert.equal(verifyOrder2.paid, false);
  assert.equal(verifyOrder2.status, 'PENDING');

  // 6. Verify GET /api/create-order?orderId=... returns PAID Order #1
  const getOrderRes = await createOrderGET(
    new Request(`http://localhost:3000/api/create-order?orderId=${order1.orderId}`)
  );
  const getOrderJson = await getOrderRes.json();
  assert.equal(getOrderJson.order.status, 'PAID');
  assert.equal(getOrderJson.order.utr, uniqueUtr);
});
