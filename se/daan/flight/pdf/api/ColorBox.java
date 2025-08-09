package se.daan.flight.pdf.api;

public record ColorBox(
        Coordinate topLeft,
        Size size,
        Color color
) implements Drawing { }
