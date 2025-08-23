
class ManagePage implements Page {
    page: Value<Page> = new Value(new EmptyPage())
    descriptions = [
        aircraft,
        aerodrome
    ]

    constructor(private entityRepo: EntityRepo) {

    }

    open<T extends VersionedEntity>(description: EntityDescription<T>) {
        this.page.set(new ManageEntityPage<T>(this.entityRepo, description, this))
    }

    showDetails<T extends VersionedEntity>(description: EntityDescription<T>, entity: T) {
        this.page.set(new ShowDetailsPage<T>(entity, description))
    }

    create<T extends VersionedEntity>(description: EntityDescription<T>) {
        this.page.set(new CreatePage<T>(description, this.entityRepo, this))
    }

    getComponent(): Component {
        return manage(this)
    }
}

function manage(managePage: ManagePage): Component {
    let titles = managePage.descriptions
        .map(e => div(text(e.name), onklick(() => managePage.open(e))))

    return arr([
        div(
            clazz("navigation-bar"),
            ...titles
        ),
        div(
            sub(map(managePage.page, (p: Page) => p.getComponent()))
        )
    ])
}


class ManageEntityPage<T extends VersionedEntity> implements Page {
    public entities: T[]
    constructor(
        repo: EntityRepo,
        private description: EntityDescription<T>,
        private managePage: ManagePage
    ) {
        this.entities = repo.getAllOfType(description.type)
    }

    name(entity: T): string {
        return entity[this.description.nameKey]
    }

    typeName(): string {
        return this.description.name
    }

    showDetails(entity: T) {
        this.managePage.showDetails(this.description, entity)
    }

    create() {
        this.managePage.create(this.description)
    }

    getComponent(): Component {
        return manageEntity(this)
    }
}

function manageEntity<T extends VersionedEntity>(
    manageEntityPage: ManageEntityPage<T>
) {
    let items = manageEntityPage.entities.map(e =>
        div(
            onklick(() => manageEntityPage.showDetails(e)),
            text(manageEntityPage.name(e))
        )
    )
    return arr([
        h1(text(manageEntityPage.typeName())),
        ...items,
        button(text("Create"), onklick(() => manageEntityPage.create()))
    ])
}

class ShowDetailsPage<T extends VersionedEntity> implements Page {
    constructor(
        public entity: T,
        public description: EntityDescription<T>
    ) {
    }

    title(): string {
        return this.description.name + ": " + this.entity[this.description.nameKey]
    }

    getComponent(): Component {
        return showDetails(this)
    }
}

function showDetails<T extends VersionedEntity>(
    showDetailsPage: ShowDetailsPage<T>
): Component {
    let fields = showDetailsPage.description.fields.map(f =>
        div(
            clazz("key-val"),
            div(text(f.name)),
            div(text(showDetailsPage.entity[f.key]))
        )
    )
    return arr([
        h1(text(showDetailsPage.title())),
        ...fields
    ])
}

class CreatePage<T extends VersionedEntity> implements Page {
    public values: { [key: string]: Value<string> } = {}

    constructor(
        public description: EntityDescription<T>,
        private entityRepo: EntityRepo,
        private managePage: ManagePage
    ) {
        description.fields.forEach(f => {
            this.values[f.key] = new Value("")
        })
    }

    title(): string {
        return "Create " + this.description.name
    }

    create() {
        let obj: VersionedEntity = {
            type: this.description.type,
            entity: this.entityRepo.nextEntity(),
            version: this.entityRepo.nextVersion()
        }
        for (let key in this.values) {
            obj[key] = this.values[key].get()
        }
        this.entityRepo.save([obj])
        this.managePage.open(this.description)
    }

    getComponent(): Component {
        return createEntity(this)
    }
}

function createEntity<T extends VersionedEntity>(
    createPage: CreatePage<T>
): Component {
    let fields = createPage.description.fields.map(f =>
        div(
            clazz("key-val"),
            div(text(f.name)),
            div(textInput(value(createPage.values[f.key]))),
        )
    )
    return arr([
        h1(text(createPage.title())),
        ...fields,
        button(text("Create"), onklick(() => createPage.create()))
    ])
}
