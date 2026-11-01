import React from 'react';
import { CheckCircle2, ArrowLeft, ExternalLink } from 'lucide-react';

interface MerchantCallbackViewProps {
  search: string;
  onNavigate: (path: string) => void;
}

export const MerchantCallbackView: React.FC<MerchantCallbackViewProps> = ({
  search,
  onNavigate,
}) => {
  const params = new URLSearchParams(search);
  const orderId = params.get('orderId') || 'Unknown';
  const status = params.get('status') || 'PAID';
  const utr = params.get('utr') || 'Verified';

  return (
    <div className="py-12 px-4 flex items-center justify-center">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 shrink-0">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">
              Merchant redirectUrl Callback Verified
            </p>
            <h1 className="text-xl font-bold text-slate-900">
              Order Completed & Redirected
            </h1>
          </div>
        </div>

        <p className="text-sm text-slate-600 leading-relaxed">
          The customer checkout automatically detected the FamApp credit email, verified
          the 12-digit NPCI UTR, marked the Firestore order as{' '}
          <span className="font-mono font-semibold text-slate-900">PAID</span>, and
          redirected back to the merchant callback URL.
        </p>

        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2.5 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Order ID</span>
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              {orderId}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Payment Status</span>
            <span className="font-mono font-semibold text-emerald-700">{status}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">12-Digit NPCI UTR</span>
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              {utr}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Return to Merchant Console
          </button>

          {orderId !== 'Unknown' && (
            <button
              type="button"
              onClick={() => onNavigate(`/checkout/${orderId}`)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              View Paid Receipt
              <ExternalLink className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
