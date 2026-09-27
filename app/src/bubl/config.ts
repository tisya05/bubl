// Distances are in meters.

export const NEAR_ICON_M = 100;             // bubbles closer than this turn solid and show their icon
export const DEFAULT_POP_RADIUS_M = 15;
export const DEMO_POP_RADIUS_M = 60;        // the Lerner demo bubble (indoor GPS is off by 20 to 50 m)
// The map shows every bubble in the city (far ones as blurred dots). Only positions and
// categories are public: what's inside still only opens within a bubble's pop radius.
export const NEARBY_QUERY_RADIUS_M = 25_000; // what the map asks nearbyBubbles for (covers NYC)
export const MAX_NEARBY_RADIUS_M = 25_000;   // server cap on nearbyBubbles radiusM

// Lerner Hall, 2920 Broadway. Where the demo dot starts.
// TODO: confirm the exact spot on the seed trip.
export const LERNER_HALL = { lat: 40.8069, lng: -73.964 };
