import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  CheckCircle2,
  Clock,
  Copy,
  Check,
  Smartphone,
  ShieldCheck,
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  MailCheck,
} from 'lucide-react';
import type { OrderRecord } from '../types';

const POLL_INTERVAL_MS = 3500;

interface CheckoutViewProps {
  orderId: string;
  imapMode: string;
  onNavigate: (path: string) => void;
}

export const CheckoutView: React.FC<CheckoutViewProps> = ({
  orderId,
  imapMode,
  onNavigate,
}) => {
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedVpa, setCopiedVpa] = useState(false);
  const [copiedUri, setCopiedUri] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(4);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [simMessage, setSimMessage] = useState('');

  const isPollingRef = useRef(false);
  const hasRedirectedRef = useRef(false);

  // Poll /api/verify-order every 3.5 seconds
  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;

    async function verifyOrderNow() {
      if (isPollingRef.current) return;
      isPollingRef.current = true;

      try {
        const res = await fetch('/api/verify-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId }),
          cache: 'no-store',
        });

        const data = await res.json();
        if (cancelled) return;

        if (!res.ok || !data.success) {
          setError(data.error || 'Unable to load checkout session.');
          setLoading(false);
          return;
        }

        setOrder(data);
        setError('');
        setLoading(false);
      } catch {
        if (!cancelled && loading) {
          setError('Network error while checking payment status.');
          setLoading(false);
        }
      } finally {
        isPollingRef.current = false;
      }
    }

    verifyOrderNow();

    const intervalId = window.setInterval(() => {
      setOrder((prev) => {
        if (prev && (prev.status === 'PAID' || prev.status === 'EXPIRED')) {
          return prev;
        }
        void verifyOrderNow();
        return prev;
      });
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [orderId]);

  // Update 15-minute session expiry timer
  useEffect(() => {
    if (!order?.expiresAt || order.status === 'PAID') return;

    const updateTimer = () => {
      const diff = Math.max(
        0,
        Math.floor((new Date(order.expiresAt).getTime() - Date.now()) / 1000)
      );
      setRemainingSeconds(diff);
    };

    updateTimer();
    const id = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(id);
  }, [order?.expiresAt, order?.status]);

  // Redirect customer to redirectUrl once PAID
  useEffect(() => {
    if (order?.status !== 'PAID' || !order.redirectUrl || hasRedirectedRef.current) {
      return;
    }

    const redirectTimer = window.setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(redirectTimer);
          hasRedirectedRef.current = true;
          performRedirect(order);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(redirectTimer);
  }, [order?.status, order?.redirectUrl, order?.orderId, order?.utr]);

  function performRedirect(paidOrder: OrderRecord) {
    if (!paidOrder.redirectUrl) return;
    try {
      const resolved = new URL(paidOrder.redirectUrl, window.location.origin);
      resolved.searchParams.set('orderId', paidOrder.orderId);
      resolved.searchParams.set('status', 'PAID');
      if (paidOrder.utr) {
        resolved.searchParams.set('utr', paidOrder.utr);
      }

      if (resolved.origin === window.location.origin) {
        onNavigate(`${resolved.pathname}${resolved.search}`);
      } else {
        window.location.assign(resolved.toString());
      }
    } catch {
      onNavigate('/');
    }
  }

  async function handleCopyVpa() {
    if (!order?.upiId) return;
    try {
      await navigator.clipboard.writeText(order.upiId);
      setCopiedVpa(true);
      setTimeout(() => setCopiedVpa(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  }

  async function handleCopyUri() {
    if (!order?.upiUri) return;
    try {
      await navigator.clipboard.writeText(order.upiUri);
      setCopiedUri(true);
      setTimeout(() => setCopiedUri(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  }

  async function handleSimulateIncomingFamAppEmail() {
    if (!order) return;
    setSimulating(true);
    setSimMessage('');
    try {
      const res = await fetch('/api/sandbox/simulate-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: order.amount,
          payerName: order.customerName || 'RAHUL SHARMA',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSimMessage(
          `FamApp alert queued (UTR ${data.email.utr}). Next 3.5s poll will verify automatically...`
        );
      }
    } finally {
      setSimulating(false);
    }
  }

  function formatMmSs(seconds: number | null) {
    if (seconds === null) return '15:00';
    const m = String(Math.floor(seconds / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  if (loading) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
          <div className="mx-auto h-8 w-8 rounded-full border-2 border-slate-300 border-t-slate-900 animate-spin" />
          <p className="text-sm font-medium text-slate-700">
            Loading NPCI UPI checkout session...
          </p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
          <AlertCircle className="mx-auto h-10 w-10 text-red-600" />
          <h1 className="text-lg font-bold text-slate-900">Checkout Session Not Found</h1>
          <p className="text-sm text-slate-600">
            {error || `Order ${orderId} could not be loaded.`}
          </p>
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Merchant Console
          </button>
        </div>
      </div>
    );
  }

  const isPaid = order.status === 'PAID';
  const isExpired = order.status === 'EXPIRED' || remainingSeconds === 0;

  return (
    <div className="py-8 px-4 flex flex-col items-center justify-center">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="inline-flex items-center gap-1.5 font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Merchant Console
          </button>
          <span className="font-mono tabular-nums">{order.orderId}</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {/* Payee & Amount Header */}
          <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Paying to</p>
              <h1 className="text-base font-bold text-slate-900 truncate">
                {order.merchantName}
              </h1>
              <p className="text-xs font-mono text-slate-500 truncate">{order.upiId}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-slate-500">Payable</p>
              <p
                data-testid="checkout-amount"
                className="text-2xl font-mono font-bold text-slate-900 tabular-nums"
              >
                ₹{Number(order.amount).toFixed(2)}
              </p>
            </div>
          </div>

          <div className="p-6">
            {isPaid ? (
              <div data-testid="payment-success-panel" className="py-5 text-center space-y-5">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                  <CheckCircle2 className="h-9 w-9" />
                </div>

                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-slate-900">Payment Successful</h2>
                  <p className="text-sm text-slate-600">
                    Verified{' '}
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      ₹{Number(order.amount).toFixed(2)}
                    </span>{' '}
                    via FamApp UPI alert.
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-left space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">12-Digit UTR</span>
                    <span
                      data-testid="verified-utr"
                      className="font-mono font-semibold text-slate-900 tabular-nums"
                    >
                      {order.utr}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Order ID</span>
                    <span className="font-mono text-slate-800 tabular-nums">
                      {order.orderId}
                    </span>
                  </div>
                  {order.paidAt && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Timestamp</span>
                      <span className="font-mono text-slate-800 tabular-nums">
                        {new Date(order.paidAt).toLocaleTimeString()}
                      </span>
                    </div>
                  )}
                </div>

                {order.redirectUrl && (
                  <div className="space-y-3 pt-1">
                    <p className="text-xs text-slate-500 tabular-nums">
                      Redirecting to merchant in {redirectCountdown}s...
                    </p>
                    <button
                      type="button"
                      onClick={() => performRedirect(order)}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
                    >
                      Continue to Merchant Now
                      <ExternalLink className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            ) : isExpired ? (
              <div className="py-8 text-center space-y-4">
                <AlertCircle className="mx-auto h-10 w-10 text-amber-600" />
                <div className="space-y-1">
                  <h2 className="text-lg font-bold text-slate-900">
                    Payment Window Expired
                  </h2>
                  <p className="text-sm text-slate-600">
                    This dynamic QR code has expired after 15 minutes. Create a new order
                    to continue.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('/')}
                  className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Create New Order
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Dynamic QR Code */}
                <div className="flex flex-col items-center">
                  <div
                    data-testid="upi-qr-container"
                    className="p-4 bg-white border border-slate-200 rounded-xl"
                  >
                    <QRCodeSVG
                      value={order.upiUri}
                      size={216}
                      level="M"
                      includeMargin={false}
                    />
                  </div>
                  <p className="mt-3 text-xs text-slate-500 text-center">
                    Scan using FamApp, Google Pay, PhonePe, Paytm, or BHIM UPI
                  </p>
                </div>

                {/* Mobile Direct UPI Intent + Copy Helpers */}
                <div className="space-y-2.5">
                  <a
                    href={order.upiUri}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap"
                  >
                    <Smartphone className="h-4 w-4" />
                    Pay via UPI
                  </a>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={handleCopyVpa}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
                    >
                      {copiedVpa ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          Copied VPA
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Copy UPI ID
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyUri}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
                    >
                      {copiedUri ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          Copied URI
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Copy UPI URI
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Auto-Polling Status Row */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <div className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 border-t-slate-800 animate-spin shrink-0" />
                    <span>Polling verification every 3.5s</span>
                  </div>
                  <div className="inline-flex items-center gap-1 font-mono font-medium text-slate-800 tabular-nums shrink-0">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    {formatMmSs(remainingSeconds)}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-slate-700" />
              NPCI UPI Standard · Zero MDR
            </span>
            <span>12-Digit UTR Verified</span>
          </div>
        </div>

        {/* Sandbox Payment Trigger when running without live Gmail credentials */}
        {!isPaid && !isExpired && imapMode === 'sandbox-imap' && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-900">
                  Sandbox Test Trigger · no-reply@famapp.in
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Simulate an incoming FamApp credit email for ₹
                  {Number(order.amount).toFixed(2)} to test live 3.5s auto-verification.
                </p>
              </div>
              <button
                type="button"
                disabled={simulating}
                onClick={handleSimulateIncomingFamAppEmail}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
              >
                <MailCheck className="h-3.5 w-3.5" />
                {simulating ? 'Sending...' : 'Simulate FamApp Payment'}
              </button>
            </div>
            {simMessage && (
              <p className="text-xs font-mono text-emerald-700">{simMessage}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
