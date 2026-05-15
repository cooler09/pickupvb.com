import type {
    BracketConfig,
    BracketFormat,
    BracketRepository,
    EventRepository,
    MatchSet,
} from '@pickupvb/domain';
import {
    Bracket,
    NotFoundError,
    UnauthorizedError,
} from '@pickupvb/domain';

// ---- Commands ------------------------------------------------------------

export class CreateBracketCommand {
    constructor(
        public readonly eventId: string,
        public readonly requesterId: string,
        public readonly format: BracketFormat,
        public readonly config?: Partial<BracketConfig>,
    ) { }
}

export class SeedBracketCommand {
    constructor(
        public readonly eventId: string,
        public readonly requesterId: string,
        public readonly teamIdsInOrder: ReadonlyArray<string>,
        public readonly pools?: ReadonlyArray<string | null>,
    ) { }
}

export class GenerateBracketCommand {
    constructor(
        public readonly eventId: string,
        public readonly requesterId: string,
    ) { }
}

export class GeneratePlayoffCommand {
    constructor(
        public readonly eventId: string,
        public readonly requesterId: string,
    ) { }
}

export class ResetBracketCommand {
    constructor(
        public readonly eventId: string,
        public readonly requesterId: string,
    ) { }
}

export class RecordMatchResultCommand {
    constructor(
        public readonly eventId: string,
        public readonly matchId: string,
        public readonly requesterId: string,
        public readonly sets: ReadonlyArray<MatchSet>,
    ) { }
}

export class ResetMatchCommand {
    constructor(
        public readonly eventId: string,
        public readonly matchId: string,
        public readonly requesterId: string,
    ) { }
}

// ---- Helpers -------------------------------------------------------------

async function loadEventOrThrow(repo: EventRepository, eventId: string) {
    const evt = await repo.findById(eventId as never);
    if (!evt) throw new NotFoundError('event', eventId);
    return evt;
}

function assertHost(eventHostId: string, requesterId: string): void {
    // Co-host check happens at the route boundary (no domain port for it
    // yet); this guard catches the trivial "non-host trying to mutate".
    if (eventHostId !== requesterId) {
        throw new UnauthorizedError('Only the event host can manage the bracket.');
    }
}

// ---- Handlers ------------------------------------------------------------

export class CreateBracketHandler {
    constructor(
        private readonly events: EventRepository,
        private readonly brackets: BracketRepository,
    ) { }

    async execute(cmd: CreateBracketCommand): Promise<{ bracketId: string }> {
        const evt = await loadEventOrThrow(this.events, cmd.eventId);
        assertHost(evt.hostId, cmd.requesterId);
        const existing = await this.brackets.findByEventId(evt.id);
        if (existing) return { bracketId: existing.id };
        const bracket = Bracket.create(
            this.brackets.nextBracketId(),
            evt.id,
            cmd.format,
            cmd.config,
        );
        await this.brackets.save(bracket);
        return { bracketId: bracket.id };
    }
}

export class SeedBracketHandler {
    constructor(
        private readonly events: EventRepository,
        private readonly brackets: BracketRepository,
    ) { }

    async execute(cmd: SeedBracketCommand): Promise<void> {
        const evt = await loadEventOrThrow(this.events, cmd.eventId);
        assertHost(evt.hostId, cmd.requesterId);
        const bracket = await this.brackets.findByEventId(evt.id);
        if (!bracket) throw new NotFoundError('bracket', cmd.eventId);
        bracket.seedTeams(
            cmd.teamIdsInOrder.map((t) => t as never),
            cmd.pools,
        );
        await this.brackets.save(bracket);
    }
}

export class GenerateBracketHandler {
    constructor(
        private readonly events: EventRepository,
        private readonly brackets: BracketRepository,
    ) { }

    async execute(cmd: GenerateBracketCommand): Promise<void> {
        const evt = await loadEventOrThrow(this.events, cmd.eventId);
        assertHost(evt.hostId, cmd.requesterId);
        const bracket = await this.brackets.findByEventId(evt.id);
        if (!bracket) throw new NotFoundError('bracket', cmd.eventId);
        bracket.generate(() => this.brackets.nextMatchId());
        await this.brackets.save(bracket);
    }
}

export class GeneratePlayoffHandler {
    constructor(
        private readonly events: EventRepository,
        private readonly brackets: BracketRepository,
    ) { }

    async execute(cmd: GeneratePlayoffCommand): Promise<void> {
        const evt = await loadEventOrThrow(this.events, cmd.eventId);
        assertHost(evt.hostId, cmd.requesterId);
        const bracket = await this.brackets.findByEventId(evt.id);
        if (!bracket) throw new NotFoundError('bracket', cmd.eventId);
        bracket.generatePlayoff(() => this.brackets.nextMatchId());
        await this.brackets.save(bracket);
    }
}

export class ResetBracketHandler {
    constructor(
        private readonly events: EventRepository,
        private readonly brackets: BracketRepository,
    ) { }

    async execute(cmd: ResetBracketCommand): Promise<void> {
        const evt = await loadEventOrThrow(this.events, cmd.eventId);
        assertHost(evt.hostId, cmd.requesterId);
        const bracket = await this.brackets.findByEventId(evt.id);
        if (!bracket) throw new NotFoundError('bracket', cmd.eventId);
        bracket.reset();
        await this.brackets.save(bracket);
    }
}

export class RecordMatchResultHandler {
    constructor(private readonly brackets: BracketRepository) { }

    async execute(cmd: RecordMatchResultCommand): Promise<void> {
        // Permissions for "captain of either team" are enforced by Postgres
        // RLS at the persistence boundary; the domain only enforces match
        // state-machine guards.
        const bracket = await this.brackets.findByEventId(cmd.eventId as never);
        if (!bracket) throw new NotFoundError('bracket', cmd.eventId);
        bracket.recordResult({
            matchId: cmd.matchId as never,
            sets: cmd.sets,
        });
        await this.brackets.save(bracket);
    }
}

export class ResetMatchHandler {
    constructor(private readonly brackets: BracketRepository) { }

    async execute(cmd: ResetMatchCommand): Promise<void> {
        const bracket = await this.brackets.findByEventId(cmd.eventId as never);
        if (!bracket) throw new NotFoundError('bracket', cmd.eventId);
        bracket.resetMatch(cmd.matchId as never);
        await this.brackets.save(bracket);
    }
}
