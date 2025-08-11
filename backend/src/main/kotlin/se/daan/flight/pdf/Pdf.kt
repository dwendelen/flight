package se.daan.flight.pdf

import org.apache.pdfbox.pdmodel.PDDocument
import org.apache.pdfbox.pdmodel.PDPage
import org.apache.pdfbox.pdmodel.PDPageContentStream
import org.apache.pdfbox.pdmodel.common.PDRectangle
import org.apache.pdfbox.pdmodel.font.PDType1Font
import org.apache.pdfbox.pdmodel.font.Standard14Fonts
import org.apache.pdfbox.util.Matrix
import se.daan.flight.pdf.api.ColorBox
import se.daan.flight.pdf.api.DottedLine
import se.daan.flight.pdf.api.Page
import se.daan.flight.pdf.api.Text
import java.io.ByteArrayOutputStream

const val PT_PER_PX = 3f / 4f

fun generate(pages: List<Page>): ByteArray {
    val document = PDDocument()
    val font = PDType1Font(Standard14Fonts.FontName.TIMES_ROMAN)

    for (page in pages) {
        val pdPage = PDPage(
            PDRectangle(
                page.width * PT_PER_PX,
                page.height * PT_PER_PX
            )
        )
        document.addPage(pdPage)

        val stream = PDPageContentStream(document, pdPage)
        stream.transform(
            Matrix(
                PT_PER_PX, 0f,
                0f, -PT_PER_PX,
                0f, page.height * PT_PER_PX
            )
        )
        for (drawing in page.drawings) {
            if (drawing is DottedLine) {
                stream.setLineWidth(drawing.lineWidth)
                if ("dotted" == drawing.style) {
                    stream.setLineDashPattern(
                        floatArrayOf(
                            1.0f,
                            drawing.dotDistance
                        ), 0f
                    )
                } else if ("solid" == drawing.style) {
                    stream.setLineDashPattern(FloatArray(0), 0f)
                } else {
                    throw RuntimeException("Unknown style: " + drawing.style)
                }
                stream.moveTo(drawing.start.x, drawing.start.y)
                stream.lineTo(drawing.end.x, drawing.end.y)
                stream.stroke()
            } else if (drawing is Text) {
                val fontSize: Float = drawing.fontSize

                val xOffset: Float
                if (drawing.align == "left") {
                    xOffset = 0f
                } else if (drawing.align == "center") {
                    xOffset = -font.getStringWidth(drawing.text) / 1000f * fontSize / 2f
                } else if (drawing.align == "right") {
                    xOffset = -font.getStringWidth(drawing.text) / 1000f * fontSize
                } else {
                    throw RuntimeException("Unknown align: " + drawing.align)
                }
                stream.beginText()
                stream.setFont(font, fontSize)
                stream.setTextMatrix(
                    Matrix(
                        1f, 0f,
                        0f, -1f,
                        drawing.start.x + xOffset, drawing.start.y
                    )
                )
                stream.showText(drawing.text)
                stream.endText()
            } else if (drawing is ColorBox) {
                stream.addRect(
                    drawing.topLeft.x,
                    drawing.topLeft.y,
                    drawing.size.width,
                    drawing.size.height
                )
                stream.setNonStrokingColor(
                    drawing.color.r,
                    drawing.color.g,
                    drawing.color.b
                )
                stream.fill()
                stream.setNonStrokingColor(0f, 0f, 0f)
            }
        }
        stream.close()
    }

    val output = ByteArrayOutputStream()
    document.save(output)
    document.close()
    return output.toByteArray()
}