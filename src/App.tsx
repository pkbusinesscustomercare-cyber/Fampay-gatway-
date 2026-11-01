import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  FileCode2,
  RefreshCw,
  QrCode,
  BookOpen,
} from 'lucide-react';
import { OrdersWorkspace } from './components/OrdersWorkspace';
import { CheckoutView } from './components/CheckoutView';
import { MerchantCallbackView } from './components/MerchantCallbackView';
import { CodebaseExplorer } from './components/CodebaseExplorer';
import type {
  OrderRecord,
  SandboxEmailRecord,
  WebhookDeliveryRecord,
  ExportFileItem,
} from './types';

export function App() {
  const [pathname, setPathname] = useState<string>(() => window.location.pathname);
  const [search, setSearch] = useState<string>(() => window.location.search);

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loadingOrders, setLoadingOrders] = useState<boolean>(true);
  const [sandboxEmails, setSandboxEmails] = useState<SandboxEmailRecord[]>([]);
  const [webhookDeliveries, setWebhookDeliveries] = useState<WebhookDeliveryRecord[]>([]);
  const [merchantName, setMerchantName] = useState<string>('FamPay Merchant Store');
  const [upiId, setUpiId] = useState<string>('merchant@fam');
  const [imapMode, setImapMode] = useState<string>('sandbox-imap');
  const [firebaseMode, setFirebaseMode] = useState<string>('in-memory-firestore');

  const [exportFiles, setExportFiles] = useState<ExportFileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState<boolean>(false);

  const navigate = useCallback((to: string) => {
    const url = new URL(to, window.location.origin);
    window.history.pushState({}, '', `${url.pathname}${url.search}`);
    setPathname(url.pathname);
    setSearch(url.search);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setPathname(window.location.pathname);
      setSearch(window.location.search);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const refreshGatewayData = useCallback(async () => {
    try {
      const [ordersRes, statusRes] = await Promise.all([
        fetch('/api/create-order', { cache: 'no-store' }),
        fetch('/api/sandbox/status', { cache: 'no-store' }),
      ]);

      const ordersData = await ordersRes.json();
      if (ordersData.success && Array.isArray(ordersData.orders)) {
        setOrders(ordersData.orders);
      }

      const statusData = await statusRes.json();
      if (statusData.success) {
        setMerchantName(statusData.merchantName || 'FamPay Merchant Store');
        setUpiId(statusData.upiId || 'merchant@fam');
        setImapMode(statusData.imapMode || 'sandbox-imap');
        setFirebaseMode(statusData.firebaseMode || 'in-memory-firestore');
        setSandboxEmails(statusData.emails || []);
        setWebhookDeliveries(statusData.webhooks || []);
      }
    } catch {
      // Ignore transient refresh failure
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  useEffect(() => {
    void refreshGatewayData();
  }, [refreshGatewayData, pathname]);

  useEffect(() => {
    if ((pathname === '/files' || pathname === '/docs') && exportFiles.length === 0) {
      setLoadingFiles(true);
      fetch('/api/export-files')
        .then((r) => r.json())
        .then((data) => {
          if (data.success && Array.isArray(data.files)) {
            setExportFiles(data.files);
          }
        })
        .finally(() => setLoadingFiles(false));
    }
  }, [pathname, exportFiles.length]);

  const checkoutMatch = pathname.match(/^\/checkout\/([^/]+)$/);

  // Standalone customer-facing checkout layout for /checkout/[orderId]
  if (checkoutMatch) {
    const orderId = decodeURIComponent(checkoutMatch[1]);
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <CheckoutView orderId={orderId} imapMode={imapMode} onNavigate={navigate} />
      </div>
    );
  }

  const readmeFile = exportFiles.find((f) => f.path === 'README.md');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* Desktop Sidebar Navigation (256px) */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:shrink-0 border-r border-slate-200 bg-white">
        <div className="px-6 py-5 border-b border-slate-200">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap"
          >
            FamPay UPI Gateway
          </button>
          <p className="text-xs text-slate-500 mt-1">Self-Hosted NPCI Stack</p>
        </div>

        <nav aria-label="Workspace navigation" className="flex-1 p-4 space-y-1">
          <button
            type="button"
            onClick={() => navigate('/')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              pathname === '/'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            Merchant Console
          </button>

          <button
            type="button"
            onClick={() => {
              const firstPending =
                orders.find((o) => o.status === 'PENDING') || orders[0];
              if (firstPending) {
                navigate(`/checkout/${firstPending.orderId}`);
              } else {
                navigate('/');
              }
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors whitespace-nowrap"
          >
            <QrCode className="h-4 w-4 shrink-0" />
            Live QR Checkout Demo
          </button>

          <button
            type="button"
            onClick={() => navigate('/files')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              pathname === '/files'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <FileCode2 className="h-4 w-4 shrink-0" />
            Next.js Source Code
          </button>

          <button
            type="button"
            onClick={() => navigate('/docs')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              pathname === '/docs'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <BookOpen className="h-4 w-4 shrink-0" />
            Vercel & Firebase Guide
          </button>
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-2 text-xs text-slate-500">
          <div className="flex justify-between">
            <span>Database</span>
            <span className="font-mono text-slate-800">
              {firebaseMode === 'firebase-admin' ? 'Firestore Live' : 'Firestore Sandbox'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Email Engine</span>
            <span className="font-mono text-slate-800">
              {imapMode === 'gmail-imap' ? 'Gmail IMAP' : 'Sandbox IMAP'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Strict 3-Zone Top Bar */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-sm font-semibold text-slate-900 whitespace-nowrap shrink-0"
          >
            {pathname === '/files'
              ? 'Workspace / Next.js Repository'
              : pathname === '/docs'
                ? 'Workspace / Deployment Guide'
                : pathname === '/merchant/callback'
                  ? 'Workspace / Order Callback'
                  : 'Workspace / Payment Operations'}
          </button>

          <nav
            aria-label="Primary links"
            className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-600"
          >
            <button
              type="button"
              onClick={() => navigate('/')}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Console
            </button>
            <button
              type="button"
              onClick={() => navigate('/files')}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Source Files
            </button>
            <button
              type="button"
              onClick={() => navigate('/docs')}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Setup Guide
            </button>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => void refreshGatewayData()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Sync State
            </button>
          </div>
        </header>

        {/* Mobile Quick Navigation Strip */}
        <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => navigate('/')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap ${
              pathname === '/' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            Console
          </button>
          <button
            type="button"
            onClick={() => navigate('/files')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap ${
              pathname === '/files' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            Next.js Files
          </button>
          <button
            type="button"
            onClick={() => navigate('/docs')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap ${
              pathname === '/docs' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            Setup Guide
          </button>
        </div>

        <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
          {pathname === '/merchant/callback' ? (
            <MerchantCallbackView search={search} onNavigate={navigate} />
          ) : pathname === '/files' ? (
            <CodebaseExplorer files={exportFiles} loading={loadingFiles} />
          ) : pathname === '/docs' ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-slate-500">
                    README.md · Vercel + Firebase Service Account + Gmail App Password
                  </p>
                  <h1 className="text-2xl font-bold text-slate-900 mt-1">
                    Deployment & Self-Hosting Guide
                  </h1>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/files')}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
                >
                  Inspect All 11 Source Files
                </button>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
                {loadingFiles ? (
                  <p className="text-sm text-slate-500">Loading README.md...</p>
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm text-slate-800 leading-relaxed">
                    {readmeFile?.content || 'Documentation loaded from README.md.'}
                  </pre>
                )}
              </div>
            </div>
          ) : (
            <OrdersWorkspace
              orders={orders}
              loadingOrders={loadingOrders}
              sandboxEmails={sandboxEmails}
              webhookDeliveries={webhookDeliveries}
              merchantName={merchantName}
              upiId={upiId}
              onRefreshAll={refreshGatewayData}
              onNavigate={navigate}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
