import { pick } from 'lodash';
import { IWithPagination } from 'knex-paginate'; // For types only

import { createPublicPermalink } from '../frontends/service-results';
import { truncateString } from '../util/string';
import Record from './record';
import { Transaction } from '../util/db';

import env = require('../util/env');

const { awsDefaultRegion } = env;

const statesToDefaultMessages = {
  accepted: 'The job has been accepted and is waiting to be processed',
  running: 'The job is being processed',
  successful: 'The job has completed successfully',
  failed: 'The job failed with an unknown error',
};

const defaultMessages = Object.values(statesToDefaultMessages);

const serializedJobFields = [
  'username', 'status', 'message', 'progress', 'createdAt', 'updatedAt', 'links', 'request',
];

const stagingBucketTitle = `Results in AWS S3. Access from AWS ${awsDefaultRegion} with keys from /cloud-access.sh`;


export enum JobStatus {
  ACCEPTED = 'accepted',
  RUNNING = 'running',
  SUCCESSFUL = 'successful',
  FAILED = 'failed',
}

export interface JobLink {
  href: string;
  type?: string;
  title?: string;
  rel: string;
  temporal?: {
    start: string;
    end: string;
  };
  bbox?: number[];
}

export interface JobRecord {
  id?: number;
  username: string;
  requestId: string;
  status?: JobStatus;
  message?: string;
  progress?: number;
  _json_links?: string | JobLink[];
  links?: string | JobLink[];
  request: string;
  createdAt?: Date | number;
  updatedAt?: Date | number;
}

export interface JobQuery {
  id?: number;
  username?: string;
  requestId?: string;
  status?: JobStatus;
  message?: string;
  progress?: number;
  request?: string;
  createdAt?: number;
  updatedAt?: number;
}

/**
 *
 * Wrapper object for persisted jobs
 *
 * Fields:
 *   - id: (integer) auto-number primary key
 *   - username: (string) Earthdata Login username
 *   - requestId: (uuid) ID of the originating user request that produced the job
 *   - status: (enum string) job status ['accepted', 'running', 'successful', 'failed']
 *   - message: (string) human readable status message
 *   - progress: (integer) 0-100 approximate completion percentage
 *   - links: (JSON) links to output files, array of objects containing the following keys:
 *       "href", "title", "type", and "rel"
 *   - request: (string) Original user request URL that created this job
 *   - createdAt: (Date) the date / time at which the job was created
 *   - updatedAt: (Date) the date / time at which the job was last updated
 */
export class Job extends Record {
  static table = 'jobs';

  static statuses: JobStatus;

  static record: JobRecord;

  links: JobLink[];

  message: string;

  username: string;

  requestId: string;

  progress: number;

  request: string;

  _json_links?: string | JobLink[];

  status: string;

  jobID: string;

  /**
   * Returns an array of all jobs that match the given constraints
   *
   * @param transaction - the transaction to use for querying
   * @param constraints - field / value pairs that must be matched for a record to be returned
   * @param currentPage - the index of the page to show
   * @param perPage - the number of results per page
   * @returns a list of all of the user's jobs
   */
  static async queryAll(
    transaction: Transaction,
    constraints: JobQuery = {},
    currentPage = 0,
    perPage = 10,
  ): Promise<IWithPagination<Job[]>> {
    const items = await transaction('jobs')
      .select()
      .where(constraints)
      .orderBy('createdAt', 'desc')
      .paginate({ currentPage, perPage, isLengthAware: true });
    return {
      data: items.data.map((j) => new Job(j)),
      pagination: items.pagination,
    };
  }

  /**
   * Returns an array of all jobs for the given username using the given transaction
   *
   * @param transaction - the transaction to use for querying
   * @param username - the user whose jobs should be retrieved
   * @param currentPage - the index of the page to show
   * @param perPage - the number of results per page
   * @returns a list of all of the user's jobs
   */
  static forUser(transaction: Transaction, username: string, currentPage = 0, perPage = 10):
  Promise<IWithPagination<Job[]>> {
    return this.queryAll(transaction, { username }, currentPage, perPage);
  }

  /**
   * Returns the job matching the given username and request ID, or null if
   * no such job exists.
   *
   * @param transaction - the transaction to use for querying
   * @param username - the username associated with the job
   * @param requestId - the UUID of the request associated with the job
   * @returns the matching job, or null if none exists
   */
  static async byUsernameAndRequestId(transaction, username, requestId): Promise<Job> {
    const result = await transaction('jobs').select().where({ username, requestId }).forUpdate();
    return result.length === 0 ? null : new Job(result[0]);
  }

  /**
   * Returns the job matching the given request ID, or null if no such job exists
   *
   * @param transaction - the transaction to use for querying
   * @param requestId - the UUID of the request associated with the job
   * @returns the matching job, or null if none exists
   */
  static async byRequestId(transaction, requestId): Promise<Job> {
    const result = await transaction('jobs').select().where({ requestId }).forUpdate();
    return result.length === 0 ? null : new Job(result[0]);
  }

  /**
   * Returns the job matching the given primary key id, or null if no such job exists
   *
   * @param transaction - the transaction to use for querying
   * @param id - the primary key of the job record
   * @returns the matching job, or null if none exists
   */
  static async byId(transaction: Transaction, id: number): Promise<Job> {
    const result = await transaction('jobs').select().where({ id }).forUpdate();
    return result.length === 0 ? null : new Job(result[0]);
  }

  /**
   * Creates a Job instance.
   *
   * @param fields - Object containing fields to set on the record
   */
  constructor(fields: JobRecord) {
    super(fields);
    // Allow up to 4096 chars for the request string
    this.request = fields.request && truncateString(fields.request, 4096);
    this.updateStatus(fields.status || JobStatus.ACCEPTED, fields.message);
    this.progress = fields.progress || 0;
    // Need to jump through serialization hoops due array caveat here: http://knexjs.org/#Schema-json
    this.links = fields.links
      || (typeof fields._json_links === 'string' ? JSON.parse(fields._json_links) : fields._json_links)
      || [];
  }

  /**
   * Validates the job. Returns null if the job is valid.  Returns a list of errors if
   * it is invalid. Other constraints are validated via database constraints.
   *
   * @returns a list of validation errors, or null if the record is valid
   */
  validate(): string[] {
    const errors = [];
    if (this.progress < 0 || this.progress > 100) {
      errors.push('Job progress must be between 0 and 100');
    }
    if (!this.request.match(/^https?:\/\/.+$/)) {
      errors.push(`Invalid request ${this.request}. Job request must be a URL.`);
    }
    return errors.length === 0 ? null : errors;
  }

  /**
   * Adds a link to the list of result links for the job.
   * You must call `#save` to persist the change
   *
   * @param link - Adds a link to the list of links for the object.
   */
  addLink(link: JobLink): void {
    this.links.push(link);
  }

  /**
   * Adds a staging location link to the list of result links for the job.
   * You must call `#save` to persist the change
   *
   * @param stagingLocation - Adds link to the staging bucket to the list of links.
   */
  addStagingBucketLink(stagingLocation): void {
    if (stagingLocation) {
      const stagingLocationLink = {
        href: stagingLocation,
        title: stagingBucketTitle,
        rel: 's3-access',
      };
      this.links.push(stagingLocationLink);
    }
  }

  /**
   * Updates the status to failed and message to the supplied error message or the default
   * if none is provided.  You should generally provide an error message if possible, as the
   * default indicates an unknown error.
   * You must call `#save` to persist the change
   *
   * @param message - an error message
   */
  fail(message = statesToDefaultMessages.failed): void {
    this.updateStatus(JobStatus.FAILED, message);
  }

  /**
   * Updates the status to success, providing the optional message.  Generally you should
   * only set a message if there is information to provide to users about the result, as
   * providing a message will override any prior message, including warnings.
   * You must call `#save` to persist the change
   *
   * @param message - (optional) a human-readable success message.  See method description.
   */
  succeed(message?: string): void {
    this.updateStatus(JobStatus.SUCCESSFUL, message);
  }

  /**
   * Update the status and status message of a job.  If a null or default message is provided,
   * will use a default message corresponding to the status.
   * You must call `#save` to persist the change
   *
   * @param status - The new status, one of successful, failed, running, accepted
   * @param message - (optional) a human-readable status message
   */
  updateStatus(status: JobStatus, message?: string): void {
    this.status = status;
    if (message) {
      // Update the message if a new one was provided
      this.message = message;
    }
    if (!this.message || defaultMessages.includes(this.message)) {
      // Update the message to a default one if it's currently a default one for a
      // different status
      this.message = statesToDefaultMessages[status];
    }
    if (this.status === JobStatus.SUCCESSFUL) {
      this.progress = 100;
    }
  }

  /**
   * Returns true if the job is complete, i.e. it expects no further interaction with
   * backend services.
   *
   * @returns true if the job is complete
   */
  isComplete(): boolean {
    return this.status === JobStatus.SUCCESSFUL || this.status === JobStatus.FAILED;
  }

  /**
   * Validates and saves the job using the given transaction.  Throws an error if the
   * job is not valid.  New jobs will be inserted and have their id, createdAt, and
   * updatedAt fields set.  Existing jobs will be updated and have their updatedAt
   * field set.
   *
   * @param transaction - The transaction to use for saving the job
   * @throws {@link Error} if the job is invalid
   */
  async save(transaction: Transaction): Promise<void> {
    // Need to jump through serialization hoops due array caveat here: http://knexjs.org/#Schema-json
    const { links } = this;
    delete this.links;
    this._json_links = JSON.stringify(links);
    await super.save(transaction);
    this.links = links;
    delete this._json_links;
  }

  /**
   * Serializes a Job to return from any of the jobs frontend endpoints
   * @param urlRoot - the root URL to be used when constructing links
   * @returns an object with the serialized job fields.
   */
  serialize(urlRoot?: string): Job {
    const serializedJob = pick(this, serializedJobFields) as Job;
    serializedJob.updatedAt = new Date(serializedJob.updatedAt);
    serializedJob.createdAt = new Date(serializedJob.createdAt);
    serializedJob.jobID = this.requestId;
    if (urlRoot) {
      serializedJob.links = serializedJob.links.map((link) => {
        let { href } = link;
        const { title, type, rel, bbox, temporal } = link;
        // Leave the S3 output staging location as an S3 link
        if (rel !== 's3-access') {
          href = createPublicPermalink(href, urlRoot, type);
        }
        return { href, title, type, rel, bbox, temporal };
      });
    }
    return new Job(serializedJob as JobRecord);
  }

  /**
   * Returns only the links with a rel that matches the passed in value
   *
   * @param rel - the relation to return links for
   * @returns the job output links with the given rel
   */
  getRelatedLinks(rel: string): JobLink[] {
    return this.links.filter((link) => link.rel === rel);
  }
}