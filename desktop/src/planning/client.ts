export type Invoke = <T>(command: string, args?: object) => Promise<T>;
export function createPlanningClient(invoke: Invoke, publicMode = false) {
  const publicOperations = new Set(['search-policies', 'snapshots', 'snapshot', 'original', 'export-snapshot']);
  return {
    request<T = any>(operation: string, values: object = {}): Promise<T> {
      if (publicMode && !publicOperations.has(operation)) throw new Error('Staff access required.');
      return invoke<T>(publicMode ? 'planning_public_request' : 'planning_domain_request', {request: {operation, ...values}});
    },
    pickBundle(): Promise<object | null> {
      if (publicMode) throw new Error('Staff access required.');
      return invoke('planning_pick_bundle');
    }
  };
}
