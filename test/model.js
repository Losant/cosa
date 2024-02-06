import { expect } from './common.js';
import { MongoClient, ObjectId } from 'mongodb';
import Model from '../lib/model.js';
import cosaDb from '../lib/db.js';
import { createSession } from '../lib/session.js';
import { sleep, times } from 'omnibelt';
import Immutable from '../lib/immutable.js';
import { FullTestModel } from './support/full-test-model.js';

const getMongoClient = async () => {
  const mongoClient = new MongoClient(process.env.COSA_DB_URI);
  return mongoClient.connect();
};

const cleanUpDb = async (client, db, close = true) => {
  const cursorCollection = await db.listCollections({});
  const collections = await cursorCollection.toArray();
  await Promise.all(collections.map(async ({ name }) => {
    const collection = db.collection(name);
    await collection.dropIndexes();
    return collection.deleteMany();
  }));
  if (close) { await client.close(); }
};


describe('Model', () => {
  after(async () => {
    if (cosaDb._client) {
      await cosaDb._client.close();
    }
  });
  let _db, client;

  beforeEach(async () => {
    client = await getMongoClient();
    _db = await client.db('test');
    await cleanUpDb(client, _db, false);
    await _db.createCollection('mocha_test').catch((err) => {
      if (!err.message.includes('already exists')) {
        throw err;
      }
    });
  });

  afterEach(() => {
    return cleanUpDb(client, _db);
  });

  describe('session test', () => {

    it('should abort all transactions', async () => {
      const exists = await FullTestModel.create({
        str: 'foo-1'
      }).save();
      const session = await createSession();
      await session.startTransaction();
      await FullTestModel.create({
        str: 'foo0'
      }).save({ session });
      expect(await FullTestModel.count({}, { session, allowGlobalQuery: true })).to.equal(2);
      await FullTestModel.create({
        str: 'foo1'
      }).save({ session });
      expect(await FullTestModel.count({}, { session, allowGlobalQuery: true })).to.equal(3);
      await exists.remove({ session });
      expect(await FullTestModel.count({}, { session, allowGlobalQuery: true })).to.equal(2);
      await session.abortTransaction();
      expect(await FullTestModel.count({}, { allowGlobalQuery: true })).to.equal(1);
    });

    it('should save all transactions', async () => {
      const exists = await FullTestModel.create({
        str: 'foo-1'
      }).save();
      const session = await createSession();
      await session.startTransaction();
      await FullTestModel.create({
        str: 'foo0'
      }).save({ session });
      expect(await FullTestModel.count({}, { session, allowGlobalQuery: true })).to.equal(2);
      await FullTestModel.create({
        str: 'foo1'
      }).save({ session });
      expect(await FullTestModel.count({}, { session, allowGlobalQuery: true })).to.equal(3);
      await exists.remove({ session });
      expect(await FullTestModel.count({}, { session, allowGlobalQuery: true })).to.equal(2);
      await session.commitTransaction();
      expect(await FullTestModel.count({}, { allowGlobalQuery: true })).to.equal(2);
    });
  });

  describe('.define()', () => {

    it('should return a model definition', () => {
      const ModelA = Model.define({
        name: 'MyModelA',
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
      expect(ModelA.__collectionName).to.equal('mocha_test');
      expect(ModelA.__name).to.equal('MyModelA');
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

    it('should delete multiple vars when an array is given', () => {
      const model = FullTestModel.create({
        str: 'foo',
        obj: { deep: { blah: 'blah' } }
      });
      const model2 = model.del(['str', 'obj.deep.blah']);
      expect(FullTestModel.isA(model2)).to.equal(true);
      expect(model.get('str')).to.equal('foo');
      expect(model2.get('str')).to.be.oneOf([ null, undefined ]);
      expect(model.get('obj.deep.blah')).to.equal('blah');
      expect(model2.get('obj.deep.blah')).to.be.oneOf([ null, undefined ]);
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
    it('should return false if one object is null and the other is a model', () => {
      const obj = null;
      const modelA = Model.define({
        name: 'ModelA',
        collection: 'mocha_test',
        properties: {
          str: { type: 'string' }
        }
      }).create({ str: 'foo' });
      expect(modelA.is(obj)).to.equal(false);
    });
    it('should return true if both objects reference the same doc', () => {
      const modelA = Model.define({
        name: 'ModelA',
        collection: 'mocha_test',
        properties: {
          str: { type: 'string' }
        }
      }).create({ str: 'foo' });
      let m = modelA;
      expect(modelA.is(m)).to.equal(true);
      m = modelA.set('str', 'blah');
      expect(modelA.is(m)).to.equal(false);
    });
    it('should return false if the documents do not match, and should return true when the do', async () => {
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
      expect(modelA.is(modelB)).to.equal(false);
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

  describe('.saveWithId()', function() {
    it('should save with a given ID', async () => {
      const id = new ObjectId('1234abcd103f8e485c9d2019');
      const model = await FullTestModel.create({
        str: 'foo'
      }).saveWithId(id);
      expect(model._id.toString()).to.equal('1234abcd103f8e485c9d2019');
    });

    it('should error when trying to update an object', async () => {
      const id = new ObjectId('1234abcd103f8e485c9d2019');
      const newId = new ObjectId('5678abcd103f8e485c9d9000');
      const model = await FullTestModel.create({
        str: 'foo'
      }).saveWithId(id);
      const error = await model.saveWithId(newId).catch((e) => { return e; });
      expect(error.name).to.equal('Error');
      expect(error.message).to.equal('saveWithId must receive a newly created object');
    });

    it('should pass the explicit id into beforeSave', async () => {
      let beforeSaveObj;
      const BeforeSaveTestModel = Model.define({
        name: 'BeforeSaveTestModel',
        collection: 'before_save_test',
        properties: {
          str: { type: 'string', required: true }
        },
        methods: {
          beforeSave: function() {
            beforeSaveObj = this;
          }
        }
      });

      const id = new ObjectId('1234abcd103f8e485c9d2019');
      await BeforeSaveTestModel.create({
        str: 'foo'
      }).saveWithId(id);
      expect(`${beforeSaveObj._id}`).to.equal(`${id}`);
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
                oid: { type: 'objectId' }
              }
            }
          },
          nullVal: { type: '*' }
        }
      });
      const model = DeepArrayModel.create({
        arr: [
          { oid: new ObjectId('abdfabdfabdfabdfabdfabdf') },
          { oid: new ObjectId('abdfabdfabdfabdfabdfabdf') }
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
                oid: { type: 'objectId' }
              }
            }
          }
        }
      });
      const model = DeepArrayModel.create({
        arr: [
          { oid: new ObjectId('abdfabdfabdfabdfabdfabdf') },
          { oid: new ObjectId('abdfabdfabdfabdfabdfabdf') }
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

    it('should reject promise if validation fails', async () => {
      const model = FullTestModel.create({});
      const error = await model.validate().catch((e) => { return e; });
      expect(error.type).to.equal('Validation');
      expect(error.name).to.equal('ValidationError');
      expect(error.statusCode).to.equal(400);
      expect(error.message).to.equal('"str" is required');
    });

    it('should resolve promise if validation succeeds', async () => {
      const objId = new ObjectId();
      let model = await FullTestModel.create({ str: 'bar', objId }).save();
      await model.validate();
      model = await model.reload();
      expect(model.toObject().objId).to.deep.equal(objId);
    });
  });

  describe('db', function() {

    it('should auto connect to db if connection lost', async () => {
      const model = FullTestModel.create({
        str: 'foo',
        obj: { prop1: 'bar' }
      });
      const updatedModel = await model.save();
      let count = await FullTestModel.count({ _id: updatedModel._id });
      expect(count).to.equal(1);
      await cosaDb._client.close();
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
      const collection = _db.collection('mocha_test');
      const doc = await collection.findOne({ _id: updatedModel._id.toObject() });
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
      const collection = _db.collection('mocha_test');
      const doc = await collection.findOne({ _id: updatedModel._id.toObject() });
      expect(updatedModel._etag).to.equal(doc._etag);
      expect(updatedModel._id.toObject().toString()).to.equal(doc._id.toString());
      expect(updatedModel.bool).to.equal(doc.bool);
      expect(updatedModel.date).to.equalDate(doc.date);
      expect(updatedModel.num).to.equal(doc.num);
      expect(updatedModel.obj.toObject()).to.eql(doc.obj);
      expect(updatedModel.str).to.equal(doc.str);
    });

    it('should wait for the after save', async () => {
      let afterSaveCalled = false;
      const afterSaveModel = Model.define({
        name: 'SaveTest',
        collection: 'mocha_save_test',
        properties: {
          str: { type: 'string', required: true }
        },
        methods: {
          afterSave: async function() {
            await sleep(150);
            afterSaveCalled = true;
          }
        }
      });
      await afterSaveModel.create({ str: 'hello' }).save({ waitAfterSave: true });
      expect(afterSaveCalled).to.equal(true);
      const collection = _db.collection('mocha_save_test');
      const count = await collection.countDocuments();
      expect(count).to.equal(1);
    });

    it('should wait after save when globally set', async () => {
      let afterSaveCalled = false;
      const afterSaveModel = Model.define({
        name: 'SaveTest',
        collection: 'mocha_save_test',
        waitAfterSave: true,
        properties: {
          str: { type: 'string', required: true }
        },
        methods: {
          afterSave: async function() {
            await sleep(150);
            afterSaveCalled = true;
          }
        }
      });
      await afterSaveModel.create({ str: 'hello' }).save();
      expect(afterSaveCalled).to.equal(true);
      const collection = _db.collection('mocha_save_test');
      const count = await collection.countDocuments();
      expect(count).to.equal(1);
    });

    it('should not wait after save when globally set but overrided as a save option', async () => {
      let afterSaveCalled = false;
      const afterSaveModel = Model.define({
        name: 'SaveTest',
        collection: 'mocha_save_test',
        waitAfterSave: true,
        properties: {
          str: { type: 'string', required: true }
        },
        methods: {
          afterSave: async function() {
            await sleep(150);
            afterSaveCalled = true;
          }
        }
      });
      await afterSaveModel.create({ str: 'hello' }).save({ waitAfterSave: false });
      expect(afterSaveCalled).to.equal(false);
      const collection = _db.collection('mocha_save_test');
      const count = await collection.countDocuments();
      expect(count).to.equal(1);
    });

    it('should transform a duplicate error on insert where before save updates the property', async () => {
      const collection = 'mocha_save_test';
      const dupKeyModel = Model.define({
        name: 'SaveTest',
        collection,
        properties: {
          str: { type: 'string', required: true }
        },
        methods: {
          beforeSave: function() {
            this.str = `${this.str}-1`;
          },
          transformDuplicateKeyError: function(err) {
            expect(err.code).to.equal(11000);
            return new Error(`Duplicate key on ${this.str}`);
          }
        }
      });

      await _db.collection(collection).createIndex({ str: 1 }, { name: 'str_1', unique: true });
      const str = 'str';
      await dupKeyModel.create({ str }).save();
      let err;
      try {
        await dupKeyModel.create({ str }).save();
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal('Duplicate key on str-1');
    });

    it('should transform a duplicate error on insert', async () => {
      const collection = 'mocha_save_test';
      const dupKeyModel = Model.define({
        name: 'SaveTest',
        collection,
        properties: {
          str: { type: 'string', required: true }
        },
        methods: {
          transformDuplicateKeyError: function(err) {
            expect(err.code).to.equal(11000);
            return new Error(`Duplicate key on ${this.str}`);
          }
        }
      });

      await _db.collection(collection).createIndex({ str: 1 }, { name: 'str_1', unique: true });
      const str = 'str';
      await dupKeyModel.create({ str }).save();
      let err;
      try {
        await dupKeyModel.create({ str }).save();
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal('Duplicate key on str');
    });

    it('should transform a duplicate error on update', async () => {
      const collection = 'mocha_save_test';
      const str = 'str';
      const dupKeyModel = Model.define({
        name: 'SaveTest',
        collection,
        properties: {
          str: { type: 'string', required: true }
        },
        methods: {
          transformDuplicateKeyError: function(err) {
            expect(err.code).to.equal(11000);
            return new Error(`Duplicate key on ${this.str}`);
          }
        }
      });

      await _db.collection(collection).createIndex({ str: 1 }, { name: 'str_1', unique: true });
      const toBeUpdated = await dupKeyModel.create({ str }).save();
      await dupKeyModel.create({ str: 'str1' }).save();
      let err;
      try {
        await toBeUpdated.set({ str: 'str1' }).save();
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal('Duplicate key on str1');
    });

  });

  it('should transform a duplicate error on update where before save updates the property', async () => {
    const collection = 'mocha_save_test';
    const str = 'str';
    const dupKeyModel = Model.define({
      name: 'SaveTest',
      collection,
      properties: {
        str: { type: 'string', required: true }
      },
      methods: {
        beforeSave: function() {
          this.str = `${this.str}-1`;
        },
        transformDuplicateKeyError: function(err) {
          expect(err.code).to.equal(11000);
          return new Error(`Duplicate key on ${this.str}`);
        }
      }
    });

    await _db.collection(collection).createIndex({ str: 1 }, { name: 'str_1', unique: true });
    const toBeUpdated = await dupKeyModel.create({ str }).save();
    await dupKeyModel.create({ str: 'str1' }).save();
    let err;
    try {
      await toBeUpdated.set({ str: 'str1' }).save();
    } catch (e) {
      err = e;
    }
    expect(err.message).to.equal('Duplicate key on str1-1');
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
      const collection = _db.collection('mocha_test');
      const count = await collection.countDocuments();
      expect(count).to.equal(0);
    });

    it('should wait for the after remove', async () => {
      let afterRemoveCalled = false;
      const afterRemoveModel = Model.define({
        name: 'RemoveTest',
        collection: 'mocha_remove_test',
        properties: {
          str: { type: 'string', required: true }
        },
        methods: {
          afterRemove: async function() {
            await sleep(150);
            afterRemoveCalled = true;
          }
        }
      });
      const testModel = await afterRemoveModel.create({ str: 'hello' }).save();
      await testModel.remove({ waitAfterRemove: true });
      expect(afterRemoveCalled).to.equal(true);
      const collection = _db.collection('mocha_remove_test');
      const count = await collection.countDocuments();
      expect(count).to.equal(0);
    });

    it('should wait for the after remove when globally set', async () => {
      let afterRemoveCalled = false;
      const afterRemoveModel = Model.define({
        name: 'RemoveTest',
        collection: 'mocha_remove_test',
        waitAfterRemove: true,
        properties: {
          str: { type: 'string', required: true }
        },
        methods: {
          afterRemove: async function() {
            await sleep(150);
            afterRemoveCalled = true;
          }
        }
      });
      const testModel = await afterRemoveModel.create({ str: 'hello' }).save();
      await testModel.remove();
      expect(afterRemoveCalled).to.equal(true);
      const collection = _db.collection('mocha_remove_test');
      const count = await collection.countDocuments();
      expect(count).to.equal(0);
    });

    it('should not wait for the after remove when globally set but overriden by remove options', async () => {
      let afterRemoveCalled = false;
      const afterRemoveModel = Model.define({
        name: 'RemoveTest',
        collection: 'mocha_remove_test',
        waitAfterRemove: true,
        properties: {
          str: { type: 'string', required: true }
        },
        methods: {
          afterRemove: async function() {
            await sleep(150);
            afterRemoveCalled = true;
          }
        }
      });
      const testModel = await afterRemoveModel.create({ str: 'hello' }).save();
      await testModel.remove({ waitAfterRemove: false });
      expect(afterRemoveCalled).to.equal(false);
      const collection = _db.collection('mocha_remove_test');
      const count = await collection.countDocuments();
      expect(count).to.equal(0);
    });

  });

  describe('.reload', async () => {
    it('should reload a model', async () => {
      const model = FullTestModel.create({
        str: 'test string',
        obj: { prop1: 'bar' }
      });
      const updatedModel = await model.save();
      const reloadedModel = await updatedModel.reload();
      expect(reloadedModel.toObject()).to.deep.equal(updatedModel.toObject());
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
    it('should return the count of objects with a skip or limit without a query', async () => {
      await Promise.all([
        FullTestModel.create({
          str: 'test string',
          obj: { prop1: 'bar' }
        }).save(),
        FullTestModel.create({
          str: 'test string',
          obj: { prop1: 'bar' }
        }).save(),
        FullTestModel.create({
          str: 'test string',
          obj: { prop1: 'bar' }
        }).save(),
        FullTestModel.create({
          str: 'test string',
          obj: { prop1: 'bar' }
        }).save(),
        FullTestModel.create({
          str: 'test string',
          obj: { prop1: 'bar' }
        }).save()
      ]);
      expect(await FullTestModel.count({}, { skip: 3, allowGlobalQuery: true })).to.equal(2);
      expect(await FullTestModel.count({}, { limit: 4, allowGlobalQuery: true })).to.equal(4);
      expect(await FullTestModel.count({}, { skip: 2, limit: 4, allowGlobalQuery: true })).to.equal(3);
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

    it('should perform reasonably on large finds', async () => {
      const creations = [];
      for (let i=0; i<1000; i++) {
        creations.push(cosaDb.insert('mocha_test', {
          aDate: new Date(Number(new Date('2019-03-11T04:55:00.000Z')) - i),
          aString: 'a string',
          aNumber: 1234,
          anArray: ['a', {}, 2, true, [], new ObjectId(), new Date()],
          aBoolean: true,
          anObject: {
            one: 1, two: false, three: {}, four: [], five: new Date(), six: new ObjectId(), seven: 'one two three four five six seven'
          },
          _etag: '"1e0-ilC0ScG/I4BHBDUJQZFa+TEv+B0"'
        }));
      }
      await Promise.all(creations);

      const PerfModel = Model.define({
        name: 'PerfTest',
        collection: 'mocha_test',
        properties: {
          aDate: { type: 'date' },
          aString: { type: 'string' },
          aNumber: { type: 'number' },
          anArray: { type: 'array', items: { type: 'any' } },
          aBoolean: { type: 'boolean' },
          anObject: {
            type: 'object',
            properties: {
              one: { type: 'number' },
              two: { type: 'boolean' },
              three: { type: 'object', properties: {} },
              four: { type: 'array', items: { type: 'any' } },
              five: { type: 'date' },
              six: { type: 'objectId' },
              seven: { type: 'string' }
            }
          }
        }
      });

      let start = Date.now();
      expect((await PerfModel.find({}, { array: true, allowGlobalQuery: true })).length).to.equal(1000);
      const modelFindTime = Date.now() - start;
      expect(modelFindTime).to.be.below(300); // generally below 200, but leaving some room

      start = Date.now();
      expect((await PerfModel.project({}, {}, { array: true, allowGlobalQuery: true })).length).to.equal(1000);
      const projectFindTime = Date.now() - start;
      expect(projectFindTime).to.be.below(200); // generally below 100 but leaving some room
    });
  });

  describe('.exists()', () => {
    it('should return true if at least one object matches the query', async () => {
      await FullTestModel.create({
        str: 'test string'
      }).save();
      expect(await FullTestModel.exists({ str: { $exists: true } })).to.equal(true);
    });
    it('should return false if no object matches the query', async () => {
      await FullTestModel.create({
        str: 'abc'
      }).save();
      expect(await FullTestModel.exists({ str: 'not a valid string' })).to.equal(false);
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
      const result = await FullTestModel.update({}, { any: 'boo' }, { allowGlobalQuery: true });
      expect(result.matchedCount).to.equal(1);
      expect(result.modifiedCount).to.equal(1);
      const doc = await FullTestModel.findOne({ str: 'foo' });
      expect(doc.str).to.equal('foo');
      expect(doc.any).to.equal('boo');
    });

    it('should partial update all docs', async () => {
      const result = await FullTestModel.update({}, { any: 'any' }, { multiple: true, allowGlobalQuery: true });
      expect(result.matchedCount).to.equal(3);
      expect(result.modifiedCount).to.equal(3);
      const docs = await FullTestModel.find({}, { sort: { str: 1 }, array: true, allowGlobalQuery: true });
      expect(docs[0].str).to.equal('bar');
      expect(docs[0].any).to.equal('any');
      expect(docs[1].str).to.equal('blah');
      expect(docs[1].any).to.equal('any');
      expect(docs[2].str).to.equal('foo');
      expect(docs[2].any).to.equal('any');
    });

    it('should replace single doc', async () => {
      const result = await FullTestModel.update({}, { $set: { arr: ['a', 'b', 'c'] } }, { autoSet: false, allowGlobalQuery: true });
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
      const results = await FullTestModel.distinct('str', {}, { allowGlobalQuery: true });
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
      const cursor = await FullTestModel.aggregate([
        { $group: { _id: '$str', count: { $sum: 1 } } }
      ], { allowGlobalQuery: true });
      const results = await cursor.toArray();
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
      const collection = _db.collection('mocha_test');
      const count = await collection.countDocuments({ _id: id });
      expect(count).to.equal(0);
    });
  });

  describe('query validation', () => {
    it('should validate query on count', async () => {
      await expect(FullTestModel.count()).to.be.rejectedWith('Query must be an object.');
      await expect(FullTestModel.count(1)).to.be.rejectedWith('Query must be an object.');
      await expect(FullTestModel.count({})).to.be.rejectedWith('To make an unrestricted query, please set the allowGlobalQuery option.');
      await expect(FullTestModel.count({}, { allowGlobalQuery: true })).to.eventually.deep.equal(0);
    });

    it('should validate query on find', async () => {
      await expect(FullTestModel.find()).to.be.rejectedWith('Query must be an object.');
      await expect(FullTestModel.find('what')).to.be.rejectedWith('Query must be an object.');
      await expect(FullTestModel.find({})).to.be.rejectedWith('To make an unrestricted query, please set the allowGlobalQuery option.');
      await expect(FullTestModel.find({}, { allowGlobalQuery: true, array: true })).to.eventually.deep.equal([]);
    });

    it('should validate query on findOne', async () => {
      await expect(FullTestModel.findOne()).to.be.rejectedWith('Query must be an object.');
      await expect(FullTestModel.findOne([])).to.be.rejectedWith('Query must be an object.');
      await expect(FullTestModel.findOne({})).to.be.rejectedWith('To make an unrestricted query, please set the allowGlobalQuery option.');
      await expect(FullTestModel.findOne({}, { allowGlobalQuery: true })).to.eventually.deep.equal(null);
    });

    it('should validate query on exists', async () => {
      await expect(FullTestModel.exists()).to.be.rejectedWith('Query must be an object.');
      await expect(FullTestModel.exists([])).to.be.rejectedWith('Query must be an object.');
      await expect(FullTestModel.exists({})).to.be.rejectedWith('To make an unrestricted query, please set the allowGlobalQuery option.');
      await expect(FullTestModel.exists({}, { allowGlobalQuery: true })).to.eventually.deep.equal(false);
    });

    it('should validate query on update', async () => {
      await expect(FullTestModel.update()).to.be.rejectedWith('Query must be an object.');
      await expect(FullTestModel.update(null)).to.be.rejectedWith('Query must be an object.');
      await expect(FullTestModel.update({})).to.be.rejectedWith('To make an unrestricted query, please set the allowGlobalQuery option.');
      await expect(FullTestModel.update({}, {}, { allowGlobalQuery: true })).to.eventually.deep.equal({
        acknowledged: true,
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 0,
        upsertedId: null
      });
    });

    it('should validate query on distinct', async () => {
      await expect(FullTestModel.distinct()).to.be.rejectedWith('Query must be an object.');
      await expect(FullTestModel.distinct('field')).to.be.rejectedWith('Query must be an object.');
      await expect(FullTestModel.distinct('field', new Date())).to.be.rejectedWith('Query must be an object.');
      await expect(FullTestModel.distinct('field', {})).to.be.rejectedWith('To make an unrestricted query, please set the allowGlobalQuery option.');
      await expect(FullTestModel.distinct('field', {}, { allowGlobalQuery: true })).to.eventually.deep.equal([]);
    });

    it('should validate pipeline on aggregate', async () => {
      await expect(FullTestModel.aggregate()).to.be.rejectedWith('Aggregation pipeline must be an array.');
      await expect(FullTestModel.aggregate({})).to.be.rejectedWith('Aggregation pipeline must be an array.');
      await expect(FullTestModel.aggregate([])).to.be.rejectedWith('To make an unrestricted query, please set the allowGlobalQuery option.');
      await expect(FullTestModel.aggregate([{ $match: 'what' }])).to.be.rejectedWith('Query must be an object.');
      await expect(FullTestModel.aggregate([{ $match: {} }])).to.be.rejectedWith('To make an unrestricted query, please set the allowGlobalQuery option.');
      await expect(FullTestModel.aggregate([], { allowGlobalQuery: true, array: true })).to.eventually.deep.equal([]);
      await expect(FullTestModel.aggregate([{ $match: {} }], { allowGlobalQuery: true, array: true })).to.eventually.deep.equal([]);
    });

    it('should validate query on project', async () => {
      await expect(FullTestModel.project()).to.be.rejectedWith('Query must be an object.');
      await expect(FullTestModel.project('what')).to.be.rejectedWith('Query must be an object.');
      await expect(FullTestModel.project({}, {})).to.be.rejectedWith('To make an unrestricted query, please set the allowGlobalQuery option.');
      await expect(FullTestModel.project({}, {}, { allowGlobalQuery: true, array: true })).to.eventually.deep.equal([]);
    });
  });

  describe('where', () => {
    const ModelWithWhere = Model.define({
      name: 'ModelWithWhere',
      collection: 'mocha_test',
      where: { strA: 'A' },
      properties: {
        strA: { type: 'string' },
        strB: { type: 'string' }
      }
    });

    it('should correctly respect the global where', async () => {
      const modelA = await ModelWithWhere.create({
        strA: 'A',
        strB: 'B'
      }).save();
      expect(await modelA.reload()).to.deep.equal(modelA);

      const modelB = await ModelWithWhere.create({
        strA: 'C',
        strB: 'D'
      }).save();
      expect(await modelB.reload()).to.deep.equal(modelB);

      expect(await ModelWithWhere.count({}, { allowGlobalQuery: true })).to.equal(1);
      expect(await ModelWithWhere.count({}, { bypassGlobalWhere: true, allowGlobalQuery: true })).to.equal(2);

      expect(await ModelWithWhere.find({}, { array: true, allowGlobalQuery: true })).to.deep.equal([modelA]);
      expect(await ModelWithWhere.find({}, { sort: { strA: 1 }, array: true, bypassGlobalWhere: true, allowGlobalQuery: true }))
        .to.deep.equal([modelA, modelB]);

      expect(await ModelWithWhere.findOne({ _id: modelA._id })).to.deep.equal(modelA);
      expect(await ModelWithWhere.findOne({ _id: modelB._id })).to.equal(null);
      expect(await ModelWithWhere.findOne({ _id: modelB._id }, { bypassGlobalWhere: true })).to.deep.equal(modelB);

      await expect(ModelWithWhere.aggregate(
        [{ $group: { _id: null, count: { $sum: 1 } } }],
        { allowGlobalQuery: true, array: true }
      )).to.eventually.deep.equal([ { _id: null, count: 1 } ]);

      await expect(ModelWithWhere.aggregate(
        [{ $match: { _id: modelB._id } }, { $group: { _id: null, count: { $sum: 1 } } }],
        { allowGlobalQuery: true, array: true }
      )).to.eventually.deep.equal([]);

      await expect(ModelWithWhere.aggregate(
        [{ $group: { _id: null, count: { $sum: 1 } } }],
        { allowGlobalQuery: true, bypassGlobalWhere: true, array: true }
      )).to.eventually.deep.equal([ { _id: null, count: 2 } ]);

      await expect(ModelWithWhere.aggregate(
        [{ $match: { _id: modelB._id } }, { $group: { _id: null, count: { $sum: 1 } } }],
        { allowGlobalQuery: true, bypassGlobalWhere: true, array: true }
      )).to.eventually.deep.equal([ { _id: null, count: 1 } ]);
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
      let strToSave, options;
      const HookedModel = Model.define({
        name: 'HookedModel',
        collection: 'mocha_test',
        properties: {
          str: { type: 'string' }
        },
        methods: {
          beforeSave: function(opts) {
            strToSave = this.str;
            options = opts;
          }
        }
      });
      const model = HookedModel.create({ str: 'foo' });
      expect(model.beforeSave).to.be.a('function');
      await model.save({ randomOption: 'hello' });
      expect(strToSave).to.equal('foo');
      expect(options).to.deep.equal({ randomOption: 'hello' });
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
        expect(args[1]).to.deep.equal({ randomOption: 'hello' });
        wasCalled = true;
      };
      const m = await model.save({ randomOption: 'hello' });
      expect(wasCalled).to.equal(true);

      wasCalled = false;
      checkFunction = function(instance, args) {
        expect(instance.str).to.equal('bar');
        expect(args[0].str).to.equal('foo');
        expect(args[1]).to.deep.equal({ randomOption: 'goodbye' });
        wasCalled = true;
      };
      await m.set('str', 'bar').save({ randomOption: 'goodbye' });
      expect(wasCalled).to.equal(true);
      expect(strSaved).to.equal('bar');
    });

  });

  describe('.beforeRemove()', () => {

    it('should execute before a model is removed', async () => {
      let strRemoved, options;
      const HookedModel = Model.define({
        name: 'HookedModel',
        collection: 'mocha_test',
        properties: {
          str: { type: 'string' }
        },
        methods: {
          beforeRemove: function(opts) {
            strRemoved = this.str;
            options = opts;
          }
        }
      });
      const model = HookedModel.create({ str: 'foo' });
      expect(model.beforeRemove).to.be.a('function');
      const m = await model.save();
      await m.remove({ anotherOption: 'what' });
      expect(strRemoved).to.equal('foo');
      expect(options).to.deep.equal({ anotherOption: 'what' });
    });

  });

  describe('.afterRemove()', () => {

    it('should execute after a model is removed', async () => {
      let strRemoved, options;
      const HookedModel = Model.define({
        name: 'HookedModel',
        collection: 'mocha_test',
        properties: {
          str: { type: 'string' }
        },
        methods: {
          afterRemove: function(opt) {
            strRemoved = this.str;
            options = opt;
          }
        }
      });
      const model = HookedModel.create({ str: 'foo' });
      expect(model.afterRemove).to.be.a('function');
      const m = await model.save();
      await m.remove({ foo: 'bar' });
      expect(strRemoved).to.equal('foo');
      expect(options).to.deep.equal({ foo: 'bar' });
    });

  });

  describe('.project()', () => {

    it('should return cursor of projected values', async () => {
      await FullTestModel.create({
        str: 'test string',
        obj: { prop1: 'bar' }
      }).save();
      const values = await FullTestModel.project({}, { str: 1 }, { array: 1, allowGlobalQuery: true });
      expect(values.length).to.equal(1);
      expect(values[0].str).to.equal('test string');
    });

  });

  describe('.forEachParallelLimitP', () => {
    it('should iterate over a cursor in parallel', async () => {
      await Promise.all(times(() => {
        return FullTestModel.create({
          str: 'test string',
          obj: { prop1: 'bar' }
        }).save();
      }, 100));
      const count = await FullTestModel.count({}, { allowGlobalQuery: true });
      const cursor = await FullTestModel.find({}, { allowGlobalQuery: true });
      let numOfTimesCalled = 0;
      await cursor.forEachParallelLimitP(50, async (item) => {
        expect(FullTestModel.isA(item)).to.equal(true);
        await sleep(1);
        numOfTimesCalled++;
      });
      expect(numOfTimesCalled).to.equal(count);
    });
    it('should iterate over a cursor in parallel', async () => {
      await Promise.all(times(() => {
        return FullTestModel.create({
          str: 'test string',
          obj: { prop1: 'bar' }
        }).save();
      }, 10));
      const count = await FullTestModel.count({}, { allowGlobalQuery: true });
      const cursor = await FullTestModel.find({}, { allowGlobalQuery: true });
      let numOfTimesCalled = 0;
      await cursor.forEachParallelLimitP(100, async (item) => {
        expect(FullTestModel.isA(item)).to.equal(true);
        await sleep(1);
        numOfTimesCalled++;
      });
      expect(numOfTimesCalled).to.equal(count);
    });
  });

});
