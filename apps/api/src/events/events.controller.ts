import {
    Body,
    Controller,
    Get,
    Headers,
    HttpCode,
    Param,
    Post,
    Query,
    UnauthorizedException,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CreateEventSchema, SearchEventsSchema } from '@pickupvb/types';
import {
    CreateEventCommand,
    GetEventByIdQuery,
    JoinEventCommand,
    SearchEventsQuery,
} from './application/messages';

/**
 * Thin HTTP layer — validates input, dispatches CQRS messages, returns DTOs.
 * No domain logic lives here.
 */
@Controller('events')
export class EventsController {
    constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
    ) { }

    @Get()
    search(@Query() query: unknown, @Headers('x-user-id') viewerId?: string) {
        const parsed = SearchEventsSchema.parse(query);
        return this.queryBus.execute(new SearchEventsQuery(viewerId ?? null, parsed));
    }

    @Get(':id')
    getById(@Param('id') id: string) {
        return this.queryBus.execute(new GetEventByIdQuery(id));
    }

    @Post()
    @HttpCode(201)
    create(@Body() body: unknown, @Headers('x-user-id') userId?: string) {
        if (!userId) throw new UnauthorizedException();
        const dto = CreateEventSchema.parse(body);
        return this.commandBus.execute(new CreateEventCommand(userId, dto));
    }

    @Post(':id/join')
    @HttpCode(204)
    async join(@Param('id') id: string, @Headers('x-user-id') userId?: string) {
        if (!userId) throw new UnauthorizedException();
        await this.commandBus.execute(new JoinEventCommand(id, userId));
    }
}
