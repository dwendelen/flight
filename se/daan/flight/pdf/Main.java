package se.daan.flight.pdf;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.util.Matrix;
import se.daan.flight.pdf.api.*;

import java.io.File;
import java.io.IOException;
import java.util.List;

class Main {
    public static float PT_PER_PX = 3f / 4f;

    public static void main(String[] args) throws IOException {
        final ObjectMapper objectMapper = new ObjectMapper();
        final List<Page> pages = objectMapper.readValue(new File("/tmp/pdf.json"), new TypeReference<List<Page>>() { });

        final PDDocument document = new PDDocument();
        final PDType1Font font = new PDType1Font(Standard14Fonts.FontName.TIMES_ROMAN);

        for (Page page : pages) {
            final PDPage pdPage = new PDPage(new PDRectangle(
                    page.width() * PT_PER_PX,
                    page.height() * PT_PER_PX
            ));
            document.addPage(pdPage);

            final PDPageContentStream stream = new PDPageContentStream(document, pdPage);
            stream.transform(new Matrix(
                    PT_PER_PX, 0,
                    0, -PT_PER_PX,
                    0, page.height() * PT_PER_PX
            ));
            for (Drawing drawing : page.drawings()) {
                if(drawing instanceof DottedLine line) {
                    stream.setLineWidth(line.lineWidth());
                    if("dotted".equals(line.style())) {
                        stream.setLineDashPattern(new float[] {
                                1.0f,
                                line.dotDistance()
                        }, 0f);
                    } else if("solid".equals(line.style())) {
                        stream.setLineDashPattern(new float[0], 0f);
                    } else {
                        throw new RuntimeException("Unknown style: " + line.style());
                    }
                    stream.moveTo(line.start().x(), line.start().y());
                    stream.lineTo(line.end().x(), line.end().y());
                    stream.stroke();
                } else if(drawing instanceof Text text) {
                    final float fontSize = text.fontSize();

                    float xOffset;
                    if(text.align().equals("left")) {
                        xOffset = 0f;
                    } else if(text.align().equals("center")) {
                        xOffset = -font.getStringWidth(text.text()) / 1000f * fontSize / 2f;
                    } else if(text.align().equals("right")) {
                        xOffset = -font.getStringWidth(text.text()) / 1000f * fontSize;
                    } else {
                        throw new RuntimeException("Unknown align: " + text.align());
                    }
                    stream.beginText();
                    stream.setFont(font, fontSize);
                    stream.setTextMatrix(new Matrix(
                            1, 0,
                            0, -1,
                            text.start().x() + xOffset, text.start().y()
                    ));
                    stream.showText(text.text());
                    stream.endText();
                } else if(drawing instanceof ColorBox colorbox) {
                    stream.addRect(
                            colorbox.topLeft().x(),
                            colorbox.topLeft().y(),
                            colorbox.size().width(),
                            colorbox.size().height()
                    );
                    stream.setNonStrokingColor(
                            colorbox.color().r(),
                            colorbox.color().g(),
                            colorbox.color().b()
                    );
                    stream.fill();
                    stream.setNonStrokingColor(0f, 0f, 0f);
                }
            }
            stream.close();
        }

        document.save(new File("/tmp/pdf.pdf"));
        document.close();
    }
}