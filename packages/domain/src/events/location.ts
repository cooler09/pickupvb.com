import { InvariantViolation } from '../shared/result.js';

/**
 * Geographic location value object.
 * Latitude/longitude allow radius search ("events near me").
 */
export class Location {
    private constructor(
        public readonly addressLine: string,
        public readonly city: string,
        public readonly region: string,
        public readonly postalCode: string,
        public readonly country: string,
        public readonly latitude: number,
        public readonly longitude: number,
    ) { }

    static create(props: {
        addressLine: string;
        city: string;
        region: string;
        postalCode: string;
        country: string;
        latitude: number;
        longitude: number;
    }): Location {
        if (props.latitude < -90 || props.latitude > 90) {
            throw new InvariantViolation('Latitude must be between -90 and 90.');
        }
        if (props.longitude < -180 || props.longitude > 180) {
            throw new InvariantViolation('Longitude must be between -180 and 180.');
        }
        if (!props.city.trim() || !props.country.trim()) {
            throw new InvariantViolation('City and country are required.');
        }
        return new Location(
            props.addressLine.trim(),
            props.city.trim(),
            props.region.trim(),
            props.postalCode.trim(),
            props.country.trim(),
            props.latitude,
            props.longitude,
        );
    }
}
