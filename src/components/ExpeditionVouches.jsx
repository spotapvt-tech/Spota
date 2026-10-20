import { useState } from 'react';
import { UserCheck, Check, X } from 'lucide-react';
import { requestVouch, respondVouch, VOUCH_BONUS } from '../lib/communityService';
import { track } from '../lib/analytics';

const STATUS = { requested: 'waiting', confirmed: 'vouched', declined: 'declined' };

/** Inline form under a pending/rejected trek: ask a buddy or guide to vouch. */
export function VouchRequestForm({ attemptId, onSent }) {
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('buddy');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const row = await requestVouch(attemptId, username, role);
      track('attestation_requested', { role });
      onSent?.({ ...row, attester: username.trim().replace(/^@/, '') });
      setUsername('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="vouch-form" onSubmit={send} data-testid="vouch-form">
      <p className="vouch-help">
        Someone who was with you can vouch for this trek (+{VOUCH_BONUS} score). Buddies need Ridge Runner tier or higher;
        guides need a Spota partner agency.
      </p>
      <div className="vouch-form-row">
        <input
          aria-label="Their username"
          placeholder="@username"
          value={username}
          maxLength={40}
          onChange={(e) => setUsername(e.target.value)}
        />
        <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="buddy">Trek buddy</option>
          <option value="guide">Guide</option>
        </select>
        <button type="submit" disabled={busy || !username.trim()}>{busy ? 'Sending…' : 'Ask'}</button>
      </div>
      {error && <p className="expedition-hint">{error}</p>}
    </form>
  );
}

/** Outgoing vouch status chips for one trek. */
export function VouchStatus({ items }) {
  if (!items?.length) return null;
  return (
    <div className="vouch-status">
      {items.map((v) => (
        <span key={v.id} className={`vouch-chip is-${v.status}`}>
          <UserCheck size={12} /> @{v.attester} · {STATUS[v.status] || v.status}
          {v.status === 'confirmed' && v.bonus_applied ? ` · +${VOUCH_BONUS}` : ''}
        </span>
      ))}
    </div>
  );
}

/** Requests from other trekkers asking the signed-in user to vouch. */
export function IncomingVouches({ items, onAnswered }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const open = (items || []).filter((v) => v.status === 'requested');
  if (open.length === 0) return null;

  const answer = async (v, confirm) => {
    setBusyId(v.id);
    setError(null);
    try {
      const row = await respondVouch(v.id, confirm);
      if (confirm) track('attestation_given', { role: v.role });
      onAnswered?.(v.id, row?.status || (confirm ? 'confirmed' : 'declined'));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="vouch-incoming" data-testid="vouch-incoming">
      <span className="expedition-profile-label">Vouch requests</span>
      {open.map((v) => (
        <div key={v.id} className="vouch-incoming-row">
          <div>
            <strong>@{v.requester}</strong>
            <span>
              {v.adventure} · {new Date(v.completed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              {' · as '}{v.role === 'guide' ? 'guide' : 'trek buddy'}
            </span>
          </div>
          <div className="vouch-incoming-actions">
            <button type="button" className="vouch-yes" disabled={busyId === v.id} onClick={() => answer(v, true)}>
              <Check size={14} /> I was there
            </button>
            <button type="button" className="vouch-no" disabled={busyId === v.id} onClick={() => answer(v, false)} aria-label="Decline">
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
      <p className="vouch-help">Only vouch if you trekked with them. Vouches are logged and reviewed.</p>
      {error && <p className="expedition-hint">{error}</p>}
    </div>
  );
}
