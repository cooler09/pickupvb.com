import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { EventsController } from './events.controller';
import { CreateEventHandler } from './application/commands/create-event.handler';
import { JoinEventHandler } from './application/commands/join-event.handler';
import { SearchEventsHandler } from './application/queries/search-events.handler';
import { GetEventByIdHandler } from './application/queries/get-event-by-id.handler';
import { SupabaseEventRepository } from './infrastructure/supabase-event-repository';
import { EVENT_REPOSITORY } from './application/tokens';

const CommandHandlers = [CreateEventHandler, JoinEventHandler];
const QueryHandlers = [SearchEventsHandler, GetEventByIdHandler];

@Module({
    imports: [CqrsModule],
    controllers: [EventsController],
    providers: [
        ...CommandHandlers,
        ...QueryHandlers,
        { provide: EVENT_REPOSITORY, useClass: SupabaseEventRepository },
    ],
})
export class EventsModule { }
