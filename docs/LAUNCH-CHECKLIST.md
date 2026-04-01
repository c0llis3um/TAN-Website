# DeFi Tanda — Live Launch Checklist

Complete every item before switching `VITE_ENV=dev` → `VITE_ENV=live`.

---

## 1. Infrastructure & Secrets

Current dev `.env` configuration — every variable below must be replaced with production values before launch:

### Supabase (currently configured — dev project)
| Variable | Dev value | Action needed |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://dfaqxjdoyjdlmsbeybxg.supabase.co` | Replace with prod Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_H-DudEqO573lQSjTqKUixQ_nZpDnqL4` | Replace with prod anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | *(not set)* | Set from prod Supabase → Settings → API |
| `SUPABASE_DB_PASSWORD` | *(not set)* | Set from prod Supabase → Settings → Database |

### Contract Deployment (not yet set)
| Variable | Notes |
|---|---|
| `PRIVATE_KEY` | Deployer wallet private key — use a dedicated deploy wallet, not your personal wallet |
| `SEPOLIA_RPC_URL` | Infura or Alchemy — for testnet; swap for mainnet RPC at launch |
| `TREASURY_ADDRESS` | Should be a multisig (Gnosis Safe) for production |
| `CREATION_FEE` | Currently `2000000` ($2 USDC) — set final fee before mainnet deploy |

### Payments & Onramp (not yet set)
| Variable | Notes |
|---|---|
| `VITE_STRIPE_PUBLISHABLE_KEY` | Get from Stripe dashboard → switch from `pk_test_` to `pk_live_` |
| `STRIPE_SECRET_KEY` | Server-side only — never expose in frontend; switch to `sk_live_` |
| `VITE_MOONPAY_API_KEY` | Switch from test key to live key in MoonPay dashboard |

### Email (not yet set)
| Variable | Notes |
|---|---|
| `RESEND_API_KEY` | Get production key from Resend dashboard |

### App Mode
| Variable | Dev value | Production value |
|---|---|---|
| `VITE_ENV` | `dev` | `live` |

---

- [ ] Create production Supabase project (separate from dev)
- [ ] Fill in every variable in the table above with production values
- [ ] Set all env vars in Vercel / hosting dashboard (never in the repo)
- [ ] Never commit `.env` to git — confirm `.gitignore` covers it
- [ ] Rotate the dev Supabase anon key (`sb_publishable_H-DudEqO5...`) — it is in git history
- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY` and `STRIPE_SECRET_KEY` are server-side only (not prefixed with `VITE_`)

---

## 2. Supabase Database

- [ ] Run all migrations (001 → 013) on the production Supabase project
- [ ] Verify RLS policies are active on every table
- [ ] Confirm `anon` role can only read public data
- [ ] Confirm `authenticated` role is scoped correctly (no cross-user reads)
- [ ] Set up Supabase daily backups
- [ ] Remove any test/seed data from prod tables

---

## 3. Ethereum (Mainnet)

- [ ] Audit `TandaFactory.sol` and `TandaPod.sol` — get a professional security audit
- [ ] Deploy `TandaFactory` to Ethereum mainnet:
  ```bash
  SEPOLIA_RPC_URL=<mainnet-rpc> node scripts/deploy.js
  ```
- [ ] Deploy `TandaPod` implementation to mainnet
- [ ] Update `src/contracts/live.json` with mainnet contract addresses
- [ ] Verify contracts on Etherscan (upload source / use Hardhat verify)
- [ ] Set treasury wallet to a multisig (e.g. Gnosis Safe), not an EOA
- [ ] Test `joinPod()` + `contribute()` + payout on mainnet with small amounts first
- [ ] Set `creationFee` to real value (not $2 test amount)

---

## 4. Solana (Mainnet)

- [ ] Audit `programs/tanda/src/lib.rs` (Anchor program)
- [ ] Deploy to Solana mainnet-beta:
  ```bash
  anchor build
  anchor deploy --provider.cluster mainnet
  ```
- [ ] Update `src/contracts/live.json` with the mainnet program ID
- [ ] Fund the program's upgrade authority wallet
- [ ] Test `join_pod` + `contribute` instructions on mainnet with small SOL amounts
- [ ] USDC mint address: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` — confirm in `src/lib/solana.js`

---

## 5. XRPL (Mainnet)

- [ ] Get the official Ripple mainnet RLUSD issuer address and update `RLUSD_ISSUER.live` in `src/lib/xrpl.js`
- [ ] Fund a production treasury/escrow XRPL wallet (minimum 10 XRP reserve + operating funds)
- [ ] Replace plaintext seed storage with encrypted KMS solution before going live (noted in `createXrplPodEscrow`)
- [ ] Test XRP and RLUSD payments end-to-end on mainnet with small amounts
- [ ] Switch XRPL node in `src/lib/xrpl.js` to `wss://xrplcluster.com` (it already is — confirm it stays)

---

## 6. Wallet & Frontend

- [ ] Test MetaMask connect → join pod → pay on mainnet Ethereum
- [ ] Test Phantom connect → join pod → pay on mainnet Solana
- [ ] Test Xaman connect → join pod → pay on mainnet XRPL
- [ ] Confirm wallet disconnect works on all three
- [ ] Confirm `WalletModal` shows correct chain names and install links
- [ ] Test on mobile browsers (iOS Safari, Android Chrome)

---

## 7. Admin Panel

- [ ] Change admin password from default → strong unique password in Supabase Auth
- [ ] Confirm `joelalcan@gmail.com` is the only admin account (or add others intentionally)
- [ ] Add treasury wallet addresses for all three chains in the Admin → Treasury page
- [ ] Confirm treasury wallet proposals table is working (audit trail)
- [ ] Test admin dashboard with real pod data

---

## 8. Pod Lifecycle Testing (End-to-End)

- [ ] Create a 3-member pod on each chain
- [ ] Have 3 test wallets join the pod (verify collateral deposited)
- [ ] Complete cycle 1 payments — verify pot sent to payout recipient
- [ ] Complete all cycles — verify collateral refunded to all members
- [ ] Test a default scenario — verify collateral slashing works
- [ ] Test pod cancellation — verify refunds work

---

## 9. Legal & Compliance

- [ ] Terms of Service page linked from WalletModal is real and reviewed by counsel
- [ ] Privacy policy in place
- [ ] ROSCA regulations checked for target markets (US: varies by state; MX: varies)
- [ ] KYC/AML requirements assessed for your user base
- [ ] Disclaimer that this is not financial advice

---

## 10. Monitoring & Ops

- [ ] Set up error tracking (Sentry or similar) on the frontend
- [ ] Set up uptime monitoring for the Supabase project
- [ ] Set up alerts for failed on-chain transactions (via event indexer or webhook)
- [ ] Document the runbook: what to do if a pod gets stuck mid-cycle
- [ ] Have a plan for upgrading contracts (proxy pattern or migration path)

---

## 11. Final Go / No-Go

- [ ] All items above checked
- [ ] At least one full pod lifecycle completed on mainnet with real funds (small test)
- [ ] Smart contract audit report reviewed and critical findings resolved
- [ ] Team aligned on support process for user issues
- [ ] Flip `VITE_ENV=live` in production environment

---

> Last updated: 2026-03-31
> Keep this document in the repo and update it as the product evolves.
