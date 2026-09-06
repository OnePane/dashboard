# Financial platform services

This repository contains a Vercel frontend and independently deployable backend services:

- **Web app** (`apps/web`) is the Vercel deployment.

- **API gateway** (`:3000`) is the public edge. It proxies financial-account requests to the account service and routes payment intents through a configured payment-service-provider adapter.
- **Accounts service** (`:3001`) owns financial-account records. Its current repository is in-memory so the API can run locally; replace it with a database-backed implementation before production.

## Run locally

Requires Node 20+.

```sh
npm install
npm run start:accounts
# in another terminal
npm run start:gateway
```

Or start both in containers:

```sh
docker compose up --build
```

Create a financial account through the public API:

```sh
curl -X POST http://localhost:3000/v1/financial-accounts \
  -H 'content-type: application/json' \
  -d '{"customerId":"cus_123","currency":"USD","type":"cash"}'
```

Create a payment intent using the local mock provider:

```sh
curl -X POST http://localhost:3000/v1/payment-intents \
  -H 'content-type: application/json' \
  -d '{"amount":2500,"currency":"USD","financialAccountId":"fa_example"}'
```

`PAYMENT_PROVIDER=mock` is the default. Add further providers by implementing `PaymentProvider` in `services/api-gateway/src/providers.js` and registering it in `createProviderRegistry`—provider credentials remain gateway-only environment variables.

## Boundaries

The gateway does not read account data directly, and clients do not call provider SDKs. Each service exposes `/health` for orchestration. In production, put authentication and rate limiting at the gateway, use durable storage in accounts, and publish account/payment events through an outbox/message broker.
