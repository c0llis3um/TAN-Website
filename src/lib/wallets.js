/**
 * wallets.js — MetaMask (EVM) and Phantom (Solana) connectors
 *
 * Returns { address, chain, chainId } on success.
 * Throws a user-readable string on failure.
 */

// ── MetaMask ─────────────────────────────────────────────────

export function isMetaMaskInstalled() {
  return typeof window !== 'undefined' && !!window.ethereum?.isMetaMask
}

export async function connectMetaMask() {
  if (!isMetaMaskInstalled()) {
    throw 'MetaMask is not installed. Install it at metamask.io'
  }

  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
  if (!accounts?.length) throw 'No accounts returned from MetaMask.'

  const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' })
  const chainId    = parseInt(chainIdHex, 16)

  const chainName = EVM_CHAINS[chainId] ?? `Chain ${chainId}`

  return {
    address:  accounts[0],
    chain:    'Ethereum',
    chainId,
    chainName,
    provider: 'metamask',
  }
}

const EVM_CHAINS = {
  1:        'Ethereum Mainnet',
  11155111: 'Sepolia Testnet',
  137:      'Polygon',
  8453:     'Base',
}

// ── Phantom (Solana) ─────────────────────────────────────────

export function isPhantomInstalled() {
  return typeof window !== 'undefined' && !!window.solana?.isPhantom
}

export async function connectPhantom() {
  if (!isPhantomInstalled()) {
    throw 'Phantom is not installed. Install it at phantom.app'
  }

  const resp = await window.solana.connect()
  const address = resp.publicKey.toString()

  return {
    address,
    chain:    'Solana',
    chainId:  null,
    chainName: 'Solana',
    provider: 'phantom',
  }
}

// ── Xaman / XUMM (XRPL) ─────────────────────────────────────

export function isXamanInstalled() {
  return typeof window !== 'undefined' && !!window.xumm
}

export async function connectXaman() {
  if (!isXamanInstalled()) {
    throw 'Xaman (XUMM) wallet not found. Install the Xaman browser extension at xumm.app'
  }

  const account = await window.xumm.authorize()
  const address = account?.me?.account
  if (!address) throw 'Xaman authorisation cancelled or failed.'

  return {
    address,
    chain:    'XRPL',
    chainId:  null,
    chainName: 'XRP Ledger',
    provider: 'xaman',
  }
}

// ── Disconnect ───────────────────────────────────────────────

export async function disconnectWallet(provider) {
  if (provider === 'phantom' && window.solana?.disconnect) {
    await window.solana.disconnect()
  }
  // MetaMask has no programmatic disconnect — just clear app state
}

// ── Account / chain change listeners ────────────────────────

export function onAccountChanged(callback) {
  window.ethereum?.on('accountsChanged', (accounts) => {
    callback(accounts[0] ?? null)
  })
}

export function onChainChanged(callback) {
  window.ethereum?.on('chainChanged', (chainIdHex) => {
    callback(parseInt(chainIdHex, 16))
  })
}

export function removeWalletListeners() {
  window.ethereum?.removeAllListeners?.('accountsChanged')
  window.ethereum?.removeAllListeners?.('chainChanged')
}
