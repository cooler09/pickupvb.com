'use client';

import { useEffect, useRef, useState } from 'react';
import { primaryButtonClass } from '@/components/primary-button';
import { DayPicker } from 'react-day-picker';
import { format } from 'date-fns';
import 'react-day-picker/style.css';
import { useIsMounted } from '@/lib/use-is-mounted';

type Props = {
  name: string;
  value: Date | null;
  onChange: (d: Date | null) => void;
  minDate?: Date;
  placeholder?: string;
  inputClass: string;
};

/**
 * Combined date + time picker.
 * - Visible button shows formatted date/time.
 * - Popover contains a calendar (react-day-picker) and an HH:MM time input.
 * - Hidden <input name=…> carries an ISO string for form submission.
 */
export default function DateTimePicker({
  name,
  value,
  onChange,
  minDate,
  placeholder = 'Pick a date and time',
  inputClass,
}: Props) {
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState<string>(value ? format(value, 'HH:mm') : '18:00');
  const mounted = useIsMounted();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on click outside.
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // Escape closes the picker and returns focus to the trigger.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function closeAndReturnFocus() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function combine(date: Date | undefined, hhmm: string): Date | null {
    if (!date) return null;
    const [hStr, mStr] = hhmm.split(':');
    const h = Number(hStr ?? '0');
    const m = Number(mStr ?? '0');
    const next = new Date(date);
    next.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
    return next;
  }

  function handleDay(d: Date | undefined) {
    const next = combine(d, time);
    onChange(next);
  }

  function handleTime(hhmm: string) {
    setTime(hhmm);
    if (value) onChange(combine(value, hhmm));
  }

  const display = value ? format(value, 'EEE, MMM d, yyyy · h:mm a') : '';
  const timeZone =
    typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        id={name}
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        className={`${inputClass} text-left`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {mounted ? (
          display || <span className="text-fg/40">{placeholder}</span>
        ) : (
          // Render a stable placeholder on the server to avoid
          // hydration mismatches — the formatted date uses the
          // local TZ which differs between server and client.
          <span className="text-fg/40">{placeholder}</span>
        )}
      </button>
      <input type="hidden" name={name} value={value ? value.toISOString() : ''} />
      {mounted && timeZone && (
        <p className="text-muted mt-1 text-xs">
          Your timezone: <span className="text-fg/80 font-medium">{timeZone}</span>
        </p>
      )}
      {open && (
        <div
          role="dialog"
          className="border-border-base bg-surface absolute top-full left-0 z-20 mt-1 rounded-md border p-3 shadow-lg"
        >
          <DayPicker
            mode="single"
            selected={value ?? undefined}
            onSelect={handleDay}
            {...(minDate ? { disabled: { before: minDate } } : {})}
            showOutsideDays
          />
          <div className="border-border-base mt-2 flex items-center gap-2 border-t pt-2">
            <label htmlFor={`${name}-time`} className="text-fg text-sm">
              Time
            </label>
            <input
              id={`${name}-time`}
              type="time"
              value={time}
              onChange={(e) => handleTime(e.target.value)}
              className="border-border-base focus:border-primary focus-visible:ring-primary rounded-md border px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            />
            <button
              type="button"
              onClick={closeAndReturnFocus}
              className={`${primaryButtonClass('sm')} ml-auto`}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
