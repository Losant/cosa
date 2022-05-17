const db = require('./db');
const { forEachSerialP } = require('omnibelt');

const createSession = async () => {
  const afterCommits = [];
  const onAborts = [];
  if (!db._client) {
    await db.init();
  }
  const session = await db._client.startSession();

  const abortTransaction = async () => {
    let error;
    await session.abortTransaction();
    await session.endSession();
    await forEachSerialP(async (afterAborted) => {
      try {
        await afterAborted(error);
      } catch (err) {
        if (!err) {
          error = err;
        }
      }
    }, onAborts);
    if (error) { throw error; }
  };

  return {
    get: () => {
      return session;
    },
    startTransaction: () => {
      return session.startTransaction();
    },
    commitTransaction: async () => {
      let error;
      await session.commitTransaction();
      await session.endSession();
      await forEachSerialP(async (afterCommitFunc) => {
        try {
          await afterCommitFunc();
        } catch (err) {
          if (!error) {
            error = err;
          }
        }
      }, afterCommits);
      if (error) { throw error; }
    },
    abortTransaction,
    afterCommits,
    onAborts
  };
};

module.exports = {
  createSession
};
