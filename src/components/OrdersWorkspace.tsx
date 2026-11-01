import React, { useState, useMemo } from 'react';
import {
  QrCode,
  ArrowUpRight,
  Copy,
  Check,
  CheckCircle2,
  Clock,
  AlertCircle,
  Search,
  MailPlus,
  ShieldCheck,
  Webhook,
} from 'lucide-react';
import type {
  OrderRecord,
  SandboxEmailRecord,
  WebhookDeliveryRecord,
} from '../types';

interface OrdersWorkspaceProps {
  orders: OrderRecord[];
  loadingOrders: boolean;
  sandboxEmails: SandboxEmailRecord[];
  webhookDeliveries: WebhookDeliveryRecord[];
  merchantName: string;
  upiId: string;
  onRefreshAll: () => Promise<void>;
  onNavigate: (path: string) => void;
}

export const OrdersWorkspace: React.FC<OrdersWorkspaceProps> = ({
  orders,
  loadingOrders,
  sandboxEmails,
  webhookDeliveries,
  merchantName,
  upiId,
  onRefreshAll,
  onNavigate,
}) => {
  // Create Order Form State
  const [amount, setAmount] = useState('149.00');
  const [customerName, setCustomerName] = useState('Rohan Verma');
  const [customerEmail, setCustomerEmail] = useState('rohan.verma@example.com');
  const [note, setNote] = useState('Pro API Plan — Monthly');
  const [redirectUrl, setRedirectUrl] = useState('/merchant/callback');
  const [webhookUrl, setWebhookUrl] = useState('/api/webhook-receiver');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  const [issuedOrder, setIssuedOrder] = useState<OrderRecord | null>(null);
  const [copiedField, setCopiedField] = useState('');

  // Orders Ledger Filter & Search State
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PAID' | 'PENDING'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // FamApp IMAP Simulator State
  const [simAmount, setSimAmount] = useState('149.00');
  const [simUtr, setSimUtr] = useState('');
  const [simPayer, setSimPayer] = useState('ROHAN VERMA');
  const [simSubmitting, setSimSubmitting] = useState(false);
  const [simFeedback, setSimFeedback] = useState('');

  const metrics = useMemo(() => {
    const paidOrders = orders.filter((o) => o.status === 'PAID');
    const pendingOrders = orders.filter((o) => o.status === 'PENDING');
    const paidVolume = paidOrders.reduce((acc, cur) => acc + Number(cur.amount || 0), 0);
    return {
      totalCount: orders.length,
      paidCount: paidOrders.length,
      pendingCount: pendingOrders.length,
      paidVolume,
    };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter((ord) => {
      if (statusFilter !== 'ALL' && ord.status !== statusFilter) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        ord.orderId.toLowerCase().includes(q) ||
        ord.customerName.toLowerCase().includes(q) ||
        (ord.utr && ord.utr.toLowerCase().includes(q)) ||
        String(ord.amount).includes(q)
      );
    });
  }, [orders, statusFilter, searchQuery]);

  async function handleCreateOrder(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 1 || parsedAmount > 100000) {
      setFormError('Enter a valid INR amount between ₹1.00 and ₹1,00,000.00.');
      return;
    }
    if (!customerName.trim()) {
      setFormError('Customer name is required.');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parsedAmount,
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim(),
          note: note.trim(),
          redirectUrl: redirectUrl.trim(),
          webhookUrl: webhookUrl.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create order.');
      }

      setIssuedOrder(data);
      setSimAmount(Number(data.amount).toFixed(2));
      await onRefreshAll();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to create order.');
    } finally {
      setCreating(false);
    }
  }

  async function handleSimulateEmail(e: React.FormEvent) {
    e.preventDefault();
    setSimFeedback('');

    const parsed = Number(simAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setSimFeedback('Error: Enter a positive INR amount.');
      return;
    }
    if (simUtr.trim() && !/^\d{12}$/.test(simUtr.trim())) {
      setSimFeedback('Error: Custom UTR must be exactly 12 digits (or leave blank for random).');
      return;
    }

    setSimSubmitting(true);
    try {
      const res = await fetch('/api/sandbox/simulate-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parsed,
          utr: simUtr.trim(),
          payerName: simPayer.trim() || 'UPI CUSTOMER',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to queue simulated email.');
      }
      setSimFeedback(data.message);
      setSimUtr('');
      await onRefreshAll();
    } catch (err) {
      setSimFeedback(err instanceof Error ? err.message : 'Simulation failed.');
    } finally {
      setSimSubmitting(false);
    }
  }

  async function copyToClipboard(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(key);
      setTimeout(() => setCopiedField(''), 1800);
    } catch {
      // Clipboard fallback ignored
    }
  }

  return (
    <div className="space-y-8">
      {/* Page Title & Metadata Row */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>Payee: {merchantName}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono text-slate-700">{upiId}</span>
          <span aria-hidden="true">·</span>
          <span>NPCI Dynamic QR + FamApp IMAP Reconciliation</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          Merchant Payment Operations & Test Console
        </h1>
      </div>

      {/* Clean 4-Column KPI Strip */}
      <div className="bg-white border border-slate-200 rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Settled Volume (INR)</p>
          <p className="mt-1.5 text-2xl font-mono font-bold text-slate-900 tabular-nums">
            ₹{metrics.paidVolume.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="mt-1 text-xs text-slate-500">0% MDR direct to VPA</p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Verified Paid Orders</p>
          <p className="mt-1.5 text-2xl font-mono font-bold text-emerald-700 tabular-nums">
            {metrics.paidCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">12-digit UTR matched</p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Pending Sessions</p>
          <p className="mt-1.5 text-2xl font-mono font-bold text-slate-900 tabular-nums">
            {metrics.pendingCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">3.5s active polling window</p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Signed Webhooks Sent</p>
          <p className="mt-1.5 text-2xl font-mono font-bold text-slate-900 tabular-nums">
            {webhookDeliveries.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">HMAC-SHA256 verified</p>
        </div>
      </div>

      {/* Create Order + Issued Checkout Link Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <form
          onSubmit={handleCreateOrder}
          className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5 flex flex-col justify-between"
        >
          <div className="space-y-5">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-base font-semibold text-slate-900">
                01. Create Dynamic UPI Order
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Persists a <code className="font-mono text-slate-800">PENDING</code> order in
                Firestore and generates an NPCI <code className="font-mono text-slate-800">upi://pay</code>{' '}
                checkout link.
              </p>
            </div>

            {formError && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700"
              >
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="create-amount"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Amount (INR ₹)
                </label>
                <input
                  id="create-amount"
                  type="number"
                  step="0.01"
                  min="1"
                  max="100000"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="create-customer"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Customer Name
                </label>
                <input
                  id="create-customer"
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="create-email"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Customer Email
                </label>
                <input
                  id="create-email"
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="create-note"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Transaction Note (tn)
                </label>
                <input
                  id="create-note"
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="create-redirect"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Redirect URL (redirectUrl)
                </label>
                <input
                  id="create-redirect"
                  type="text"
                  value={redirectUrl}
                  onChange={(e) => setRedirectUrl(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="create-webhook"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Webhook URL (webhookUrl)
                </label>
                <input
                  id="create-webhook"
                  type="text"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              Duplicate UTR replay protection enforced
            </span>

            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <QrCode className="h-4 w-4" />
              {creating ? 'Creating Order...' : 'Create UPI Payment Link'}
            </button>
          </div>
        </form>

        {/* Active Session Output Panel */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-base font-semibold text-slate-900">
                02. Issued Checkout Session
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Direct link & NPCI URI returned by <code className="font-mono">/api/create-order</code>
              </p>
            </div>

            {!issuedOrder ? (
              <div className="py-10 px-4 text-center border border-dashed border-slate-200 rounded-lg space-y-2">
                <p className="text-sm font-medium text-slate-700">
                  Ready to issue payment session
                </p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Click &ldquo;Create UPI Payment Link&rdquo; to generate an order ID, NPCI QR
                  payload, and live hosted checkout route.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-baseline justify-between border-b border-slate-100 pb-3">
                  <div>
                    <p className="text-xs text-slate-500">Order Reference</p>
                    <p
                      data-testid="issued-order-id"
                      className="text-sm font-mono font-semibold text-slate-900 tabular-nums"
                    >
                      {issuedOrder.orderId}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Amount</p>
                    <p className="text-xl font-mono font-bold text-slate-900 tabular-nums">
                      ₹{Number(issuedOrder.amount).toFixed(2)}
                    </p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Checkout URL</span>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          'checkout',
                          issuedOrder.checkoutUrl ||
                            `${window.location.origin}/checkout/${issuedOrder.orderId}`
                        )
                      }
                      className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-slate-900"
                    >
                      {copiedField === 'checkout' ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" /> Copy URL
                        </>
                      )}
                    </button>
                  </div>
                  <p className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 font-mono text-xs text-slate-800 break-all">
                    {issuedOrder.checkoutUrl || `/checkout/${issuedOrder.orderId}`}
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>NPCI UPI Deep Link (upi://pay)</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard('upi', issuedOrder.upiUri)}
                      className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-slate-900"
                    >
                      {copiedField === 'upi' ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" /> Copy URI
                        </>
                      )}
                    </button>
                  </div>
                  <p className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 font-mono text-xs text-slate-700 break-all">
                    {issuedOrder.upiUri}
                  </p>
                </div>
              </div>
            )}
          </div>

          {issuedOrder && (
            <button
              type="button"
              onClick={() => onNavigate(`/checkout/${issuedOrder.orderId}`)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors whitespace-nowrap"
            >
              Open Hosted Checkout Page
              <ArrowUpRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Firestore Orders Ledger */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Firestore Orders Ledger
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Real-time payment statuses, verified 12-digit UTRs, and checkout links
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Interactive Filter Segmented Control */}
            <div
              role="group"
              aria-label="Filter orders by status"
              className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
            >
              {(['ALL', 'PAID', 'PENDING'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    statusFilter === tab
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab === 'ALL' ? 'All Orders' : tab === 'PAID' ? 'Paid' : 'Pending'}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                aria-label="Search orders by ID, customer, or UTR"
                placeholder="Search ID, name, UTR..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 focus:border-slate-900 focus:outline-none w-48"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-3 px-6">Order ID</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">12-Digit UTR</th>
                <th className="py-3 px-4">Created</th>
                <th className="py-3 px-6 text-right">Checkout</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {loadingOrders ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    Loading Firestore orders...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    No matching orders found. Create a test order above or clear filters.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((ord) => (
                  <tr key={ord.orderId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-6 font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                      {ord.orderId}
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      <div className="font-medium text-slate-900">{ord.customerName}</div>
                      {ord.note && (
                        <div className="text-slate-500 truncate max-w-[180px]">{ord.note}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                      ₹{Number(ord.amount).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {ord.status === 'PAID' ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          PAID
                        </span>
                      ) : ord.status === 'EXPIRED' ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-red-700">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          EXPIRED
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-medium text-amber-700">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          PENDING
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700 tabular-nums whitespace-nowrap">
                      {ord.utr || '—'}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500 tabular-nums whitespace-nowrap">
                      {ord.createdAt
                        ? new Date(ord.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>
                    <td className="py-3 px-6 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onNavigate(`/checkout/${ord.orderId}`)}
                        className="font-semibold text-slate-900 hover:underline whitespace-nowrap"
                      >
                        {ord.status === 'PAID' ? 'Receipt →' : 'Pay / Poll →'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom 2-Column Testing Tools: FamApp IMAP Simulator + Signed Webhook Receiver */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* FamApp Email Parser & UTR Deduplication Tester */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-semibold text-slate-900">
              FamApp IMAP Inbox Simulator · no-reply@famapp.in
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Queue a realistic unread FamApp credit email to test{' '}
              <code className="font-mono text-slate-800">lib/emailParser.js</code> regex
              extraction and 12-digit UTR replay rejection.
            </p>
          </div>

          <form onSubmit={handleSimulateEmail} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="sim-amount"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Received ₹ Amount
                </label>
                <input
                  id="sim-amount"
                  type="number"
                  step="0.01"
                  required
                  value={simAmount}
                  onChange={(e) => setSimAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="sim-utr"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  12-Digit UTR (Optional)
                </label>
                <input
                  id="sim-utr"
                  type="text"
                  maxLength={12}
                  placeholder="Auto-generate"
                  value={simUtr}
                  onChange={(e) => setSimUtr(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono tabular-nums text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="sim-payer"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Sender Name
                </label>
                <input
                  id="sim-payer"
                  type="text"
                  value={simPayer}
                  onChange={(e) => setSimPayer(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                type="submit"
                disabled={simSubmitting}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                <MailPlus className="h-3.5 w-3.5" />
                {simSubmitting ? 'Queueing Email...' : 'Queue Unread FamApp Email'}
              </button>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {sandboxEmails.filter((e) => !e.seen).length} unseen in inbox
              </span>
            </div>

            {simFeedback && (
              <p className="text-xs font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                {simFeedback}
              </p>
            )}
          </form>
        </div>

        {/* Live Merchant Webhook Log */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Merchant Webhook Inspector · /api/webhook-receiver
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Background POST callbacks triggered when /api/verify-order marks an order PAID
              </p>
            </div>
            <Webhook className="h-4 w-4 text-slate-400 shrink-0" />
          </div>

          {webhookDeliveries.length === 0 ? (
            <div className="py-8 text-center border border-dashed border-slate-200 rounded-lg px-4 space-y-1">
              <p className="text-xs font-medium text-slate-700">
                No webhooks received yet
              </p>
              <p className="text-xs text-slate-500">
                Complete a payment with <code className="font-mono">/api/webhook-receiver</code> set
                as <code className="font-mono">webhookUrl</code> to inspect live signed POST payloads.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 max-h-52 overflow-y-auto">
              {webhookDeliveries.map((wh) => (
                <div key={wh.id} className="py-3 first:pt-0 last:pb-0 space-y-1 text-xs">
                  <div className="flex items-center justify-between font-mono">
                    <span className="font-semibold text-slate-900">
                      {wh.payload.orderId} · ₹{Number(wh.payload.amount || 0).toFixed(2)}
                    </span>
                    <span className="text-emerald-700">
                      {wh.signatureValid ? 'HMAC Verified' : 'Unsigned'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-500 font-mono tabular-nums">
                    <span>UTR: {wh.payload.utr}</span>
                    <span>{new Date(wh.receivedAt).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
