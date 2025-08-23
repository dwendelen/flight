
type Component = (elem: HTMLElement) => Subscription

function sub(val: View<Component>): Component {
    return (elem) => {
        let elemSub = val.get()(elem)
        let valSub = val.subscribe(v => {
            elemSub()
            elemSub = v(elem)
        });
        return () => {
            elemSub()
            valSub()
        }
    }
}

function arr(components: Component[]): Component {
    return (elem) => {
        let subs = []
        for (let component of components) {
            subs.push(component(elem))
        }
        return () => {
            for (let sub of subs) {
                sub()
            }
        }
    }
}

function factory(fn: () => Component): Component {
    return (elem) => {
        let comp = fn()
        return comp(elem)
    }
}

function div(...mods: Component[]): Component {
    return tag("div", ...mods)
}

function button(...mods: Component[]): Component {
    return tag("button", ...mods)
}

function h1(...mods: Component[]): Component {
    return tag("h1", ...mods)
}

function span(...mods: Component[]): Component {
    return tag("span", ...mods)
}

function dropdown<T>(value: Value<T>, options: T[], toString: (option: T) => string): Component {
    let opts = options.map(o => {
        let selected = (elem: HTMLOptionElement) => {
            if(value.get() === o) {
                elem.selected = true
            }
            return () => {}
        }
        return tag("option", text(toString(o)), selected)
    })
    let onChange = (elem: HTMLSelectElement) => {
        elem.onchange = () => {
            value.set(options[elem.selectedIndex])
        }
        return () => {
            elem.onchange = null
        }
    }
    return tag("select", onChange, ...opts)
}

function input(...mods: Component[]): Component {
    return tag("input", ...mods)
}

function type(type: string): Component {
    return (elem: HTMLInputElement) => {
        elem.type = type
        return () => {}
    }
}

function canvas(...mods: Component[]): Component {
    return tag("canvas", ...mods)
}

function br(...mods: Component[]): Component {
    return tag("br", ...mods)
}

function tag(tag: string, ...mods: Component[]): Component {
    return (elem) => {
        let div = document.createElement(tag);
        let subs: Subscription[] = []
        mods.forEach(m => subs.push(m(div)))
        elem.append(div)
        return () => {
            subs.forEach(s => s())
            div.remove()
        }
    }
}

function id(id: string): Component {
    return (elem) => {
        elem.id = id
        return () => elem.id = ""
    }
}

function text(text: string): Component {
    return (elem) => {
        // // Remove text elements
        // let child = elem.firstChild
        // while(child != null) {
        //     let next = child.nextSibling
        //     if(child instanceof Text) {
        //         child.remove()
        //     }
        //     child = next
        // }

        let textNode = document.createTextNode(text);
        elem.append(textNode)
        return () => textNode.remove()
    }
}

function clazz(className: string): Component {
    return (elem) => {
        elem.classList.add(className)
        return () => {
            elem.classList.remove(className)
        }
    }
}

function onklick(fn: () => void): Component {
    return (elem) => {
        elem.onclick = fn
        return () => {
            elem.onclick = null
        }
    }
}

function width(width: number): Component {
    return (elem: HTMLCanvasElement) => {
        elem.width = width
        return () => {}
    }
}

function height(height: number): Component {
    return (elem: HTMLCanvasElement) => {
        elem.height = height
        return () => {}
    }
}

function value(val: Value<string>): Component {
    return (elem: HTMLInputElement) => {
        elem.value = val.get()
        let sub = val.subscribe((v) => {
            elem.value = v
        })
        elem.onchange = () => {
            val.set(elem.value)
        }
        return () => {
            sub()
            elem.onchange = null
        }
    }
}

function onBlur(fn: () => void): Component {
    return (elem: HTMLInputElement) => {
        elem.onblur = fn
        return () => {
            elem.onblur = null
        }
    }
}
