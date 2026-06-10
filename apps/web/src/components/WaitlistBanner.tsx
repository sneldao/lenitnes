'use client';

import { useState } from 'react';
import { Mail, Send, X } from 'lucide-react';

export function WaitlistBanner() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) return;
    // In a real app you'd POST to /api/waitlist here.
    // For now, opening a mailto with the feedback intent.
    window.location.href = `mailto:hello@lenitnes.com?subject=LENITNES%20Early%20Access&body=Count%20me%20in!%0A%0AEmail:%20${encodeURIComponent(email)}`;
    setSubmitted(true);
  };

  return (
    <div className="reveal mx-auto max-w-xl rounded-2xl border border-accent/20 bg-accent/5 p-6 text-center">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-white">Early Access + Feedback</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            LENITNES is in open beta. We&apos;re building toward official launch. Join the waitlist
            or jump into our Telegram for instant updates.
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded-lg p-1 text-slate-600 hover:text-slate-300"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {!submitted ? (
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Mail className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input w-full pl-9 text-xs"
            />
          </div>
          <button type="submit" className="btn text-xs shrink-0">
            <Send className="h-3 w-3" />
            Join Waitlist
          </button>
        </form>
      ) : (
        <p className="mt-4 text-xs text-signal">Thanks! Check your inbox to confirm.</p>
      )}

      <div className="mt-3 flex items-center justify-center gap-3 text-[10px] text-slate-500">
        <span>Or join</span>
        <a
          href="https://t.me/lenitnes"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-accent hover:underline"
        >
          <Send className="h-2.5 w-2.5" /> Telegram channel
        </a>
        <span>for instant feedback.</span>
      </div>
    </div>
  );
}
