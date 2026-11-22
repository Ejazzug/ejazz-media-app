// Enough react-native for a PURE module to be bundled and run in node. The modules under
// test never touch these at module scope; they import them for code that only runs on a
// phone, and a bundle that cannot resolve them does not build.
export const Platform = { OS: 'test', select: (o) => o.default ?? o.android };
export const AppState = { addEventListener: () => ({ remove() {} }) };
export const Share = { share: async () => ({ action: 'dismissedAction' }) };
