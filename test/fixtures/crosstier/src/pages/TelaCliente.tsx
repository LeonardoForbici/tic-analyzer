import axios from 'axios';

export function TelaCliente() {
  async function salvar(payload: unknown) {
    return axios.post('/api/clientes', payload);
  }
  return salvar;
}
