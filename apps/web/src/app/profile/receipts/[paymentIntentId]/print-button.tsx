'use client';

export function PrintButton() {
    return (
        <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md border border-border-base px-3 py-1.5 text-sm hover:bg-fg/5"
        >
            Print / Save as PDF
        </button>
    );
}
