import { db } from '../../../lib/firebaseAdmin.js';
import { verifyFamPayPayment, signWebhookPayload } from '../../../lib/emailParser.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Fires an asynchronous signed HTTP POST webhook to the merchant's `webhookUrl`
 * when an order transitions to `PAID`.
 */
async function dispatchMerchantWebhook(order, requestOrigin) {
  if (!order.webhookUrl) return;

  const targetUrl = order.webhookUrl.startsWith('/')
    ? `${requestOrigin}${order.webhookUrl}`
    : order.webhookUrl;

  const payloadObject = {
    event: 'payment.captured',
    orderId: order.orderId,
    amount: order.amount,
    currency: order.currency || 'INR',
    status: 'PAID',
    utr: order.utr,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    note: order.note,
    paidAt: order.paidAt,
    metadata: order.metadata || {},
  };

  const rawPayload = JSON.stringify(payloadObject);
  const signature = signWebhookPayload(
    rawPayload,
    process.env.GATEWAY_SECRET_KEY || 'default-dev-secret'
  );

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'FamPay-UPI-Gateway/1.0',
        'X-Gateway-Event': 'payment.captured',
        'X-Gateway-Signature': signature,
      },
      body: rawPayload,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    await db
      .collection('orders')
      .doc(order.orderId)
      .update({
        webhookDelivered: response.ok,
        webhookStatusCode: response.status,
        webhookDispatchedAt: new Date().toISOString(),
      });
  } catch (err) {
    console.error(`[verify-order] Webhook delivery failed for ${order.orderId}:`, err);
    await db
      .collection('orders')
      .doc(order.orderId)
      .update({
        webhookDelivered: false,
        webhookError: err instanceof Error ? err.message : 'Network error',
        webhookDispatchedAt: new Date().toISOString(),
      })
      .catch(() => {});
  }
}

async function handleVerifyOrder(orderId, requestOrigin) {
  if (!orderId) {
    return Response.json(
      { success: false, error: 'orderId is required.' },
      { status: 400 }
    );
  }

  const orderRef = db.collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();

  if (!orderSnap.exists) {
    return Response.json(
      { success: false, error: `Order ${orderId} does not exist.` },
      { status: 404 }
    );
  }

  const order = orderSnap.data();

  // 1. Fast-path: If already marked PAID in Firestore, return immediately without IMAP scan
  if (order.status === 'PAID') {
    return Response.json({
      success: true,
      paid: true,
      status: 'PAID',
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency || 'INR',
      merchantName: order.merchantName,
      upiId: order.upiId,
      upiUri: order.upiUri,
      note: order.note,
      customerName: order.customerName,
      utr: order.utr,
      paidAt: order.paidAt,
      redirectUrl: order.redirectUrl || '',
      expiresAt: order.expiresAt,
      webhookDelivered: Boolean(order.webhookDelivered),
    });
  }

  // 2. Check 15-minute payment window expiry
  if (
    order.expiresAt &&
    Date.now() > new Date(order.expiresAt).getTime() &&
    order.status === 'PENDING'
  ) {
    await orderRef.update({ status: 'EXPIRED' });
    return Response.json({
      success: true,
      paid: false,
      status: 'EXPIRED',
      orderId: order.orderId,
      amount: order.amount,
      merchantName: order.merchantName,
      upiId: order.upiId,
      upiUri: order.upiUri,
      expiresAt: order.expiresAt,
      redirectUrl: order.redirectUrl || '',
    });
  }

  if (order.status !== 'PENDING') {
    return Response.json({
      success: true,
      paid: false,
      status: order.status,
      orderId: order.orderId,
      amount: order.amount,
      merchantName: order.merchantName,
      upiId: order.upiId,
      upiUri: order.upiUri,
      expiresAt: order.expiresAt,
      redirectUrl: order.redirectUrl || '',
    });
  }

  // 3. Order is PENDING -> Trigger FamApp Gmail IMAP Scanner
  const orderCreatedAtMs =
    order.createdAtMs || (order.createdAt ? new Date(order.createdAt).getTime() : 0);

  const imapResult = await verifyFamPayPayment({
    expectedAmount: order.amount,
    orderCreatedAtMs,
    isUtrUsed: async (candidateUtr) => {
      const existingUtrSnap = await db
        .collection('orders')
        .where('utr', '==', candidateUtr)
        .limit(1)
        .get();
      return !existingUtrSnap.empty;
    },
  });

  if (!imapResult.verified || !imapResult.utr) {
    return Response.json({
      success: true,
      paid: false,
      status: 'PENDING',
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency || 'INR',
      merchantName: order.merchantName,
      upiId: order.upiId,
      upiUri: order.upiUri,
      note: order.note,
      customerName: order.customerName,
      expiresAt: order.expiresAt,
      redirectUrl: order.redirectUrl || '',
    });
  }

  // 4. Final atomic guard against UTR duplication across orders
  const duplicateCheck = await db
    .collection('orders')
    .where('utr', '==', imapResult.utr)
    .limit(1)
    .get();

  if (!duplicateCheck.empty) {
    return Response.json({
      success: true,
      paid: false,
      status: 'PENDING',
      orderId: order.orderId,
      amount: order.amount,
      merchantName: order.merchantName,
      upiId: order.upiId,
      upiUri: order.upiUri,
      expiresAt: order.expiresAt,
      redirectUrl: order.redirectUrl || '',
    });
  }

  // 5. Mark Order as PAID in Firestore
  const paidAt = new Date().toISOString();
  const paidPatch = {
    status: 'PAID',
    utr: imapResult.utr,
    paidAt,
    verificationSource: imapResult.source,
  };

  await orderRef.update(paidPatch);

  const updatedOrder = { ...order, ...paidPatch };

  // 6. Trigger Merchant Webhook in the background without delaying checkout response
  if (updatedOrder.webhookUrl) {
    void dispatchMerchantWebhook(updatedOrder, requestOrigin);
  }

  return Response.json({
    success: true,
    paid: true,
    status: 'PAID',
    orderId: updatedOrder.orderId,
    amount: updatedOrder.amount,
    currency: updatedOrder.currency || 'INR',
    merchantName: updatedOrder.merchantName,
    upiId: updatedOrder.upiId,
    upiUri: updatedOrder.upiUri,
    note: updatedOrder.note,
    customerName: updatedOrder.customerName,
    utr: updatedOrder.utr,
    paidAt: updatedOrder.paidAt,
    redirectUrl: updatedOrder.redirectUrl || '',
    expiresAt: updatedOrder.expiresAt,
  });
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { searchParams, origin } = new URL(request.url);
    const orderId = String(body?.orderId || searchParams.get('orderId') || '').trim();
    return await handleVerifyOrder(orderId, origin);
  } catch (error) {
    console.error('[verify-order POST] Error:', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Verification failed.',
      },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  try {
    const { searchParams, origin } = new URL(request.url);
    const orderId = String(searchParams.get('orderId') || '').trim();
    return await handleVerifyOrder(orderId, origin);
  } catch (error) {
    console.error('[verify-order GET] Error:', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Verification failed.',
      },
      { status: 500 }
    );
  }
}
