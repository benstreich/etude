/**
 * No events: Expo Modules documents no typed-array support in event payloads
 * (they are plain maps), so audio is pulled with read() rather than pushed.
 */
export type PitchInputEvents = Record<never, never>;
