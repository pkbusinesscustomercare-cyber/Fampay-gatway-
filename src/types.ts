export type OrderStatus = 'PENDING' | 'PAID' | 'EXPIRED';

export interface OrderRecord {
  orderId: string;
  amount: number;
  currency: string;
  customerName: string;
  customerEmail?: string;
  note: string;
  merchantName: string;
  upiId: string;
  upiUri: string;
  checkoutUrl?: string;
  redirectUrl?: string;
  webhookUrl?: string;
  webhookDelivered?: boolean;
  webhookStatusCode?: number;
  status: OrderStatus;
  utr: string | null;
  createdAt: string;
  paidAt: string | null;
  expiresAt: string;
}

export interface SandboxEmailRecord {
  uid: number;
  from: string;
  subject: string;
  text: string;
  seen: boolean;
  date: string;
}

export interface WebhookDeliveryRecord {
  id: string;
  receivedAt: string;
  event: string;
  signature: string;
  signatureValid: boolean;
  payload: {
    event?: string;
    orderId?: string;
    amount?: number;
    currency?: string;
    status?: string;
    utr?: string;
    customerName?: string;
    paidAt?: string;
  };
}

export interface ExportFileItem {
  path: string;
  language: string;
  content: string;
}
