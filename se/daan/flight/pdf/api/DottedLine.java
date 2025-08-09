package se.daan.flight.pdf.api;

public record DottedLine(
        Coordinate start,
        Coordinate end,
        float lineWidth,
        float dotDistance,
        String style // For now
) implements Line { }
