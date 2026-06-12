import axios from 'axios';

export async function approve(payload: unknown) {
  return axios.post('/api/approvals', payload);
}
