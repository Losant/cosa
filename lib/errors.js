/**
 * Custom errors.
 * @namespace errors
 */
export default {

  /**
   * Error used when an action results in a conflict between documents.
   */
  Conflict: ({ message = 'Document conflict' }) => {
    const result = new Error();

    Object.defineProperty(result, 'type', {
      value: 'Conflict',
      enumerable: true,
      writable: true,
      configurable: true
    });

    result.name = 'ConflictError';
    result.message = message;
    result.statusCode = 409;

    return result;
  },

  /**
   * Error used when validation of a document fails.
   */
  Validation: (cause) => {
    const result = new Error();

    Object.defineProperty(result, 'type', {
      value: 'Validation',
      enumerable: true,
      writable: true,
      configurable: true
    });

    Object.defineProperty(result, 'cause', {
      value: cause,
      configurable: true,
      enumerable: false
    });

    result.name = 'ValidationError';
    result.message = cause.message;
    result.statusCode = 400;

    return result;
  }
};
