package se.daan.flight.pdf.api

import com.fasterxml.jackson.annotation.JsonSubTypes
import com.fasterxml.jackson.annotation.JsonTypeInfo

data class Page(
    val height: Float,
    val width: Float,
    val drawings: List<Drawing>
)

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes(
    JsonSubTypes.Type(value = DottedLine::class, name = "line"),
    JsonSubTypes.Type(value = Text::class, name = "text"),
    JsonSubTypes.Type(value = ColorBox::class, name = "colorbox")
)
sealed interface Drawing

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "style")
@JsonSubTypes(
    JsonSubTypes.Type(value = SolidLine::class, name = "solid"),
    JsonSubTypes.Type(value = DottedLine::class, name = "dotted")
)
interface Line : Drawing {
    val start: Coordinate?
    val end: Coordinate?
    val lineWidth: Float
}

data class SolidLine(
    override val start: Coordinate,
    override val end: Coordinate,
    override val lineWidth: Float
) : Line

data class DottedLine(
    override val start: Coordinate,
    override val end: Coordinate,
    override val lineWidth: Float,
    val dotDistance: Float,
    val style: String // For now
) : Line


data class Text(
    val start: Coordinate,
    val fontSize: Float,
    val text: String,
    val align: String
) : Drawing

data class ColorBox(
    val topLeft: Coordinate,
    val size: Size,
    val color: Color
) : Drawing

data class Coordinate(
    val x: Float,
    val y: Float
)

data class Size(
    val width: Float,
    val height: Float
)

data class Color(
    val r: Float,
    val g: Float,
    val b: Float,
)