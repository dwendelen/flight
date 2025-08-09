package se.daan.flight.pdf.api;

public record Text(
        Coordinate start,
        float fontSize,
        String text,
        String align
) implements Drawing { }
