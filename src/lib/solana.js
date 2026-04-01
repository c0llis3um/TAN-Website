/**
 * solana.js — Phantom wallet + SOL/USDC transfers
 *
 * Wallet: window.solana (Phantom browser extension)
 * Devnet USDC mint: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
 */

import {
  Connection, PublicKey, Transaction,
  SystemProgram, LAMPORTS_PER_SOL, clusterApiUrl,
} from '@solana/web3.js'
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
} from '@solana/spl-token'

const USDC_MINT = {
  dev:  new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'),
  live: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
}

function getConnection(env) {
  return new Connection(
    env === 'live' ? 'https://api.mainnet-beta.solana.com' : clusterApiUrl('devnet'),
    'confirmed',
  )
}

// ── Wallet detection ──────────────────────────────────────────

export function isPhantomInstalled() {
  return typeof window !== 'undefined' && !!window.solana?.isPhantom
}

export async function connectPhantom() {
  if (!isPhantomInstalled()) {
    throw new Error('Phantom wallet not found. Install it at phantom.app')
  }
  const resp = await window.solana.connect()
  return resp.publicKey.toString()
}

export function getPhantomAddress() {
  if (!window.solana?.publicKey) return null
  return window.solana.publicKey.toString()
}

// ── Balances ──────────────────────────────────────────────────

export async function getSolanaBalances(walletAddress, env) {
  const connection = getConnection(env)
  const pubkey     = new PublicKey(walletAddress)

  const lamports  = await connection.getBalance(pubkey)
  const solBalance = lamports / LAMPORTS_PER_SOL

  let usdcBalance = 0
  try {
    const usdcMint = USDC_MINT[env] ?? USDC_MINT.dev
    const ata      = await getAssociatedTokenAddress(usdcMint, pubkey)
    const account  = await getAccount(connection, ata)
    usdcBalance    = Number(account.amount) / 1e6
  } catch {
    // ATA doesn't exist yet — balance is 0
  }

  return { sol: solBalance, usdc: usdcBalance }
}

// ── Send SOL or USDC ──────────────────────────────────────────

/**
 * @param {string} toAddress
 * @param {number} amount         — human-readable (e.g. 3 for 3 USDC)
 * @param {'SOL'|'USDC'} token
 * @param {'dev'|'live'} env
 * @returns {{ txHash: string }}
 */
export async function sendSolanaContribution(toAddress, amount, token, env) {
  if (!window.solana?.isPhantom) throw new Error('Phantom wallet not connected.')

  const connection   = getConnection(env)
  const fromPubkey   = new PublicKey(window.solana.publicKey.toString())
  const toPubkey     = new PublicKey(toAddress)
  const tx           = new Transaction()

  if (token === 'SOL') {
    tx.add(SystemProgram.transfer({
      fromPubkey,
      toPubkey,
      lamports: Math.round(amount * LAMPORTS_PER_SOL),
    }))
  } else if (token === 'USDC') {
    const usdcMint = USDC_MINT[env] ?? USDC_MINT.dev
    const fromAta  = await getAssociatedTokenAddress(usdcMint, fromPubkey)
    const toAta    = await getAssociatedTokenAddress(usdcMint, toPubkey)

    // Create recipient ATA if it doesn't exist
    try {
      await getAccount(connection, toAta)
    } catch {
      tx.add(createAssociatedTokenAccountInstruction(
        fromPubkey, toAta, toPubkey, usdcMint,
      ))
    }

    tx.add(createTransferInstruction(
      fromAta,
      toAta,
      fromPubkey,
      Math.round(amount * 1e6),  // USDC has 6 decimals
    ))
  } else {
    throw new Error(`Token ${token} not supported on Solana yet.`)
  }

  const { blockhash } = await connection.getLatestBlockhash()
  tx.recentBlockhash  = blockhash
  tx.feePayer         = fromPubkey

  // Phantom signs + sends
  const signed  = await window.solana.signAndSendTransaction(tx)
  return { txHash: signed.signature }
}
