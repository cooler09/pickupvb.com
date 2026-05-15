import { NextResponse } from 'next/server';
import { JoinEventCommand } from '@pickupvb/application';
import { handlers } from '@/lib/handlers';
import { handleError, requireUser } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const auth = await requireUser();
        if (auth.response) return auth.response;
        await handlers.joinEvent.execute(new JoinEventCommand(params.id, auth.user.id));
        return new NextResponse(null, { status: 204 });
    } catch (err) {
        return handleError(err);
    }
}
