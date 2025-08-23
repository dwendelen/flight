interface Page {
    getComponent(): Component
}

interface PageNavigator {
    open(page: Page)
}