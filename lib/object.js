const Immutable = require('./immutable');

const addProp = function(name, builder, data) {
  if (builder.props[name]) { return; }
  let value = data[name];
  if ('function' === typeof value) { return; }
  const getter = function() {
    return (value = Immutable.create(value, { clone: false }));
  };
  builder.defineProperty(name, getter);
};

/**
 * Immutable handler used to wrap a simple javascript object.
 * @name ImmutableObject
 * @param {object} data - Underlying array
 * @param {object} builder - Builder instance
 * @returns {undefined} no return value
 */
module.exports = function(data, builder) {
  for (const p in data) {
    if (Object.prototype.hasOwnProperty.call(data, p)) {
      addProp(p, builder, data);
    }
  }
};
