package com.acme.pedido.service;

import com.acme.pedido.repository.PedidoRepository;

public class PedidoServiceImpl implements PedidoService {
    private final PedidoRepository pedidoRepository;

    public PedidoServiceImpl(PedidoRepository pedidoRepository) {
        this.pedidoRepository = pedidoRepository;
    }

    @Override
    public Long salvar(String body) {
        return pedidoRepository.persistir(body);
    }
}
