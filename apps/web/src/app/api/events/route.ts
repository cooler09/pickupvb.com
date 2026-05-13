import { NextRequest, NextResponse } from 'next/server';
import { CreateEventSchema, SearchEventsSchema } from '@pickupvb/types';
import { CreateEventCommand, SearchEventsQuery } from '@pickupvb/application';
import { handlers } from '@/lib/handlers';
import { getViewer, handleError, requireUser } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const params = Object.fromEntries(request.nextUrl.searchParams);
        const filters = SearchEventsSchema.parse(params);
        const viewer = await getViewer();
        const result = await handlers.searchEvents.execute(
            new SearchEventsQuery(viewer?.id ?? null, filters),
        );
        return NextResponse.json(result);
    } catch (err) {
        return handleError(err);
    }
}

export async function POST(request: NextRequest) {
    try {
        const auth = await requireUser();
        if (auth.response) return auth.response;
        const body = await request.json();
        const dto = CreateEventSchema.parse(body);
        const result = await handlers.createEvent.execute(
            new CreateEventCommand(auth.user.id, dto),
        );
        return NextResponse.json(result, { status: 201 });
    } catch (err) {
        return handleError(err);
    }
}
