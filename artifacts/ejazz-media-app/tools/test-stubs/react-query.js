// The hooks are never called in these tests; they exist so the bundle resolves.
export const useQuery = () => ({ data: undefined, isLoading: false, isError: false });
export class QueryClient {}
