'use client';

import { useEffect, useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { format } from 'date-fns';
import 'react-day-picker/style.css';

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
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function onClickOutside(e: MouseEvent) {
            if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, []);

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

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className={`${inputClass} text-left`}
                aria-haspopup="dialog"
                aria-expanded={open}
            >
                {display || <span className="text-fg/40">{placeholder}</span>}
            </button>
            <input type="hidden" name={name} value={value ? value.toISOString() : ''} />
            {open && (
                <div
                    role="dialog"
                    className="absolute left-0 top-full z-20 mt-1 rounded-md border border-border-base bg-surface p-3 shadow-lg"
                >
                    <DayPicker
                        mode="single"
                        selected={value ?? undefined}
                        onSelect={handleDay}
                        {...(minDate ? { disabled: { before: minDate } } : {})}
                        showOutsideDays
                    />
                    <div className="mt-2 flex items-center gap-2 border-t border-border-base pt-2">
                        <label htmlFor={`${name}-time`} className="text-sm text-fg">
                            Time
                        </label>
                        <input
                            id={`${name}-time`}
                            type="time"
                            value={time}
                            onChange={(e) => handleTime(e.target.value)}
                            className="rounded-md border border-border-base px-2 py-1 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="ml-auto rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary/90"
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
