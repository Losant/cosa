var defaults = require('defaults');
var Immutable = require('./immutable');

module.exports = function (data, builder, options) {

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
