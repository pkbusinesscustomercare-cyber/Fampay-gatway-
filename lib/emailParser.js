import crypto from 'node:crypto';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

const FAMAPP_SENDER = 'no-reply@famapp.in';

/**
 * Builds an NPCI-compliant UPI URI (`upi://pay?...`) suitable for QR codes
 * and mobile deep-link intent buttons.
 */
export function buildUpiUri({ upiId, merchantName, amount, orderId, note = '' }) {
  const cleanUpiId = String(upiId || '').trim();
  if (!cleanUpiId || !cleanUpiId.includes('@')) {
    throw new Error('A valid merchant UPI ID (VPA) such as name@fam is required.');
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error('Order amount must be a positive number.');
  }

  const formattedAmount = numericAmount.toFixed(2);
  const cleanMerchant = String(merchantName || 'Merchant').trim().slice(0, 50);
  const cleanOrderId = String(orderId || '').trim();
  const transactionNote = String(note || `Order ${cleanOrderId}`).trim().slice(0, 80);

  const params = new URLSearchParams({
    pa: cleanUpiId,
    pn: cleanMerchant,
    am: formattedAmount,
    cu: 'INR',
    tn: transactionNote,
    tr: cleanOrderId,
  });

  // URLSearchParams encodes spaces as '+'; NPCI UPI apps handle '%20' most reliably across iOS & Android
  return `upi://pay?${params.toString().replace(/\+/g, '%20')}`;
}

/**
 * Compares two INR currency values safely within 0.005 floating-point tolerance.
 */
export function amountsMatch(expectedAmount, parsedAmount) {
  const a = Number(expectedAmount);
  const b = Number(parsedAmount);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(Math.round(a * 100) - Math.round(b * 100)) === 0;
}

/**
 * Strips HTML tags and normalizes whitespace so HTML-only FamApp emails parse cleanly.
 */
function stripHtmlToText(html = '') {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#8377;|&₹/gi, '₹')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts received INR `amount` and 12-digit NPCI `utr` (UPI Reference ID)
 * from a FamApp / FamPay transaction alert email.
 */
export function parseFamPayEmailContent({ subject = '', text = '', html = '' }) {
  const plainFromHtml = html ? stripHtmlToText(html) : '';
  const combined = `${subject}\n${text}\n${plainFromHtml}`.trim();

  if (!combined) {
    return { matched: false, amount: null, utr: null };
  }

  // 1. Extract INR Amount: matches ₹149.00, ₹ 1,250.50, Rs. 500, INR 99.00, etc.
  const amountPatterns = [
    /(?:received|credited|amount|paid)\s*(?:of|:|-)?\s*(?:₹|Rs\.?|INR)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /(?:₹|Rs\.?|INR)\s*([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:has\s+been\s+)?(?:received|credited)/i,
    /(?:₹|Rs\.?|INR)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /Amount\s*[:\-]\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
  ];

  let extractedAmount = null;
  for (const regex of amountPatterns) {
    const match = combined.match(regex);
    if (match && match[1]) {
      const normalized = Number(match[1].replace(/,/g, ''));
      if (Number.isFinite(normalized) && normalized > 0) {
        extractedAmount = Number(normalized.toFixed(2));
        break;
      }
    }
  }

  // 2. Extract 12-digit NPCI UTR / Reference ID
  const utrPatterns = [
    /(?:UTR|UPI\s*Ref(?:erence)?(?:\s*(?:No|ID|Number))?\.?|Ref(?:erence)?\s*(?:No|ID|Number)\.?|Transaction\s*ID|Txn\s*ID)\s*[:#\-]?\s*(\d{12})\b/i,
    /\b(\d{12})\b/,
  ];

  let extractedUtr = null;
  for (const regex of utrPatterns) {
    const match = combined.match(regex);
    if (match && match[1] && /^\d{12}$/.test(match[1])) {
      extractedUtr = match[1];
      break;
    }
  }

  return {
    matched: extractedAmount !== null && extractedUtr !== null,
    amount: extractedAmount,
    utr: extractedUtr,
  };
}

/**
 * Generates an HMAC-SHA256 hex signature for outgoing webhook payloads.
 */
export function signWebhookPayload(rawBody, secretKey) {
  const secret = String(secretKey || 'default-dev-secret');
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

/**
 * Checks whether real Gmail IMAP credentials are provided in environment variables.
 */
export function hasRealImapCredentials() {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.trim();
  if (!user || !pass) return false;
  if (
    user === 'your-fampay-linked-email@gmail.com' ||
    pass.toLowerCase().includes('xxxx')
  ) {
    return false;
  }
  return true;
}

/**
 * Sandbox unread email inbox for testing end-to-end FamPay verification locally
 * without live Gmail IMAP credentials.
 */
function getSandboxInbox() {
  if (!globalThis.__FAMPAY_SANDBOX_INBOX__) {
    globalThis.__FAMPAY_SANDBOX_INBOX__ = [];
  }
  return globalThis.__FAMPAY_SANDBOX_INBOX__;
}

export function enqueueSandboxFamPayEmail({
  from = FAMAPP_SENDER,
  subject,
  text,
  html = '',
  date = new Date(),
}) {
  const inbox = getSandboxInbox();
  const message = {
    uid: Date.now() + Math.floor(Math.random() * 1000),
    from,
    subject,
    text,
    html,
    seen: false,
    date: date instanceof Date ? date : new Date(date),
  };
  inbox.push(message);
  return message;
}

export function listSandboxFamPayEmails() {
  return [...getSandboxInbox()].reverse();
}

/**
 * Connects securely to Gmail IMAP (`imap.gmail.com:993`) via `imapflow`,
 * searches UNSEEN emails from `no-reply@famapp.in`, parses each email with `mailparser`,
 * matches `expectedAmount`, verifies UTR uniqueness via optional `isUtrUsed` callback,
 * marks the matched message as `\Seen`, and immediately logs out.
 *
 * @param {Object} options
 * @param {number} options.expectedAmount - Exact INR amount expected for the pending order
 * @param {number} [options.orderCreatedAtMs] - Timestamp (ms) when the order was created
 * @param {(utr: string) => Promise<boolean>} [options.isUtrUsed] - Checks if UTR already exists in DB
 */
export async function verifyFamPayPayment({
  expectedAmount,
  orderCreatedAtMs = 0,
  isUtrUsed = async () => false,
}) {
  // Allow 90 seconds clock-skew tolerance before order creation timestamp
  const earliestAllowedMs = orderCreatedAtMs > 0 ? orderCreatedAtMs - 90 * 1000 : 0;

  // Fallback to local sandbox inbox if Gmail credentials are not configured
  if (!hasRealImapCredentials()) {
    const inbox = getSandboxInbox();
    for (let i = inbox.length - 1; i >= 0; i--) {
      const msg = inbox[i];
      if (msg.seen) continue;
      if (!String(msg.from || '').toLowerCase().includes(FAMAPP_SENDER)) continue;
      if (earliestAllowedMs > 0 && msg.date.getTime() < earliestAllowedMs) continue;

      // Parse raw RFC822 MIME string through real `mailparser` simpleParser
      const rawMime = [
        `From: FamApp <${msg.from}>`,
        `Subject: ${msg.subject}`,
        `Date: ${msg.date.toUTCString()}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        '',
        msg.text || msg.html || '',
      ].join('\r\n');

      const parsedMail = await simpleParser(rawMime);
      const extracted = parseFamPayEmailContent({
        subject: parsedMail.subject || msg.subject,
        text: parsedMail.text || msg.text,
        html: typeof parsedMail.html === 'string' ? parsedMail.html : msg.html,
      });

      if (extracted.matched && amountsMatch(expectedAmount, extracted.amount)) {
        const duplicate = await isUtrUsed(extracted.utr);
        if (duplicate) {
          continue;
        }
        msg.seen = true;
        return {
          verified: true,
          source: 'sandbox-imap',
          amount: extracted.amount,
          utr: extracted.utr,
          emailDate: msg.date.toISOString(),
        };
      }
    }

    return {
      verified: false,
      source: 'sandbox-imap',
      amount: null,
      utr: null,
    };
  }

  // Production Serverless Gmail IMAP Connection (imap.gmail.com:993 over TLS)
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER.trim(),
      pass: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, ''),
    },
    logger: false,
    connectionTimeout: 10000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
  });

  let mailboxLock = null;

  try {
    await client.connect();
    mailboxLock = await client.getMailboxLock('INBOX');

    // Search only unread messages from no-reply@famapp.in
    const searchQuery = {
      seen: false,
      from: FAMAPP_SENDER,
    };

    const uids = await client.search(searchQuery, { uid: true });
    if (!uids || uids.length === 0) {
      return { verified: false, source: 'gmail-imap', amount: null, utr: null };
    }

    // Inspect newest unread FamApp emails first (limit to latest 15 for fast serverless execution)
    const recentUids = [...uids].sort((a, b) => b - a).slice(0, 15);

    for (const uid of recentUids) {
      const message = await client.fetchOne(
        uid,
        { uid: true, source: true, envelope: true, internalDate: true },
        { uid: true }
      );

      if (!message || !message.source) continue;

      const msgDate = message.internalDate
        ? new Date(message.internalDate)
        : message.envelope?.date
          ? new Date(message.envelope.date)
          : new Date();

      if (earliestAllowedMs > 0 && msgDate.getTime() < earliestAllowedMs) {
        continue;
      }

      const parsed = await simpleParser(message.source);
      const fromAddress =
        parsed.from?.value?.map((v) => v.address?.toLowerCase()).join(' ') || '';

      if (!fromAddress.includes(FAMAPP_SENDER)) {
        continue;
      }

      const extracted = parseFamPayEmailContent({
        subject: parsed.subject || '',
        text: parsed.text || '',
        html: typeof parsed.html === 'string' ? parsed.html : '',
      });

      if (extracted.matched && amountsMatch(expectedAmount, extracted.amount)) {
        const duplicate = await isUtrUsed(extracted.utr);
        if (duplicate) {
          continue;
        }

        // Mark matched FamApp alert email as read (\Seen)
        await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });

        return {
          verified: true,
          source: 'gmail-imap',
          amount: extracted.amount,
          utr: extracted.utr,
          emailDate: msgDate.toISOString(),
        };
      }
    }

    return { verified: false, source: 'gmail-imap', amount: null, utr: null };
  } finally {
    if (mailboxLock) {
      try {
        mailboxLock.release();
      } catch {
        // Ignore lock release errors during teardown
      }
    }
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }
}
