import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Deep health probe: verifies we can talk to Postgres via Supabase.
 * Cheap query (`select id from profiles limit 1`) under RLS — anonymous role
 * is allowed to read the public profiles list. Returns 503 on any failure so
 * uptime monitors can flip alerts.
 */
export async function GET() {
    const start = Date.now();
    try {
        const supabase = getServerSupabase();
        const { error } = await supabase.from('profiles').select('id').limit(1);
        if (error) {
            return NextResponse.json(
                {
                    status: 'degraded',
                    service: 'pickupvb-web',
                    db: 'error',
                    message: error.message,
                    durationMs: Date.now() - start,
                    time: new Date().toISOString(),
                },
                { status: 503 },
            );
        }
        return NextResponse.json({
            status: 'ok',
            service: 'pickupvb-web',
            db: 'ok',
            durationMs: Date.now() - start,
            time: new Date().toISOString(),
        });
    } catch (err) {
        return NextResponse.json(
            {
                status: 'down',
                service: 'pickupvb-web',
                db: 'unreachable',
                message: err instanceof Error ? err.message : String(err),
                durationMs: Date.now() - start,
                time: new Date().toISOString(),
            },
            { status: 503 },
        );
    }
}
