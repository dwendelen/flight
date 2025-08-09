package se.daan.flight.pdf.api;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

@JsonTypeInfo(
        use = JsonTypeInfo.Id.NAME,
        property = "style"
)
@JsonSubTypes({
        @JsonSubTypes.Type(value = SolidLine.class, name = "solid"),
        @JsonSubTypes.Type(value = DottedLine.class, name = "dotted")
})
public sealed interface Line extends Drawing permits SolidLine, DottedLine {
    Coordinate start();
    Coordinate end();
    float lineWidth();
}
