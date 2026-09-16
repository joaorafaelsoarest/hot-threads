export const SYNC_THREAD = 'SYNC_THREAD';
export const GET_THREAD_STATE = 'GET_THREAD_STATE';
export const TOGGLE_PIN = 'TOGGLE_PIN';
export const GET_DASHBOARD = 'GET_DASHBOARD';
export const UNPIN_THREAD = 'UNPIN_THREAD';
export const OPEN_THREAD = 'OPEN_THREAD';

export const success = (data) => ({ ok: true, data });
export const failure = (code, message) => ({ ok: false, error: { code, message } });
