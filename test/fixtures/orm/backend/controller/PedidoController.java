package com.acme.pedido.controller;

import com.acme.pedido.service.PedidoService;

public class PedidoController {
    private final PedidoService pedidoService;

    public PedidoController(PedidoService pedidoService) {
        this.pedidoService = pedidoService;
    }

    @PostMapping("/api/pedidos")
    public Long salvar(String body) {
        return pedidoService.salvar(body);
    }
}
