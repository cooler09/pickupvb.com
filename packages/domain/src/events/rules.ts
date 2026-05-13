import { Format, Surface } from './enums.js';
import { InvariantViolation } from '../shared/result.js';

/**
 * Encodes the rule:
 *   - Indoor   → sixes | quads
 *   - Grass    → sixes | quads | triples | doubles
 *   - Sand     → sixes | quads | triples | doubles
 *
 * Pure function so it can be reused on the client (form validation),
 * server (command handler), and database (CHECK constraint mirror).
 */
export function isFormatAllowedForSurface(surface: Surface, format: Format): boolean {
    if (surface === Surface.Indoor) {
        return format === Format.Sixes || format === Format.Quads;
    }
    // grass + sand
    return (
        format === Format.Sixes ||
        format === Format.Quads ||
        format === Format.Triples ||
        format === Format.Doubles
    );
}

export function assertFormatAllowedForSurface(surface: Surface, format: Format): void {
    if (!isFormatAllowedForSurface(surface, format)) {
        throw new InvariantViolation(
            `Format '${format}' is not allowed on surface '${surface}'.`,
            { surface, format },
        );
    }
}

/**
 * Number of players that fill one "spot" depending on format.
 * Used for open-play capacity math.
 */
export function playersPerSide(format: Format): number {
    switch (format) {
        case Format.Sixes:
            return 6;
        case Format.Quads:
            return 4;
        case Format.Triples:
            return 3;
        case Format.Doubles:
            return 2;
    }
}
