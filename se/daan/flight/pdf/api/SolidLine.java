package se.daan.flight.pdf.api;

public record SolidLine(
        Coordinate start,
        Coordinate end,
        float lineWidth
) implements Line { }
