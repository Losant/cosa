var chai = require('chai');
const chaiPromise = require('chai-as-promised');
chai.use(chaiPromise);
var MongoClient = require('mongodb').MongoClient;
var q = require('q');
var bson = require('bson');

chai.use(require('chai-datetime'));
var expect = chai.expect;

describe('Model', function () {

  var Model = require('../lib/model');
  var Immutable = require('../lib/immutable');
  var FullTestModel = require('./support/full-test-model');

  describe('.define()', function () {

    it('should return a model definition', function () {
      var ModelA = Model.define({
        collection: 'mocha_test',
        properties: {
          _type: { type: 'string', enum: ['A', 'B'], default: 'A'},
          strA: { type: 'string' }
        },
        methods: {
          blah: function () {
            return 'blah';
          }
        }
      });
      expect(ModelA.create).to.exist;
      expect(ModelA.extend).to.exist;
      expect(ModelA.count).to.exist;
      expect(ModelA.find).to.exist;
      expect(ModelA.findOne).to.exist;
      expect(ModelA.remove).to.exist;
    });

  });

  describe('.get()', function () {

    it('should return a value at the given path', function () {
      var model = FullTestModel.create({
        str: 'foo',
        obj: { deep: { blah: 'blah' } }
      });
      expect(model.get('str')).to.equal('foo');
      expect(model.get('obj.deep.blah')).to.equal('blah');
    });

  });

  describe('.set()', function () {

    it('should except a path and value and return a new model', function () {
      var model = FullTestModel.create({
        str: 'foo',
        obj: { deep: { blah: 'blah' } }
      });
      var model2 = model.set('obj.deep.blah', 'boo');
      expect(FullTestModel.isA(model2)).to.be.true;
      expect(model.get('obj.deep.blah')).to.equal('blah');
      expect(model2.get('obj.deep.blah')).to.equal('boo');
    });

    it('should except an object of values to assign and return a new model', function () {
      var model = FullTestModel.create({});
      var model2 = model.set({
        str: 'foo',
        obj: { deep: { blah: 'blah' } }
      });
      expect(FullTestModel.isA(model2)).to.be.true;
      expect(model2.fooString('str is set to {str}')).to.equal('str is set to foo');
      expect(model.get('str')).to.not.exist;
      expect(model.get('obj.deep.blah')).to.not.exist;
      expect(model2.get('str')).to.equal('foo');
      expect(model2.get('obj.deep.blah')).to.equal('blah');
    });

  });

  describe('.del()', function () {

    it('should delete the var at the given path and return a new model', function () {
      var model = FullTestModel.create({
        str: 'foo',
        obj: { deep: { blah: 'blah' } }
      });
      var model2 = model.del('str');
      var model3 = model.del('obj.deep.blah');
      expect(FullTestModel.isA(model2)).to.be.true;
      expect(FullTestModel.isA(model3)).to.be.true;
      expect(model.get('str')).to.equal('foo');
      expect(model2.get('str')).to.not.exist;
      expect(model.get('obj.deep.blah')).to.equal('blah');
      expect(model3.get('obj.deep.blah')).to.not.exist;
    });

  });

  describe('.has()', function () {

    it('should return true if the model contains a value at the given path', function () {
      var model = FullTestModel.create({
        str: 'foo',
        obj: { deep: { blah: 'blah' } }
      });
      expect(model.has('str')).to.be.true;
      expect(model.has('obj.deep.blah')).to.be.true;
    });

  });

  describe('.is()', function () {
    var _db;

    before(function (done) {
      MongoClient.connect(process.env.COSA_DB_URI, function (err, db) {
        if (err) { return done(err); }
        _db = db;
        done();
      })
    })

    after(function (done) {
      _db.collection('mocha_test', function (err, collection) {
        collection.deleteMany({}, function (err) {
          if (err) { return done(err); }
          _db.close();
          done();
        });
      });
    });

    // TODO split this up into multiple tests
    it('should return true if both objects reference the same doc', async function () {
      const obj = null;
      const modelA = Model.define({
        name: 'ModelA',
        collection: 'mocha_test',
        properties: {
          str: { type: 'string' }
        }
      }).create({ str: 'foo'});
      const modelB = Model.define({
        name: 'ModelB',
        collection: 'mocha_test',
        properties: {
          str: { type: 'string' }
        }
      }).create({ str: 'foo'});
      expect(modelA.is(obj)).to.be.false;
      expect(modelA.is(modelB)).to.be.false;
      let m = modelA;
      expect(modelA.is(m)).to.be.true;
      m = modelA.set('str', 'blah');
      expect(modelA.is(m)).to.be.false;
      const modelA2 = await modelA.save();
      expect(modelA.is(modelA2)).to.be.false;
      let m2 = modelA2.set('str', 'bar');
      expect(modelA2.is(m2)).to.be.true;
        // .then(function (modelA2) {
        //   // done();
        // })
        // .done(null, done);
    });

  });

  describe('.equals()', function () {
    var _db;

    before(function (done) {
      MongoClient.connect(process.env.COSA_DB_URI, function (err, db) {
        if (err) { return done(err); }
        _db = db;
        done();
      })
    })

    after(function (done) {
      _db.collection('mocha_test', function (err, collection) {
        collection.deleteMany({}, function (err) {
          if (err) { return done(err); }
          _db.close();
          done();
        });
      });
    });

    it('should return true if both objects reference the same doc and version', async function () {
      const modelA = Model.define({
        name: 'ModelA',
        collection: 'mocha_test',
        properties: {
          str: { type: 'string' }
        }
      }).create({ str: 'foo'});
      expect(modelA.equals(modelA.set('str', 'blah'))).to.be.false;
      const modelA2 = await modelA.save();
      expect(modelA2.equals(modelA2.set('num', 10))).to.be.false;
        // .then(function (modelA2) {
        //   done();
        // })
        // .done(null, done);
    });

  });

  describe('.isNew()', function () {
    var _db;

    before(function (done) {
      MongoClient.connect(process.env.COSA_DB_URI, function (err, db) {
        if (err) { return done(err); }
        _db = db;
        done();
      })
    })

    after(function (done) {
      _db.collection('mocha_test', function (err, collection) {
        collection.deleteMany({}, function (err) {
          if (err) { return done(err); }
          _db.close();
          done();
        });
      });
    });

    it('should return true if the model is new', async function () {
      var model = FullTestModel.create({
        str: 'foo'
      });
      expect(model.isNew()).to.be.true;
      const model2 = await model.save();
      expect(model2.isNew()).to.be.false;
    });

  });

  describe('.isModified()', function () {

    it('should return true if the given path is modified', function () {
      var model = FullTestModel.create({
        str: 'foo',
        obj: { deep: { blah: 'blah' } }
      });
      var m = model.set('arr', [1, 2, 3]);
      expect(m.isModified('arr')).to.be.true;
      expect(m.isModified('str')).to.be.false;
      var m2 = model.set('obj.deep.blah', 'boo');
      expect(m2.isModified('obj')).to.be.true;
      expect(m2.isModified('obj.deep')).to.be.true;
      expect(m2.isModified('obj.deep.blah')).to.be.true;
    });

    it('should return true if no path is given and the object has been modified', function () {
      var model = FullTestModel.create({
        str: 'foo',
        obj: { deep: { blah: 'blah' } }
      });
      expect(model.isModified()).to.be.false;
      var m = model.set('arr', [1, 2, 3]);
      expect(m.isModified()).to.be.true;
    });

  });

  describe('.toJSON()', function () {
    var _db;

    before(function (done) {
      MongoClient.connect(process.env.COSA_DB_URI, function (err, db) {
        if (err) { return done(err); }
        _db = db;
        done();
      });
    });

    after(function (done) {
      _db.collection('mocha_test', function (err, collection) {
        collection.deleteMany({}, function (err) {
          if (err) { return done(err); }
          _db.close();
          done();
        });
      });
    });

    it('should return valid json', function () {
      var DeepArrayModel = Model.define({
        collection: 'mocha_test',
        properties: {
          arr: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                oid: { type: 'objectid' }
              }
            }
          },
          nullVal: { type: '*' }
        }
      });
      var model = DeepArrayModel.create({
        arr: [
          { oid: bson.ObjectId('abdfabdfabdfabdfabdfabdf') },
          { oid: bson.ObjectId('abdfabdfabdfabdfabdfabdf') }
        ],
        nullVal: null
      });
      expect(JSON.stringify(model.toJSON())).to.equal("{\"arr\":[{\"oid\":{\"$oid\":\"abdfabdfabdfabdfabdfabdf\"}},{\"oid\":{\"$oid\":\"abdfabdfabdfabdfabdfabdf\"}}],\"nullVal\":null}");
    });

    it('should except an extended option', function () {
      var DeepArrayModel = Model.define({
        collection: 'mocha_test',
        properties: {
          arr: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                oid: { type: 'objectid' }
              }
            }
          }
        }
      });
      var model = DeepArrayModel.create({
        arr: [
          { oid: bson.ObjectId('abdfabdfabdfabdfabdfabdf') },
          { oid: bson.ObjectId('abdfabdfabdfabdfabdfabdf') }
        ]
      });
      expect(JSON.stringify(model.toJSON({ extended: false }))).to.equal("{\"arr\":[{\"oid\":\"abdfabdfabdfabdfabdfabdf\"},{\"oid\":\"abdfabdfabdfabdfabdfabdf\"}]}");
    });

    it('should except an exclude option', function () {
      var model = FullTestModel.create({
        str: 'test string',
        obj: { prop1: 'bar' }
      });
      var json = model.toJSON({ exclude: ['str', 'date'] });
      expect(JSON.stringify(json)).to.equal("{\"obj\":{\"prop1\":\"bar\",\"propv\":\"bar.undefined\"},\"num\":0,\"bool\":false,\"virt\":\"test string.virtual\"}");
    });

    it('should except an include option', function () {
      var model = FullTestModel.create({
        str: 'test string',
        obj: { prop1: 'bar' }
      });
      var json = model.toJSON({ include: ['num', 'bool', 'virt'] });
      expect(JSON.stringify(json)).to.equal("{\"num\":0,\"bool\":false,\"virt\":\"test string.virtual\"}");
    });

    it('should except a transform option', function () {
      var model = FullTestModel.create({
        str: 'test string'
      });
      var json = model.toJSON({ exclude: ['date'], transform: function (obj) {
        obj.str += ' TRANSFORMED!';
        return obj
      } });
      expect(JSON.stringify(json)).to.equal("{\"str\":\"test string TRANSFORMED!\",\"num\":0,\"bool\":false,\"virt\":\"test string.virtual\"}");
    });

  });

  describe('.validate()', function () {

    it('should reject promise if validation fails', () => {
      var model = FullTestModel.create({});
      return expect(model.validate()).to.be.eventually.rejectedWith({ statusCode: 400 });
    });

    it('should resolve promise if validation succeeds', () => {
      var model = FullTestModel.create({ str: 'bar' });
      return model.validate().then(() => {
          expect(true).to.be.true;
        });
    });

  });

  describe('db', function () {
    var _db, db = require('../lib/db');

    before(function (done) {
      MongoClient.connect(process.env.COSA_DB_URI, function (err, db) {
        if (err) { return done(err); }
        _db = db;
        _db.collection('mocha_test', function (err, collection) {
          collection.deleteMany({}, function (err) {
            if (err) { return done(err); }
            done();
          });
        });
      });
    });

    after(function (done) {
      _db.collection('mocha_test', function (err, collection) {
        collection.deleteMany({}, function (err) {
          if (err) { return done(err); }
          _db.close();
          done();
        });
      });
    });

    it('should auto connect to db if connection lost', async function () {
      var model = FullTestModel.create({
        str: 'foo',
        obj: { prop1: 'bar' }
      });
      let updatedModel = await model.save();
      let count = await FullTestModel.count({ _id: updatedModel._id });
      expect(count).to.equal(1);
      db._db.close();
      count = await FullTestModel.count({ _id: updatedModel._id });
      expect(count).to.equal(1);
    });

  });

  describe('.save()', function () {
    var _db, model;

    before(function (done) {
      model = FullTestModel.create({
        str: 'foo',
        obj: { prop1: 'bar' }
      });
      MongoClient.connect(process.env.COSA_DB_URI, function (err, db) {
        if (err) { return done(err); }
        _db = db;
        _db.collection('mocha_test', function (err, collection) {
          collection.deleteMany({}, function (err) {
            if (err) { return done(err); }
            done();
          });
        });
      });
    })

    after(function (done) {
      _db.collection('mocha_test', function (err, collection) {
        collection.deleteMany({}, function (err) {
          if (err) { return done(err); }
          _db.close();
          done();
        });
      });
    });

    it('should insert a new document', function () {
      var updatedModel;
      return model
        .save()
        .then(function (newModel) {
          var deferred = q.defer()
          updatedModel = newModel;
          expect(updatedModel._id).to.exist;
          expect(updatedModel._etag).to.exist;
          _db.collection('mocha_test', function (err, collection) {
            if (err) { return deferred.reject(err); }
            collection.count({}, function (err, count) {
              if (err) { return deferred.reject(err); }
              return deferred.resolve(count);
            });
          });
          return deferred.promise;
        })
        .then(function (count) {
          var deferred = q.defer()
          expect(count).to.equal(1);
          _db.collection('mocha_test', function (err, collection) {
            if (err) { return deferred.reject(err); }
            collection.findOne({ _id: updatedModel._id }, function (err, doc) {
              if (err) { return deferred.reject(err); }
              return deferred.resolve(doc);
            });
          });
          return deferred.promise;
        })
        .then(function (doc) {
          expect(updatedModel._etag).to.equal(doc._etag);
          expect(updatedModel._id.toObject().toString()).to.equal(doc._id.toString());
          expect(updatedModel.bool).to.equal(doc.bool);
          expect(updatedModel.date).to.equalDate(doc.date);
          expect(updatedModel.num).to.equal(doc.num);
          expect(updatedModel.obj.toObject()).to.eql(doc.obj);
          expect(updatedModel.str).to.equal(doc.str);
        });
    });

    it('should update an existing document', function () {
      var newModel, updatedModel;
      return model
        .save()
        .then(function (model) {
          newModel = model;
          return newModel.set('str', 'test update').set('num', 2).save();
        })
        .then(function (model) {
          var deferred = q.defer()
          updatedModel = model;
          expect(updatedModel._id.toString()).to.equal(newModel._id.toString());
          expect(updatedModel._etag).to.not.equal(newModel._etag);
          _db.collection('mocha_test', function (err, collection) {
            if (err) { return deferred.reject(err); }
            collection.findOne({ _id: updatedModel._id }, function (err, doc) {
              if (err) { return deferred.reject(err); }
              return deferred.resolve(doc);
            });
          });
          return deferred.promise;
        })
        .then(function (doc) {
          expect(updatedModel._etag).to.equal(doc._etag);
          expect(updatedModel._id.toObject().toString()).to.equal(doc._id.toString());
          expect(updatedModel.bool).to.equal(doc.bool);
          expect(updatedModel.date).to.equalDate(doc.date);
          expect(updatedModel.num).to.equal(doc.num);
          expect(updatedModel.obj.toObject()).to.eql(doc.obj);
          expect(updatedModel.str).to.equal(doc.str);
        });
    });

  });

  describe('.remove()', function () {
    var _db, model;

    before(function (done) {
      model = FullTestModel.create({
        str: 'test string',
        obj: { prop1: 'bar' }
      });
      MongoClient.connect(process.env.COSA_DB_URI, function (err, db) {
        if (err) { return done(err); }
        _db = db;
        done();
      })
    })

    after(function (done) {
      _db.collection('mocha_test', function (err, collection) {
        collection.deleteMany({}, function (err) {
          if (err) { return done(err); }
          _db.close();
          done();
        });
      });
    });

    it('should remove the document', function (done) {
      model
        .save()
        .then(function (updatedModel) {
          return updatedModel.remove();
        })
        .then(function () {
          _db.collection('mocha_test', function (err, collection) {
            if (err) { throw err; }
            collection.count({}, function (err, count) {
              if (err) { throw err; }
              expect(count).to.equal(0);
              done();
            });
          });
        })
        .catch(done);
        // .done(null, done);
    });

  });

  describe('.count()', function () {
    var _db, model;

    before(function (done) {
      model = FullTestModel.create({
        str: 'test string',
        obj: { prop1: 'bar' }
      });
      MongoClient.connect(process.env.COSA_DB_URI, function (err, db) {
        if (err) { return done(err); }
        _db = db;
        done();
      })
    })

    after(function (done) {
      _db.collection('mocha_test', function (err, collection) {
        collection.deleteMany({}, function (err) {
          if (err) { return done(err); }
          _db.close();
          done();
        });
      });
    });

    it('should return the count of objects', function (done) {
      model
        .save()
        .then(function (updatedModel) {
          return FullTestModel.count({ _id: updatedModel._id });
        })
        .then(function (count) {
          expect(count).to.equal(1);
          done();
        })
        .catch(done);
    });
  });

  describe('.find()', function () {
    var _db, model;

    before(function (done) {
      model = FullTestModel.create({
        str: 'test string',
        obj: { prop1: 'bar' }
      });
      MongoClient.connect(process.env.COSA_DB_URI, function (err, db) {
        if (err) { return done(err); }
        _db = db;
        done();
      })
    })

    after(function (done) {
      _db.collection('mocha_test', function (err, collection) {
        collection.deleteMany({}, function (err) {
          if (err) { return done(err); }
          _db.close();
          done();
        });
      });
    });

    it('should return a cursor to retrieve objects', function (done) {
      model
        .save()
        .then(function (updatedModel) {
          return FullTestModel.find({ _id: updatedModel._id });
        })
        .then(function (cursor) {
          return q.all([ cursor.count(), cursor.next() ])
            .spread(function (count, obj) {
              expect(count).to.equal(1);
              expect(Immutable.isImmutableType(obj, 'FullTestModel')).to.be.true;
              done();
            })
        })
        .catch(done);
    });

    it('should return an array if array option is given', function (done) {
      model
        .save()
        .then(function (updatedModel) {
          return FullTestModel.find({ _id: updatedModel._id }, { array: true });
        })
        .then(function (arr) {
          expect(Array.isArray(arr)).to.be.true;
          expect(arr.length).to.equal(1);
          expect(Immutable.isImmutableType(arr[0], 'FullTestModel')).to.be.true;
          done();
        })
        .catch(done);
    });

  });

  describe('.findOne()', function () {
    var _db, model;

    before(function (done) {
      model = FullTestModel.create({
        str: 'test string',
        obj: { prop1: 'bar' }
      });
      MongoClient.connect(process.env.COSA_DB_URI, function (err, db) {
        if (err) { return done(err); }
        _db = db;
        done();
      })
    })

    after(function (done) {
      _db.collection('mocha_test', function (err, collection) {
        collection.deleteMany({}, function (err) {
          if (err) { return done(err); }
          _db.close();
          done();
        });
      });
    });

    it('should return an object', function (done) {
      model
        .save()
        .then(function (updatedModel) {
          return FullTestModel.findOne({ _id: updatedModel._id });
        })
        .then(function (doc) {
          expect(doc).to.exist;
          expect(Immutable.isImmutableType(doc, 'FullTestModel'));
          done();
        })
        .catch(done);
    });

    it('should return null if no document is found', function () {
      return FullTestModel
        .findOne({ _id: 'asdfasdfasdf' })
        .then(function (doc) {
          expect(doc).to.not.exist;
        });
    });

  });

  describe('.update()', function () {
    var _db;

    before(function (done) {
      MongoClient.connect(process.env.COSA_DB_URI, function (err, db) {
        if (err) { return done(err); }
        _db = db;
        q.all([
          FullTestModel.create({ str: 'foo' }).save(),
          FullTestModel.create({ str: 'bar' }).save(),
          FullTestModel.create({ str: 'blah' }).save()
        ])
        .then(function () {
          done();
        })
        .catch(function (err) {
          done(err);
        });
      })
    })

    after(function (done) {
      _db.collection('mocha_test', function (err, collection) {
        collection.deleteMany({}, function (err) {
          if (err) { return done(err); }
          _db.close();
          done();
        });
      });
    });

    it('should partial update a single doc', function (done) {
      FullTestModel.update({}, { any: 'boo' })
        .then(function (result) {
          expect(result.matchedCount).to.equal(1);
          expect(result.modifiedCount).to.equal(1);
          return FullTestModel.findOne({ str: 'foo' });
        })
        .then(function (doc) {
          expect(doc.str).to.equal('foo');
          expect(doc.any).to.equal('boo');
          done();
        })
        .catch(done);
    });

    it('should partial update all docs', function (done) {
      FullTestModel.update({}, { any: 'any' }, { multiple: true })
        .then(function (result) {
          expect(result.matchedCount).to.equal(3);
          expect(result.modifiedCount).to.equal(3);
          return FullTestModel.find({}, { sort: { str: 1 } });
        })
        .then(function (cursor) {
          return cursor.toArray();
        })
        .then(function (docs) {
          expect(docs[0].str).to.equal('bar');
          expect(docs[0].any).to.equal('any');
          expect(docs[1].str).to.equal('blah');
          expect(docs[1].any).to.equal('any');
          expect(docs[2].str).to.equal('foo');
          expect(docs[2].any).to.equal('any');
          done();
        })
        .catch(done);
    });

    it('should replace single doc', function (done) {
      FullTestModel.update({}, { arr: ['a', 'b', 'c'] }, { autoSet: false })
        .then(function (result) {
          expect(result.matchedCount).to.equal(1);
          expect(result.modifiedCount).to.equal(1);
          return FullTestModel.find({ arr: ['a', 'b', 'c']});
        })
        .then(function (doc) {
          expect(doc.str).to.not.exist;
          done();
        })
        .done(null, done);
    });

  });

  describe('.distinct()', function () {
    var _db;

    before(function (done) {
      MongoClient.connect(process.env.COSA_DB_URI, function (err, db) {
        if (err) { return done(err); }
        _db = db;
        done();
      })
    })

    after(function (done) {
      _db.collection('mocha_test', function (err, collection) {
        collection.deleteMany({}, function (err) {
          if (err) { return done(err); }
          _db.close();
          done();
        });
      });
    });

    it('should return distinct key values', function (done) {
      var model = FullTestModel.create({
        str: 'test string'
      });
      var model2 = FullTestModel.create({
        str: 'another test string'
      });
      var model3 = FullTestModel.create({
        str: 'test string'
      });
      q.all([model.save(), model2.save(), model3.save()])
        .then(function () {
          return FullTestModel.distinct('str');
        })
        .then(function (results) {
          expect(results).to.contain('test string', 'another test string');
          done();
        })
        .catch(done);
    });

  });

  describe('.aggregate()', function () {
    var _db;

    before(function (done) {
      MongoClient.connect(process.env.COSA_DB_URI, function (err, db) {
        if (err) { return done(err); }
        _db = db;
        done();
      })
    })

    after(function (done) {
      _db.collection('mocha_test', function (err, collection) {
        collection.deleteMany({}, function (err) {
          if (err) { return done(err); }
          _db.close();
          done();
        });
      });
    });

    it('should return results of aggregate pipeline', function (done) {
      var model = FullTestModel.create({
        str: 'test string'
      });
      var model2 = FullTestModel.create({
        str: 'another test string'
      });
      var model3 = FullTestModel.create({
        str: 'test string'
      });
      q.all([model.save(), model2.save(), model3.save()])
        .then(function () {
          return FullTestModel.aggregate([
            { $group: { _id: '$str', count: { $sum: 1 } } }
          ]);
        })
        .then(function (results) {
          expect(results.length).to.equal(2);
          results.forEach(function (item) {
            expect(item).to.contain.all.keys('_id', 'count');
            expect(item).to.satisfy(function (val) {
              return (val._id === 'test string' && val.count === 2) ||
                (val._id === 'another test string' && val.count === 1);
            });
          });
          done();
        })
        .done(null, done);
    });

  });

  describe('.remove() [static]', function () {
    var _db, model;

    before(function (done) {
      model = FullTestModel.create({
        str: 'test string',
        obj: { prop1: 'bar' }
      });
      MongoClient.connect(process.env.COSA_DB_URI, function (err, db) {
        if (err) { return done(err); }
        _db = db;
        done();
      })
    })

    after(function (done) {
      _db.collection('mocha_test', function (err, collection) {
        collection.deleteMany({}, function (err) {
          if (err) { return done(err); }
          _db.close();
          done();
        });
      });
    });

    it('should remove a document', function (done) {
      var id;
      model
        .save()
        .then(function (updatedModel) {
          id = updatedModel._id;
          return FullTestModel.remove({ _id: updatedModel._id });
        })
        .then(function () {
          var deferred = q.defer();
          _db.collection('mocha_test', function (err, collection) {
            if (err) { return deferred.reject(err); }
            collection.count({ _id: id }, function (err, count) {
              if (err) { return deferred.reject(err); }
              return deferred.resolve(count);
            });
          });
          return deferred.promise;
        })
        .then(function (count) {
          expect(count).to.equal(0);
          done();
        })
        .catch(done);
    });
  });

  describe('.extend()', function () {

    it('should allow extending of a model', function () {
      var ModelA = Model.define({
        name: 'ModelA',
        abstract: true,
        collection: 'mocha_test',
        properties: {
          _type: { type: 'string', enum: ['A', 'B'], default: 'A'},
          strA: { type: 'string', default: 'A' }
        },
        methods: {
          blah: function () {
            return 'blah';
          }
        }
      });
      var ModelB = ModelA.extend({
        name: 'ModelB',
        where: { _type: 'B' },
        properties: {
          _type: { type: 'string', default: 'B', valid: 'B' },
          strB: { type: 'string', default: 'B' }
        }
      });
      var myModelA = ModelA.create({});
      expect(myModelA.strA).to.equal('A');
      expect(myModelA.strB).to.not.exist;
      var myModelB = ModelB.create({
        strA: 'abc',
        strB: '123'
      });
      expect(myModelB.strB).to.equal('123');
      expect(myModelB.strA).to.equal('abc');
      expect(myModelB.blah()).to.equal('blah');
    });

  });

  describe('.beforeSave()', function () {
    var _db;

    before(function (done) {
      MongoClient.connect(process.env.COSA_DB_URI, function (err, db) {
        if (err) { return done(err); }
        _db = db;
        done();
      })
    })

    after(function (done) {
      _db.collection('mocha_test', function (err, collection) {
        collection.deleteMany({}, function (err) {
          if (err) { return done(err); }
          _db.close();
          done();
        });
      });
    });

    it('should execute before a model is saved', function (done) {
      var strToSave = '';
      var HookedModel = Model.define({
        name: 'HookedModel',
        collection: 'mocha_test',
        properties: {
          str: { type: 'string' }
        },
        methods: {
          beforeSave: function () {
            strToSave = this.str;
          }
        }
      });
      var model = HookedModel.create({ str: 'foo' });
      expect(model.beforeSave).to.exist;
      model.save()
        .then(function () {
          expect(strToSave).to.equal('foo');
          done();
        })
        .catch(done);
    });

    it('should allow mutating model before saving', function (done) {
      var HookedModel = Model.define({
        name: 'HookedModel',
        collection: 'mocha_test',
        properties: {
          str: { type: 'string' }
        },
        methods: {
          beforeSave: function () {
            this.str += ' bar';
          }
        }
      });
      var model = HookedModel.create({ str: 'foo' });
      expect(model.beforeSave).to.exist;
      model.save()
        .then(function (model2) {
          expect(model2.str).to.equal('foo bar');
          done();
        })
        .catch(done);
    });

  });


  describe('.afterSave()', function () {
    var _db;

    before(function (done) {
      MongoClient.connect(process.env.COSA_DB_URI, function (err, db) {
        if (err) { return done(err); }
        _db = db;
        done();
      })
    })

    after(function (done) {
      _db.collection('mocha_test', function (err, collection) {
        collection.deleteMany({}, function (err) {
          if (err) { return done(err); }
          _db.close();
          done();
        });
      });
    });

    it('should execute after a model is saved', function (done) {
      var strSaved = '';
      let wasCalled = false;
      let checkFunction = function(instance, args){
        expect(instance.str).to.equal('foo');
        expect(args[0]).to.equal(null);
        wasCalled = true;
      }
      var HookedModel = Model.define({
        name: 'HookedModel',
        collection: 'mocha_test',
        properties: {
          str: { type: 'string' }
        },
        methods: {
          afterSave: function () {
            checkFunction(this, arguments);
            strSaved = this.str;
          }
        }
      });
      var model = HookedModel.create({ str: 'foo' });
      expect(model.afterSave).to.exist;
      model
        .save()
        .then(function (m) {
          expect(wasCalled).to.equal(true);
          wasCalled = false;
          checkFunction = function(instance, args){
            expect(instance.str).to.equal('bar');
            expect(args[0].str).to.equal('foo');
            wasCalled = true;
          }
          return m.set('str', 'bar').save();
        })
        .then(function () {
          expect(wasCalled).to.equal(true);
          expect(strSaved).to.equal('bar');
          done();
        })
        .catch(done);
    });

  });

  describe('.beforeRemove()', function () {
    var _db;

    before(function (done) {
      MongoClient.connect(process.env.COSA_DB_URI, function (err, db) {
        if (err) { return done(err); }
        _db = db;
        done();
      })
    })

    after(function (done) {
      _db.collection('mocha_test', function (err, collection) {
        collection.deleteMany({}, function (err) {
          if (err) { return done(err); }
          _db.close();
          done();
        });
      });
    });

    it('should execute before a model is removed', function (done) {
      var strRemoved = '';
      var HookedModel = Model.define({
        name: 'HookedModel',
        collection: 'mocha_test',
        properties: {
          str: { type: 'string' }
        },
        methods: {
          beforeRemove: function () {
            strRemoved = this.str;
          }
        }
      });
      var model = HookedModel.create({ str: 'foo' });
      expect(model.beforeRemove).to.exist;
      model
        .save()
        .then(function (m) {
          return m.remove();
        })
        .then(function () {
          expect(strRemoved).to.equal('foo');
          done();
        })
        .catch(done);
    });

  });

  describe('.afterRemove()', function () {
    var _db;

    before(function (done) {
      MongoClient.connect(process.env.COSA_DB_URI, function (err, db) {
        if (err) { return done(err); }
        _db = db;
        done();
      })
    })

    after(function (done) {
      _db.collection('mocha_test', function (err, collection) {
        collection.deleteMany({}, function (err) {
          if (err) { return done(err); }
          _db.close();
          done();
        });
      });
    });

    it('should execute after a model is removed', function (done) {
      var strRemoved = '';
      var HookedModel = Model.define({
        name: 'HookedModel',
        collection: 'mocha_test',
        properties: {
          str: { type: 'string' }
        },
        methods: {
          afterRemove: function () {
            strRemoved = this.str;
          }
        }
      });
      var model = HookedModel.create({ str: 'foo' });
      expect(model.afterRemove).to.exist;
      model
        .save()
        .then(function (m) {
          return m.remove();
        })
        .then(function () {
          expect(strRemoved).to.equal('foo');
          done();
        })
        .catch(done);
    });

  });

  describe('.project()', function () {
    var _db;

    before(function (done) {
      MongoClient.connect(process.env.COSA_DB_URI, function (err, db) {
        if (err) { return done(err); }
        _db = db;
        done();
      })
    })

    after(function (done) {
      _db.collection('mocha_test', function (err, collection) {
        collection.deleteMany({}, function (err) {
          if (err) { return done(err); }
          _db.close();
          done();
        });
      });
    });

    it('should return cursor of projected values', function (done) {
      FullTestModel
        .create({
          str: 'test string',
          obj: { prop1: 'bar' }
        })
        .save()
        .then(function () {
          return FullTestModel.project({}, { str: 1 }, { array: 1 });
        })
        .then(function (values) {
          expect(values.length).to.equal(1);
          expect(values[0].str).to.equal('test string');
          done();
        })
        .catch(done);
    });

  });

});
