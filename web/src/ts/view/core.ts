


function aerodromeInput(
    aerodromes: Aerodrome[],
    aerodrome: Value<Aerodrome | null>
): Component {
    return codeBasedInput(
        aerodromes,
        aerodrome,
        (a) => a.code
    )
}

function aircraftInput(
    aircrafts: Aircraft[],
    aircraft: Value<Aircraft | null>
): Component {
    return codeBasedInput(
        aircrafts,
        aircraft,
        (a) => a.registration
    )
}

function formatHHMM(seconds: number | null): string {
    if (seconds == null) {
        return ""
    } else {
        let mins = Math.round(seconds / 60)
        let h = Math.floor(mins / 60)
        let m = mins - h * 60

        let hh = h < 10 ? '0' + h : h
        let mm = m < 10 ? '0' + m : m

        return hh + ":" + mm
    }
}

function formatHHMMt(seconds: number | null): string {
    if (seconds == null) {
        return ""
    } else {
        let halfMinutes = Math.round(seconds / 30)
        let h = Math.floor(halfMinutes / 120)
        let m = Math.floor((halfMinutes - h * 120) / 2)
        let t = halfMinutes % 2

        let hh = h < 10 ? '0' + h : h
        let mm = m < 10 ? '0' + m : m
        let tt = t === 0 ? ' ' : '\''

        return hh + ":" + mm + tt
    }
}

function formatMMSS(seconds: number | null): string {
    if (seconds == null) {
        return ""
    } else {
        let secs = Math.round(seconds)
        let m = Math.floor(secs / 60)
        let s = secs - m * 60

        let mm = m < 10 ? '0' + m : m
        let ss = s < 10 ? '0' + s : s

        return mm + ":" + ss
    }
}

function formatMMt(seconds: number | null): string {
    if (seconds == null) {
        return ""
    } else {
        let halfMinutes = Math.round(seconds / 30)
        let m = Math.floor(halfMinutes / 2)
        let t = halfMinutes % 2

        let mm = m < 10 ? '0' + m : m
        let tt = t === 0 ? ' ' : '\''

        return mm + tt
    }
}

function formatDate(date: Date | null): string {
    if (date == null) {
        return ""
    } else {
        let dd = date.d < 10 ? '0' + date.d : date.d
        let mm = date.m < 10 ? '0' + date.m : date.m
        let yy = date.y < 10 ? '0' + date.y : date.y

        return dd + "/" + mm + "/" + yy
    }
}



function textInput(...mods: Component[]): Component {
    return input(type("text"), ...mods)
}

function numberInput(val: Value<number | null>, min: number | null = null, max: number | null = null): Component {
    return conversionInput(val, (n) => n.toString(), (txt) => {
        let num = Number.parseFloat(txt);
        if(!isNaN(num) && !(min != null && num < min) && !(max != null && num > max)) {
            return num
        } else {
            return null
        }
    })
}

function timeInputMMSS(val: Value<Duration | Time | null>): Component {
    return conversionInput(val, formatMMSS, (txt) => {
        let mm: number
        let ss: number
        if(txt.length == 4) {
            mm = parseInt(txt.substring(0, 2));
            ss = parseInt(txt.substring(2, 4));
        } else if(txt.length == 5 && txt[2] == ":") {
            mm = parseInt(txt.substring(0, 2));
            ss = parseInt(txt.substring(3, 5));
        } else {
            return null
        }
        if(!isNaN(mm) && !isNaN(ss)) {
            return mm * 60 + ss
        } else {
            return null
        }
    })
}

function timeInputHHMM(val: Value<Time | Duration | null>): Component {
    return conversionInput(val, formatHHMM, (txt) => {
        let hh: number
        let mm: number
        if(txt.length == 4) {
            hh = parseInt(txt.substring(0, 2));
            mm = parseInt(txt.substring(2, 4));
        } else if(txt.length == 5 && txt[2] == ":") {
            hh = parseInt(txt.substring(0, 2));
            mm = parseInt(txt.substring(3, 5));
        } else {
            return null
        }
        if(!isNaN(hh) && !isNaN(mm)) {
            return (hh * 60 + mm) * 60
        } else {
            return null
        }
    })
}

function dateInput(val: Value<Date | null>): Component {
    return conversionInput(val, formatDate, (txt) => {
        let dd: number
        let mm: number
        let yy: number
        if(txt.length == 6) {
            dd = parseInt(txt.substring(0, 2));
            mm = parseInt(txt.substring(2, 4));
            yy = parseInt(txt.substring(4, 6));
        } else if(txt.length == 8 && txt[2] == "/" && txt[5] == "/") {
            dd = parseInt(txt.substring(0, 2));
            mm = parseInt(txt.substring(3, 5));
            yy = parseInt(txt.substring(6, 8));
        } else {
            return null
        }
        if(!isNaN(dd) && !isNaN(mm) && !isNaN(yy)) {
            return { d: dd, m: mm, y: yy}
        } else {
            return null
        }
    })
}


function codeBasedInput<T>(
    items: T[],
    value: Value<T | null>,
    toCode: (item: T) => string
) {
    return conversionInput(value, toCode, (str: string) => {
        let maybeVal = items
            .filter(a => toCode(a).toLowerCase() === str.toLowerCase())
        if (maybeVal.length > 0) {
            return maybeVal[0];
        } else {
            return null
        }
    })
}

function conversionInput<T>(
    val: Value<T | null>,
    toString: (v: T) => string,
    fromString: (str: string) => T | null
) {
    return factory(() => {
        let v = val.get()
        let text = new Value(v === null? "" : toString(v))

        let doOnBlur = () => {
            let txt = text.get();
            if(txt === "") {
                val.set(null)
            } else {
                let newVal = fromString(txt)
                if(newVal !== null) {
                    val.set(newVal)
                }
            }
            let v = val.get();
            text.set(v === null? "" : toString(v))
        }

        return textInput(value(text), onBlur(doOnBlur))
    })
}
