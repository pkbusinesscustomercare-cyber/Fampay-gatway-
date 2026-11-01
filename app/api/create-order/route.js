import crypto from 'node:crypto';
import { db } from '../../../lib/firebaseAdmin.js';
import { buildUpiUri } from '../../../lib/emailParser.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function generateOrderId() {
  const randomSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
  const timeFragment = Date.now().toString(36).slice(-4).toUpperCase();
  return `ORD-${timeFragment}${randomSuffix}`;
}

function isValidHttpOrRelativeUrl(value) {
  if (!value) return true;
  const trimmed = String(value).trim();
  if (trimmed.startsWith('/')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function POST(request) {
  try {
    const configuredSecret = process.env.GATEWAY_SECRET_KEY?.trim();
    const providedSecret = request.headers.get('x-gateway-secret')?.trim();

    // If caller sends x-gateway-secret and GATEWAY_SECRET_KEY is configured, validate it strictly
    if (
      providedSecret &&
      configuredSecret &&
      configuredSecret !== 'replace_with_a_strong_32_byte_hex_secret' &&
      providedSecret !== configuredSecret
    ) {
      return Response.json(
        { success: false, error: 'Invalid x-gateway-secret header.' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return Response.json(
        { success: false, error: 'Invalid JSON request body.' },
        { status: 400 }
      );
    }

    const rawAmount = Number(body.amount);
    if (!Number.isFinite(rawAmount) || rawAmount < 1 || rawAmount > 100000) {
      return Response.json(
        {
          success: false,
          error: 'Amount must be a valid INR value between ₹1.00 and ₹1,00,000.00.',
        },
        { status: 400 }
      );
    }

    const amount = Number(rawAmount.toFixed(2));
    const merchantName =
      String(
        body.merchantName ||
          process.env.NEXT_PUBLIC_MERCHANT_NAME ||
          'FamPay Merchant Store'
      )
        .trim()
        .slice(0, 50);

    const upiId = String(
      body.upiId || process.env.NEXT_PUBLIC_UPI_ID || 'merchant@fam'
    ).trim();

    if (!upiId.includes('@')) {
      return Response.json(
        {
          success: false,
          error: 'Merchant UPI ID (NEXT_PUBLIC_UPI_ID) is invalid. Expected format: handle@fam.',
        },
        { status: 400 }
      );
    }

    const redirectUrl = body.redirectUrl ? String(body.redirectUrl).trim() : '';
    const webhookUrl = body.webhookUrl ? String(body.webhookUrl).trim() : '';

    if (!isValidHttpOrRelativeUrl(redirectUrl)) {
      return Response.json(
        { success: false, error: 'redirectUrl must be a valid URL or relative path.' },
        { status: 400 }
      );
    }

    if (!isValidHttpOrRelativeUrl(webhookUrl)) {
      return Response.json(
        { success: false, error: 'webhookUrl must be a valid HTTP/HTTPS URL.' },
        { status: 400 }
      );
    }

    const orderId = generateOrderId();
    const customerName = String(body.customerName || 'Guest Customer').trim().slice(0, 80);
    const customerEmail = String(body.customerEmail || '').trim().slice(0, 120);
    const note = String(body.note || `Order ${orderId}`).trim().slice(0, 80);

    const upiUri = buildUpiUri({
      upiId,
      merchantName,
      amount,
      orderId,
      note,
    });

    const origin = new URL(request.url).origin;
    const checkoutUrl = `${origin}/checkout/${orderId}`;
    const nowMs = Date.now();
    const createdAt = new Date(nowMs).toISOString();
    const expiresAt = new Date(nowMs + 15 * 60 * 1000).toISOString(); // 15-minute payment window

    const orderRecord = {
      orderId,
      amount,
      currency: 'INR',
      customerName,
      customerEmail,
      note,
      merchantName,
      upiId,
      upiUri,
      checkoutUrl,
      redirectUrl,
      webhookUrl,
      webhookDelivered: false,
      status: 'PENDING',
      utr: null,
      createdAt,
      createdAtMs: nowMs,
      paidAt: null,
      expiresAt,
      metadata:
        body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
    };

    await db.collection('orders').doc(orderId).set(orderRecord);

    return Response.json(
      {
        success: true,
        orderId,
        amount,
        currency: 'INR',
        status: 'PENDING',
        merchantName,
        upiId,
        upiUri,
        checkoutUrl,
        redirectUrl,
        webhookUrl,
        createdAt,
        expiresAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[create-order] Error:', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create UPI order.',
      },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId')?.trim();

    if (orderId) {
      const snap = await db.collection('orders').doc(orderId).get();
      if (!snap.exists) {
        return Response.json(
          { success: false, error: `Order ${orderId} not found.` },
          { status: 404 }
        );
      }
      return Response.json({ success: true, order: snap.data() });
    }

    const recentSnap = await db
      .collection('orders')
      .orderBy('createdAt', 'desc')
      .limit(25)
      .get();

    const orders = recentSnap.docs.map((doc) => doc.data());
    return Response.json({ success: true, orders });
  } catch (error) {
    console.error('[create-order GET] Error:', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch orders.',
      },
      { status: 500 }
    );
  }
}
