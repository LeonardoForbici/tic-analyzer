import axios from 'axios';

export function TelaPedido() {
  async function salvar(payload: unknown) {
    return axios.post('/api/pedidos', payload);
  }
  return salvar;
}
