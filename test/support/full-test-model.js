import format from 'string-template';
import Model from '../../lib/model.js';

export const FullTestModel = Model.define({
  name: 'FullTestModel',
  collection: 'mocha_test',
  properties: {
    str: { type: 'string', required: true },
    obj: {
      type: 'object',
      properties: {
        prop1: { type: 'string' },
        prop2: { type: 'string' },
        deep: {
          type: 'object',
          properties: {
            blah: { type: 'string' }
          }
        }
      },
      virtuals: {
        propv: function() {
          return `${this.prop1}.${this.prop2}`;
        }
      }
    },
    date: { type: 'date', default: function() { return new Date(); } },
    arr: { type: 'array' },
    num: { type: 'number', default: 0 },
    bool: { type: 'boolean', default: false },
    any: { type: 'any' },
    objId: { type: 'objectId' }
  },
  virtuals: {
    virt: function() {
      return `${this.str}.virtual`;
    }
  },
  methods: {
    fooString: function(message) {
      return format(message, this);
    }
  }
});
