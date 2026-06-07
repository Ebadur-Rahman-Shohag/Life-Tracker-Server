import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { sendServerError } from '../utils/apiResponse.js';

test('sendServerError omits error detail in production', () => {
  const orig = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const res = {
    statusCode: 200,
    status(n) {
      this.statusCode = n;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  const log = mock.method(console, 'error', () => {});

  sendServerError(res, new Error('db exploded'));

  process.env.NODE_ENV = orig;
  log.mock.restore();

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, 'Server error');
  assert.equal(res.body.error, undefined);
});

test('sendServerError includes error detail outside production', () => {
  const orig = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  const res = {
    statusCode: 200,
    status(n) {
      this.statusCode = n;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  const log = mock.method(console, 'error', () => {});

  sendServerError(res, new Error('db detail'));

  process.env.NODE_ENV = orig;
  log.mock.restore();

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, 'db detail');
});
