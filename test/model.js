const { promisify }      = require('es6-promisify');
const chai               = require('chai');
const MongoClient        = require('mongodb').MongoClient;
const bson               = require('bson');
chai.use(require('chai-as-promised'));
chai.use(require('chai-datetime'));
const expect             = chai.expect;
const MongoClientPromise = promisify(MongoClient.connect);

const getMongoClient = () => MongoClientPromise(process.env.COSA_DB_URI);
const cleanUpDb = (db, close = true) => {
  return new Promise((resolve, reject) => {
    db.collection('mocha_test', function(err, collection) {
      if (err) { return reject(err); }
      collection.deleteMany({}, function(err) {
        if (err) { return reject(err); }
        if (close) { db.close(); }
        return resolve();
      });
    });
  });
};

describe('Model', () => {

  let _db;

  beforeEach(async () => {
    _db = await getMongoClient();
    return cleanUpDb(_db, false);
  });

  afterEach(() => {
    return cleanUpDb(_db);
  });

  const Model = require('../lib/model');
  const Immutable = require('../lib/immutable');
  const FullTestModel = require('./support/full-test-model');

  describe('.define()', () => {

    it('should return a model definition', () => {
      const ModelA = Model.define({
        collection: 'mocha_test',
        properties: {
          _type: { type: 'string', enum: ['A', 'B'], default: 'A' },
          strA: { type: 'string' }
        },
        methods: {
          blah: function() {
            return 'blah';
          }
        }
      });
      expect(ModelA.create).to.be.a('function');
      expect(ModelA.extend).to.be.a('function');
      expect(ModelA.count).to.be.a('function');
      expect(ModelA.find).to.be.a('function');
      expect(ModelA.findOne).to.be.a('function');
      expect(ModelA.remove).to.be.a('function');
    });

  });

  describe('.get()', () => {

    it('should return a value at the given path', () => {
      const model = FullTestModel.create({
        str: 'foo',
        obj: { deep: { blah: 'blah' } }
      });
      expect(model.get('str')).to.equal('foo');
      expect(model.get('obj.deep.blah')).to.equal('blah');
    });

  });

  describe('.set()', () => {

    it('should except a path and value and return a new model', () => {
      const model = FullTestModel.create({
        str: 'foo',
        obj: { deep: { blah: 'blah' } }
      });
      const model2 = model.set('obj.deep.blah', 'boo');
      expect(FullTestModel.isA(model2)).to.equal(true);
      expect(model.get('obj.deep.blah')).to.equal('blah');
      expect(model2.get('obj.deep.blah')).to.equal('boo');
    });

    it('should except an object of values to assign and return a new model', () => {
      const model = FullTestModel.create({});
      const model2 = model.set({
        str: 'foo',
        obj: { deep: { blah: 'blah' } }
      });
      expect(FullTestModel.isA(model2)).to.equal(true);
      expect(model2.fooString('str is set to {str}')).to.equal('str is set to foo');
      expect(model.get('str')).to.be.oneOf([ null, undefined ]);
      expect(model.get('obj.deep.blah')).to.be.oneOf([ null, undefined ]);
      expect(model2.get('str')).to.equal('foo');
      expect(model2.get('obj.deep.blah')).to.equal('blah');
    });

  });

  describe('.del()', () => {

    it('should delete the var at the given path and return a new model', () => {
      const model = FullTestModel.create({
        str: 'foo',
        obj: { deep: { blah: 'blah' } }
      });
      const model2 = model.del('str');
      const model3 = model.del('obj.deep.blah');
      expect(FullTestModel.isA(model2)).to.equal(true);
      expect(FullTestModel.isA(model3)).to.equal(true);
      expect(model.get('str')).to.equal('foo');
      expect(model2.get('str')).to.be.oneOf([ null, undefined ]);
      expect(model.get('obj.deep.blah')).to.equal('blah');
      expect(model3.get('obj.deep.blah')).to.be.oneOf([ null, undefined ]);
    });

  });

  describe('.has()', () => {

    it('should return true if the model contains a value at the given path', () => {
      const model = FullTestModel.create({
        str: 'foo',
        obj: { deep: { blah: 'blah' } }
      });
      expect(model.has('str')).to.equal(true);
      expect(model.has('obj.deep.blah')).to.equal(true);
    });

  });

  describe('.is()', function() {
    // TODO split this up into multiple tests
    it('should return true if both objects reference the same doc', async () => {
      const obj = null;
      const modelA = Model.define({
        name: 'ModelA',
        collection: 'mocha_test',
        properties: {
          str: { type: 'string' }
        }
      }).create({ str: 'foo' });
      const modelB = Model.define({
        name: 'ModelB',
        collection: 'mocha_test',
        properties: {
          str: { type: 'string' }
        }
      }).create({ str: 'foo' });
      expect(modelA.is(obj)).to.equal(false);
      expect(modelA.is(modelB)).to.equal(false);
      let m = modelA;
      expect(modelA.is(m)).to.equal(true);
      m = modelA.set('str', 'blah');
      expect(modelA.is(m)).to.equal(false);
      const modelA2 = await modelA.save();
      expect(modelA.is(modelA2)).to.equal(false);
      const m2 = modelA2.set('str', 'bar');
      expect(modelA2.is(m2)).to.equal(true);
    });

  });

  describe('.equals()', function() {

    it('should return true if both objects reference the same doc and version', async () => {
      const modelA = Model.define({
        name: 'ModelA',
        collection: 'mocha_test',
        properties: {
          str: { type: 'string' }
        }
      }).create({ str: 'foo' });
      const m = modelA.set('str', 'blah');
      expect(modelA.equals(m)).to.equal(false);
      const modelA2 = await modelA.save();
      const m2 = modelA2.set('num', 10);
      expect(modelA2.equals(m2)).to.equal(false);
    });

  });

  describe('.isNew()', function() {

    it('should return true if the model is new', async () => {
      const model = FullTestModel.create({
        str: 'foo'
      });
      expect(model.isNew()).to.equal(true);
      const model2 = await model.save();
      expect(model2.isNew()).to.equal(false);
    });

  });

  describe('.isModified()', () => {

    it('should return true if the given path is modified', () => {
      const model = FullTestModel.create({
        str: 'foo',
        obj: { deep: { blah: 'blah' } }
      });
      const m = model.set('arr', [1, 2, 3]);
      expect(m.isModified('arr')).to.equal(true);
      expect(m.isModified('str')).to.equal(false);
      const m2 = model.set('obj.deep.blah', 'boo');
      expect(m2.isModified('obj')).to.equal(true);
      expect(m2.isModified('obj.deep')).to.equal(true);
      expect(m2.isModified('obj.deep.blah')).to.equal(true);
    });

    it('should return true if no path is given and the object has been modified', () => {
      const model = FullTestModel.create({
        str: 'foo',
        obj: { deep: { blah: 'blah' } }
      });
      expect(model.isModified()).to.equal(false);
      const m = model.set('arr', [1, 2, 3]);
      expect(m.isModified()).to.equal(true);
    });

  });

  describe('.toJSON()', () => {

    it('should return valid json', () => {
      const DeepArrayModel = Model.define({
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
      const model = DeepArrayModel.create({
        arr: [
          { oid: bson.ObjectId('abdfabdfabdfabdfabdfabdf') },
          { oid: bson.ObjectId('abdfabdfabdfabdfabdfabdf') }
        ],
        nullVal: null
      });
      expect(JSON.stringify(model.toJSON())).to.equal('{"arr":[{"oid":{"$oid":"abdfabdfabdfabdfabdfabdf"}},{"oid":{"$oid":"abdfabdfabdfabdfabdfabdf"}}],"nullVal":null}');
    });

    it('should except an extended option', () => {
      const DeepArrayModel = Model.define({
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
      const model = DeepArrayModel.create({
        arr: [
          { oid: bson.ObjectId('abdfabdfabdfabdfabdfabdf') },
          { oid: bson.ObjectId('abdfabdfabdfabdfabdfabdf') }
        ]
      });
      expect(JSON.stringify(model.toJSON({ extended: false }))).to.equal('{"arr":[{"oid":"abdfabdfabdfabdfabdfabdf"},{"oid":"abdfabdfabdfabdfabdfabdf"}]}');
    });

    it('should except an exclude option', () => {
      const model = FullTestModel.create({
        str: 'test string',
        obj: { prop1: 'bar' }
      });
      const json = model.toJSON({ exclude: ['str', 'date'] });
      expect(JSON.stringify(json)).to.equal('{"obj":{"prop1":"bar","propv":"bar.undefined"},"num":0,"bool":false,"virt":"test string.virtual"}');
    });

    it('should except an include option', () => {
      const model = FullTestModel.create({
        str: 'test string',
        obj: { prop1: 'bar' }
      });
      const json = model.toJSON({ include: ['num', 'bool', 'virt'] });
      expect(JSON.stringify(json)).to.equal('{"num":0,"bool":false,"virt":"test string.virtual"}');
    });

    it('should except a transform option', () => {
      const model = FullTestModel.create({
        str: 'test string'
      });
      const json = model.toJSON({
        exclude: ['date'],
        transform: function(obj) {
          obj.str += ' TRANSFORMED!';
          return obj;
        }
      });
      expect(JSON.stringify(json)).to.equal('{"str":"test string TRANSFORMED!","num":0,"bool":false,"virt":"test string.virtual"}');
    });

  });

  describe('.validate()', () => {

    it('should reject promise if validation fails', () => {
      const model = FullTestModel.create({});
      expect(model.validate()).to.be.eventually.rejectedWith({ statusCode: 400 });
    });

    it('should resolve promise if validation succeeds', async () => {
      const model = FullTestModel.create({ str: 'bar' });
      const result = await model.validate();
      expect(result).to.exist.and.to.be.an('object');
    });

  });

  describe('db', function() {
    const db = require('../lib/db');

    it('should auto connect to db if connection lost', async () => {
      const model = FullTestModel.create({
        str: 'foo',
        obj: { prop1: 'bar' }
      });
      const updatedModel = await model.save();
      let count = await FullTestModel.count({ _id: updatedModel._id });
      expect(count).to.equal(1);
      db._db.close();
      count = await FullTestModel.count({ _id: updatedModel._id });
      expect(count).to.equal(1);
    });

  });

  describe('.save()', function() {
    let model;

    before(() => {
      model = FullTestModel.create({
        str: 'foo',
        obj: { prop1: 'bar' }
      });
    });

    it('should insert a new document', async () => {
      const updatedModel = await model.save();
      expect(updatedModel._id).to.be.a('object');
      expect(updatedModel._etag).to.be.a('string');
      const count = await FullTestModel.count({ _id: updatedModel._id });
      expect(count).to.equal(1);
      const doc = await new Promise((resolve, reject) => {
        _db.collection('mocha_test', function(err, collection) {
          if (err) { return reject(err); }
          collection.findOne({ _id: updatedModel._id }, function(err, doc) {
            if (err) { return reject(err); }
            return resolve(doc);
          });
        });
      });
      expect(updatedModel._etag).to.equal(doc._etag);
      expect(updatedModel._id.toObject().toString()).to.equal(doc._id.toString());
      expect(updatedModel.bool).to.equal(doc.bool);
      expect(updatedModel.date).to.equalDate(doc.date);
      expect(updatedModel.num).to.equal(doc.num);
      expect(updatedModel.obj.toObject()).to.eql(doc.obj);
      expect(updatedModel.str).to.equal(doc.str);
    });

    it('should update an existing document', async () => {
      const newModel = await model.save();
      const updatedModel = await newModel.set('str', 'test update').set('num', 2).save();
      expect(updatedModel._id.toString()).to.equal(newModel._id.toString());
      expect(updatedModel._etag).to.not.equal(newModel._etag);
      const doc = await new Promise((resolve, reject) => {
        _db.collection('mocha_test', function(err, collection) {
          if (err) { return reject(err); }
          collection.findOne({ _id: updatedModel._id }, function(err, doc) {
            if (err) { return reject(err); }
            return resolve(doc);
          });
        });
      });
      expect(updatedModel._etag).to.equal(doc._etag);
      expect(updatedModel._id.toObject().toString()).to.equal(doc._id.toString());
      expect(updatedModel.bool).to.equal(doc.bool);
      expect(updatedModel.date).to.equalDate(doc.date);
      expect(updatedModel.num).to.equal(doc.num);
      expect(updatedModel.obj.toObject()).to.eql(doc.obj);
      expect(updatedModel.str).to.equal(doc.str);
    });

  });

  describe('.remove()', () => {
    let model;

    before(async () => {
      model = FullTestModel.create({
        str: 'test string',
        obj: { prop1: 'bar' }
      });
    });

    it('should remove the document', async () => {
      const updatedModel = await model.save();
      await updatedModel.remove();
      const count = await new Promise((resolve, reject) => {
        _db.collection('mocha_test', (err, collection) => {
          if (err) { return reject(err); }
          collection.count({}, (err, count) => {
            if (err) { return reject(err); }
            resolve(count);
          });
        });
      });
      expect(count).to.equal(0);
    });

  });

  describe('.count()', () => {
    let model;

    before(async () => {
      model = FullTestModel.create({
        str: 'test string',
        obj: { prop1: 'bar' }
      });
    });

    it('should return the count of objects', async () => {
      const updatedModel = await model.save();
      const count = await FullTestModel.count({ _id: updatedModel._id });
      expect(count).to.equal(1);
    });
  });

  describe('.find()', () => {
    let model;

    before(async () => {
      model = FullTestModel.create({
        str: 'test string',
        obj: { prop1: 'bar' }
      });
    });

    it('should return a cursor to retrieve objects', async () => {
      const updatedModel = await model.save();
      const cursor = await FullTestModel.find({ _id: updatedModel._id });
      const count = await cursor.count();
      const obj = await cursor.next();
      expect(count).to.equal(1);
      expect(Immutable.isImmutableType(obj, 'FullTestModel')).to.equal(true);
    });

    it('should return an array if array option is given', async () => {
      const updatedModel = await model.save();
      const arr = await FullTestModel.find({ _id: updatedModel._id }, { array: true });
      expect(Array.isArray(arr)).to.equal(true);
      expect(arr.length).to.equal(1);
      expect(Immutable.isImmutableType(arr[0], 'FullTestModel')).to.equal(true);
    });

  });

  describe('.findOne()', () => {
    let model;

    before(async () => {
      model = FullTestModel.create({
        str: 'test string',
        obj: { prop1: 'bar' }
      });
    });

    it('should return an object', async () => {
      const updatedModel = await model.save();
      const doc = await FullTestModel.findOne({ _id: updatedModel._id });
      expect(doc).to.be.a('object');
      expect(Immutable.isImmutableType(doc, 'FullTestModel'));
    });

    it('should return null if no document is found', async () => {
      const doc = await FullTestModel.findOne({ _id: 'asdfasdfasdf' });
      expect(doc).to.be.oneOf([ null, undefined ]);
    });

  });

  describe('.update()', function() {

    beforeEach(async () => {
      await FullTestModel.create({ str: 'foo' }).save();
      await FullTestModel.create({ str: 'bar' }).save();
      return FullTestModel.create({ str: 'blah' }).save();
    });

    it('should partial update a single doc', async () => {
      const result = await FullTestModel.update({}, { any: 'boo' });
      expect(result.matchedCount).to.equal(1);
      expect(result.modifiedCount).to.equal(1);
      const doc = await FullTestModel.findOne({ str: 'foo' });
      expect(doc.str).to.equal('foo');
      expect(doc.any).to.equal('boo');
    });

    it('should partial update all docs', async () => {
      const result = await FullTestModel.update({}, { any: 'any' }, { multiple: true });
      expect(result.matchedCount).to.equal(3);
      expect(result.modifiedCount).to.equal(3);
      const docs = await FullTestModel.find({}, { sort: { str: 1 }, array: true });
      expect(docs[0].str).to.equal('bar');
      expect(docs[0].any).to.equal('any');
      expect(docs[1].str).to.equal('blah');
      expect(docs[1].any).to.equal('any');
      expect(docs[2].str).to.equal('foo');
      expect(docs[2].any).to.equal('any');
    });

    it('should replace single doc', async () => {
      const result = await FullTestModel.update({}, { arr: ['a', 'b', 'c'] }, { autoSet: false });
      expect(result.matchedCount).to.equal(1);
      expect(result.modifiedCount).to.equal(1);
      const doc = await FullTestModel.find({ arr: ['a', 'b', 'c'] });
      expect(doc.str).to.be.oneOf([ null, undefined ]);
    });

  });

  describe('.distinct()', () => {

    it('should return distinct key values', async () => {
      const model = FullTestModel.create({
        str: 'test string'
      });
      const model2 = FullTestModel.create({
        str: 'another test string'
      });
      const model3 = FullTestModel.create({
        str: 'test string'
      });
      await Promise.all([ model.save(), model2.save(), model3.save() ]);
      const results = await FullTestModel.distinct('str');
      expect(results).to.contain('test string', 'another test string');
    });

  });

  describe('.aggregate()', () => {

    it('should return results of aggregate pipeline', async () => {
      const model = FullTestModel.create({
        str: 'test string'
      });
      const model2 = FullTestModel.create({
        str: 'another test string'
      });
      const model3 = FullTestModel.create({
        str: 'test string'
      });
      await Promise.all([ model.save(), model2.save(), model3.save() ]);
      const results = await FullTestModel.aggregate([
        { $group: { _id: '$str', count: { $sum: 1 } } }
      ]);
      expect(results.length).to.equal(2);
      results.forEach(function(item) {
        expect(item).to.contain.all.keys('_id', 'count');
        expect(item).to.satisfy(function(val) {
          return (val._id === 'test string' && val.count === 2) ||
            (val._id === 'another test string' && val.count === 1);
        });
      });
    });

  });

  describe('.remove() [static]', () => {
    let model;

    before(async () => {
      model = FullTestModel.create({
        str: 'test string',
        obj: { prop1: 'bar' }
      });
    });

    it('should remove a document', async () => {
      const updatedModel = await model.save();
      const id = updatedModel._id;
      await FullTestModel.remove({ _id: updatedModel._id });
      const count = await new Promise((resolve, reject) => {
        _db.collection('mocha_test', function(err, collection) {
          if (err) { return reject(err); }
          collection.count({ _id: id }, function(err, count) {
            if (err) { return reject(err); }
            return resolve(count);
          });
        });
      });
      expect(count).to.equal(0);
    });
  });

  describe('.extend()', () => {

    it('should allow extending of a model', () => {
      const ModelA = Model.define({
        name: 'ModelA',
        abstract: true,
        collection: 'mocha_test',
        properties: {
          _type: { type: 'string', enum: ['A', 'B'], default: 'A' },
          strA: { type: 'string', default: 'A' }
        },
        methods: {
          blah: function() {
            return 'blah';
          }
        }
      });
      const ModelB = ModelA.extend({
        name: 'ModelB',
        where: { _type: 'B' },
        properties: {
          _type: { type: 'string', default: 'B', valid: 'B' },
          strB: { type: 'string', default: 'B' }
        }
      });
      const myModelA = ModelA.create({});
      expect(myModelA.strA).to.equal('A');
      expect(myModelA.strB).to.be.oneOf([ null, undefined ]);
      const myModelB = ModelB.create({
        strA: 'abc',
        strB: '123'
      });
      expect(myModelB.strB).to.equal('123');
      expect(myModelB.strA).to.equal('abc');
      expect(myModelB.blah()).to.equal('blah');
    });

  });

  describe('.beforeSave()', () => {

    it('should execute before a model is saved', async () => {
      let strToSave = '';
      const HookedModel = Model.define({
        name: 'HookedModel',
        collection: 'mocha_test',
        properties: {
          str: { type: 'string' }
        },
        methods: {
          beforeSave: function() {
            strToSave = this.str;
          }
        }
      });
      const model = HookedModel.create({ str: 'foo' });
      expect(model.beforeSave).to.be.a('function');
      await model.save();
      expect(strToSave).to.equal('foo');
    });

    it('should allow mutating model before saving', async () => {
      const HookedModel = Model.define({
        name: 'HookedModel',
        collection: 'mocha_test',
        properties: {
          str: { type: 'string' }
        },
        methods: {
          beforeSave: function() {
            this.str += ' bar';
          }
        }
      });
      const model = HookedModel.create({ str: 'foo' });
      expect(model.beforeSave).to.be.a('function');
      const model2 = await model.save();
      expect(model2.str).to.equal('foo bar');
    });

  });


  describe('.afterSave()', () => {

    it('should execute after a model is saved', async () => {
      let strSaved = '';
      let checkFunction;
      const HookedModel = Model.define({
        name: 'HookedModel',
        collection: 'mocha_test',
        properties: {
          str: { type: 'string' }
        },
        methods: {
          afterSave: function(...args) {
            checkFunction(this, args);
            strSaved = this.str;
          }
        }
      });
      const model = HookedModel.create({ str: 'foo' });
      expect(model.afterSave).to.be.a('function');
      let wasCalled = false;
      checkFunction = function(instance, args) {
        expect(instance.str).to.equal('foo');
        expect(args[0]).to.equal(null);
        wasCalled = true;
      };

      const m = await model.save();
      expect(wasCalled).to.equal(true);
      wasCalled = false;
      checkFunction = function(instance, args) {
        expect(instance.str).to.equal('bar');
        expect(args[0].str).to.equal('foo');
        wasCalled = true;
      };
      await m.set('str', 'bar').save();
      expect(wasCalled).to.equal(true);
      expect(strSaved).to.equal('bar');
    });

  });

  describe('.beforeRemove()', () => {

    it('should execute before a model is removed', async () => {
      let strRemoved = '';
      const HookedModel = Model.define({
        name: 'HookedModel',
        collection: 'mocha_test',
        properties: {
          str: { type: 'string' }
        },
        methods: {
          beforeRemove: function() {
            strRemoved = this.str;
          }
        }
      });
      const model = HookedModel.create({ str: 'foo' });
      expect(model.beforeRemove).to.be.a('function');
      const m = await model.save();
      await m.remove();
      expect(strRemoved).to.equal('foo');
    });

  });

  describe('.afterRemove()', () => {

    it('should execute after a model is removed', async () => {
      let strRemoved = '';
      const HookedModel = Model.define({
        name: 'HookedModel',
        collection: 'mocha_test',
        properties: {
          str: { type: 'string' }
        },
        methods: {
          afterRemove: function() {
            strRemoved = this.str;
          }
        }
      });
      const model = HookedModel.create({ str: 'foo' });
      expect(model.afterRemove).to.be.a('function');

      const m = await model.save();
      await m.remove();
      expect(strRemoved).to.equal('foo');
    });

  });

  describe('.project()', () => {

    it('should return cursor of projected values', async () => {
      await FullTestModel.create({
        str: 'test string',
        obj: { prop1: 'bar' }
      }).save();
      const values = await FullTestModel.project({}, { str: 1 }, { array: 1 });
      expect(values.length).to.equal(1);
      expect(values[0].str).to.equal('test string');
    });

  });

});
