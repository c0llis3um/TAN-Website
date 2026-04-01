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

const SEPOLIA_CHAIN_ID = 11155111

export async function connectMetaMask() {
  if (!isMetaMaskInstalled()) {
    throw 'MetaMask is not installed. Install it at metamask.io'
  }

  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
  if (!accounts?.length) throw 'No accounts returned from MetaMask.'

  // Switch to Sepolia automatically
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${SEPOLIA_CHAIN_ID.toString(16)}` }],
    })
  } catch (switchErr) {
    // Chain not added yet — add it
    if (switchErr.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId:         `0x${SEPOLIA_CHAIN_ID.toString(16)}`,
          chainName:       'Sepolia Testnet',
          nativeCurrency:  { name: 'ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls:         ['https://rpc.sepolia.org'],
          blockExplorerUrls: ['https://sepolia.etherscan.io'],
        }],
      })
    }
    // If user rejected the switch, continue with current chain
  }

  const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' })
  const chainId    = parseInt(chainIdHex, 16)
  const chainName  = EVM_CHAINS[chainId] ?? `Chain ${chainId}`

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

/** Always true — Xumm SDK works on mobile and desktop without a browser extension */
export function isXamanInstalled() {
  return true
}

export async function connectXaman() {
  const { connectXumm } = await import('@/lib/xrpl')
  const address = await connectXumm()
  if (!address) throw 'Xaman authorisation cancelled or failed.'

  return {
    address,
    chain:     'XRPL',
    chainId:   null,
    chainName: 'XRP Ledger',
    provider:  'xaman',
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
