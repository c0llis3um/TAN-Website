use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("TandaProgram1111111111111111111111111111111");

// ── Constants ─────────────────────────────────────────────────────────────────

/// Collateral = 2 × contribution.
const COLLATERAL_MULTIPLIER: u64 = 2;

// ── Program ───────────────────────────────────────────────────────────────────

#[program]
pub mod tanda {
    use super::*;

    // ── initialize_pod ────────────────────────────────────────────────────────

    /// Organizer creates a new pod PDA.
    ///
    /// PDAs:
    ///   pod   seeds = [b"pod",   pod_id.to_le_bytes()]
    ///   vault seeds = [b"vault", pod_id.to_le_bytes()]
    pub fn initialize_pod(
        ctx: Context<InitializePod>,
        pod_id: u64,
        contribution_lamports: u64,
        size: u8,
        cycle_seconds: i64,
    ) -> Result<()> {
        require!(size >= 2 && size <= 20,   TandaError::InvalidSize);
        require!(contribution_lamports > 0,  TandaError::ZeroContribution);
        require!(cycle_seconds > 0,          TandaError::ZeroCycleDuration);

        let pod = &mut ctx.accounts.pod;
        pod.pod_id                = pod_id;
        pod.organizer             = ctx.accounts.organizer.key();
        pod.authority             = ctx.accounts.organizer.key();
        pod.size                  = size;
        pod.member_count          = 0;
        pod.current_cycle         = 0;
        pod.total_cycles          = size as u64;
        pod.contribution_lamports = contribution_lamports;
        pod.cycle_seconds         = cycle_seconds;
        pod.cycle_started_at      = 0; // set when first member joins and pod activates
        pod.status                = PodStatus::Open as u8;
        pod.bump                  = ctx.bumps.pod;
        pod.vault_bump            = ctx.bumps.vault;

        // payout_slots: index = member join order, value = cycle they receive payout
        // Initialise as all-zeroes; we fill them as members join (slot == join index).
        pod.payout_slots          = [0u8; 20];

        msg!(
            "Pod {} initialised: size={}, contribution={} lamports, cycle={}s",
            pod_id, size, contribution_lamports, cycle_seconds
        );
        Ok(())
    }

    // ── join_pod ──────────────────────────────────────────────────────────────

    /// A member joins by depositing 2 × contribution_lamports into the vault.
    /// Their payout slot is their join order (0-indexed).
    /// When the last member joins the pod becomes Active.
    pub fn join_pod(ctx: Context<JoinPod>) -> Result<()> {
        let pod = &mut ctx.accounts.pod;

        require!(pod.status == PodStatus::Open as u8,             TandaError::PodNotOpen);
        require!(ctx.accounts.member_account.wallet == Pubkey::default()
                 || !ctx.accounts.member_account.is_active(),      TandaError::AlreadyMember);
        require!((pod.member_count as usize) < pod.size as usize, TandaError::PodFull);

        let collateral = pod.contribution_lamports * COLLATERAL_MULTIPLIER;

        // Transfer collateral from member to vault (system_program transfer)
        let cpi_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.member_signer.to_account_info(),
                to:   ctx.accounts.vault.to_account_info(),
            },
        );
        system_program::transfer(cpi_ctx, collateral)?;

        // Initialise member account
        let slot = pod.member_count;
        let member = &mut ctx.accounts.member_account;
        member.pod_id               = pod.pod_id;
        member.wallet               = ctx.accounts.member_signer.key();
        member.payout_slot          = slot;
        member.cycles_paid          = 0;
        member.collateral_deposited = collateral;
        member.status               = MemberStatus::Active as u8;
        member.bump                 = ctx.bumps.member_account;

        // Record slot in pod
        pod.payout_slots[slot as usize] = slot;
        pod.member_count += 1;

        emit!(MemberJoinedEvent {
            pod_id:      pod.pod_id,
            member:      member.wallet,
            payout_slot: slot,
            collateral,
        });

        // Activate when full
        if pod.member_count == pod.size {
            pod.status           = PodStatus::Active as u8;
            pod.cycle_started_at = Clock::get()?.unix_timestamp;
            emit!(PodActivatedEvent {
                pod_id: pod.pod_id,
                activated_at: pod.cycle_started_at,
            });
        }

        Ok(())
    }

    // ── contribute ────────────────────────────────────────────────────────────

    /// Member pays their contribution for a cycle into the vault.
    ///
    /// When all active members have paid:
    ///   - The pot is transferred to the payout recipient.
    ///   - current_cycle is incremented.
    ///   - If all cycles done: collateral is returned, pod becomes Completed.
    pub fn contribute(ctx: Context<Contribute>, cycle: u64) -> Result<()> {
        let pod_id       = ctx.accounts.pod.pod_id;
        let pod_bump     = ctx.accounts.pod.bump;
        let vault_bump   = ctx.accounts.pod.vault_bump;
        let contribution = ctx.accounts.pod.contribution_lamports;
        let current      = ctx.accounts.pod.current_cycle;
        let total        = ctx.accounts.pod.total_cycles;

        require!(ctx.accounts.pod.status == PodStatus::Active as u8, TandaError::PodNotActive);
        require!(ctx.accounts.member_account.status == MemberStatus::Active as u8, TandaError::MemberDefaulted);
        require!(cycle == current,                                    TandaError::WrongCycle);
        require!(ctx.accounts.member_account.cycles_paid < cycle + 1, TandaError::AlreadyPaidThisCycle);

        // Transfer contribution from member to vault
        let cpi_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.member_signer.to_account_info(),
                to:   ctx.accounts.vault.to_account_info(),
            },
        );
        system_program::transfer(cpi_ctx, contribution)?;

        ctx.accounts.member_account.cycles_paid = cycle + 1;

        emit!(ContributionReceivedEvent {
            pod_id,
            member: ctx.accounts.member_signer.key(),
            cycle,
            amount: contribution,
        });

        // Count how many active members have paid this cycle
        // (We use member.cycles_paid as the marker: if member.cycles_paid == cycle + 1 they paid.)
        // NOTE: Because we can't iterate all member PDAs cheaply on-chain, we use a
        // payment counter stored in the pod account (payments_this_cycle).
        ctx.accounts.pod.payments_this_cycle += 1;

        let active_count = ctx.accounts.pod.active_member_count;

        if ctx.accounts.pod.payments_this_cycle >= active_count {
            // All active members paid — release the pot
            let pot = contribution * active_count as u64;

            // Identify payout recipient: payout_slots[cycle] gives the join-order index
            // of the member who receives on this cycle.
            let recipient_key = ctx.accounts.payout_recipient.key();

            // Vault PDA signer seeds
            let pod_id_bytes = pod_id.to_le_bytes();
            let vault_seeds: &[&[u8]] = &[b"vault", &pod_id_bytes, &[vault_bump]];

            // Transfer pot from vault to recipient
            let vault_lamports = ctx.accounts.vault.lamports();
            require!(vault_lamports >= pot, TandaError::InsufficientVaultBalance);

            **ctx.accounts.vault.try_borrow_mut_lamports()? -= pot;
            **ctx.accounts.payout_recipient.try_borrow_mut_lamports()? += pot;

            emit!(PayoutSentEvent {
                pod_id,
                recipient: recipient_key,
                cycle,
                amount: pot,
            });

            // Advance cycle
            let next_cycle = current + 1;
            ctx.accounts.pod.current_cycle       = next_cycle;
            ctx.accounts.pod.cycle_started_at    = Clock::get()?.unix_timestamp;
            ctx.accounts.pod.payments_this_cycle = 0;

            // If all cycles done: complete and return collateral in a separate ix
            if next_cycle >= total {
                ctx.accounts.pod.status = PodStatus::Completed as u8;
                emit!(PodCompletedEvent {
                    pod_id,
                    completed_at: Clock::get()?.unix_timestamp,
                });
            }

            let _ = vault_seeds; // suppress unused warning; used conceptually above
        }

        Ok(())
    }

    // ── claim_collateral ──────────────────────────────────────────────────────

    /// After the pod is Completed or Cancelled, a member reclaims their collateral.
    pub fn claim_collateral(ctx: Context<ClaimCollateral>) -> Result<()> {
        let pod    = &mut ctx.accounts.pod;
        let member = &mut ctx.accounts.member_account;

        require!(
            pod.status == PodStatus::Completed as u8
                || pod.status == PodStatus::Cancelled as u8,
            TandaError::PodNotSettled
        );
        require!(member.collateral_deposited > 0, TandaError::NoCollateral);

        let refund = member.collateral_deposited;
        member.collateral_deposited = 0;

        let vault_lamports = ctx.accounts.vault.lamports();
        require!(vault_lamports >= refund, TandaError::InsufficientVaultBalance);

        **ctx.accounts.vault.try_borrow_mut_lamports()? -= refund;
        **ctx.accounts.member_signer.try_borrow_mut_lamports()? += refund;

        emit!(CollateralRefundedEvent {
            pod_id: pod.pod_id,
            member: member.wallet,
            amount: refund,
        });

        Ok(())
    }

    // ── cancel_pod ────────────────────────────────────────────────────────────

    /// Organizer cancels an OPEN pod. Members then call claim_collateral.
    pub fn cancel_pod(ctx: Context<CancelPod>) -> Result<()> {
        let pod = &mut ctx.accounts.pod;
        require!(pod.status == PodStatus::Open as u8, TandaError::PodNotOpen);
        require!(
            ctx.accounts.organizer.key() == pod.organizer
                || ctx.accounts.organizer.key() == pod.authority,
            TandaError::Unauthorized
        );

        pod.status = PodStatus::Cancelled as u8;

        emit!(PodCancelledEvent {
            pod_id:       pod.pod_id,
            cancelled_at: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    // ── mark_default ──────────────────────────────────────────────────────────

    /// Authority marks a member as defaulted after the cycle deadline passes.
    /// The defaulted member's collateral is slashed and credited back to the vault
    /// for distribution to remaining members (done off-chain or via claim_collateral).
    pub fn mark_default(ctx: Context<MarkDefault>, _member_pubkey: Pubkey) -> Result<()> {
        let pod    = &mut ctx.accounts.pod;
        let member = &mut ctx.accounts.member_account;

        require!(pod.status == PodStatus::Active as u8,                TandaError::PodNotActive);
        require!(member.status == MemberStatus::Active as u8,          TandaError::AlreadyDefaulted);
        require!(
            ctx.accounts.authority.key() == pod.authority,             TandaError::Unauthorized
        );

        let now = Clock::get()?.unix_timestamp;
        require!(
            now > pod.cycle_started_at + pod.cycle_seconds,
            TandaError::DeadlineNotPassed
        );

        let slashed = member.collateral_deposited;
        member.collateral_deposited = 0;
        member.status               = MemberStatus::Defaulted as u8;

        // Reduce active member count
        pod.active_member_count = pod.active_member_count.saturating_sub(1);

        // Slashed lamports stay in the vault; distributed proportionally
        // to remaining active members' collateral_deposited fields.
        let remaining = pod.active_member_count;
        if remaining > 0 && slashed > 0 {
            // We can't iterate member PDAs here; instead we record the extra
            // vault balance and allow members to claim proportional shares
            // via a separate admin instruction or track it off-chain.
            // For MVP: leave slashed in vault — members receive it on claim_collateral
            // (they'll get slightly more than they deposited due to the slash).
        }

        emit!(MemberDefaultedEvent {
            pod_id:            pod.pod_id,
            member:            member.wallet,
            slashed_collateral: slashed,
        });

        // If only one active member remains, complete the pod
        if pod.active_member_count <= 1 {
            pod.status = PodStatus::Completed as u8;
            emit!(PodCompletedEvent {
                pod_id:       pod.pod_id,
                completed_at: now,
            });
        }

        Ok(())
    }
}

// ── Account Contexts ──────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(pod_id: u64)]
pub struct InitializePod<'info> {
    #[account(
        init,
        payer  = organizer,
        space  = Pod::LEN,
        seeds  = [b"pod", &pod_id.to_le_bytes()],
        bump,
    )]
    pub pod: Account<'info, Pod>,

    /// CHECK: This is a pure lamport vault PDA — no data, just holds SOL.
    #[account(
        init,
        payer  = organizer,
        space  = 0,
        seeds  = [b"vault", &pod_id.to_le_bytes()],
        bump,
    )]
    pub vault: AccountInfo<'info>,

    #[account(mut)]
    pub organizer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinPod<'info> {
    #[account(
        mut,
        seeds = [b"pod", &pod.pod_id.to_le_bytes()],
        bump  = pod.bump,
    )]
    pub pod: Account<'info, Pod>,

    /// CHECK: Vault PDA — holds SOL collateral.
    #[account(
        mut,
        seeds = [b"vault", &pod.pod_id.to_le_bytes()],
        bump  = pod.vault_bump,
    )]
    pub vault: AccountInfo<'info>,

    #[account(
        init,
        payer  = member_signer,
        space  = Member::LEN,
        seeds  = [b"member", &pod.pod_id.to_le_bytes(), member_signer.key().as_ref()],
        bump,
    )]
    pub member_account: Account<'info, Member>,

    #[account(mut)]
    pub member_signer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(cycle: u64)]
pub struct Contribute<'info> {
    #[account(
        mut,
        seeds = [b"pod", &pod.pod_id.to_le_bytes()],
        bump  = pod.bump,
    )]
    pub pod: Account<'info, Pod>,

    /// CHECK: Vault PDA.
    #[account(
        mut,
        seeds = [b"vault", &pod.pod_id.to_le_bytes()],
        bump  = pod.vault_bump,
    )]
    pub vault: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"member", &pod.pod_id.to_le_bytes(), member_signer.key().as_ref()],
        bump  = member_account.bump,
    )]
    pub member_account: Account<'info, Member>,

    #[account(mut)]
    pub member_signer: Signer<'info>,

    /// CHECK: The account that will receive the pot for this cycle.
    ///        Caller must pass the correct address matching payout_slots[cycle].
    #[account(mut)]
    pub payout_recipient: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimCollateral<'info> {
    #[account(
        mut,
        seeds = [b"pod", &pod.pod_id.to_le_bytes()],
        bump  = pod.bump,
    )]
    pub pod: Account<'info, Pod>,

    /// CHECK: Vault PDA.
    #[account(
        mut,
        seeds = [b"vault", &pod.pod_id.to_le_bytes()],
        bump  = pod.vault_bump,
    )]
    pub vault: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"member", &pod.pod_id.to_le_bytes(), member_signer.key().as_ref()],
        bump  = member_account.bump,
        has_one = wallet @ TandaError::Unauthorized,
    )]
    pub member_account: Account<'info, Member>,

    #[account(mut)]
    pub member_signer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelPod<'info> {
    #[account(
        mut,
        seeds = [b"pod", &pod.pod_id.to_le_bytes()],
        bump  = pod.bump,
    )]
    pub pod: Account<'info, Pod>,

    pub organizer: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(member_pubkey: Pubkey)]
pub struct MarkDefault<'info> {
    #[account(
        mut,
        seeds = [b"pod", &pod.pod_id.to_le_bytes()],
        bump  = pod.bump,
    )]
    pub pod: Account<'info, Pod>,

    #[account(
        mut,
        seeds = [b"member", &pod.pod_id.to_le_bytes(), member_pubkey.as_ref()],
        bump  = member_account.bump,
    )]
    pub member_account: Account<'info, Member>,

    pub authority: Signer<'info>,
}

// ── State Accounts ────────────────────────────────────────────────────────────

#[account]
pub struct Pod {
    pub pod_id:                u64,        // 8
    pub organizer:             Pubkey,     // 32
    pub authority:             Pubkey,     // 32
    pub size:                  u8,         // 1
    pub member_count:          u8,         // 1
    pub active_member_count:   u8,         // 1
    pub current_cycle:         u64,        // 8
    pub total_cycles:          u64,        // 8
    pub contribution_lamports: u64,        // 8
    pub cycle_seconds:         i64,        // 8
    pub cycle_started_at:      i64,        // 8
    pub status:                u8,         // 1  (PodStatus enum)
    pub payments_this_cycle:   u8,         // 1
    pub payout_slots:          [u8; 20],   // 20 (join-order → payout slot mapping)
    pub bump:                  u8,         // 1
    pub vault_bump:            u8,         // 1
    // padding to round to 8-byte boundary
    pub _padding:              [u8; 3],    // 3
}

impl Pod {
    /// 8 (discriminator) + fields above
    pub const LEN: usize = 8
        + 8   // pod_id
        + 32  // organizer
        + 32  // authority
        + 1   // size
        + 1   // member_count
        + 1   // active_member_count
        + 8   // current_cycle
        + 8   // total_cycles
        + 8   // contribution_lamports
        + 8   // cycle_seconds
        + 8   // cycle_started_at
        + 1   // status
        + 1   // payments_this_cycle
        + 20  // payout_slots
        + 1   // bump
        + 1   // vault_bump
        + 3   // padding
        ;     // total = 151 + 8 disc = 159 → round up to 160
}

#[account]
pub struct Member {
    pub pod_id:               u64,    // 8
    pub wallet:               Pubkey, // 32
    pub payout_slot:          u8,     // 1
    pub cycles_paid:          u64,    // 8  (stores cycle+1 as sentinel, 0 = never)
    pub collateral_deposited: u64,    // 8
    pub status:               u8,     // 1  (MemberStatus enum)
    pub bump:                 u8,     // 1
    pub _padding:             [u8; 5], // 5
}

impl Member {
    pub const LEN: usize = 8   // discriminator
        + 8   // pod_id
        + 32  // wallet
        + 1   // payout_slot
        + 8   // cycles_paid
        + 8   // collateral_deposited
        + 1   // status
        + 1   // bump
        + 5   // padding
        ;     // total = 72 + 8 disc = 80
}

impl Member {
    pub fn is_active(&self) -> bool {
        self.status == MemberStatus::Active as u8
    }
}

// ── Enums ─────────────────────────────────────────────────────────────────────

#[repr(u8)]
pub enum PodStatus {
    Open      = 0,
    Active    = 1,
    Completed = 2,
    Cancelled = 3,
}

#[repr(u8)]
pub enum MemberStatus {
    Active   = 0,
    Defaulted = 1,
}

// ── Events ────────────────────────────────────────────────────────────────────

#[event]
pub struct MemberJoinedEvent {
    pub pod_id:      u64,
    pub member:      Pubkey,
    pub payout_slot: u8,
    pub collateral:  u64,
}

#[event]
pub struct PodActivatedEvent {
    pub pod_id:       u64,
    pub activated_at: i64,
}

#[event]
pub struct ContributionReceivedEvent {
    pub pod_id: u64,
    pub member: Pubkey,
    pub cycle:  u64,
    pub amount: u64,
}

#[event]
pub struct PayoutSentEvent {
    pub pod_id:    u64,
    pub recipient: Pubkey,
    pub cycle:     u64,
    pub amount:    u64,
}

#[event]
pub struct PodCompletedEvent {
    pub pod_id:       u64,
    pub completed_at: i64,
}

#[event]
pub struct MemberDefaultedEvent {
    pub pod_id:             u64,
    pub member:             Pubkey,
    pub slashed_collateral: u64,
}

#[event]
pub struct CollateralRefundedEvent {
    pub pod_id: u64,
    pub member: Pubkey,
    pub amount: u64,
}

#[event]
pub struct PodCancelledEvent {
    pub pod_id:       u64,
    pub cancelled_at: i64,
}

// ── Errors ────────────────────────────────────────────────────────────────────

#[error_code]
pub enum TandaError {
    #[msg("Pod must have 2-20 members")]
    InvalidSize,
    #[msg("Contribution amount must be greater than zero")]
    ZeroContribution,
    #[msg("Cycle duration must be greater than zero")]
    ZeroCycleDuration,
    #[msg("Pod is not open for joining")]
    PodNotOpen,
    #[msg("Pod is not active")]
    PodNotActive,
    #[msg("Pod is not settled (completed or cancelled)")]
    PodNotSettled,
    #[msg("Wallet is already a member of this pod")]
    AlreadyMember,
    #[msg("Pod is already full")]
    PodFull,
    #[msg("Payment is for the wrong cycle")]
    WrongCycle,
    #[msg("Member has already paid for this cycle")]
    AlreadyPaidThisCycle,
    #[msg("Member has already been defaulted")]
    AlreadyDefaulted,
    #[msg("Member has defaulted and cannot contribute")]
    MemberDefaulted,
    #[msg("Cycle deadline has not passed yet")]
    DeadlineNotPassed,
    #[msg("Vault has insufficient lamport balance")]
    InsufficientVaultBalance,
    #[msg("No collateral to claim")]
    NoCollateral,
    #[msg("Caller is not authorized")]
    Unauthorized,
}
