import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import chaiDateTime from 'chai-datetime';
chai.use(chaiAsPromised);
chai.use(chaiDateTime);
export const expect = chai.expect;
