import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

import {
  POST as createOrderPOST,
  GET as createOrderGET,
} from './app/api/create-order/route.js';
import {
  POST as verifyOrderPOST,
  GET as verifyOrderGET,
} from './app/api/verify-order/route.js';
import {
  enqueueSandboxFamPayEmail,
  listSandboxFamPayEmails,
  signWebhookPayload,
  hasRealImapCredentials,
} from './lib/emailParser.js';
import { hasRealFirebaseCredentials } from './lib/firebaseAdmin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;

interface WebhookLogEntry {
  id: string;
  receivedAt: string;
  event: string;
  signature: string;
  signatureValid: boolean;
  payload: Record<string, unknown>;
}

const webhookDeliveries: WebhookLogEntry[] = [];

const NEXTJS_PACKAGE_JSON = JSON.stringify(
  {
    name: 'fampay-automated-upi-gateway',
    version: '1.0.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
      lint: 'next lint',
    },
    dependencies: {
      'firebase-admin': '^13.0.2',
      imapflow: '^1.0.171',
      'lucide-react': '^0.475.0',
      mailparser: '^3.7.2',
      next: '^15.1.6',
      'qrcode.react': '^4.2.0',
      react: '^19.0.0',
      'react-dom': '^19.0.0',
    },
    devDependencies: {
      '@tailwindcss/postcss': '^4.0.0',
      postcss: '^8.5.1',
      tailwindcss: '^4.0.0',
    },
  },
  null,
  2
);

function buildWebRequest(req: express.Request): Request {
  const protocol =
    (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() ||
    req.protocol ||
    'http';
  const host = req.headers.host || `localhost:${PORT}`;
  const fullUrl = `${protocol}://${host}${req.originalUrl}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      headers.set(key, value.join(', '));
    } else if (typeof value === 'string') {
      headers.set(key, value);
    }
  }

  const method = req.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';

  return new Request(fullUrl, {
    method,
    headers,
    body: hasBody && req.body !== undefined ? JSON.stringify(req.body) : undefined,
  });
}

async function sendWebResponse(webRes: Response, res: express.Response) {
  res.status(webRes.status);
  webRes.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const text = await webRes.text();
  res.send(text);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // 1. Mount real Next.js App Router Route Handlers directly
  app.post('/api/create-order', async (req, res) => {
    const webReq = buildWebRequest(req);
    const webRes = await createOrderPOST(webReq);
    await sendWebResponse(webRes, res);
  });

  app.get('/api/create-order', async (req, res) => {
    const webReq = buildWebRequest(req);
    const webRes = await createOrderGET(webReq);
    await sendWebResponse(webRes, res);
  });

  app.post('/api/verify-order', async (req, res) => {
    const webReq = buildWebRequest(req);
    const webRes = await verifyOrderPOST(webReq);
    await sendWebResponse(webRes, res);
  });

  app.get('/api/verify-order', async (req, res) => {
    const webReq = buildWebRequest(req);
    const webRes = await verifyOrderGET(webReq);
    await sendWebResponse(webRes, res);
  });

  // 2. Sandbox FamApp IMAP Email Simulator (for testing without live Gmail IMAP credentials)
  app.get('/api/sandbox/status', (_req, res) => {
    res.json({
      success: true,
      firebaseMode: hasRealFirebaseCredentials() ? 'firebase-admin' : 'in-memory-firestore',
      imapMode: hasRealImapCredentials() ? 'gmail-imap' : 'sandbox-imap',
      merchantName: process.env.NEXT_PUBLIC_MERCHANT_NAME || 'FamPay Merchant Store',
      upiId: process.env.NEXT_PUBLIC_UPI_ID || 'merchant@fam',
      emails: listSandboxFamPayEmails(),
      webhooks: webhookDeliveries,
    });
  });

  app.post('/api/sandbox/simulate-email', (req, res) => {
    const rawAmount = Number(req.body?.amount);
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      res.status(400).json({ success: false, error: 'Valid positive INR amount is required.' });
      return;
    }

    const formattedAmount = rawAmount.toFixed(2);
    const customUtr = String(req.body?.utr || '').trim();
    const utr =
      /^\d{12}$/.test(customUtr)
        ? customUtr
        : `${Math.floor(100000 + Math.random() * 900000)}${Math.floor(
            100000 + Math.random() * 900000
          )}`;

    const payerName = String(req.body?.payerName || 'CUSTOMER VIA UPI').trim();

    const email = enqueueSandboxFamPayEmail({
      from: 'no-reply@famapp.in',
      subject: `You have received ₹${formattedAmount} on FamApp`,
      text: `Hey! You have received ₹${formattedAmount} from ${payerName} in your FamX account via UPI.\nUPI Ref No: ${utr}\nStatus: SUCCESS`,
      date: new Date(),
    });

    res.status(201).json({
      success: true,
      message: `Simulated unread email from no-reply@famapp.in for ₹${formattedAmount} (UTR: ${utr}).`,
      email: {
        uid: email.uid,
        from: email.from,
        subject: email.subject,
        utr,
        amount: Number(formattedAmount),
        date: email.date.toISOString(),
      },
    });
  });

  // 3. Built-in Merchant Webhook Receiver for verifying HMAC-SHA256 signatures end-to-end
  app.post('/api/webhook-receiver', (req, res) => {
    const rawPayload = JSON.stringify(req.body || {});
    const signature = String(req.headers['x-gateway-signature'] || '');
    const expectedSignature = signWebhookPayload(
      rawPayload,
      process.env.GATEWAY_SECRET_KEY || 'default-dev-secret'
    );

    const entry: WebhookLogEntry = {
      id: `WHK-${Date.now().toString(36).toUpperCase()}`,
      receivedAt: new Date().toISOString(),
      event: String(req.headers['x-gateway-event'] || req.body?.event || 'payment.captured'),
      signature,
      signatureValid: Boolean(signature) && signature === expectedSignature,
      payload: req.body || {},
    };

    webhookDeliveries.unshift(entry);
    if (webhookDeliveries.length > 30) {
      webhookDeliveries.pop();
    }

    res.status(200).json({ received: true, signatureValid: entry.signatureValid });
  });

  app.get('/api/webhook-receiver', (_req, res) => {
    res.json({ success: true, deliveries: webhookDeliveries });
  });

  // 4. Serve the 11 production Next.js App Router files directly from disk for inspection & export
  app.get('/api/export-files', async (_req, res) => {
    try {
      const diskFiles = [
        { path: 'next.config.js', diskPath: 'next.config.js', language: 'javascript' },
        { path: '.env.example', diskPath: '.env.example', language: 'bash' },
        { path: 'lib/firebaseAdmin.js', diskPath: 'lib/firebaseAdmin.js', language: 'javascript' },
        { path: 'lib/emailParser.js', diskPath: 'lib/emailParser.js', language: 'javascript' },
        { path: 'app/layout.jsx', diskPath: 'app/layout.jsx', language: 'jsx' },
        { path: 'app/page.jsx', diskPath: 'app/page.jsx', language: 'jsx' },
        {
          path: 'app/checkout/[orderId]/page.jsx',
          diskPath: 'app/checkout/[orderId]/page.jsx',
          language: 'jsx',
        },
        {
          path: 'app/api/create-order/route.js',
          diskPath: 'app/api/create-order/route.js',
          language: 'javascript',
        },
        {
          path: 'app/api/verify-order/route.js',
          diskPath: 'app/api/verify-order/route.js',
          language: 'javascript',
        },
        { path: 'app/globals.css', diskPath: 'app/globals.css', language: 'css' },
        { path: 'README.md', diskPath: 'README.md', language: 'markdown' },
      ];

      const loadedFiles = await Promise.all(
        diskFiles.map(async (f) => {
          const content = await fs.readFile(path.join(__dirname, f.diskPath), 'utf8');
          return {
            path: f.path,
            language: f.language,
            content,
          };
        })
      );

      const files = [
        {
          path: 'package.json',
          language: 'json',
          content: NEXTJS_PACKAGE_JSON,
        },
        ...loadedFiles,
      ];

      res.json({ success: true, files });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load repository files.',
      });
    }
  });

  // 5. Vite Middleware (Development) or Static Dist (Production)
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FamPay Automated UPI Payment Gateway running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start gateway server:', err);
  process.exit(1);
});
