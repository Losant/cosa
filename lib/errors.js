/**
 * Custom errors.
 * @namespace errors
 */

const createError = (type) => {
  const result = new Error();
  result.name = `${type}Error`;

  Object.defineProperty(result, 'type', {
    value: type,
    enumerable: true,
    writable: true,
    configurable: true
  });

  return result;
};

export default {

  /**
   * Error used when an action results in a conflict between documents.
   */
  Conflict: ({ message = 'Document conflict' }) => {
    const result = createError('Conflict');
    result.message = message;
    result.statusCode = 409;
    return result;
  },

  /**
   * Error used when validation of a document fails.
   */
  Validation: (cause) => {
    const result = createError('Validation');
    result.message = cause.message;
    result.statusCode = 400;

    Object.defineProperty(result, 'cause', {
      value: cause,
      configurable: true,
      enumerable: false
    });

    return result;
  }
};
