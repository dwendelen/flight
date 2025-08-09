package se.daan.flight.pdf.api;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

@JsonTypeInfo(
        use = JsonTypeInfo.Id.NAME,
        property = "type"
)
@JsonSubTypes({
//        @JsonSubTypes.Type(value = Line.class, name = "line"),
        @JsonSubTypes.Type(value = DottedLine.class, name = "line"), // For now
        @JsonSubTypes.Type(value = Text.class, name = "text"),
        @JsonSubTypes.Type(value = ColorBox.class, name = "colorbox"),
})
public sealed interface Drawing permits ColorBox, Line, Text {

}
