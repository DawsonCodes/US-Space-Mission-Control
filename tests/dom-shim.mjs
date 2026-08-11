// Minimal browser surface so the app's modules can be imported under plain Node
// for the module-evaluation audit in check-project.mjs. It is deliberately
// inert: enough for module-scope code to run, not enough to render anything.

function makeEl() {
  const classes = new Set();
  return {
    dataset: {}, style: { setProperty() {}, removeProperty() {} },
    hidden: false, disabled: false, value: "", textContent: "", innerHTML: "",
    tabIndex: 0, open: false, offsetWidth: 0,
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c),
      toggle() {}, contains: (c) => classes.has(c)
    },
    addEventListener() {}, removeEventListener() {},
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    appendChild() {}, append() {}, prepend() {}, remove() {}, insertAdjacentHTML() {},
    querySelector: () => null, querySelectorAll: () => [],
    closest: () => null, contains: () => false,
    focus() {}, scrollIntoView() {}, getContext: () => null
  };
}

if (!globalThis.document) {
  globalThis.document = {
    documentElement: makeEl(),
    getElementById: () => makeEl(),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => makeEl(),
    createDocumentFragment: () => makeEl(),
    addEventListener() {},
    removeEventListener() {},
    visibilityState: "visible",
    get body() { return makeEl(); }
  };
}

if (!globalThis.window) {
  globalThis.window = {
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    setInterval: () => 0, clearInterval() {},
    setTimeout: () => 0, clearTimeout() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    devicePixelRatio: 1, innerWidth: 1280, innerHeight: 800,
    location: { href: "https://example.test/", search: "", pathname: "/", hash: "" },
    scrollTo() {}
  };
}

const store = new Map();
const memoryStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear()
};
if (!globalThis.localStorage) globalThis.localStorage = memoryStorage;
if (!globalThis.sessionStorage) globalThis.sessionStorage = { ...memoryStorage };
if (!globalThis.history) globalThis.history = { pushState() {}, replaceState() {} };
