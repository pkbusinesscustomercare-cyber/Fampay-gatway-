'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Copy,
  Check,
  QrCode,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

export default function MerchantTestPage() {
  const [amount, setAmount] = useState('149.00');
  const [customerName, setCustomerName] = useState('Rohan Verma');
  const [customerEmail, setCustomerEmail] = useState('rohan@example.com');
  const [note, setNote] = useState('Pro Subscription — 1 Month');
  const [redirectUrl, setRedirectUrl] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [createdOrder, setCreatedOrder] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [copiedKey, setCopiedKey] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined' && !redirectUrl) {
      setRedirectUrl(`${window.location.origin}/?payment=success`);
    }
  }, [redirectUrl]);

  const fetchRecentOrders = useCallback(async () => {
    try {
      setLoadingOrders(true);
      const res = await fetch('/api/create-order', { cache: 'no-store' });
      const data = await res.json();
      if (data.success && Array.isArray(data.orders)) {
        setOrders(data.orders);
      }
    } catch {
      // Ignore background fetch error on initial mount
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  useEffect(() => {
    fetchRecentOrders();
  }, [fetchRecentOrders]);

  async function handleCreateOrder(e) {
    e.preventDefault();
    setError('');
    setCreating(true);

    try {
      const response = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(amount),
          customerName,
          customerEmail,
          note,
          redirectUrl,
          webhookUrl,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to create order.');
      }

      setCreatedOrder(data);
      fetchRecentOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error creating order.');
    } finally {
      setCreating(false);
    }
  }

  async function copyValue(key, text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(''), 1800);
    } catch {
      // Clipboard fallback ignored
    }
  }

  const merchantName =
    process.env.NEXT_PUBLIC_MERCHANT_NAME || 'FamPay Merchant Store';
  const upiId = process.env.NEXT_PUBLIC_UPI_ID || 'merchant@fam';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-6 py-4">
          <Link
            href="/"
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            FamPay UPI Gateway
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#create-order" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Create Order
            </a>
            <a href="#recent-orders" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Transactions
            </a>
            <a href="#api-usage" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              API Integration
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={fetchRecentOrders}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh Ledger
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10 space-y-12">
        <section className="space-y-3 max-w-3xl">
          <p className="text-xs font-medium text-slate-500">
            Merchant VPA: <span className="font-mono text-slate-800">{upiId}</span> · Payee:{' '}
            <span className="text-slate-800">{merchantName}</span> · Zero MDR Direct Settlement
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            Self-Hosted Automated UPI Checkout & Verification Console
          </h1>
          <p className="text-base text-slate-600 leading-relaxed">
            Generate dynamic NPCI-compliant QR payment links stored in Firebase Firestore and
            reconcile incoming FamApp credit alerts automatically via serverless Gmail IMAP
            UTR verification.
          </p>
        </section>

        <section
          id="create-order"
          className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
        >
          <form
            onSubmit={handleCreateOrder}
            className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6"
          >
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-lg font-semibold text-slate-900">
                Create Test Payment Order
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Calls <code className="font-mono text-xs text-slate-800">POST /api/create-order</code>{' '}
                to persist a pending order and issue a checkout session.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label
                  htmlFor="order-amount"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Amount (INR ₹)
                </label>
                <input
                  id="order-amount"
                  type="number"
                  step="0.01"
                  min="1"
                  max="100000"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="customer-name"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Customer Name
                </label>
                <input
                  id="customer-name"
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="customer-email"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Customer Email (Optional)
                </label>
                <input
                  id="customer-email"
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="order-note"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Transaction Note (tn)
                </label>
                <input
                  id="order-note"
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="redirect-url"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Success Redirect URL (redirectUrl)
                </label>
                <input
                  id="redirect-url"
                  type="text"
                  placeholder="https://yourstore.com/order-success"
                  value={redirectUrl}
                  onChange={(e) => setRedirectUrl(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-mono text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="webhook-url"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Merchant Webhook Endpoint (webhookUrl, Optional)
                </label>
                <input
                  id="webhook-url"
                  type="url"
                  placeholder="https://yourstore.com/api/webhooks/fampay"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-mono text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>12-digit NPCI UTR replay protection active</span>
              </div>

              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
              >
                <QrCode className="h-4 w-4" />
                {creating ? 'Creating Order...' : 'Generate UPI Checkout Link'}
              </button>
            </div>
          </form>

          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-5">
            <h2 className="text-lg font-semibold text-slate-900">
              Issued Checkout Session
            </h2>

            {!createdOrder ? (
              <div className="py-10 text-center space-y-2 border border-dashed border-slate-200 rounded-lg px-4">
                <p className="text-sm font-medium text-slate-700">
                  No active checkout link generated yet
                </p>
                <p className="text-xs text-slate-500">
                  Submit the order form to create a Firestore pending transaction and receive
                  a live checkout URL and NPCI UPI URI.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-baseline justify-between border-b border-slate-100 pb-4">
                  <div>
                    <p className="text-xs text-slate-500">Order ID</p>
                    <p className="text-base font-mono font-semibold text-slate-900 tabular-nums">
                      {createdOrder.orderId}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Payable Amount</p>
                    <p className="text-xl font-mono font-bold text-slate-900 tabular-nums">
                      ₹{Number(createdOrder.amount).toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span>Hosted Checkout URL</span>
                      <button
                        type="button"
                        onClick={() => copyValue('checkout', createdOrder.checkoutUrl)}
                        className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900 font-medium"
                      >
                        {copiedKey === 'checkout' ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-600" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" /> Copy
                          </>
                        )}
                      </button>
                    </div>
                    <p className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 font-mono text-xs text-slate-800 break-all">
                      {createdOrder.checkoutUrl}
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span>NPCI UPI Deep-Link URI</span>
                      <button
                        type="button"
                        onClick={() => copyValue('upi', createdOrder.upiUri)}
                        className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900 font-medium"
                      >
                        {copiedKey === 'upi' ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-600" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" /> Copy
                          </>
                        )}
                      </button>
                    </div>
                    <p className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 font-mono text-xs text-slate-700 break-all">
                      {createdOrder.upiUri}
                    </p>
                  </div>
                </div>

                <Link
                  href={`/checkout/${createdOrder.orderId}`}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
                >
                  Open Live Checkout Page
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </div>
        </section>

        <section
          id="recent-orders"
          className="bg-white border border-slate-200 rounded-xl overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Recent Firestore Orders
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Live state from the <code className="font-mono">orders</code> collection
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {orders.length} records
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 px-6">Order ID</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">UTR Reference</th>
                  <th className="py-3 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {loadingOrders ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      Loading orders...
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No orders created yet. Generate your first UPI order above.
                    </td>
                  </tr>
                ) : (
                  orders.map((ord) => (
                    <tr key={ord.orderId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-6 font-mono text-xs font-medium text-slate-900 tabular-nums">
                        {ord.orderId}
                      </td>
                      <td className="py-3 px-4 text-slate-700">{ord.customerName}</td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-slate-900 tabular-nums">
                        ₹{Number(ord.amount).toFixed(2)}
                      </td>
                      <td className="py-3 px-4">
                        {ord.status === 'PAID' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            PAID
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                            <Clock className="h-3.5 w-3.5" />
                            {ord.status}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600 tabular-nums">
                        {ord.utr || '—'}
                      </td>
                      <td className="py-3 px-6 text-right">
                        <Link
                          href={`/checkout/${ord.orderId}`}
                          className="text-xs font-semibold text-slate-900 hover:underline whitespace-nowrap"
                        >
                          Open Checkout →
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section
          id="api-usage"
          className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-4"
        >
          <h2 className="text-lg font-semibold text-slate-900">
            Server-to-Server Order Creation Example
          </h2>
          <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs font-mono text-slate-100 leading-relaxed">
{`curl -X POST https://your-domain.vercel.app/api/create-order \\
  -H "Content-Type: application/json" \\
  -H "x-gateway-secret: YOUR_GATEWAY_SECRET_KEY" \\
  -d '{
    "amount": 499.00,
    "customerName": "Ananya Gupta",
    "note": "Invoice #INV-208",
    "redirectUrl": "https://merchant.example.com/thank-you",
    "webhookUrl": "https://merchant.example.com/api/fampay-webhook"
  }'`}
          </pre>
        </section>
      </main>
    </div>
  );
}
