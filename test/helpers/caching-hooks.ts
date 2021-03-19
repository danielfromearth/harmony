import FormData from 'form-data';
import { before, after } from 'mocha';
import sinon, { SinonStub } from 'sinon';
import { hookMockS3 } from './object-store';
import * as cmr from '../../app/util/cmr';

hookMockS3();

process.env.REPLAY = process.env.REPLAY || 'record';
require('replay');

// Patch our requests so they work repeatably in node-replay with multipart form
// data.
// Two things need to happen:
//   1. The multipart boundary created by FormData needs to not be random,
//      because node-replay fails to match random content
//   2. `fetch` needs to be called with strings not FormData, because
//      node-replay cannot record streaming bodies
const originalFetchPost = cmr.fetchPost;
before(function () {
  // Stub getBoundary to return a consistent multipart form boundary
  sinon.stub(FormData.prototype, 'getBoundary').callsFake(function () {
    return '----------------------------012345678901234567890123';
  });

  // Stub fetchPost to provide a string body rather than a FormData stream
  sinon.stub(cmr, 'fetchPost').callsFake(async function (
    path: string, formData: FormData, headers: { [key: string]: string },
  ): Promise<cmr.CmrResponse> {
    // Read the body into a stream
    const chunks = [];
    const body = await new Promise<string>((resolve, reject) => {
      formData.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      formData.on('error', (err) => reject(err));
      formData.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      formData.resume();
    });
    return originalFetchPost(path, body, headers);
  });
});

// Restore the stubs.  In principle this is unnecessary, since it will be
// the last thing to happen before exit of the test suite, but a good practice
after(function () {
  const getBoundary = FormData.prototype.getBoundary as SinonStub;
  if (getBoundary.restore) getBoundary.restore();

  const fetchPost = cmr.fetchPost as SinonStub;
  if (fetchPost.restore) fetchPost.restore();
});
