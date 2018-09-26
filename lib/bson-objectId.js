/**
 * Immutable handler used to wrap bson ObjectID.
 * @name ImmutableBSONObjectID
 * @param {object} data
 * @param {object} builder
 */
module.exports = function(data, builder) {
  builder.type = 'bson.ObjectID';

  builder.defineMethod('toString', function() {
    return data.toString();
  });

  builder.defineMethod('inspect', function() {
    return `[Immutable|bson.ObjectId] ${data}`;
  });

  builder.defineMethod('toHexString', function() {
    return data.toHexString();
  });

  builder.defineMethod('toJSON', function() {
    return data.toJSON();
  });

  builder.defineMethod('getTimestamp', function() {
    return data.getTimestamp();
  });

  builder.defineProperty('id', function() {
    return data.id;
  });
};
