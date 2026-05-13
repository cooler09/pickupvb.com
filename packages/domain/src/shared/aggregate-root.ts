/**
 * Base class for aggregate roots in DDD.
 * Tracks domain events raised during command handling so the application
 * layer can dispatch them after the transaction commits.
 */
import type { DomainEvent } from './domain-event.js';

export abstract class AggregateRoot<TId> {
    private _events: DomainEvent[] = [];

    protected constructor(public readonly id: TId) { }

    protected raise(event: DomainEvent): void {
        this._events.push(event);
    }

    pullEvents(): DomainEvent[] {
        const events = this._events;
        this._events = [];
        return events;
    }

    get pendingEvents(): readonly DomainEvent[] {
        return this._events;
    }
}
