'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export function NearMeButton() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [pending, start] = useTransition();
    const [error, setError] = useState<string | null>(null);

    function locate() {
        setError(null);
        if (!('geolocation' in navigator)) {
            setError('Geolocation not supported by this browser.');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const params = new URLSearchParams(searchParams.toString());
                params.set('lat', pos.coords.latitude.toFixed(6));
                params.set('lng', pos.coords.longitude.toFixed(6));
                if (!params.get('radiusKm')) params.set('radiusKm', '40');
                start(() => router.push(`/events?${params.toString()}`));
            },
            (err) => setError(err.message || 'Unable to read your location.'),
            { enableHighAccuracy: false, maximumAge: 5 * 60_000, timeout: 10_000 },
        );
    }

    return (
        <div className="flex items-center gap-3">
            <button
                type="button"
                onClick={locate}
                disabled={pending}
                className="rounded-md border border-primary/40 bg-surface px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-60"
            >
                {pending ? 'Locating…' : '📍 Near me'}
            </button>
            {error && (
                <span role="alert" className="text-sm text-red-600">
                    {error}
                </span>
            )}
        </div>
    );
}
