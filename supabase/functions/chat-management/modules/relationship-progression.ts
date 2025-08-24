import type { AddonSettings } from '../types/streaming-interfaces.ts';

// Builds the relationship progression guidance block based on persisted context & invitation status.
// Consolidated from previous inline logic in message-handler to ensure single source of truth.
export function buildRelationshipProgressionBlock(currentContext: any, addonSettings: AddonSettings): string {
  if (!addonSettings?.relationshipStatus || !currentContext) return '';
  const relLine = (currentContext as any).relationshipStatus || (currentContext as any).relationship;
  if (!relLine || relLine === 'No context') return '';

  let notReadyMatch = relLine.match(/not ready to move into (.+?)\./i);
  let readyMatch = relLine.match(/ready to move into (.+?)\./i);
  const nextStageLabel = (notReadyMatch || readyMatch)?.[1] || null;
  const isReady = /ready to move into/i.test(relLine) && !/not ready/i.test(relLine);
  const invitationStatus = (currentContext as any).relationship_meta?.invitation_status;
  let body = '';
  if (nextStageLabel) {
    if (isReady) {
      if (invitationStatus === 'ready_unasked') {
        body = `RP1 Ready for potential advance to "${nextStageLabel}" but requires explicit user proposal. RP2 Issue exactly ONE brief, natural invitation in THIS reply (single sentence asking if they'd like to become "${nextStageLabel}"). RP3 After inviting, stop inviting until user accepts or status changes. RP4 Never advance without explicit acceptance.`;
      } else if (invitationStatus === 'asked_pending') {
        body = `RP1 Awaiting user decision on invitation to advance to "${nextStageLabel}". RP2 Do NOT re-invite or pressure; respond naturally. RP3 If user clearly accepts/proposes, advancement occurs via system. RP4 If user declines, acknowledge respectfully and do not re-invite.`;
      } else if (invitationStatus === 'asked_declined') {
        body = `RP1 User previously declined advancement to "${nextStageLabel}". RP2 Do NOT re-invite unless user clearly reopens or proposes advancement. RP3 Maintain current stage comfortably.`;
      } else {
        body = `RP1 Ready for potential advance to "${nextStageLabel}". RP2 Wait for user to propose; do not invite (internal state).`;
      }
    } else {
      body = `RP1 Not ready to advance to "${nextStageLabel}". RP2 Politely decline advancement proposals; encourage bonding. RP3 Do not roleplay next stage.`;
    }
  } else {
    body = 'RP Final stage reached; no further advancement. Reaffirm politely if pressed.';
  }
  return body ? `\n\n[RELATIONSHIP PROGRESSION]\n${body}\n[/RELATIONSHIP PROGRESSION]` : '';
}
