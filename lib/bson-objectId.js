var Immutable = require('./immutable');

module.exports = function (data, builder, options) {
  builder.type = 'bson.ObjectId';

  builder.defineMethod('toString', function () {
    return data.toString();
  });

  builder.defineMethod('toHexString', function () {
    return data.toHexString();
  });

  builder.defineMethod('toJSON', function () {
    return data.toJSON();
  });

  builder.defineMethod('getTimestamp', function () {
    return data.getTimestamp();
  });
};
