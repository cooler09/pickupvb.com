import { InvariantViolation } from '../shared/result.js';

/**
 * Capacity for an open-play event. Either a fixed cap or unlimited.
 * Tournaments use TeamRoster instead.
 */
export class Capacity {
    private constructor(
        public readonly kind: 'fixed' | 'unlimited',
        public readonly maxSpots: number | null,
    ) { }

    static unlimited(): Capacity {
        return new Capacity('unlimited', null);
    }

    static fixed(maxSpots: number): Capacity {
        if (!Number.isInteger(maxSpots) || maxSpots <= 0) {
            throw new InvariantViolation('Fixed capacity must be a positive integer.', { maxSpots });
        }
        return new Capacity('fixed', maxSpots);
    }

    hasRoom(currentlyFilled: number): boolean {
        if (this.kind === 'unlimited') return true;
        return currentlyFilled < (this.maxSpots ?? 0);
    }
}
