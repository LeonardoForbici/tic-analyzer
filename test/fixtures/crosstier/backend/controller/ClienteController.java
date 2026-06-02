package com.acme.cliente.controller;

import com.acme.cliente.service.ClienteService;

public class ClienteController {
    private final ClienteService clienteService;

    public ClienteController(ClienteService clienteService) {
        this.clienteService = clienteService;
    }

    @PostMapping("/api/clientes")
    public String salvar(String body) {
        return clienteService.salvar(body);
    }
}
