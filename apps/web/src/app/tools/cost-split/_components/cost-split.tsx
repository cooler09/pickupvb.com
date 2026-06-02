'use client';

import { useState } from 'react';
import { neutralButtonClass } from '@/components/primary-button';
import {
  fieldInputClass as inputClass,
  fieldLabelClass as labelClass,
  fieldHintClass as hintClass,
} from '@/components/field-styles';
import {
  toCents,
  parsePeople,
  splitCost,
  allocationTotal,
  hasUnevenShares,
  formatCents,
  formatCostText,
} from '../_lib/cost.js';

export function CostSplit() {
  const [amount, setAmount] = useState('');
  const [peopleRaw, setPeopleRaw] = useState('');
  const [copied, setCopied] = useState(false);

  // Everything here is pure — derive the split live during render, no button.
  const totalCents = toCents(Number.parseFloat(amount));
  const people = parsePeople(peopleRaw);
  const allocations = splitCost(totalCents, people);
  const uneven = hasUnevenShares(people);
  const ready = totalCents > 0 && allocations.length > 0;

  function copy() {
    if (!ready) return;
    void navigator.clipboard?.writeText(formatCostText(allocations));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-6">
      <div className="border-border-base rounded-shape-sm space-y-5 border p-5">
        <div className="sm:w-1/2">
          <label htmlFor="amount" className={labelClass}>
            Total cost ($)
          </label>
          <input
            id="amount"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="120.00"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="people" className={labelClass}>
            Attendees
          </label>
          <textarea
            id="people"
            value={peopleRaw}
            onChange={(e) => setPeopleRaw(e.target.value)}
            rows={7}
            placeholder={'Alex\nBo\nCara\nDev…'}
            className={`${inputClass} resize-y font-mono`}
          />
          <p className={hintClass}>
            One name per line. Add a number to give someone extra shares — e.g.{' '}
            <span className="font-mono">Alex 2</span> pays double.{' '}
            {people.length > 0 ? `${people.length} attendee${people.length === 1 ? '' : 's'}.` : ''}
          </p>
        </div>
      </div>

      {ready ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-fg text-lg font-semibold">
              {people.length} {people.length === 1 ? 'person' : 'people'} ·{' '}
              {formatCents(allocationTotal(allocations))}
            </h2>
            <button type="button" onClick={copy} className={neutralButtonClass('sm')}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <ul className="divide-border-base border-border-base rounded-shape-sm divide-y border">
            {allocations.map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="text-fg">
                  {a.name}
                  {uneven ? (
                    <span className="text-muted ml-1.5 text-xs">
                      ({a.shares} share{a.shares === 1 ? '' : 's'})
                    </span>
                  ) : null}
                </span>
                <span className="text-fg font-medium">{formatCents(a.cents)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (people.length > 0 || amount !== '') && !ready ? (
        <p className="text-muted text-sm">Enter a total amount and add at least one attendee.</p>
      ) : null}
    </div>
  );
}
