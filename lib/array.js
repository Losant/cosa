const { clone } = require('omnibelt');
const Immutable = require('./immutable');

/**
 * Immutable handler used to wrap a javascript array.
 * @name ImmutableArray
 * @param {object} data 
 * @param {object} builder 
 * @param {object} options
 */
module.exports = function (data, builder, options) {
  builder.type = 'Array';

  builder.defineProperty('length', data.length);

  const itemDefinition = options.definition ? options.definition.items || {} : {};
  const itemOptions = { definition: itemDefinition, clone: false };


  ['forEach', 'map', 'filter', 'some', 'every'].forEach(function (name) {
    builder.defineMethod(name, function (cb, thisArg) {
      var immuArr = Immutable.create(data, options);
      return Immutable.create(Array.prototype[name].call(data, function (val, index) {
        return cb.call(thisArg, Immutable.create(val, itemOptions), index, immuArr);
      }));
    });
  });

  ['reduce', 'reduceRight'].forEach(function (name) {
    builder.defineMethod(name, function (cb, initialValue) {
      var immuArr = Immutable.create(data, options);
      return Immutable.create(Array.prototype[name].call(data, function (prev, cur, index) {
        return cb(Immutable.create(prev), Immutable.create(cur, itemOptions), index, immuArr);
      }), initialValue);
    });
  });

  ['concat', 'join', 'slice', 'indexOf', 'lastIndexOf', 'reverse',
  'toString', 'toLocaleString'].forEach(function (name) {
    builder.defineMethod(name, function () {
      return Immutable.create(Array.prototype[name].apply(data, arguments), options);
    });
  });

  builder.defineMethod('push', function () {
    return Immutable.create(Array.prototype.concat.apply(data, arguments), options);
  });

  builder.defineMethod('unshift', function () {
    var args = Array(arguments.length);
    for (var i = 0, l = arguments.length; i < l; i++) {
      args[i] = arguments[i];
    }
    return Immutable.create(args.concat(data), options);
  });

  builder.defineMethod('sort', function (cb) {
    var newArr = clone(data);
    if (!cb) {
      return Immutable.create(newArr.sort(), options);
    }
    return Immutable.create(newArr.sort(function (a, b) {
      return cb(Immutable.create(a, itemOptions), Immutable.create(b, itemOptions));
    }));
  });

  builder.defineMethod('splice', function () {
    var args = Array(arguments.length);
    for (var i = 0, l = arguments.length; i < l; i++) {
      args[i] = arguments[i];
    }
    var start = args[0];
    var deleteCount = args[1];
    var items = args.slice(2) || [];
    var front = data.slice(0, start);
    var back = data.slice(start + deleteCount);
    return Immutable.create(front.concat(items, back), options);
  });

  builder.defineMethod('reverse', function () {
    var newArr = clone(data);
    return Immutable.create(newArr.reverse(), options);
  });
};
