type Subscription = () => void
type Listener<T> = (val: T) => void

interface View<T> {
    get(): T
    subscribe(listener: Listener<T>): Subscription
}

class Value<T> implements View<T> {
    private listeners: Set<Listener<T>> = new Set()

    constructor(private value: T = null) {
    }

    get(): T {
        return this.value;
    }

    set(value: T) {
        this.value = value
        this.listeners.forEach((l: Listener<T>) => l(this.value))
    }

    subscribe(listener: (val: T) => void): Subscription {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }
}

function map<I, O>(view: View<I>, fn: (inp: I) => O): View<O> {
    return new class implements View<O> {
        get(): O {
            return fn(view.get());
        }

        subscribe(listener: Listener<O>): Subscription {
            return view.subscribe((e) => listener(fn(e)));
        }
    }
}

function unique<T>(view: View<T>, eq: (a: T, b: T) => boolean): View<T> {
    return new class implements View<T> {
        get(): T {
            return view.get();
        }

        subscribe(listener: Listener<T>): Subscription {
            let last = view.get()
            return view.subscribe((e) => {
                if(!eq(last, e)) {
                    last = e
                    listener(e)
                }
            });
        }
    }
}

function eq(a: any, b: any): boolean {
    if(typeof a === "object" && typeof b === "object") {
        let keysA = Object.keys(a)
        let keysB = Object.keys(b)
        if(keysA.length !== keysB.length) {
            return false
        } else {
            return keysA.every(k => a[k] === b[k])
        }
    } else {
        return a === b
    }
}
