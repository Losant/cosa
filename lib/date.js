var Immutable = require('./immutable');

module.exports = function (data, builder, options) {
  builder.type = 'Date';

  builder.defineMethod('mutate', function (cb) {
    var newDate = new Date(data.valueOf());
    cb.apply(newDate);
    return Immutable.create(newDate, { clone: false });
  });

  ['toString', 'toISOString', 'toUTCString', 'toDateString', 'toTimeString',
  'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString', 'valueOf',
  'getTime', 'getFullYear', 'getUTCFullYear', 'toGMTString', 'getMonth',
  'getUTCMonth', 'getDate', 'getUTCDate', 'getDay', 'getUTCDay', 'getHours',
  'getUTCHours', 'getMinutes', 'getUTCMinutes', 'getSeconds', 'getUTCSeconds',
  'getMilliseconds', 'getUTCMilliseconds', 'getTimezoneOffset', 'getYear',
  'toJSON'].forEach(function (name) {
    builder.defineMethod(name, function () {
      var args = Array(arguments.length);
      for (var i = 0, l = args.length; i < l; i++) {
        args[i] = arguments[i];
      }
      return Date.prototype[name].apply(data, args);
    });
  });

  ['setTime', 'setMilliseconds', 'setUTCMilliseconds', 'setSeconds',
  'setUTCSeconds', 'setMinutes', 'setUTCMinutes', 'setHours', 'setUTCHours',
  'setDate', 'setUTCDate', 'setMonth', 'setUTCMonth', 'setFullYear',
  'setUTCFullYear', 'setYear'].forEach(function (name) {
    builder.defineMethod(name, function () {
      var args = Array(arguments.length);
      for (var i = 0, l = args.length; i < l; i++) {
        args[i] = arguments[i];
      }
      var newDate = new Date(data.valueOf());
      newDate[name].apply(newDate, args);
      return Immutable.create(newDate, options);
    });
  });

};
