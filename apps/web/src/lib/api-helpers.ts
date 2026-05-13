import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getServerSupabase } from './supabase';

export async function requireUser() {
    const supabase = getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        return { user: null, response: NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }) };
    }
    return { user, response: null as null };
}

export async function getViewer() {
    const supabase = getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    return user;
}

export function handleError(err: unknown): NextResponse {
    if (err instanceof ZodError) {
        return NextResponse.json({ error: 'VALIDATION', issues: err.issues }, { status: 400 });
    }
    if (err instanceof Error) {
        if (err.message === 'NOT_FOUND') {
            return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
        }
        // Domain InvariantViolation has a `code` prop
        const code = (err as { code?: string }).code;
        if (code === 'INVARIANT_VIOLATION') {
            return NextResponse.json({ error: code, message: err.message }, { status: 422 });
        }
    }
    console.error(err);
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
}
