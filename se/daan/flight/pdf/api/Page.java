package se.daan.flight.pdf.api;

import java.util.List;

public record Page(
        float height,
        float width,
        List<Drawing> drawings
) { }
