// Every server function throws this shape on failure,
// except canPop and dropBubble, which return their union results.
export type ApiErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'invalid_input'
  | 'rate_limited'
  | 'internal';

export interface ApiError {
  code: ApiErrorCode;
  message: string;
}
