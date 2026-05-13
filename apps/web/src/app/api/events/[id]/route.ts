import { NextResponse } from 'next/server';
import { GetEventByIdQuery } from '@pickupvb/application';
import { handlers } from '@/lib/handlers';
import { handleError } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
    try {
        const result = await handlers.getEventById.execute(new GetEventByIdQuery(params.id));
        return NextResponse.json(result);
    } catch (err) {
        return handleError(err);
    }
}
