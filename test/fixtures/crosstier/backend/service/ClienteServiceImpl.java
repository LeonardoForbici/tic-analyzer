package com.acme.cliente.service;

import com.acme.cliente.repository.ClienteRepository;

public class ClienteServiceImpl implements ClienteService {
    private final ClienteRepository clienteRepository;

    public ClienteServiceImpl(ClienteRepository clienteRepository) {
        this.clienteRepository = clienteRepository;
    }

    @Override
    public String salvar(String body) {
        return clienteRepository.salvar(body);
    }
}
