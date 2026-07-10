# Testing Strategy

## Three-layer approach

```
┌─────────────────────────────────────────────┐
│  Layer 3 — Devnet Integration (manual/CI)   │  Real XRPL devnet, funded wallets
│  Layer 2 — Playwright e2e (npm test:e2e)     │  Full UI flows, mocked APIs
│  Layer 1 — Vitest unit (npm test:unit)       │  Pure logic, no network
└─────────────────────────────────────────────┘
```

---

## Layer 1 — Vitest unit tests (`npm run test:unit`)

Fast, no network. Run on every commit.

| File | What it covers |
|------|----------------|
| `tests/vault-math.test.ts` | APY yield calculation, simulateYield, sharesForAmount |
| `tests/netlify-guards.test.ts` | Guard logic for vault-deposit, vault-withdraw, slash (404/400/409 paths), isNotEnabledError detection |

**What's NOT unit-tested here:** actual XRPL transactions (need devnet), Supabase queries (need DB).

---

## Layer 2 — Playwright e2e (`npm run test:e2e`)

Full browser, real React render, Supabase REST calls mocked via `page.route()`.

| File | What it covers |
|------|----------------|
| `e2e/landing.spec.ts` | Waitlist form, success state |
| `e2e/browse-pods.spec.ts` | Pod listing, search, chain filter, navigation |
| `e2e/create-pod.spec.ts` | Full wizard: rules step, XRPL yield flow, Ethereum path, KYC gate |
| `e2e/pod-view.spec.ts` | Vault card (deposited + pending), non-member hide, non-yield hide |
| `e2e/admin-login.spec.ts` | Login form, error, success redirect, auth gate |

**How API mocking works:**
```ts
await page.route('**/rest/v1/pods*', async route => {
  await route.fulfill({ status: 200, body: JSON.stringify(MOCK_DATA) })
})
```

---

## Layer 3 — Devnet integration (manual + future CI)

Run against real XRPL devnet. Requires funded test wallets.

### Contract return tests

These are the hardest to automate because they require live XRPL network state.

**Manual test checklist for each Netlify function:**

#### `vault-deposit`
1. Create a yield/vault pod via the wizard
2. Have 12 members join (or use admin to force LOCKED)
3. POST to `/.netlify/functions/vault-deposit` with `{ podId, env: 'dev' }`
4. Assert response: `{ vaultId, sharesDeposited, simulated: true }` (devnet = simulated)
5. Check `pod_escrows` row: `vault_status = 'deposited'`, `vault_shares` is set
6. Re-POST → should get 409 (idempotency)

#### `vault-withdraw` (slash scenario)
1. After vault-deposit succeeds
2. POST `{ podId, env: 'dev', amount: '100' }` (partial slash)
3. Assert RLUSD balance of escrow wallet increases by ~100
4. Assert `vault_shares` in DB decreased proportionally
5. POST `{ podId, env: 'dev', full: true }` (pod complete)
6. Assert `vault_status = 'withdrawn'`

#### `slash-xrpl-collateral`
1. Create ACTIVE pod, advance past cycle due date (devnet: wait 1-2 hours)
2. POST slash for a member who hasn't paid
3. Assert payout recipient wallet balance increases by `contribution_amount`
4. Assert `pod_members` row: `status = 'DEFAULTED'`
5. Assert `payments` row with `method = 'collateral_slash'` exists
6. Re-POST → should get 400 "already slashed"

### Running devnet tests

```bash
# Set env vars
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

# Test a specific function (example)
curl -X POST http://localhost:8888/.netlify/functions/vault-deposit \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"podId":"<uuid>","env":"dev"}'
```

Run Netlify dev server: `npx netlify dev`

---

## Running all tests

```bash
npm run test:unit      # vitest only (fast, no browser)
npm run test:e2e       # playwright only
npm run test           # both
```
