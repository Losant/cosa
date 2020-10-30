# Cosa

[![Build Status](https://travis-ci.com/Losant/cosa.svg?branch=master)](https://travis-ci.com/Losant/cosa) [![npm version](https://badge.fury.io/js/cosa.svg)](https://badge.fury.io/js/cosa)

Simplified object modeling for MongoDB

## Installation

Use your favorite package manager to add cosa to your project.

```bash
yarn add cosa
```

## Usage

First define a model:

```javascript
const { Model } = require('cosa');

const UserModel = Model.define({
  name: 'UserModel',
  collection: 'users',
  properties: {
    name: { type: 'string', required: true },
    email: { type: 'string', required: true, email: true }
  }
})
```

Use the model to add users to the database:

```javascript
const newUser = UserModel.create({
  name: 'John Smith',
  email: 'jsmith@example.com'
})
newUser.save()
```

Fetch all the users in the database:

```javascript
UserModel
  .find({}, { array: true })
  .then((users) => {
    // loop over the array of users and do something
  })
```

## Reference

- [Cosa API Documentation](API.md)
- [MongoDB API Documentation](http://mongodb.github.io/node-mongodb-native/3.5/api/)

## License

The module is available as open source under the terms of the [MIT License](http://opensource.org/licenses/MIT).
