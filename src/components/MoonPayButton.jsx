/**
 * MoonPayButton
 *
 * Opens the MoonPay widget to let users buy XRP (or other tokens)
 * with Apple Pay, Google Pay, or a credit card.
 *
 * Sandbox: buy-sandbox.moonpay.com  (use pk_test_... key)
 * Live:    buy.moonpay.com          (use pk_live_... key)
 *
 * NOTE: For production, MoonPay requires server-side URL signing.
 *       Add a Netlify function to sign the URL before going live.
 */

const MOONPAY_URL = {
  dev:  'https://buy-sandbox.moonpay.com',
  live: 'https://buy.moonpay.com',
}

const CURRENCY_MAP = {
  XRP:   'xrp',
  RLUSD: 'rlusd',
  ETH:   'eth',
  USDC:  'usdc_ethereum',
  USDT:  'usdt_ethereum',
}

/**
 * @param {string}  walletAddress  — destination wallet (pre-filled in widget)
 * @param {number}  amount         — crypto amount to buy (e.g. 30 XRP)
 * @param {string}  token          — 'XRP' | 'RLUSD' | 'ETH' | 'USDC'
 * @param {string}  env            — 'dev' | 'live'
 * @param {string}  [label]        — button label override
 * @param {string}  [className]    — extra classes
 */
export default function MoonPayButton({ walletAddress, amount, token, env = 'dev', label, className = '' }) {
  const apiKey = import.meta.env.VITE_MOONPAY_API_KEY
  if (!apiKey) return null   // hide button if key not configured

  function handleClick() {
    const base     = MOONPAY_URL[env] ?? MOONPAY_URL.dev
    const currency = CURRENCY_MAP[token] ?? 'xrp'

    const params = new URLSearchParams({
      apiKey:              apiKey,
      currencyCode:        currency,
      colorCode:           '#0077FF',
      theme:               'dark',
    })

    if (walletAddress) params.set('walletAddress', walletAddress)
    if (amount)        params.set('quoteCurrencyAmount', String(amount))

    window.open(`${base}?${params.toString()}`, '_blank', 'width=450,height=700')
  }

  return (
    <button
      onClick={handleClick}
      className={`w-full flex items-center justify-center gap-2.5 py-3.5 px-5 rounded-2xl font-bold text-sm transition-all
        bg-gradient-to-r from-[#7B3FE4] to-[#3B82F6] text-white hover:opacity-90 shadow-lg hover:shadow-xl
        ${className}`}
    >
      <CardIcon />
      {label ?? `Buy ${token} with Apple Pay / Google Pay`}
    </button>
  )
}

function CardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
      <line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  )
}
