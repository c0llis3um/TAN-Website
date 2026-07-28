/**
 * Plain-text Telegram message templates — one per notify.js/check-overdue.js
 * event, mirroring lib/email.js's templates 1:1 with the same inputs. Plain
 * text (no Markdown) so a user-supplied pod name can never break the send —
 * see lib/telegram.js's header comment.
 */

export function podCreatedTelegramText(pod) {
  return `Your tanda "${pod.name}" is live.\n\n` +
    `Contribution: ${pod.contribution_amount} ${pod.token} per cycle\n` +
    `Group size: ${pod.size} members\n` +
    `Chain: ${pod.chain}\n\n` +
    `Share the invite link with your group to start filling spots.`
}

export function podJoinedTelegramText(pod) {
  return `You're in! You've joined "${pod.name}".\n\n` +
    `Contribution: ${pod.contribution_amount} ${pod.token} per cycle\n\n` +
    `We'll message you here before each payment is due.`
}

export function paymentReceivedTelegramText(pod, { amount, token, cycle }) {
  return `Payment confirmed — ${pod.name}, cycle ${cycle}\n\n` +
    `Your payment of ${amount} ${token} has been recorded.`
}

export function paymentReminderTelegramText(pod, { cycle, dueDate }) {
  return `Payment due soon — ${pod.name}\n\n` +
    `Your contribution of ${pod.contribution_amount} ${pod.token} for cycle ${cycle} is due ` +
    `${dueDate ? `on ${new Date(dueDate).toLocaleDateString()}` : 'soon'}.\n\n` +
    `Pay on time to avoid your collateral being slashed.`
}

export function overdueSlashTelegramText(pod, { cycle, amount, token }) {
  return `Missed payment — collateral slashed for "${pod.name}"\n\n` +
    `You missed the cycle ${cycle} payment, so ${amount} ${token} of your collateral ` +
    `was used to keep the payout on schedule for the group.\n\n` +
    `You've been marked as defaulted for this pod.`
}
