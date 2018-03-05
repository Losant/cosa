var Immutable = require('./immutable');

/**
 * Immutable handler used to wrap a simple javascript object.
 * @name ImmutableObject
 * @param {object} data 
 * @param {object} builder 
 */
module.exports = function (data, builder) {

  function addProp(name) {
    if (builder.props[name]) { return; }
    var value = data[name];
    if ('function' === typeof value) { return; }
    var getter = function () {
      return (value = Immutable.create(value, { clone: false }));
    };
    builder.defineProperty(name, getter);
  }

  for (var p in data) {
    addProp(p);
  }

};
