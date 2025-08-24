interface PdfPage {
    height: number,
    width: number,
    drawings: Drawing[]
}

type Drawing = Line | Txt | ColorBox

interface Coordinate {
    y: number // px
    x: number // px
}

interface Size {
    height: number // px
    width: number // px
}

interface Line {
    type: "line"
    start: Coordinate
    end: Coordinate
    lineWidth: number
    style: "solid" | "dotted"
}

interface SolidLine extends Line {
    style: "solid"
}

interface DottedLine extends Line {
    style: "dotted"
    dotDistance: number
}

interface Txt {
    type: "text"
    start: Coordinate
    fontSize: number // px
    text: string
    align: "left" | "center" | "right"
}

interface Color {
    r: number // 0.0 - 1.0
    g: number // 0.0 - 1.0
    b: number
}

interface ColorBox {
    type: "colorbox"
    topLeft: Coordinate
    size: Size
    color: Color
}
