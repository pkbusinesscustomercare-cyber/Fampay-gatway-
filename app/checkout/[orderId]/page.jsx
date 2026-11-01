'use client';

import { useState, useEffect, useRef, use } from 'react';
import Link from 'next/link';
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
} from 'lucide-react';

const POLL_INTERVAL_MS = 3500; // Poll /api/verify-order every 3.5 seconds

export default function CheckoutPage({ params }) {
  const resolvedParams =
    params && typeof params.then === 'function' ? use(params) : params || {};
  const orderId = resolvedParams.orderId;

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedVpa, setCopiedVpa] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(4);
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const isPollingRef = useRef(false);
  const hasRedirectedRef = useRef(false);

  // Initial load + 3.5-second polling against /api/verify-order
  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;

    async function verifyStatus() {
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
          setError(data.error || 'Unable to load payment session.');
          setLoading(false);
          return;
        }

        setOrder(data);
        setError('');
        setLoading(false);
      } catch {
        if (!cancelled && loading) {
          setError('Network error while checking payment status. Retrying...');
          setLoading(false);
        }
      } finally {
        isPollingRef.current = false;
      }
    }

    verifyStatus();

    const pollTimer = setInterval(() => {
      setOrder((current) => {
        if (current && (current.status === 'PAID' || current.status === 'EXPIRED')) {
          return current;
        }
        verifyStatus();
        return current;
      });
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(pollTimer);
    };
  }, [orderId]);

  // Countdown timer for 15-minute payment expiry
  useEffect(() => {
    if (!order?.expiresAt || order.status === 'PAID') return;

    function updateClock() {
      const diffSec = Math.max(
        0,
        Math.floor((new Date(order.expiresAt).getTime() - Date.now()) / 1000)
      );
      setRemainingSeconds(diffSec);
    }

    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, [order?.expiresAt, order?.status]);

  // Redirect customer automatically to `redirectUrl` once payment is PAID
  useEffect(() => {
    if (order?.status !== 'PAID' || !order.redirectUrl || hasRedirectedRef.current) {
      return;
    }

    const countdownInterval = setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          hasRedirectedRef.current = true;

          try {
            const target = new URL(order.redirectUrl, window.location.origin);
            target.searchParams.set('orderId', order.orderId);
            target.searchParams.set('status', 'PAID');
            if (order.utr) target.searchParams.set('utr', order.utr);
            window.location.assign(target.toString());
          } catch {
            window.location.assign(order.redirectUrl);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, [order?.status, order?.redirectUrl, order?.orderId, order?.utr]);

  async function handleCopyUpiId() {
    if (!order?.upiId) return;
    try {
      await navigator.clipboard.writeText(order.upiId);
      setCopiedVpa(true);
      setTimeout(() => setCopiedVpa(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  }

  function formatTimer(totalSec) {
    if (totalSec === null) return '15:00';
    const mins = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const secs = String(totalSec % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
          <div className="mx-auto h-8 w-8 rounded-full border-2 border-slate-300 border-t-slate-900 animate-spin" />
          <p className="text-sm font-medium text-slate-700">
            Initializing secure UPI session...
          </p>
        </div>
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
          <AlertCircle className="mx-auto h-10 w-10 text-red-600" />
          <h1 className="text-lg font-bold text-slate-900">Checkout Unavailable</h1>
          <p className="text-sm text-slate-600">{error}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Return to Merchant Store
          </Link>
        </div>
      </div>
    );
  }

  const isPaid = order?.status === 'PAID';
  const isExpired = order?.status === 'EXPIRED' || remainingSeconds === 0;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 flex flex-col items-center justify-center">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Merchant Console
          </Link>
          <span className="font-mono tabular-nums">{order.orderId}</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {/* Merchant & Payable Header */}
          <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Paying to</p>
              <h1 className="text-base font-bold text-slate-900 truncate">
                {order.merchantName ||
                  process.env.NEXT_PUBLIC_MERCHANT_NAME ||
                  'Verified Merchant'}
              </h1>
              <p className="text-xs font-mono text-slate-500 truncate">{order.upiId}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-slate-500">Amount</p>
              <p className="text-2xl font-mono font-bold text-slate-900 tabular-nums">
                ₹{Number(order.amount).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Payment Body */}
          <div className="p-6">
            {isPaid ? (
              <div className="py-6 text-center space-y-5">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                  <CheckCircle2 className="h-9 w-9" />
                </div>

                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-slate-900">Payment Successful</h2>
                  <p className="text-sm text-slate-600">
                    Your UPI payment of{' '}
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      ₹{Number(order.amount).toFixed(2)}
                    </span>{' '}
                    has been verified automatically.
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-left space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">NPCI UTR / Ref ID</span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      {order.utr}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Order Reference</span>
                    <span className="font-mono text-slate-800 tabular-nums">
                      {order.orderId}
                    </span>
                  </div>
                  {order.paidAt && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Verified At</span>
                      <span className="font-mono text-slate-800 tabular-nums">
                        {new Date(order.paidAt).toLocaleTimeString()}
                      </span>
                    </div>
                  )}
                </div>

                {order.redirectUrl && (
                  <div className="space-y-3 pt-1">
                    <p className="text-xs text-slate-500 tabular-nums">
                      Redirecting back to merchant in {redirectCountdown}s...
                    </p>
                    <a
                      href={order.redirectUrl}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
                    >
                      Continue to Merchant Now
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                )}
              </div>
            ) : isExpired ? (
              <div className="py-8 text-center space-y-4">
                <AlertCircle className="mx-auto h-10 w-10 text-amber-600" />
                <div className="space-y-1">
                  <h2 className="text-lg font-bold text-slate-900">
                    Payment Session Expired
                  </h2>
                  <p className="text-sm text-slate-600">
                    This dynamic QR code has expired. Please initiate a fresh checkout from
                    the merchant page.
                  </p>
                </div>
                <Link
                  href="/"
                  className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Create New Payment
                </Link>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Dynamic NPCI QR Code */}
                <div className="flex flex-col items-center">
                  <div className="p-4 bg-white border border-slate-200 rounded-xl">
                    <QRCodeSVG
                      value={order.upiUri}
                      size={216}
                      level="M"
                      includeMargin={false}
                    />
                  </div>
                  <p className="mt-3 text-xs text-slate-500 text-center">
                    Scan with FamApp, Google Pay, PhonePe, Paytm, or any BHIM UPI app
                  </p>
                </div>

                {/* Direct Mobile UPI Intent Button */}
                <div className="space-y-2.5">
                  <a
                    href={order.upiUri}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
                  >
                    <Smartphone className="h-4 w-4" />
                    Pay via UPI
                  </a>

                  <button
                    type="button"
                    onClick={handleCopyUpiId}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    {copiedVpa ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        Copied VPA ({order.upiId})
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copy UPI ID: {order.upiId}
                      </>
                    )}
                  </button>
                </div>

                {/* Live 3.5s Auto-Verification Status Footer */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <div className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 border-t-slate-800 animate-spin shrink-0" />
                    <span>Awaiting UPI confirmation (auto-checks every 3.5s)</span>
                  </div>
                  <div className="inline-flex items-center gap-1 font-mono font-medium text-slate-800 tabular-nums shrink-0">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    {formatTimer(remainingSeconds)}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-slate-700" />
              NPCI Standard UPI URI · Zero Fee
            </span>
            <span>Automated UTR Match</span>
          </div>
        </div>
      </div>
    </div>
  );
}
