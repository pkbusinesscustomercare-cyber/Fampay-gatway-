import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Checks whether real Firebase Service Account environment variables are configured
 * (and not placeholder values from .env.example).
 */
export function hasRealFirebaseCredentials() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();

  if (!projectId || !clientEmail || !privateKey) {
    return false;
  }

  if (
    projectId === 'your-firebase-project-id' ||
    privateKey.includes('YOUR_PRIVATE_KEY_HERE')
  ) {
    return false;
  }

  return privateKey.includes('BEGIN PRIVATE KEY');
}

/**
 * In-memory Firestore-compatible fallback adapter used ONLY in local/sandbox
 * demo environments when Firebase Service Account credentials have not been set yet.
 * Supports .collection(name).doc(id).get()/set()/update(), .where(), .orderBy(), .limit().
 */
function createInMemoryFirestore() {
  if (!globalThis.__FAMPAY_GATEWAY_MEM_STORE__) {
    const now = Date.now();
    const seededOrders = new Map();

    const demoPaidId = 'ORD-DEMO9042';
    seededOrders.set(demoPaidId, {
      orderId: demoPaidId,
      amount: 249.0,
      currency: 'INR',
      customerName: 'Aarav Mehta',
      customerEmail: 'aarav.mehta@example.com',
      note: 'Pro API Plan — Monthly',
      merchantName: process.env.NEXT_PUBLIC_MERCHANT_NAME || 'FamPay Merchant Store',
      upiId: process.env.NEXT_PUBLIC_UPI_ID || 'merchant@fam',
      upiUri:
        'upi://pay?pa=merchant%40fam&pn=FamPay%20Merchant%20Store&am=249.00&cu=INR&tn=Order%20ORD-DEMO9042&tr=ORD-DEMO9042',
      status: 'PAID',
      utr: '430981726541',
      redirectUrl: '/merchant/callback',
      webhookUrl: '',
      webhookDelivered: false,
      createdAt: new Date(now - 1000 * 60 * 18).toISOString(),
      createdAtMs: now - 1000 * 60 * 18,
      paidAt: new Date(now - 1000 * 60 * 17).toISOString(),
      expiresAt: new Date(now - 1000 * 60 * 3).toISOString(),
    });

    const demoPaidId2 = 'ORD-DEMO7815';
    seededOrders.set(demoPaidId2, {
      orderId: demoPaidId2,
      amount: 99.0,
      currency: 'INR',
      customerName: 'Priya Nair',
      customerEmail: 'priya.nair@example.com',
      note: 'Digital Asset Pack #14',
      merchantName: process.env.NEXT_PUBLIC_MERCHANT_NAME || 'FamPay Merchant Store',
      upiId: process.env.NEXT_PUBLIC_UPI_ID || 'merchant@fam',
      upiUri:
        'upi://pay?pa=merchant%40fam&pn=FamPay%20Merchant%20Store&am=99.00&cu=INR&tn=Order%20ORD-DEMO7815&tr=ORD-DEMO7815',
      status: 'PAID',
      utr: '430965412890',
      redirectUrl: '/merchant/callback',
      webhookUrl: '',
      webhookDelivered: true,
      createdAt: new Date(now - 1000 * 60 * 52).toISOString(),
      createdAtMs: now - 1000 * 60 * 52,
      paidAt: new Date(now - 1000 * 60 * 51).toISOString(),
      expiresAt: new Date(now - 1000 * 60 * 37).toISOString(),
    });

    globalThis.__FAMPAY_GATEWAY_MEM_STORE__ = {
      orders: seededOrders,
      webhooks: [],
    };
  }

  const rootStore = globalThis.__FAMPAY_GATEWAY_MEM_STORE__;

  function ensureCollection(name) {
    if (!rootStore[name] || !(rootStore[name] instanceof Map)) {
      rootStore[name] = new Map();
    }
    return rootStore[name];
  }

  function buildQuery(colMap, filters = [], sortSpec = null, maxResults = null) {
    return {
      where(field, op, value) {
        return buildQuery(colMap, [...filters, { field, op, value }], sortSpec, maxResults);
      },
      orderBy(field, direction = 'asc') {
        return buildQuery(colMap, filters, { field, direction }, maxResults);
      },
      limit(n) {
        return buildQuery(colMap, filters, sortSpec, n);
      },
      async get() {
        let entries = Array.from(colMap.entries()).map(([id, data]) => ({
          id,
          exists: true,
          data: () => ({ ...data }),
        }));

        for (const f of filters) {
          entries = entries.filter((docSnap) => {
            const val = docSnap.data()[f.field];
            if (f.op === '==') return val === f.value;
            if (f.op === '!=') return val !== f.value;
            if (f.op === '>') return val > f.value;
            if (f.op === '>=') return val >= f.value;
            if (f.op === '<') return val < f.value;
            if (f.op === '<=') return val <= f.value;
            return true;
          });
        }

        if (sortSpec) {
          const dir = sortSpec.direction === 'desc' ? -1 : 1;
          entries.sort((a, b) => {
            const av = a.data()[sortSpec.field];
            const bv = b.data()[sortSpec.field];
            if (av === bv) return 0;
            return av > bv ? dir : -dir;
          });
        }

        if (typeof maxResults === 'number') {
          entries = entries.slice(0, maxResults);
        }

        return {
          empty: entries.length === 0,
          size: entries.length,
          docs: entries,
          forEach(cb) {
            entries.forEach(cb);
          },
        };
      },
    };
  }

  return {
    __isInMemoryFallback: true,
    collection(collectionName) {
      const colMap = ensureCollection(collectionName);
      const baseQuery = buildQuery(colMap);

      return {
        ...baseQuery,
        doc(docId) {
          const resolvedId =
            docId || `DOC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          return {
            id: resolvedId,
            async get() {
              const record = colMap.get(resolvedId);
              return {
                id: resolvedId,
                exists: Boolean(record),
                data: () => (record ? { ...record } : undefined),
              };
            },
            async set(data, options = {}) {
              if (options.merge && colMap.has(resolvedId)) {
                colMap.set(resolvedId, { ...colMap.get(resolvedId), ...data });
              } else {
                colMap.set(resolvedId, { ...data });
              }
            },
            async update(patch) {
              if (!colMap.has(resolvedId)) {
                throw new Error(`Document ${collectionName}/${resolvedId} does not exist.`);
              }
              colMap.set(resolvedId, { ...colMap.get(resolvedId), ...patch });
            },
            async delete() {
              colMap.delete(resolvedId);
            },
          };
        },
      };
    },
  };
}

let firestoreInstance = null;

/**
 * Returns a singleton Firebase Admin Firestore client.
 * In production (Vercel / Node.js with FIREBASE_* env vars), initializes the official
 * Firebase Admin SDK once across hot-reloads and serverless invocations.
 */
export function getDb() {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  if (hasRealFirebaseCredentials()) {
    const formattedPrivateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

    const app =
      getApps().length > 0
        ? getApps()[0]
        : initializeApp({
            credential: cert({
              projectId: process.env.FIREBASE_PROJECT_ID.trim(),
              clientEmail: process.env.FIREBASE_CLIENT_EMAIL.trim(),
              privateKey: formattedPrivateKey,
            }),
          });

    const db = getFirestore(app);
    firestoreInstance = db;
    return firestoreInstance;
  }

  firestoreInstance = createInMemoryFirestore();
  return firestoreInstance;
}

const db = getDb();
export { db };
export default db;
