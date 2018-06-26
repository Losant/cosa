const Immutable = require('./immutable');

const addProp = function(name, builder, data) {
  if (builder.props[name]) { return; }
  let value = data[name];
  if ('function' === typeof value) { return; }
  const getter = function () {
    return (value = Immutable.create(value, { clone: false }));
  };
  builder.defineProperty(name, getter);
}

/**
 * Immutable handler used to wrap a simple javascript object.
 * @name ImmutableObject
 * @param {object} data 
 * @param {object} builder 
 */
module.exports = function (data, builder) {
  for (let p in data) {
    addProp(p, builder, data);
  }

};
