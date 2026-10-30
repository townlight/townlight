export type Invoke = <T>(command: string, args?: object) => Promise<T>;
export function createPlanningClient(invoke: Invoke, publicMode = false) {
  const publicOperations = new Set(['search-policies', 'plan-explore', 'snapshots', 'snapshot', 'original', 'export-snapshot']);
  return {
    request<T = any>(operation: string, values: object = {}): Promise<T> {
      if (publicMode && !publicOperations.has(operation)) throw new Error('Staff access required.');
      // The plan explorer is a public read: it is served on the shell's public
      // planning router in both shell modes.
      if (operation === 'plan-explore') {
        return invoke<T>('planning_public_request', {request: {operation, ...values}});
      }
      return invoke<T>(publicMode ? 'planning_public_request' : 'planning_domain_request', {request: {operation, ...values}});
    },
    planExplore(payload: { goal?: string; topic?: string; plan_type?: string }): Promise<any> {
      return invoke('planning_public_request', {request: {operation: 'plan-explore', payload}});
    },
    pickBundle(): Promise<object | null> {
      if (publicMode) throw new Error('Staff access required.');
      return invoke('planning_pick_bundle');
    }
  };
}
