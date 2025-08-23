

interface TripPlan extends VersionedEntity {
    type: "plan"
    trip: TripId
    powerSetting: string | null
    ias: number | null
    tas: number | null
    fuelFlow: number | null
    variation: number | null // TODO input
    fuelContingency: number | null // TODO input
    finalReserve: Duration | null // TODO input // TODO to seconds
    preTakeoffTime: Duration | null // TODO input // TODO to seconds
    preTakeoffFuel: number | null // TODO input
    postTakeoffTime: Duration | null // TODO input // TODO to seconds
    preLandingTime:  Duration | null // TODO input // TODO to seconds
    postLandingTime:  Duration | null // TODO input // TODO to seconds
    postLandingFuel: number | null // TODO input
    stops: Stop[]
    flightPlans: FlightPlan[]
}

interface Stop {
    aerodrome: AerodromeVersion
    refuel: boolean
}

interface FlightPlan {
    waypoints: Waypoint[]
    legs: Leg[]
}

type WaypointType =
    "take-off" |
    "simple" |
    "rate-one" |
    "landing"

interface Waypoint {
    name: string
    type: WaypointType
    altitude: number | null
    eta: number | null
}

interface Leg  {
    trueTrack: number | null
    distance: number | null
    windDirection: number | null
    windVelocity: number | null
    altitude: number | null
    msa: number | null
    ete: number | null
    notes: Note[]
}

interface Note {
    time: Duration | null
    note: string
    number: string
}
