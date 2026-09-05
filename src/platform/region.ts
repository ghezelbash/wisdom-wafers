/**
 * The one region.
 *
 * `europe-west1` was written out at four call sites — two client callable
 * factories, the global function options, and both schedules. A region change
 * would have had to find all four, and missing one is a client calling a
 * function that is not there: a 404 that reads, on a device, as "the network is
 * down".
 *
 * Read from the environment so a differently-located project is configuration
 * rather than a code change, with the current region as the default so nothing
 * has to be set for the environments that exist today.
 */
export const FUNCTIONS_REGION = process.env.EXPO_PUBLIC_FIREBASE_REGION ?? 'europe-west1';
