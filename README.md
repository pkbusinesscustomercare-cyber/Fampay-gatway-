# FamPay Automated UPI Payment Gateway

एक पूर्णतः सेल्फ-होस्टेड (Self-Hosted), ज़ीरो-कमीशन (0% MDR), ओपन-सोर्स **Automated UPI Payment Gateway** जो **Next.js (App Router)**, **Firebase Admin Firestore**, और **FamApp Gmail IMAP Verification** पर आधारित है।

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyour-username%2Ffampay-upi-gateway&env=NEXT_PUBLIC_MERCHANT_NAME,NEXT_PUBLIC_UPI_ID,GMAIL_USER,GMAIL_APP_PASSWORD,FIREBASE_PROJECT_ID,FIREBASE_CLIENT_EMAIL,FIREBASE_PRIVATE_KEY,GATEWAY_SECRET_KEY&project-name=fampay-upi-gateway&repository-name=fampay-upi-gateway)

---

## मुख्य विशेषताएँ (Key Features)

1. **NPCI Standard Dynamic QR & UPI Intent (`upi://pay?...`)**
   - डेस्कटॉप पर ग्राहक के लिए हाई-प्रिसिजन डायनामिक SVG QR कोड (`qrcode.react`) और मोबाइल पर वन-टैप **"Pay via UPI"** डीप-लिंक इंटेंट बटन।
2. **Serverless FamApp Gmail IMAP UTR Verification (`imapflow` + `mailparser`)**
   - `imap.gmail.com:993` (TLS) से सुरक्षित कनेक्शन स्थापित कर `no-reply@famapp.in` से आए नए अनरीड (`UNSEEN`) ईमेल्स को स्कैन करता है।
   - सटीक राशि (Amount) और **12-अंकों के NPCI UTR / Reference ID** को Regex से निकालता है और वेरिफिकेशन के तुरंत बाद IMAP कनेक्शन बंद (`logout`) कर देता है।
3. **UTR Replay / Duplicate Fraud Prevention**
   - प्रत्येक पेमेंट को `PAID` मार्क करने से पहले Firestore के `orders` कलेक्शन में जांच करता है कि वह 12-अंकों का UTR पहले किसी अन्य ऑर्डर में उपयोग तो नहीं हुआ है।
4. **3.5-Second Real-time Checkout Polling + Signed Webhooks**
   - चेकआउट पेज हर `3.5 सेकंड` में `/api/verify-order` को पोल करता है, सफल होते ही **Payment Successful** दिखाता है, ग्राहक को `redirectUrl` पर रीडायरेक्ट करता है, और मर्चेंट सर्वर (`webhookUrl`) पर `HMAC-SHA256` हस्ताक्षरित (`X-Gateway-Signature`) POST वेबहुक भेजता है।

---

## प्रोजेक्ट संरचना (Folder Structure)

```text
fampay-upi-gateway/
├── app/
│   ├── api/
│   │   ├── create-order/
│   │   │   └── route.js          # POST नया ऑर्डर बनाएँ + GET ऑर्डर विवरण
│   │   └── verify-order/
│   │       └── route.js          # POST/GET पेमेंट सत्यापन, UTR जांच और वेबहुक ट्रिगर
│   ├── checkout/
│   │   └── [orderId]/
│   │       └── page.jsx          # डायनामिक QR कोड, "Pay via UPI" और 3.5s पोलिंग UI
│   ├── globals.css               # Tailwind CSS स्टाइल्स
│   ├── layout.jsx                # Root App Router Layout
│   └── page.jsx                  # मर्चेंट टेस्ट और ऑर्डर डैशबोर्ड पेज
├── lib/
│   ├── firebaseAdmin.js          # Singleton Firebase Admin Firestore SDK
│   └── emailParser.js            # Serverless Gmail IMAP (`imapflow` + `mailparser`) इंजन
├── .env.example                  # आवश्यक Environment Variables टेम्पलेट
├── next.config.js                # Next.js प्रोडक्शन कॉन्फ़िगरेशन
├── package.json                  # प्रोजेक्ट डिपेंडेंसीज़
└── README.md                     # सेटअप और डिप्लॉयमेंट गाइड
```

---

## Step-by-Step Setup Guide

### 1. Firebase Service Account सेटअप (Firestore Database)

1. [Firebase Console](https://console.firebase.google.com/) पर जाएँ और **Create a project** पर क्लिक करें।
2. बाएँ मेन्यू में **Build → Firestore Database** चुनें और **Create database** पर क्लिक करें (Production mode चुनें और अपना नजदीकी रीजन जैसे `asia-south1 (Mumbai)` चुनें)।
3. ऊपर बाईं ओर ⚙️ **Project Overview → Project settings** में जाएँ और **Service accounts** टैब खोलें।
4. **Firebase Admin SDK** सेक्शन में **Node.js** चुनें और **Generate new private key** बटन दबाएँ।
5. डाउनलोड हुई JSON फ़ाइल को खोलें और उसमें से ये 3 मान अपनी `.env.local` (और Vercel Environment Variables) में कॉपी करें:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_PRIVATE_KEY` (पूरा स्ट्रिंग `"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"` कोट्स सहित रखें)

---

### 2. Gmail App Password और FamApp ईमेल अलर्ट सेटअप

1. सुनिश्चित करें कि आपके FamApp अकाउंट से आपका Gmail पता लिंक है और UPI पेमेंट प्राप्त होने पर `no-reply@famapp.in` से ईमेल अलर्ट आते हैं।
2. अपने Google Account में जाएँ → **Security** → **2-Step Verification** को **ON** करें।
3. अब [Google App Passwords](https://myaccount.google.com/apppasswords) पेज खोलें।
4. App name में `FamPay UPI Gateway` लिखें और **Create** पर क्लिक करें।
5. प्राप्त 16-अक्षरों के पासवर्ड को `GMAIL_APP_PASSWORD` में डालें और अपना ईमेल पता `GMAIL_USER` में सेट करें।
6. Gmail Settings → **Forwarding and POP/IMAP** में सुनिश्चित करें कि **IMAP access** सक्षम है।

---

### 3. लोकल इंस्टॉलेशन और रन करना (Local Development)

```bash
git clone https://github.com/your-username/fampay-upi-gateway.git
cd fampay-upi-gateway

# डिपेंडेंसीज़ इंस्टॉल करें
npm install

# Environment फ़ाइल तैयार करें
cp .env.example .env.local
# अब .env.local में अपने क्रेडेंशियल्स भरें

# डेवलपमेंट सर्वर चलाएँ
npm run dev
```

ब्राउज़र में `http://localhost:3000` खोलें।

---

### 4. Vercel पर वन-क्लिक डिप्लॉयमेंट

1. इस प्रोजेक्ट को अपने GitHub रिपॉज़िटरी में पुश करें।
2. ऊपर दिए गए **Deploy with Vercel** बटन पर क्लिक करें या [Vercel Dashboard](https://vercel.com/new) से रिपॉज़िटरी इम्पोर्ट करें।
3. **Environment Variables** सेक्शन में `.env.example` के सभी 8 वेरिएबल्स जोड़ें:
   - `NEXT_PUBLIC_MERCHANT_NAME`
   - `NEXT_PUBLIC_UPI_ID`
   - `GMAIL_USER`
   - `GMAIL_APP_PASSWORD`
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY`
   - `GATEWAY_SECRET_KEY`
4. **Deploy** पर क्लिक करें। आपका पेमेंट गेटवे लाइव हो जाएगा!

---

## API और Webhook सत्यापन (Merchant Integration)

### 1. नया ऑर्डर बनाना (`POST /api/create-order`)

```javascript
const response = await fetch('https://your-gateway.vercel.app/api/create-order', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-gateway-secret': process.env.GATEWAY_SECRET_KEY,
  },
  body: JSON.stringify({
    amount: 299.00,
    customerName: 'Vikram Singh',
    note: 'Order #9841',
    redirectUrl: 'https://merchant.example.com/order/complete',
    webhookUrl: 'https://merchant.example.com/api/upi-webhook',
  }),
});

const { orderId, checkoutUrl, upiUri } = await response.json();
// ग्राहक को checkoutUrl पर रीडायरेक्ट करें
```

### 2. मर्चेंट सर्वर पर Webhook Signature सत्यापित करना

जब पेमेंट `PAID` होता है, तो गेटवे `webhookUrl` पर `X-Gateway-Signature` हेडर भेजता है:

```javascript
import crypto from 'node:crypto';

export function verifyGatewayWebhook(rawBodyString, signatureHeader, secretKey) {
  const expected = crypto
    .createHmac('sha256', secretKey)
    .update(rawBodyString)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expected, 'utf8'),
    Buffer.from(signatureHeader || '', 'utf8')
  );
}
```

---

## लाइसेंस (License)

MIT License — स्व-होस्टिंग और वाणिज्यिक उपयोग के लिए पूर्णतः स्वतंत्र।
