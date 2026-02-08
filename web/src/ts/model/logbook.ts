interface LogbookEntry extends VersionedEntity {
    type: "logbook-entry"
    page: number
    line: number
    date: Date | null
    from: AerodromeVersion | null
    to: AerodromeVersion | null
    departure: Time | null
    arrival: Time | null
    aircraft: AircraftVersion | null
    landingsDay: number | null
    // Might be undefined for older events
    landingsNight: number | null
    // Might be undefined for older events
    night: Duration | null
    pic: Duration | null
    dual: Duration | null
    trip: TripId | null
}
