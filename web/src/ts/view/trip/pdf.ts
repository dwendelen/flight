function draw(canvas: HTMLCanvasElement, pages: PdfPage[]) {
    let pixels = Math.sqrt(window.screen.height * window.screen.height + window.screen.width * window.screen.width);
    // In HTML, there are 96 pixels per inch
    // TODO make configurable
    let scale = (pixels / 27) / 96

    let pageMargin = 20

    let width = 0
    let height = 0
    for (let page of pages) {
        if(width < page.width * scale) {
            width = page.width * scale
        }
        height += pageMargin + Math.ceil(page.height * scale);
    }
    width += 2 * pageMargin;
    height += pageMargin;

    canvas.width = width
    canvas.height = height

    let ctx = canvas.getContext("2d");
    ctx.fillStyle = "lightgrey"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    let xOffset = pageMargin
    let yOffset = pageMargin
    for (let page of pages) {
        drawPage(xOffset, yOffset, page)
        yOffset += pageMargin + Math.ceil(page.height * scale);
    }

    function drawPage(xOffset: number, yOffset: number, page: PdfPage) {
        ctx.resetTransform()
        ctx.translate(xOffset, yOffset)
        // ctx.scale(scale, scale);

        ctx.fillStyle = "white"
        ctx.fillRect(0, 0, Math.ceil(scale*page.width), Math.ceil(scale * page.height))
        ctx.fillStyle = "black"

        page.drawings.forEach((drawing) => {
            if(drawing.type === "line") {
                ctx.beginPath()
                if(drawing.style == "solid") {
                    ctx.setLineDash([])
                } else if(drawing.style == "dotted") {
                    ctx.setLineDash([1, (drawing as DottedLine).dotDistance])
                } else {
                    throw "Unknown style"
                }

                if(drawing.start.y == drawing.end.y) {
                    // Horizontal line
                    let width = Math.round(scale * drawing.lineWidth)
                    let halfWidth = width / 2;
                    let x1 = Math.round(scale * drawing.start.x)
                    let x2 = Math.round(scale * drawing.end.x)
                    let y = Math.round(scale * drawing.start.y - halfWidth) + halfWidth
                    ctx.moveTo(x1, y)
                    ctx.lineTo(x2, y)
                    ctx.lineWidth = width
                } else if (drawing.start.x == drawing.end.x) {
                    // Vertical line
                    let width = Math.round(scale * drawing.lineWidth)
                    let halfWidth = width / 2;
                    let x = Math.round(scale * drawing.start.x - halfWidth) + halfWidth
                    let y1 = Math.round(scale * drawing.start.y)
                    let y2 = Math.round(scale * drawing.end.y)
                    ctx.moveTo(x, y1)
                    ctx.lineTo(x, y2)
                    ctx.lineWidth = width
                } else {
                    ctx.moveTo(drawing.start.x, drawing.start.y)
                    ctx.lineTo(drawing.end.x, drawing.end.y)
                    ctx.lineWidth = drawing.lineWidth
                }
                ctx.stroke()
            } else if(drawing.type === "text") {
                ctx.font = "normal " + scale * drawing.fontSize + "px Times New Roman"
                if(drawing.align == "left") {
                    ctx.textAlign = "left"
                } else if(drawing.align == "center") {
                    ctx.textAlign = "center"
                } else if(drawing.align == "right") {
                    ctx.textAlign = "right"
                } else {
                    throw "Unknown align"
                }
                ctx.fillText(drawing.text, scale * drawing.start.x, scale * drawing.start.y)
            } else if(drawing.type === "colorbox") {
                ctx.beginPath()
                ctx.fillStyle = colorToString(drawing.color)
                let x1 = Math.round(scale * drawing.topLeft.x)
                let y1 = Math.round(scale * drawing.topLeft.y)
                let x2 = Math.round(scale * (drawing.topLeft.x + drawing.size.width))
                let y2 = Math.round(scale * (drawing.topLeft.y + drawing.size.height))
                ctx.fillRect(x1, y1, (x2 - x1), (y2 - y1))
                ctx.fillStyle = "black"
            } else {
                throw "Unknown type"
            }
        })
    }
}

function colorToString(color: Color): string {
    return "#" +
        componentToString(color.r) +
        componentToString(color.g) +
        componentToString(color.b)
}

function componentToString(comp: number) {
    let num = Math.round(comp * 255)
    if(num < 0) {
        num = 0
    } else if(num > 255) {
        num = 255
    }
    let str = num.toString(16)
    if(str.length < 2) {
        str = "0" + str
    }
    return str
}
