/**
 * Immutable handler used to wrap bson ObjectId.
 * @name ImmutableBSONObjectId
 * @param {object} data - the object id
 * @param {object} builder - the immutable handler to wrapper the object id.
 * @returns {undefined} - this adds methods on to the builder.
 */

export default function(data, builder) {
  builder.type = 'bson.ObjectId';

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
}
