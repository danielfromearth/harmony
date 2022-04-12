import { Router, json } from 'express';
import { getWork, updateWorkItem } from '../backends/workflow-orchestration';
import { responseHandler } from '../backends/service-response';
import { getReadyWorkItemCountForServiceID } from '../backends/service-metrics';
import log from '../util/log';

/**
 * Creates and returns an Router instance that can receive callbacks from backend
 * services and route them to frontend requests that may be awaiting responses.
 *
 * @returns A router which can respond to backend services
 */
export default function router(): Router {
  const result = Router();
  result.use(json({
    type: 'application/json',
    limit: '500kb',
  }));
  result.post('/:requestId/response', responseHandler);
  result.get('/work', getWork);
  result.put('/work/:id', updateWorkItem);

  result.get('/metrics', getReadyWorkItemCountForServiceID);

  result.use((err, _req, _res, _next) => {
    if (err) {
      log.error(err);
      _next(err);
    } else {
      log.error('404');
      _next();
    }
  });
  return result;
}
