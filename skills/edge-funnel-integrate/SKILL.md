---
name: edge-funnel-integrate
description: Step-by-step instructions for integrating Next.js, Astro, Odoo, tabligh-os, nazhir-reach, or any SaaS web/payment backend with edge-funnel first-party attribution and D+1/D+3/D+7 cohort tracking.
---

# Integrating Any App with `edge-funnel`

Use this skill whenever wiring content links, landing pages, WhatsApp chat leads, or payment checkouts into an `edge-funnel` instance.

## 1. URL & Content Link Standard (`ef_ep` Contract)
Every content CTA (or automated campaign emitted by `tabligh-os` / `nazhir-reach`) points to either:
- **Managed Smart Shortlink**:
  `https://<your-edge-funnel>/r/<code>`
  *(Redirects `<10ms` with HTTP 302 and auto-appends `ef_ep`, `utm_source`, `utm_medium`, `utm_campaign`, and `ef_tp`)*
- **Direct Landing URL**:
  `https://your-site.id/offer?ef_ep=<episode_code>&utm_source=<platform>&utm_medium=<medium>&utm_campaign=<campaign>`

## 2. Install `<2KB` First-Party Pixel (`/ef.js`)
Add one `<script>` tag inside `<head>` of your site (`Next.js`, `Astro`, `Odoo Website`, static HTML):

```html
<script defer src="https://<your-edge-funnel>/ef.js" data-ws="<workspace_slug>"></script>
```

### Framework Snippets
- **Next.js App Router (`app/layout.tsx`)**:
  ```tsx
  import Script from 'next/script';

  export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
      <html lang="id">
        <body>
          {children}
          <Script
            src="https://<your-edge-funnel>/ef.js"
            data-ws="saif-growth"
            strategy="afterInteractive"
          />
        </body>
      </html>
    );
  }
  ```
- **Astro (`src/layouts/Layout.astro`)**:
  ```astro
  <script is:inline defer src="https://<your-edge-funnel>/ef.js" data-ws="saif-growth"></script>
  ```
- **Odoo Website**: Paste the `<script>` tag under *Website -> Settings -> Custom Code (Head)*.

### What `/ef.js` Automates Immediately
1. Generates first-party `ef_vid` and preserves `first-touch` (`ef_ft`) + `last-touch` (`ef_lt`) in `localStorage`.
2. Sends a non-blocking `POST /api/v1/collect` beacon when `ef_ep` is present in the URL.
3. Automatically decorates:
   - WhatsApp links (`a[href*="wa.me/"]`, `a[href*="api.whatsapp.com/send"]`) with `[ref:ef_ep=<lt>|ft=<ft>|vid=<vid>]`.
   - HTML `<form>` elements with hidden inputs `ef_ep`, `ef_ft_ep`, and `ef_vid`.
   - Checkout links carrying `[data-ef-checkout]` with `ef_ep`, `ef_ft_ep`, and `ef_vid` query parameters.

## 3. Attach Attribution to Payment Checkouts (Push Webhooks)
When creating a checkout session on your backend, read `window.ef.get()` (or hidden form inputs `ef_ep`, `ef_ft_ep`, `ef_vid`) and forward them into your payment provider's metadata:

| Provider | Webhook Endpoint | Signature Header / Field | Where to Put Attribution |
| :--- | :--- | :--- | :--- |
| **`waflare` (WhatsApp)** | `POST /api/v1/webhooks/:ws/waflare` | `x-waflare-signature: sha256=<hmac>` | Auto-parsed from `[ref:ef_ep=...]` in message `text` |
| **QRIS Dinamis** | `POST /api/v1/webhooks/:ws/qris` | `x-qris-signature: sha256=<hmac>` | `metadata: { ef_ep, ef_ft_ep, ef_vid }` |
| **Midtrans** | `POST /api/v1/webhooks/:ws/midtrans` | Native `signature_key` (SHA-512) | `custom_field1: "[ref:ef_ep=...|ft=...|vid=...]"` |
| **Xendit** | `POST /api/v1/webhooks/:ws/xendit` | `x-callback-token` or `x-xendit-signature` | `metadata: { ef_ep, ef_ft_ep, ef_vid }` |
| **Stripe** | `POST /api/v1/webhooks/:ws/stripe` | `stripe-signature: t=...,v1=...` | `metadata: { ef_ep, ef_ft_ep, ef_vid }` |
| **Generic HMAC** | `POST /api/v1/webhooks/:ws/generic` | `x-ef-signature: sha256=<hmac>` | Top-level `ef_ep`, `ef_ft_ep`, `ef_vid` |

## 4. Alternative: 2-Endpoint Read-Only Pull Contract
If your backend cannot push outbound webhooks (e.g., behind a corporate firewall or legacy Odoo/ERP), expose two read-only JSON routes authenticated by a Bearer token:

1. **`GET /ef/signups?since=<ISO-8601>`**
   ```json
   {
     "items": [
       {
         "id": "signup_101",
         "occurred_at": "2026-11-20T08:00:00Z",
         "stage": "lead",
         "ef_ep": "ep-07",
         "ef_ft_ep": "ep-01",
         "customer_phone": "+6281234567890"
       }
     ]
   }
   ```
2. **`GET /ef/orders?since=<ISO-8601>`**
   ```json
   {
     "items": [
       {
         "id": "ord_501",
         "occurred_at": "2026-11-20T10:30:00Z",
         "amount": 1500000,
         "currency": "IDR",
         "ef_ep": "ep-07",
         "ef_ft_ep": "ep-01",
         "customer_phone": "+6281234567890"
       }
     ]
   }
   ```

`edge-funnel`'s Cron Trigger (or `POST /api/v1/workspaces/:slug/pull-sync`) pulls both endpoints idempotently and updates the D+1 / D+3 / D+7 Cohort Velocity dashboard automatically.
