// A discriminated union: `status` tells TypeScript which other fields exist,
// so `data` can only be read after checking status === 'success'. This rules
// out impossible combinations like "loading and also has an error".
export type LoadState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string };
